/**
 * Skills module public exports.
 */

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
export { applyReferenceMode } from './reference-mode';
export type {
    ReferenceMode,
    SkillInput,
    ReferenceModeResult,
} from './reference-mode';
