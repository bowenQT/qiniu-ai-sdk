/**
 * MCP module public exports.
 */

export { MCPClient, MCPClientError } from './client';
export { adaptMCPToolsToRegistry, getAllMCPToolsAsRegistered } from './adapter';
export type {
    MCPClientConfig,
    MCPServerConfig,
    MCPToolDefinition,
    MCPToolResult,
    MCPConnectionState,
    MCPTransport,
} from './types';
export { DEFAULT_MCP_CONFIG } from './types';
