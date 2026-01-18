/**
 * MCP module public exports.
 */

// Client
export { MCPClient, MCPClientError } from './client';
export { adaptMCPToolsToRegistry, getAllMCPToolsAsRegistered } from './adapter';

// HTTP Transport (Phase 3)
export { MCPHttpTransport, MCPHttpTransportError, type TokenProvider } from './http-transport';

// OAuth (Phase 3)
export {
    PKCEFlow,
    DeviceCodeFlow,
    OAuthError,
    generateCodeVerifier,
    generateCodeChallenge,
    generateState,
    refreshAccessToken,
    type OAuthTokens,
} from './oauth';

// Token Store (Phase 3)
export {
    MemoryTokenStore,
    FileTokenStore,
    TokenManager,
    type TokenStore,
    type FileTokenStoreConfig,
} from './token-store';

// Types
export type {
    MCPClientConfig,
    MCPServerConfig,
    MCPStdioServerConfig,
    MCPHttpServerConfig,
    MCPOAuthConfig,
    MCPToolDefinition,
    MCPToolResult,
    MCPConnectionState,
    MCPTransport,
} from './types';
export { DEFAULT_MCP_CONFIG } from './types';

// MCP Server (Phase 4)
export { QiniuMCPServer, startFromEnv, type QiniuMCPServerConfig } from './server';
