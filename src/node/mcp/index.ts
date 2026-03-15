/**
 * MCP module public exports.
 */

// HTTP Transport (Phase 3)
export {
    MCPHttpTransport,
    MCPHttpTransportError,
    type TokenProvider,
    type MCPProbeOptions,
    type MCPProbeResult,
} from './http-transport';

// OAuth (Phase 3)
export {
    PKCEFlow,
    DeviceCodeFlow,
    OAuthError,
    generateCodeVerifier,
    generateCodeChallenge,
    generateState,
    discoverProtectedResourceMetadata,
    discoverAuthorizationServerMetadata,
    discoverMcpOAuthMetadata,
    refreshAccessToken,
    type OAuthTokens,
    type ProtectedResourceMetadata,
    type AuthorizationServerMetadata,
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
    MCPServerConfig,
    MCPStdioServerConfig,
    MCPHttpServerConfig,
    MCPOAuthConfig,
    MCPToolDefinition,
    MCPToolResult,
    MCPTransport,
} from './types';
export { DEFAULT_MCP_CONFIG } from './types';

// MCP Server (Phase 4)
export { QiniuMCPServer, startFromEnv, type QiniuMCPServerConfig } from './server';
