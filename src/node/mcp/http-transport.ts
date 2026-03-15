/**
 * MCP HTTP Transport using official SDK.
 * Wraps StreamableHTTPClientTransport with retries and connection management.
 *
 * @see https://modelcontextprotocol.io/docs/concepts/transports#streamable-http
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
    MCPHttpServerConfig,
    MCPPromptMessage,
    MCPPromptDefinition,
    MCPResourceContent,
    MCPResourceDefinition,
    MCPToolDefinition,
    MCPToolResult,
} from './types';
import { DEFAULT_MCP_CONFIG } from './types';
import { SDK_VERSION } from '../../lib/version';
import {
    discoverMcpOAuthMetadata,
    type AuthorizationServerMetadata,
    type ProtectedResourceMetadata,
} from './oauth';

/** HTTP Transport error */
export class MCPHttpTransportError extends Error {
    constructor(
        message: string,
        public readonly serverName: string,
        public readonly statusCode?: number
    ) {
        super(message);
        this.name = 'MCPHttpTransportError';
    }
}

/** OAuth token provider function */
export type TokenProvider = () => Promise<string | undefined>;

export interface MCPProbeOptions {
    listTools?: boolean;
    listResources?: boolean;
    listPrompts?: boolean;
    readResource?: {
        uri: string;
    };
    getPrompt?: {
        name: string;
        args?: Record<string, string>;
    };
    executeTool?: {
        name: string;
        args?: Record<string, unknown>;
    };
    eventStream?: {
        lastEventId?: string;
    } | boolean;
    oauthMetadata?: {
        challengeHeader?: string;
    } | boolean;
    terminateSession?: boolean;
}

export interface MCPProbeResult {
    tools?: MCPToolDefinition[];
    resources?: MCPResourceDefinition[];
    prompts?: MCPPromptDefinition[];
    resourceText?: string;
    promptText?: string;
    toolResult?: MCPToolResult;
    eventStream?: {
        status: number;
        contentType: string | null;
    };
    oauthMetadata?: {
        protectedResource: ProtectedResourceMetadata;
        authorizationServer: AuthorizationServerMetadata | null;
    };
    terminated?: boolean;
}

function buildHttpHeaders(config: MCPHttpServerConfig, token?: string): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: config.accept ?? DEFAULT_MCP_CONFIG.accept,
        'MCP-Protocol-Version': config.protocolVersion ?? DEFAULT_MCP_CONFIG.protocolVersion,
        ...config.headers,
    };

    if (config.sessionId) {
        headers['MCP-Session-Id'] = config.sessionId;
    }
    if (config.lastEventId) {
        headers['Last-Event-ID'] = config.lastEventId;
    }
    if (config.origin) {
        headers.Origin = config.origin;
    }
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return headers;
}

/**
 * HTTP Transport wrapper for MCP servers.
 * Uses official SDK's StreamableHTTPClientTransport.
 */
export class MCPHttpTransport {
    private client: Client | null = null;
    private transport: StreamableHTTPClientTransport | null = null;
    private readonly config: MCPHttpServerConfig;
    private connected = false;

    constructor(config: MCPHttpServerConfig) {
        this.config = config;
    }

    private requestTimeout(): number {
        return this.config.timeout ?? DEFAULT_MCP_CONFIG.httpTimeout;
    }

    private async fetchWithTimeout(
        input: string,
        init: RequestInit,
        timeoutLabel: string,
    ): Promise<Response> {
        const timeout = this.requestTimeout();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            return await fetch(input, {
                ...init,
                signal: controller.signal,
            });
        } catch (error) {
            if (controller.signal.aborted) {
                throw new MCPHttpTransportError(
                    `${timeoutLabel} timeout after ${timeout}ms`,
                    this.config.name,
                );
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async resolveToken(): Promise<string | undefined> {
        if (this.config.token) {
            return this.config.token;
        }

        if (this.config.tokenProvider) {
            return await this.config.tokenProvider();
        }

        return undefined;
    }

    private async resolveHeaders(overrides?: {
        accept?: string;
        lastEventId?: string;
    }): Promise<Record<string, string>> {
        const token = await this.resolveToken();
        const headers = buildHttpHeaders(this.config, token);

        if (overrides?.accept) {
            headers.Accept = overrides.accept;
        }
        if (overrides?.lastEventId) {
            headers['Last-Event-ID'] = overrides.lastEventId;
        }

        return headers;
    }

    /**
     * Connect to the MCP server.
     */
    async connect(): Promise<void> {
        if (this.connected) return;

        const headers = await this.resolveHeaders();

        // Create transport
        this.transport = new StreamableHTTPClientTransport(
            new URL(this.config.url),
            {
                requestInit: {
                    headers,
                },
            }
        );

        // Create client
        this.client = new Client(
            {
                name: 'qiniu-ai-sdk',
                version: SDK_VERSION,
            },
            {
                capabilities: {},
            }
        );

        // Connect with timeout
        const timeout = this.requestTimeout();
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new MCPHttpTransportError(
                `Connection timeout after ${timeout}ms`,
                this.config.name
            )), timeout);
        });

        await Promise.race([
            this.client.connect(this.transport),
            timeoutPromise,
        ]);

        this.connected = true;
    }

    /**
     * Disconnect from the MCP server.
     */
    async disconnect(): Promise<void> {
        if (!this.connected) return;

        await this.client?.close();
        this.client = null;
        this.transport = null;
        this.connected = false;
    }

    /**
     * Open the server event stream for resume / long polling scenarios.
     */
    async openEventStream(lastEventId?: string): Promise<Response> {
        const response = await this.fetchWithTimeout(this.config.url, {
            method: 'GET',
            headers: await this.resolveHeaders({
                accept: 'text/event-stream',
                lastEventId: lastEventId ?? this.config.lastEventId,
            }),
        }, 'Open event stream');

        if (!response.ok) {
            throw new MCPHttpTransportError(
                `Failed to open event stream: ${response.status}`,
                this.config.name,
                response.status,
            );
        }

        return response;
    }

    /**
     * Terminate an active session using MCP DELETE semantics.
     * Returns false when the server does not support DELETE termination.
     */
    async terminateSession(): Promise<boolean> {
        const response = await this.fetchWithTimeout(this.config.url, {
            method: 'DELETE',
            headers: await this.resolveHeaders(),
        }, 'Terminate session');

        if (response.status === 404 || response.status === 405 || response.status === 501) {
            return false;
        }

        if (!response.ok) {
            throw new MCPHttpTransportError(
                `Failed to terminate session: ${response.status}`,
                this.config.name,
                response.status,
            );
        }

        await this.disconnect();
        return true;
    }

    /**
     * Discover OAuth metadata from the MCP protected resource.
     */
    async discoverOAuthMetadata(challengeHeader?: string): Promise<{
        protectedResource: ProtectedResourceMetadata;
        authorizationServer: AuthorizationServerMetadata | null;
    }> {
        return discoverMcpOAuthMetadata(this.config.url, {
            headers: this.config.headers,
            protocolVersion: this.config.protocolVersion ?? DEFAULT_MCP_CONFIG.protocolVersion,
            challengeHeader,
            fetchImpl: (input, init) => this.fetchWithTimeout(
                typeof input === 'string' ? input : input.toString(),
                init ?? {},
                'OAuth metadata discovery',
            ),
        });
    }

    /**
     * Probe MCP server capabilities using the current transport configuration.
     * Useful for live verification and structured interoperability checks.
     */
    async probe(options: MCPProbeOptions = {}): Promise<MCPProbeResult> {
        const result: MCPProbeResult = {};
        let terminated = false;
        const needsClient = options.listTools
            || options.listResources
            || options.listPrompts
            || options.readResource
            || options.getPrompt
            || options.executeTool;

        try {
            if (needsClient) {
                await this.connect();
            }

            if (options.listTools) {
                result.tools = await this.listTools();
            }

            if (options.listResources) {
                result.resources = await this.listResources();
            }

            if (options.listPrompts) {
                result.prompts = await this.listPrompts();
            }

            if (options.readResource) {
                result.resourceText = await this.readResource(options.readResource.uri);
            }

            if (options.getPrompt) {
                result.promptText = await this.getPrompt(
                    options.getPrompt.name,
                    options.getPrompt.args,
                );
            }

            if (options.executeTool) {
                result.toolResult = await this.executeTool(
                    options.executeTool.name,
                    options.executeTool.args ?? {},
                );
            }

            if (options.eventStream) {
                const response = await this.openEventStream(
                    typeof options.eventStream === 'object' ? options.eventStream.lastEventId : undefined,
                );
                result.eventStream = {
                    status: response.status,
                    contentType: response.headers.get('content-type'),
                };
            }

            if (options.oauthMetadata) {
                result.oauthMetadata = await this.discoverOAuthMetadata(
                    typeof options.oauthMetadata === 'object' ? options.oauthMetadata.challengeHeader : undefined,
                );
            }

            if (options.terminateSession) {
                result.terminated = await this.terminateSession();
                terminated = result.terminated === true;
            }

            return result;
        } finally {
            if (needsClient && !terminated) {
                await this.disconnect();
            }
        }
    }

    /**
     * List available tools.
     */
    async listTools(): Promise<MCPToolDefinition[]> {
        if (!this.client) {
            throw new MCPHttpTransportError('Not connected', this.config.name);
        }

        const result = await this.client.listTools();
        return (result.tools || []).map((tool) => ({
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema as MCPToolDefinition['inputSchema'],
        }));
    }

    /**
     * List available resources.
     */
    async listResources(): Promise<MCPResourceDefinition[]> {
        if (!this.client) {
            throw new MCPHttpTransportError('Not connected', this.config.name);
        }

        const result = await this.client.listResources();
        return (result.resources || []).map((resource) => ({
            uri: resource.uri,
            name: resource.name ?? resource.uri,
            mimeType: (resource as any).mimeType,
        }));
    }

    /**
     * List available prompts.
     */
    async listPrompts(): Promise<MCPPromptDefinition[]> {
        if (!this.client) {
            throw new MCPHttpTransportError('Not connected', this.config.name);
        }

        const result = await this.client.listPrompts();
        return (result.prompts || []).map((prompt) => ({
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments?.map((arg) => ({
                name: arg.name,
                required: arg.required,
            })),
        }));
    }

    /**
     * Read a specific MCP resource and return its text representation.
     */
    async readResource(uri: string): Promise<string> {
        const contents = await this.readResourceContents(uri);
        if (contents.length === 0) {
            return '';
        }

        return contents
            .map((content) => {
                if (typeof content.text === 'string') {
                    return content.text;
                }
                return JSON.stringify(content);
            })
            .join('\n');
    }

    /**
     * Read a specific MCP resource and return its structured contents.
     */
    async readResourceContents(uri: string): Promise<MCPResourceContent[]> {
        if (!this.client) {
            throw new MCPHttpTransportError('Not connected', this.config.name);
        }

        const result = await this.client.readResource({ uri });
        return (result.contents || []).map((content) => ({
            ...(content as Record<string, unknown>),
        }));
    }

    /**
     * Resolve a prompt with optional string arguments and return its text representation.
     */
    async getPrompt(
        promptName: string,
        args?: Record<string, string>,
    ): Promise<string> {
        const messages = await this.getPromptMessages(promptName, args);
        if (messages.length === 0) {
            return '';
        }

        return messages.map((message) => {
            const content = message.content;
            if (typeof content === 'string') {
                return content;
            }
            if (content && typeof content === 'object' && 'text' in content && typeof content.text === 'string') {
                return content.text;
            }
            return JSON.stringify(content);
        }).join('\n');
    }

    /**
     * Resolve a prompt with optional string arguments and return structured messages.
     */
    async getPromptMessages(
        promptName: string,
        args?: Record<string, string>,
    ): Promise<MCPPromptMessage[]> {
        if (!this.client) {
            throw new MCPHttpTransportError('Not connected', this.config.name);
        }

        const result = await this.client.getPrompt({
            name: promptName,
            arguments: args,
        });

        return (result.messages || []).map((message) => ({
            ...(message as Record<string, unknown>),
            content: message.content,
        })) as MCPPromptMessage[];
    }

    /**
     * Execute a tool.
     */
    async executeTool(
        toolName: string,
        args: Record<string, unknown>
    ): Promise<MCPToolResult> {
        if (!this.client) {
            throw new MCPHttpTransportError('Not connected', this.config.name);
        }

        const result = await this.client.callTool({
            name: toolName,
            arguments: args,
        });

        const contentArray = Array.isArray(result.content) ? result.content : [];

        return {
            content: contentArray.map((item: { type: string; text?: string; data?: string; mimeType?: string }) => {
                if (item.type === 'text') {
                    return { type: 'text' as const, text: item.text };
                }
                if (item.type === 'image') {
                    return {
                        type: 'image' as const,
                        data: item.data,
                        mimeType: item.mimeType,
                    };
                }
                return { type: 'resource' as const };
            }),
            isError: result.isError === true,
        };
    }

    /**
     * Check if connected.
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Get server name.
     */
    getServerName(): string {
        return this.config.name;
    }
}
