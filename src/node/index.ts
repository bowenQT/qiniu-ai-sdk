/**
 * Node.js specific exports.
 * Contains modules that require Node.js APIs (fs, path, child_process).
 * Browser/Edge builds should NOT import from this module.
 */

export { createNodeQiniuAI } from './client';
export type { NodeQiniuAI, NodeQiniuAIOptions } from './client';

// Re-export skill loader (requires fs, path)
export { SkillLoader, SkillSecurityError, SkillNotFoundError } from './skills';
export type {
    Skill,
    SkillLoaderConfig,
    SkillReference,
    SkillInjectionConfig,
    SkillInjectionPosition,
    SkillBudget,
} from '../modules/skills/types';
export { DEFAULT_SKILL_CONFIG, DEFAULT_SKILL_BUDGET } from '../modules/skills/types';
export { SkillRegistry, RegistryProtocolStub } from './skills';
export type {
    SkillRegistryConfig,
    RemoteSkillSource,
    SkillRegistryProtocol,
    RegistrySkillEntry,
    RegistrySearchOptions,
} from './skills';


// Re-export NodeMCPHost (MCP Host Layer v2)
export { NodeMCPHost } from './mcp-host';
export type { NodeMCPHostConfig, MCPServerConfig } from './mcp-host';

// Re-export Skill Package v2 modules
export { SkillValidator, DEFAULT_CONTENT_EXTENSIONS, DEFAULT_ACTION_EXTENSIONS } from './skills';
export { SkillInstaller } from './skills';
export { createLockEntry, writeLockfile, readLockfile } from './skills';
export type { SkillLockEntry } from './skills';
export { applyReferenceMode } from '../modules/skills/reference-mode';
export { auditLogger, AuditLoggerCollector } from './audit-logger';
export { createKodoAuditSink } from './kodo-audit-sink';
export type { AuditLoggerConfig, AuditLogEntry, AuditSinkLike, AuditLoggerSink } from '../ai/guardrails/types';
export type { KodoAuditSinkConfig } from './kodo-audit-sink';

// MCP HTTP transport + OAuth + token stores are Node-only in the current implementation
export {
    MCPHttpTransport,
    MCPHttpTransportError,
    PKCEFlow,
    DeviceCodeFlow,
    OAuthError,
    generateCodeVerifier,
    generateCodeChallenge,
    generateState,
    refreshAccessToken,
    MemoryTokenStore,
    FileTokenStore,
    TokenManager,
    QiniuMCPServer,
    startFromEnv,
} from './mcp';
export type {
    MCPProbeOptions,
    MCPProbeResult,
    TokenProvider,
    OAuthTokens,
    TokenStore,
    FileTokenStoreConfig,
    MCPStdioServerConfig,
    MCPHttpServerConfig,
    MCPOAuthConfig,
    MCPToolDefinition,
    MCPToolResult,
    MCPTransport,
    QiniuMCPServerConfig,
} from './mcp';

// Node-only runtime/integration exports
export {
    RedisCheckpointer,
    PostgresCheckpointer,
    KodoCheckpointer,
} from './checkpointers';
export type {
    RedisClient,
    RedisCheckpointerConfig,
    PostgresClient,
    PostgresCheckpointerConfig,
    KodoCheckpointerConfig,
    KodoRegion,
} from './checkpointers';

export { Sandbox as QiniuSandbox } from './sandbox';
export { SandboxInstance, CommandHandle, SandboxPty } from './sandbox';
export { Templates as SandboxTemplates, TemplateCreateResponse } from './sandbox';
export { ChildTransport } from '../lib/child-transport';
export type {
    SandboxConfig,
    CreateSandboxParams,
    SandboxInfo,
    SandboxState,
    CommandResult,
    EntryInfo,
    ListSandboxParams,
    ListedSandbox,
    RunCommandOptions,
    WaitUntilReadyOptions,
    StreamCommandOptions,
    ProcessEvent,
    ProcessInfo,
    PtySize,
    PtyOptions,
    TemplateInfo,
    TemplateBuildInfo,
    TemplateBuildLogs,
    CreateTemplateParams,
    UpdateTemplateParams,
    WaitForBuildOptions,
} from './sandbox';
