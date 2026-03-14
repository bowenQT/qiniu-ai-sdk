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

    async readResource(serverName: string, uri: string): Promise<string> {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server "${serverName}" not found`);
        }

        const result = await client.readResource({ uri });
        const contents = result.contents;
        if (contents.length === 0) {
            return '';
        }
        return (contents[0] as any).text ?? JSON.stringify(contents[0]);
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

    async getPrompt(
        serverName: string,
        name: string,
        args?: Record<string, string>,
    ): Promise<string> {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP server "${serverName}" not found`);
        }

        const result = await client.getPrompt({ name, arguments: args });
        const messages = result.messages;
        if (messages.length === 0) {
            return '';
        }

        return messages.map(m => {
            const content = m.content;
            if (typeof content === 'string') return content;
            if (content && typeof content === 'object' && 'text' in content) {
                return (content as any).text;
            }
            return JSON.stringify(content);
        }).join('\n');
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

    private async refreshTools(): Promise<void> {
        const allTools: RegisteredTool[] = [];

        for (const [serverName, client] of this.clients) {
            try {
                const policy = this.getPolicyForServer(serverName);
                const result = await client.listTools();
                for (const t of result.tools) {
                    allTools.push({
                        name: t.name,
                        description: t.description ?? '',
                        parameters: (t.inputSchema as any) ?? { type: 'object' as const, properties: {} },
                        source: { type: 'mcp' as const, namespace: serverName },
                        requiresApproval: policy.requiresApproval ?? false,
                        execute: async (args: Record<string, unknown>, _context?: RegisteredToolContext) => {
                            const maxLen = policy.maxOutputLength ?? 1_048_576;

                            // SDK-native timeout/cancel via RequestOptions
                            const requestOptions: Record<string, unknown> = {
                                timeout: policy.timeout ?? 30000,
                                resetTimeoutOnProgress: policy.resetTimeoutOnProgress ?? false,
                            };
                            if (policy.maxTotalTimeout != null) {
                                requestOptions.maxTotalTimeout = policy.maxTotalTimeout;
                            }
                            // Bridge context.abortSignal to MCP SDK RequestOptions
                            if (_context?.abortSignal) {
                                requestOptions.signal = _context.abortSignal;
                            }

                            const callResult = await client.callTool(
                                { name: t.name, arguments: args as Record<string, unknown> },
                                undefined,
                                requestOptions as any,
                            );

                            // Extract text from content array
                            let output: string;
                            if (Array.isArray(callResult.content)) {
                                output = callResult.content
                                    .map((c: any) => c.text ?? JSON.stringify(c))
                                    .join('\n');
                            } else {
                                output = JSON.stringify(callResult.content);
                            }

                            // Host-layer output truncation
                            if (output.length > maxLen) {
                                output = output.slice(0, maxLen) + `\n[TRUNCATED: exceeded ${maxLen} chars]`;
                            }

                            return output;
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
