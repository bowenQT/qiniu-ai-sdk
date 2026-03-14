/**
 * MCP HTTP Transport using official SDK.
 * Wraps StreamableHTTPClientTransport with retries and connection management.
 *
 * @see https://modelcontextprotocol.io/docs/concepts/transports#streamable-http
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { MCPHttpServerConfig, MCPToolDefinition, MCPToolResult } from './types';
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
        const timeout = this.config.timeout ?? DEFAULT_MCP_CONFIG.httpTimeout;
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
        const response = await fetch(this.config.url, {
            method: 'GET',
            headers: await this.resolveHeaders({
                accept: 'text/event-stream',
                lastEventId: lastEventId ?? this.config.lastEventId,
            }),
        });

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
        const response = await fetch(this.config.url, {
            method: 'DELETE',
            headers: await this.resolveHeaders(),
        });

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
        });
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
