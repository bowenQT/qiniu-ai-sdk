/**
 * NodeMCPHost — Node.js MCP Host implementation.
 * 
 * Uses @modelcontextprotocol/sdk Client + transports.
 * Implements MCPHostProvider interface for dependency injection into createAgent.
 *
 * @module
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
    MCPHostProvider,
    MCPResource,
    MCPPrompt,
    MCPToolPolicy,
} from '../lib/mcp-host-types';
import type { RegisteredTool, RegisteredToolContext } from '../lib/tool-registry';
import { SDK_VERSION } from '../lib/version';
import {
    DEFAULT_MCP_CONFIG,
    type MCPHttpServerConfig,
    type MCPServerConfig as MCPTransportServerConfig,
} from './mcp/types';
import { MCPHttpTransport, type MCPProbeOptions, type MCPProbeResult } from './mcp/http-transport';

// ============================================================================
// Types
// ============================================================================

export type MCPServerConfig = MCPTransportServerConfig & {
    /** Per-server tool execution policy */
    toolPolicy?: MCPToolPolicy;
};

export interface NodeMCPHostConfig {
    /** MCP server configurations */
    servers: MCPServerConfig[];
    /** SDK client info name */
    clientName?: string;
    /** SDK client info version */
    clientVersion?: string;
}

export interface NodeMCPHostProbeResult {
    serverName: string;
    result: MCPProbeResult;
}

export interface NodeMCPHostInteropProbeHostResult {
    tools?: NodeMCPHostToolInfo[];
    resources?: NodeMCPHostResourceInfo[];
    prompts?: NodeMCPHostPromptInfo[];
    resourceContents?: NodeMCPHostResourceContent[];
    promptMessages?: NodeMCPHostPromptMessage[];
    toolOutput?: string;
}

export interface NodeMCPHostInteropProbeResult {
    serverName: string;
    transport?: MCPProbeResult;
    host?: NodeMCPHostInteropProbeHostResult;
    deferredRisks: string[];
}

export interface NodeMCPHostToolInfo {
    serverName: string;
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}

export interface NodeMCPHostResourceInfo {
    serverName: string;
    uri: string;
    name: string;
    mimeType?: string;
}

export interface NodeMCPHostPromptInfo {
    serverName: string;
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        required?: boolean;
    }>;
}

export interface NodeMCPHostResourceContent {
    text?: string;
    mimeType?: string;
    [key: string]: unknown;
}

export interface NodeMCPHostPromptMessage {
    role?: string;
    content: unknown;
}

export interface NodeMCPHostPromotionReadinessContract {
    officialSurface: string[];
    requiredTransportEvidence: string[];
    requiredHostEvidence: string[];
    deferredRisks: readonly string[];
    trackedDecisionPath: string;
    decisionStatus: 'held';
}

export const DEFAULT_MCP_INTEROP_DEFERRED_RISKS = [
    'Server-initiated notifications and list_changed updates are still covered by unit tests, not live verification.',
    'OAuth discovery covers metadata endpoints only; token acquisition flows remain out of scope for this package.',
    'HTTP interop evidence is collected per server; multi-server routing remains a higher-level integration concern.',
] as const;

export const NODE_MCPHOST_PROMOTION_READINESS_CONTRACT: NodeMCPHostPromotionReadinessContract = Object.freeze({
    officialSurface: [
        'probeServer',
        'probeServerInterop',
        'listServerTools',
        'executeServerTool',
        'listServerResources',
        'readResourceContents',
        'listServerPrompts',
        'getPromptMessages',
    ],
    requiredTransportEvidence: [
        'mcp-connect',
        'mcp-read-resource',
        'mcp-get-prompt',
    ],
    requiredHostEvidence: [
        'mcp-host-interop',
    ],
    deferredRisks: DEFAULT_MCP_INTEROP_DEFERRED_RISKS,
    trackedDecisionPath: '.trellis/decisions/phase2/phase2-node-integrations-node-mcphost-promotion-readiness.json',
    decisionStatus: 'held',
});

// ============================================================================
// NodeMCPHost
// ============================================================================

export class NodeMCPHost implements MCPHostProvider {
    private config: NodeMCPHostConfig;
    private clients = new Map<string, Client>();
    private toolsCache: RegisteredTool[] = [];
    private changeCallbacks: Set<(tools: RegisteredTool[]) => void> = new Set();

    constructor(config: NodeMCPHostConfig) {
        this.config = config;
    }

    async connect(): Promise<void> {
        const connectedServers: string[] = [];

        try {
            for (const server of this.config.servers) {
                const transport = await this.createTransport(server);
                const client = new Client(
                    {
                        name: this.config.clientName ?? 'qiniu-ai-sdk',
                        version: this.config.clientVersion ?? SDK_VERSION,
                    },
                    { capabilities: {} }
                );

                // Register list_changed notification handler
                client.setNotificationHandler?.(
                    { method: 'notifications/tools/list_changed' } as any,
                    async () => {
                        await this.refreshTools();
                    }
                );

                await client.connect(transport);
                this.clients.set(server.name, client);
                connectedServers.push(server.name);
            }
        } catch (err) {
            // Rollback: close all already-connected clients
            for (const name of connectedServers) {
                const client = this.clients.get(name);
                if (client) {
                    try { await client.close(); } catch { /* ignore */ }
                    this.clients.delete(name);
                }
            }
            throw err;
        }

        // Initial tool discovery
        await this.refreshTools();
    }

    getTools(): RegisteredTool[] {
        return [...this.toolsCache];
    }

    onToolsChanged(cb: (tools: RegisteredTool[]) => void): () => void {
        this.changeCallbacks.add(cb);
        return () => {
            this.changeCallbacks.delete(cb);
        };
    }

    async listResources(): Promise<MCPResource[]> {
        const allResources: MCPResource[] = [];

        for (const [serverName, client] of this.clients) {
            try {
                const result = await client.listResources();
                for (const r of result.resources) {
                    allResources.push({
                        uri: r.uri,
                        name: r.name ?? r.uri,
                        serverName,
                        mimeType: (r as any).mimeType,
                    });
                }
            } catch {
                // Server may not support resources
            }
        }

        return allResources;
    }

    async listServerResources(serverName: string): Promise<NodeMCPHostResourceInfo[]> {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server "${serverName}" not found`);
        }

        const result = await client.listResources();
        return result.resources.map((resource) => ({
            serverName,
            uri: resource.uri,
            name: resource.name ?? resource.uri,
            mimeType: (resource as any).mimeType,
        }));
    }

    async readResource(serverName: string, uri: string): Promise<string> {
        const contents = await this.readResourceContents(serverName, uri);
        if (contents.length === 0) {
            return '';
        }
        return contents.map((content) =>
            typeof content.text === 'string' ? content.text : JSON.stringify(content),
        ).join('\n');
    }

    async readResourceContents(serverName: string, uri: string): Promise<NodeMCPHostResourceContent[]> {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server "${serverName}" not found`);
        }

        const result = await client.readResource({ uri });
        return (result.contents ?? []).map((content) => ({
            ...(content as Record<string, unknown>),
        }));
    }

    async listPrompts(): Promise<MCPPrompt[]> {
        const allPrompts: MCPPrompt[] = [];

        for (const [serverName, client] of this.clients) {
            try {
                const result = await client.listPrompts();
                for (const p of result.prompts) {
                    allPrompts.push({
                        name: p.name,
                        description: p.description,
                        serverName,
                        arguments: p.arguments?.map(a => ({
                            name: a.name,
                            required: a.required,
                        })),
                    });
                }
            } catch {
                // Server may not support prompts
            }
        }

        return allPrompts;
    }

    async listServerPrompts(serverName: string): Promise<NodeMCPHostPromptInfo[]> {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server "${serverName}" not found`);
        }

        const result = await client.listPrompts();
        return result.prompts.map((prompt) => ({
            serverName,
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments?.map((arg) => ({
                name: arg.name,
                required: arg.required,
            })),
        }));
    }

    async getPrompt(
        serverName: string,
        name: string,
        args?: Record<string, string>,
    ): Promise<string> {
        const messages = await this.getPromptMessages(serverName, name, args);
        if (messages.length === 0) {
            return '';
        }

        return messages.map((message) => {
            const content = message.content;
            if (typeof content === 'string') return content;
            if (content && typeof content === 'object' && 'text' in content) {
                return (content as any).text;
            }
            return JSON.stringify(content);
        }).join('\n');
    }

    async getPromptMessages(
        serverName: string,
        name: string,
        args?: Record<string, string>,
    ): Promise<NodeMCPHostPromptMessage[]> {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server "${serverName}" not found`);
        }

        const result = await client.getPrompt({ name, arguments: args });
        return (result.messages ?? []).map((message) => ({
            role: message.role,
            content: message.content,
        }));
    }

    async listServerTools(serverName: string): Promise<NodeMCPHostToolInfo[]> {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server "${serverName}" not found`);
        }

        const result = await client.listTools();
        return result.tools.map((tool) => ({
            serverName,
            name: tool.name,
            description: tool.description,
            inputSchema: (tool.inputSchema as Record<string, unknown> | undefined),
        }));
    }

    async executeServerTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown> = {},
        context?: RegisteredToolContext,
    ): Promise<string> {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server "${serverName}" not found`);
        }

        return this.executeClientTool(serverName, client, toolName, args, context);
    }

    async dispose(): Promise<void> {
        for (const [, client] of this.clients) {
            try {
                await client.close();
            } catch {
                // Ignore close errors
            }
        }
        this.clients.clear();
        this.toolsCache = [];
        this.changeCallbacks.clear();
    }

    /**
     * Probe a single configured HTTP MCP server by name.
     * Useful for targeted health checks and verification flows.
     */
    async probeServer(serverName: string, options: MCPProbeOptions = {}): Promise<NodeMCPHostProbeResult> {
        const server = this.config.servers.find((candidate) => candidate.name === serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found`);
        }

        if (server.transport !== 'http') {
            throw new Error(`MCP server "${serverName}" does not use HTTP transport and cannot be probed`);
        }

        const transport = new MCPHttpTransport(server);
        const result = await transport.probe(options);
        return {
            serverName,
            result,
        };
    }

    /**
     * Probe a single configured HTTP MCP server through both transport and host surfaces.
     * This is useful for collecting bounded interoperability evidence without reopening the
     * broader Node platform surface.
     */
    async probeServerInterop(serverName: string, options: MCPProbeOptions = {}): Promise<NodeMCPHostInteropProbeResult> {
        const server = this.config.servers.find((candidate) => candidate.name === serverName);
        if (!server) {
            throw new Error(`MCP server "${serverName}" not found`);
        }

        if (server.transport !== 'http') {
            throw new Error(`MCP server "${serverName}" does not use HTTP transport and cannot be probed`);
        }

        const result: NodeMCPHostInteropProbeResult = {
            serverName,
            deferredRisks: [...DEFAULT_MCP_INTEROP_DEFERRED_RISKS],
        };

        const needsHostEvidence = options.listTools
            || options.listResources
            || options.listPrompts
            || options.readResource
            || options.getPrompt
            || options.executeTool;

        if (needsHostEvidence) {
            result.host = await this.withConnectedServerProbeHost(server, async (host) => {
                const hostResult: NodeMCPHostInteropProbeHostResult = {};

                if (options.listTools) {
                    hostResult.tools = await host.listServerTools(serverName);
                }
                if (options.listResources) {
                    hostResult.resources = await host.listServerResources(serverName);
                }
                if (options.listPrompts) {
                    hostResult.prompts = await host.listServerPrompts(serverName);
                }
                if (options.readResource) {
                    hostResult.resourceContents = await host.readResourceContents(serverName, options.readResource.uri);
                }
                if (options.getPrompt) {
                    hostResult.promptMessages = await host.getPromptMessages(
                        serverName,
                        options.getPrompt.name,
                        options.getPrompt.args,
                    );
                }
                if (options.executeTool) {
                    hostResult.toolOutput = await host.executeServerTool(
                        serverName,
                        options.executeTool.name,
                        options.executeTool.args ?? {},
                    );
                }

                return hostResult;
            });
        }

        result.transport = (await this.probeServer(serverName, options)).result;
        return result;
    }

    /**
     * Probe configured HTTP MCP servers using the shared MCPHttpTransport helper surface.
     * Stdio servers are skipped because they do not expose the same resumable HTTP semantics.
     */
    async probeServers(options: MCPProbeOptions = {}): Promise<NodeMCPHostProbeResult[]> {
        const results: NodeMCPHostProbeResult[] = [];

        for (const server of this.config.servers) {
            if (server.transport !== 'http') {
                continue;
            }

            results.push(await this.probeServer(server.name, options));
        }

        return results;
    }

    // ========================================================================
    // Private
    // ========================================================================

    private async createTransport(server: MCPServerConfig): Promise<any> {
        if (server.transport === 'stdio') {
            return new StdioClientTransport({
                command: server.command,
                args: server.args,
                env: server.env,
            });
        }

        const token = server.token ?? await server.tokenProvider?.();
        const headers = buildHttpHeaders(server, token);

        return new StreamableHTTPClientTransport(new URL(server.url!), {
            requestInit: {
                headers,
            },
        });
    }

    private async withConnectedServerProbeHost<T>(
        server: MCPServerConfig,
        run: (host: NodeMCPHost) => Promise<T>,
    ): Promise<T> {
        if (this.clients.has(server.name)) {
            return run(this);
        }

        const ephemeralHost = new NodeMCPHost({
            servers: [server],
            clientName: this.config.clientName,
            clientVersion: this.config.clientVersion,
        });
        await ephemeralHost.connect();

        try {
            return await run(ephemeralHost);
        } finally {
            await ephemeralHost.dispose();
        }
    }

    private async refreshTools(): Promise<void> {
        const allTools: RegisteredTool[] = [];

        for (const [serverName, client] of this.clients) {
            try {
                const result = await client.listTools();
                for (const t of result.tools) {
                    allTools.push({
                        name: t.name,
                        description: t.description ?? '',
                        parameters: (t.inputSchema as any) ?? { type: 'object' as const, properties: {} },
                        source: { type: 'mcp' as const, namespace: serverName },
                        requiresApproval: this.getPolicyForServer(serverName).requiresApproval ?? false,
                        execute: async (args: Record<string, unknown>, _context?: RegisteredToolContext) => {
                            return this.executeClientTool(serverName, client, t.name, args, _context);
                        },
                    });
                }
            } catch {
                // Server may not support tools
            }
        }

        this.toolsCache = allTools;

        // Notify listeners
        for (const cb of this.changeCallbacks) {
            cb(allTools);
        }
    }

    /**
     * Get tool policy for a given server name.
     */
    private getPolicyForServer(serverName: string): MCPToolPolicy {
        const serverConfig = this.config.servers.find(s => s.name === serverName);
        return serverConfig?.toolPolicy ?? {};
    }

    private async executeClientTool(
        serverName: string,
        client: Client,
        toolName: string,
        args: Record<string, unknown>,
        context?: RegisteredToolContext,
    ): Promise<string> {
        const policy = this.getPolicyForServer(serverName);
        const maxLen = policy.maxOutputLength ?? 1_048_576;

        const requestOptions: Record<string, unknown> = {
            timeout: policy.timeout ?? 30000,
            resetTimeoutOnProgress: policy.resetTimeoutOnProgress ?? false,
        };
        if (policy.maxTotalTimeout != null) {
            requestOptions.maxTotalTimeout = policy.maxTotalTimeout;
        }
        if (context?.abortSignal) {
            requestOptions.signal = context.abortSignal;
        }

        const callResult = await client.callTool(
            { name: toolName, arguments: args as Record<string, unknown> },
            undefined,
            requestOptions as any,
        );

        let output: string;
        if (Array.isArray(callResult.content)) {
            output = callResult.content
                .map((c: any) => c.text ?? JSON.stringify(c))
                .join('\n');
        } else {
            output = JSON.stringify(callResult.content);
        }

        if (output.length > maxLen) {
            output = output.slice(0, maxLen) + `\n[TRUNCATED: exceeded ${maxLen} chars]`;
        }

        return output;
    }
}

function buildHttpHeaders(server: MCPHttpServerConfig, token?: string): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: server.accept ?? DEFAULT_MCP_CONFIG.accept,
        'MCP-Protocol-Version': server.protocolVersion ?? DEFAULT_MCP_CONFIG.protocolVersion,
        ...server.headers,
    };

    if (server.sessionId) {
        headers['MCP-Session-Id'] = server.sessionId;
    }
    if (server.lastEventId) {
        headers['Last-Event-ID'] = server.lastEventId;
    }
    if (server.origin) {
        headers.Origin = server.origin;
    }
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return headers;
}
