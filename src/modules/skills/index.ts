/**
 * Skills module public exports.
 */

export { SkillLoader, SkillSecurityError, SkillNotFoundError } from './loader';
export type {
    Skill,
    SkillLoaderConfig,
    SkillReference,
    SkillInjectionConfig,
    SkillInjectionPosition,
    SkillBudget,
} from './types';
export { DEFAULT_SKILL_CONFIG, DEFAULT_SKILL_BUDGET } from './types';

// Skill Marketplace Protocol (v0.32.0)
export {
    parseManifest,
    parseManifestStrict,
    checkCompatibility,
} from './manifest';
export type {
    SkillManifest,
    SkillEntryType,
    SkillPermission,
    ManifestParseResult,
    CompatibilityCheckResult,
} from './manifest';

export { SkillRegistry } from './registry';
export type {
    SkillRegistryConfig,
    RemoteSkillSource,
    RegisteredSkill,
    SkillSearchResult,
} from './registry';

// Registry Protocol v2 (interface reservation)
export { RegistryProtocolStub } from './registry-protocol';
export type {
    SkillRegistryProtocol,
    RegistrySkillEntry,
    RegistrySearchOptions,
} from './registry-protocol';
