/**
 * Node.js specific exports.
 * Contains modules that require Node.js APIs (fs, path, child_process).
 * Browser/Edge builds should NOT import from this module.
 */

export { createNodeQiniuAI } from './client';
export type { NodeQiniuAI, NodeQiniuAIOptions } from './client';

// Re-export skill loader (requires fs, path)
export { SkillLoader, SkillSecurityError, SkillNotFoundError } from '../modules/skills/loader';
export type {
    Skill,
    SkillLoaderConfig,
    SkillReference,
    SkillInjectionConfig,
    SkillInjectionPosition,
    SkillBudget,
} from '../modules/skills/types';
export { DEFAULT_SKILL_CONFIG, DEFAULT_SKILL_BUDGET } from '../modules/skills/types';
export { SkillRegistry, RegistryProtocolStub } from '../modules/skills';
export type {
    SkillRegistryConfig,
    RemoteSkillSource,
    SkillRegistryProtocol,
    RegistrySkillEntry,
    RegistrySearchOptions,
} from '../modules/skills';


// Re-export NodeMCPHost (MCP Host Layer v2)
export { NodeMCPHost } from './mcp-host';
export type { NodeMCPHostConfig, MCPServerConfig } from './mcp-host';

// Re-export Skill Package v2 modules
export { SkillValidator, DEFAULT_CONTENT_EXTENSIONS, DEFAULT_ACTION_EXTENSIONS } from '../modules/skills/validator';
export { SkillInstaller } from '../modules/skills/installer';
export { createLockEntry, writeLockfile, readLockfile } from '../modules/skills/lockfile';
export type { SkillLockEntry } from '../modules/skills/lockfile';
export { applyReferenceMode } from '../modules/skills/reference-mode';
export { auditLogger, AuditLoggerCollector } from '../ai/guardrails/audit-logger';
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
} from '../modules/mcp';
export type {
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
} from '../modules/mcp';

// Node-only runtime/integration exports
export { RedisCheckpointer, PostgresCheckpointer } from '../ai/graph';
export { KodoCheckpointer } from './kodo-checkpointer';
export type {
    RedisClient,
    RedisCheckpointerConfig,
    PostgresClient,
    PostgresCheckpointerConfig,
} from '../ai/graph';
export type { KodoCheckpointerConfig, KodoRegion } from './kodo-checkpointer';

export { Sandbox as QiniuSandbox } from '../modules/sandbox';
export { SandboxInstance, CommandHandle, SandboxPty } from '../modules/sandbox';
export { Templates as SandboxTemplates, TemplateCreateResponse } from '../modules/sandbox';
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
} from '../modules/sandbox';
