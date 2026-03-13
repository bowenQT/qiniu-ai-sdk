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


// Re-export NodeMCPHost (MCP Host Layer v2)
export { NodeMCPHost } from './mcp-host';
export type { NodeMCPHostConfig, MCPServerConfig } from './mcp-host';

// Re-export Skill Package v2 modules
export { SkillValidator, DEFAULT_CONTENT_EXTENSIONS, DEFAULT_ACTION_EXTENSIONS } from '../modules/skills/validator';
export { SkillInstaller } from '../modules/skills/installer';
export { createLockEntry, writeLockfile, readLockfile } from '../modules/skills/lockfile';
export type { SkillLockEntry } from '../modules/skills/lockfile';
export { applyReferenceMode } from '../modules/skills/reference-mode';
