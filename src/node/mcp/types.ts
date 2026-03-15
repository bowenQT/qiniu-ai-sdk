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
    /** Negotiated MCP protocol version (default: 2025-11-25) */
    protocolVersion?: string;
    /** Existing MCP session id for stream resume / sticky sessions */
    sessionId?: string;
    /** Last SSE event id for stream resume */
    lastEventId?: string;
    /** Origin header for servers that validate browser-style origins */
    origin?: string;
    /** Accept header override for transport negotiation */
    accept?: string;
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

export interface MCPResourceDefinition {
    uri: string;
    name: string;
    mimeType?: string;
}

export interface MCPPromptDefinition {
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        required?: boolean;
    }>;
}

/** Default configuration */
export const DEFAULT_MCP_CONFIG = {
    connectionTimeout: 30000, // 30s
    httpTimeout: 30000, // 30s per request
    protocolVersion: '2025-11-25',
    accept: 'application/json, text/event-stream',
} as const;
