/**
 * Node.js specific exports.
 * Contains modules that require Node.js APIs (fs, path, child_process).
 * Browser/Edge builds should NOT import from this module.
 */

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

// Re-export MCP client (requires child_process for stdio transport)
export { MCPClient, MCPClientError } from '../modules/mcp/client';
export type {
    MCPClientConfig,
    MCPServerConfig,
    MCPHttpServerConfig,
    MCPToolDefinition,
    MCPToolResult,
    MCPConnectionState,
} from '../modules/mcp/types';
export { DEFAULT_MCP_CONFIG } from '../modules/mcp/types';
