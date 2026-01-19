/**
 * MCP (Model Context Protocol) Client types.
 * Phase 1: stdio transport + Bearer token
 * Phase 3: HTTP transport + OAuth 2.0
 */

import type { ToolParameters } from '../../lib/tool-registry';

/** MCP transport type */
export type MCPTransport = 'stdio' | 'http';

/** OAuth 2.0 configuration for HTTP transport */
export interface MCPOAuthConfig {
    /** OAuth client ID */
    clientId: string;
    /** OAuth client secret (optional for public clients) */
    clientSecret?: string;
    /** Requested scopes */
    scopes: string[];
    /** Authorization endpoint URL (auto-discovered if not set) */
    authorizationUrl?: string;
    /** Token endpoint URL (auto-discovered if not set) */
    tokenUrl?: string;
    /** Device code endpoint for headless auth (optional) */
    deviceCodeUrl?: string;
    /** Redirect URI for auth code flow (default: random localhost port) */
    redirectUri?: string;
}

/** Base MCP server configuration */
export interface MCPServerConfigBase {
    /** Server name (unique identifier) */
    name: string;
    /** Bearer token for authentication (legacy) */
    token?: string;
}

/** Stdio transport configuration */
export interface MCPStdioServerConfig extends MCPServerConfigBase {
    transport: 'stdio';
    /** Command to execute */
    command: string;
    /** Command arguments */
    args?: string[];
    /** Environment variables */
    env?: Record<string, string>;
}

/** HTTP transport configuration */
export interface MCPHttpServerConfig extends MCPServerConfigBase {
    transport: 'http';
    /** MCP server URL (e.g., https://mcp.example.com/mcp) */
    url: string;
    /** Static bearer token for authentication */
    token?: string;
    /** Dynamic token provider (e.g., from TokenManager) */
    tokenProvider?: () => Promise<string>;
    /** OAuth configuration (for reference, use with TokenManager) */
    oauth?: MCPOAuthConfig;
    /** Custom headers */
    headers?: Record<string, string>;
    /** Request timeout in ms (default: 30000) */
    timeout?: number;
}

/** Union type for server configuration */
export type MCPServerConfig = MCPStdioServerConfig | MCPHttpServerConfig;

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
    /** Request timeout in ms (stdio transport, default: 30000) */
    requestTimeout?: number;
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
    httpTimeout: 30000, // 30s per request
} as const;

