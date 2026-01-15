/**
 * MCP Client with stdio and HTTP transport support.
 * Phase 1: Bearer token, Phase 3: OAuth 2.0
 */

import { spawn, type ChildProcess } from 'child_process';
import type {
    MCPClientConfig,
    MCPServerConfig,
    MCPHttpServerConfig,
    MCPToolDefinition,
    MCPToolResult,
    MCPConnectionState,
} from './types';
import { DEFAULT_MCP_CONFIG } from './types';
import type { Logger } from '../../lib/logger';
import { noopLogger } from '../../lib/logger';
import { MCPHttpTransport } from './http-transport';

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
    // Stdio transport
    process: ChildProcess | null;
    // HTTP transport (Phase 3)
    httpTransport: MCPHttpTransport | null;
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
                httpTransport: null,
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
            if (conn.config.transport === 'http') {
                // HTTP transport (Phase 3)
                const httpConfig = conn.config as MCPHttpServerConfig;

                // Validate authentication configuration
                if (httpConfig.oauth && !httpConfig.token && !httpConfig.tokenProvider) {
                    throw new MCPClientError(
                        `OAuth configured for '${serverName}' but no token or tokenProvider provided. ` +
                        'Use PKCEFlow/DeviceCodeFlow to obtain tokens first, then provide via token or tokenProvider.',
                        serverName
                    );
                }

                conn.httpTransport = new MCPHttpTransport(httpConfig);

                // Connect with timeout
                await Promise.race([
                    conn.httpTransport.connect(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new MCPClientError('Connection timeout', serverName)), this.config.connectionTimeout)
                    ),
                ]);

                // List tools via HTTP transport
                conn.tools = await conn.httpTransport.listTools();
                conn.state = 'connected';

                this.logger.info('MCP HTTP server connected', {
                    server: serverName,
                    tools: conn.tools.length,
                });
            } else {
                // Stdio transport (Phase 1)
                const { command, args = [], env = {}, token } = conn.config;

                // Inject bearer token via env if configured
                const processEnv = { ...process.env, ...env };
                if (token) {
                    processEnv.MCP_BEARER_TOKEN = token;
                }

                conn.process = spawn(command, args, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: processEnv,
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
            }
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
            if (conn.httpTransport) {
                await conn.httpTransport.disconnect();
                conn.httpTransport = null;
                conn.state = 'disconnected';
                this.logger.info('MCP HTTP server disconnected', { server: name });
            } else if (conn.process) {
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
     * Only returns tools from servers with state 'connected'.
     */
    getAllTools(): MCPToolDefinition[] {
        const allTools: Array<MCPToolDefinition & { server: string }> = [];

        const serverNames = Array.from(this.connections.keys()).sort();
        for (const serverName of serverNames) {
            const conn = this.connections.get(serverName)!;
            // Only include tools from connected servers
            if (conn.state !== 'connected') continue;
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

        // HTTP transport uses MCPHttpTransport
        if (conn.httpTransport) {
            return conn.httpTransport.executeTool(toolName, args);
        }

        // Stdio transport uses JSON-RPC
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
     * Get tools for a specific server.
     */
    getServerTools(serverName: string): MCPToolDefinition[] {
        const conn = this.connections.get(serverName);
        if (!conn || conn.state !== 'connected') {
            return [];
        }
        return conn.tools;
    }

    /**
     * Get names of all connected servers.
     */
    getConnectedServerNames(): string[] {
        const names: string[] = [];
        for (const [name, conn] of this.connections) {
            if (conn.state === 'connected') {
                names.push(name);
            }
        }
        return names.sort();
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
