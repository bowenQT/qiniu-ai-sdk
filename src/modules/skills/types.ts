/**
 * Skill types for agent knowledge injection.
 */

/** Skill injection position in message history */
export type SkillInjectionPosition = 'system-end' | 'user-prefix';

/** Skill injection configuration */
export interface SkillInjectionConfig {
    /** Where to inject skills (default: system-end) */
    position: SkillInjectionPosition;
    /** Separator between original content and skills */
    separator: string;
}

/** Parsed skill definition */
export interface Skill {
    /** Skill name (directory name) */
    name: string;
    /** Main content from SKILL.md */
    content: string;
    /** Resolved references */
    references: SkillReference[];
    /** Estimated token count */
    tokenCount: number;
}

/** Skill reference (inline file) */
export interface SkillReference {
    /** Relative path from SKILL.md */
    path: string;
    /** File content */
    content: string;
}

/** Skill loader configuration */
export interface SkillLoaderConfig {
    /** Root directory for skills */
    skillsDir: string;
    /** Allowed file extensions */
    allowedExtensions?: string[];
    /** Max file size in bytes */
    maxFileSize?: number;
    /** Max reference depth */
    maxReferenceDepth?: number;
}

/** Default configuration values */
export const DEFAULT_SKILL_CONFIG = {
    allowedExtensions: ['.md', '.txt', '.json'],
    maxFileSize: 64 * 1024, // 64KB
    maxReferenceDepth: 1,
    separator: '\n\n---\n\n',
} as const;

/** Skill token budget configuration */
export interface SkillBudget {
    /** Max tokens per skill */
    maxPerSkill: number;
    /** Max total tokens for all skills */
    maxTotal: number;
    /** Multiplier for CJK text (default: 1.5) */
    cjkMultiplier: number;
}

/** Default skill budget */
export const DEFAULT_SKILL_BUDGET: SkillBudget = {
    maxPerSkill: 8 * 1024,
    maxTotal: 32 * 1024,
    cjkMultiplier: 1.5,
};
