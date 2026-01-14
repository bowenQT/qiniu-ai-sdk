/**
 * MCP Client with stdio transport.
 * Phase 1: Bearer token only, no OAuth.
 */

import { spawn, type ChildProcess } from 'child_process';
import type {
    MCPClientConfig,
    MCPServerConfig,
    MCPToolDefinition,
    MCPToolResult,
    MCPConnectionState,
} from './types';
import { DEFAULT_MCP_CONFIG } from './types';
import type { Logger } from '../../lib/logger';
import { noopLogger } from '../../lib/logger';

/** MCP Client error */
export class MCPClientError extends Error {
    constructor(message: string, public readonly serverName?: string) {
        super(message);
        this.name = 'MCPClientError';
    }
}

/** Server connection */
interface ServerConnection {
    config: MCPServerConfig;
    process: ChildProcess | null;
    state: MCPConnectionState;
    tools: MCPToolDefinition[];
    requestId: number;
    pendingRequests: Map<number, {
        resolve: (value: unknown) => void;
        reject: (reason: unknown) => void;
    }>;
    buffer: string;
}

/**
 * MCP Client manages connections to MCP servers.
 */
export class MCPClient {
    private readonly config: Required<MCPClientConfig>;
    private readonly logger: Logger;
    private readonly connections = new Map<string, ServerConnection>();

    constructor(config: MCPClientConfig, logger?: Logger) {
        this.config = {
            servers: config.servers,
            connectionTimeout: config.connectionTimeout ?? DEFAULT_MCP_CONFIG.connectionTimeout,
        };
        this.logger = logger ?? noopLogger;

        // Initialize connections (not started)
        for (const server of this.config.servers) {
            this.connections.set(server.name, {
                config: server,
                process: null,
                state: 'disconnected',
                tools: [],
                requestId: 0,
                pendingRequests: new Map(),
                buffer: '',
            });
        }
    }

    /**
     * Connect to all configured servers.
     */
    async connect(): Promise<void> {
        const promises = Array.from(this.connections.keys()).map(name =>
            this.connectServer(name)
        );
        await Promise.all(promises);
    }

    /**
     * Connect to a specific server.
     */
    async connectServer(serverName: string): Promise<void> {
        const conn = this.connections.get(serverName);
        if (!conn) {
            throw new MCPClientError(`Server not found: ${serverName}`, serverName);
        }

        if (conn.state === 'connected') {
            return;
        }

        conn.state = 'connecting';

        try {
            // Spawn process
            const { command, args = [], env = {} } = conn.config;

            conn.process = spawn(command, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, ...env },
            });

            // Handle stdout (JSON-RPC responses)
            conn.process.stdout?.on('data', (data: Buffer) => {
                this.handleData(serverName, data.toString());
            });

            // Handle stderr (logs)
            conn.process.stderr?.on('data', (data: Buffer) => {
                this.logger.debug('MCP server stderr', { server: serverName, data: data.toString() });
            });

            // Handle exit
            conn.process.on('exit', (code) => {
                this.logger.info('MCP server exited', { server: serverName, code });
                conn.state = 'disconnected';
                conn.process = null;
            });

            // Wait for connection with timeout
            await Promise.race([
                this.initialize(serverName),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new MCPClientError('Connection timeout', serverName)), this.config.connectionTimeout)
                ),
            ]);

            // List tools
            conn.tools = await this.listToolsInternal(serverName);
            conn.state = 'connected';

            this.logger.info('MCP server connected', {
                server: serverName,
                tools: conn.tools.length,
            });
        } catch (error) {
            conn.state = 'error';
            throw error;
        }
    }

    /**
     * Disconnect from all servers.
     */
    async disconnect(): Promise<void> {
        for (const [name, conn] of this.connections) {
            if (conn.process) {
                conn.process.kill();
                conn.process = null;
                conn.state = 'disconnected';
                this.logger.info('MCP server disconnected', { server: name });
            }
        }
    }

    /**
     * Get all tools from all connected servers.
     * Sorted by server name, then tool name for deterministic order.
     */
    getAllTools(): MCPToolDefinition[] {
        const allTools: Array<MCPToolDefinition & { server: string }> = [];

        const serverNames = Array.from(this.connections.keys()).sort();
        for (const serverName of serverNames) {
            const conn = this.connections.get(serverName)!;
            for (const tool of conn.tools) {
                allTools.push({ ...tool, server: serverName });
            }
        }

        // Sort by tool name
        return allTools.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Execute a tool.
     */
    async executeTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown>
    ): Promise<MCPToolResult> {
        const conn = this.connections.get(serverName);
        if (!conn || conn.state !== 'connected') {
            throw new MCPClientError(`Server not connected: ${serverName}`, serverName);
        }

        return this.sendRequest(serverName, 'tools/call', {
            name: toolName,
            arguments: args,
        }) as Promise<MCPToolResult>;
    }

    /**
     * Get connection state.
     */
    getState(serverName: string): MCPConnectionState {
        return this.connections.get(serverName)?.state ?? 'disconnected';
    }

    /**
     * Initialize connection (MCP handshake).
     */
    private async initialize(serverName: string): Promise<void> {
        await this.sendRequest(serverName, 'initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
                name: 'qiniu-ai-sdk',
                version: '0.11.0',
            },
        });

        await this.sendNotification(serverName, 'notifications/initialized', {});
    }

    /**
     * List tools from server.
     */
    private async listToolsInternal(serverName: string): Promise<MCPToolDefinition[]> {
        const result = await this.sendRequest(serverName, 'tools/list', {}) as {
            tools: MCPToolDefinition[];
        };
        return result.tools ?? [];
    }

    /**
     * Send JSON-RPC request.
     */
    private sendRequest(serverName: string, method: string, params: unknown): Promise<unknown> {
        const conn = this.connections.get(serverName)!;
        const id = ++conn.requestId;

        const message = JSON.stringify({
            jsonrpc: '2.0',
            id,
            method,
            params,
        }) + '\n';

        return new Promise((resolve, reject) => {
            conn.pendingRequests.set(id, { resolve, reject });
            conn.process?.stdin?.write(message);
        });
    }

    /**
     * Send JSON-RPC notification.
     */
    private sendNotification(serverName: string, method: string, params: unknown): void {
        const conn = this.connections.get(serverName)!;
        const message = JSON.stringify({
            jsonrpc: '2.0',
            method,
            params,
        }) + '\n';
        conn.process?.stdin?.write(message);
    }

    /**
     * Handle incoming data.
     */
    private handleData(serverName: string, data: string): void {
        const conn = this.connections.get(serverName)!;
        conn.buffer += data;

        // Process complete messages
        const lines = conn.buffer.split('\n');
        conn.buffer = lines.pop() ?? '';

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const message = JSON.parse(line);

                if (message.id !== undefined && conn.pendingRequests.has(message.id)) {
                    const { resolve, reject } = conn.pendingRequests.get(message.id)!;
                    conn.pendingRequests.delete(message.id);

                    if (message.error) {
                        reject(new MCPClientError(message.error.message, serverName));
                    } else {
                        resolve(message.result);
                    }
                }
            } catch {
                this.logger.warn('Failed to parse MCP message', { server: serverName, line });
            }
        }
    }
}
