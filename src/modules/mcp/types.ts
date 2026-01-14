/**
 * MCP (Model Context Protocol) Client types.
 * Phase 1: stdio transport + Bearer token only.
 */

import type { ToolParameters } from '../../lib/tool-registry';

/** MCP transport type */
export type MCPTransport = 'stdio';

/** MCP server configuration */
export interface MCPServerConfig {
    /** Server name (unique identifier) */
    name: string;
    /** Transport type */
    transport: MCPTransport;
    /** Command to execute (for stdio) */
    command: string;
    /** Command arguments */
    args?: string[];
    /** Environment variables */
    env?: Record<string, string>;
    /** Bearer token for authentication */
    token?: string;
}

/** MCP tool definition from server */
export interface MCPToolDefinition {
    name: string;
    description: string;
    inputSchema: ToolParameters;
}

/** MCP client configuration */
export interface MCPClientConfig {
    /** Servers to connect */
    servers: MCPServerConfig[];
    /** Connection timeout in ms */
    connectionTimeout?: number;
}

/** MCP tool execution result */
export interface MCPToolResult {
    content: Array<{
        type: 'text' | 'image' | 'resource';
        text?: string;
        data?: string;
        mimeType?: string;
    }>;
    isError?: boolean;
}

/** MCP server connection state */
export type MCPConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Default configuration */
export const DEFAULT_MCP_CONFIG = {
    connectionTimeout: 30000, // 30s
} as const;
