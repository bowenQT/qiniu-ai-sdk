/**
 * Skill Manifest types and parser for Marketplace Protocol.
 * 
 * Implements the skill.json manifest schema for machine-readable discovery,
 * SHA256 integrity verification, and version compatibility checks.
 * 
 * @module
 */

import { RecoverableError } from '../../lib/errors';

// ============================================================================
// Types
// ============================================================================

/** Skill entry point type */
export type SkillEntryType = 'markdown' | 'json';

/** Permission types for skill capabilities */
export type SkillPermission =
    | 'file:read'
    | 'file:write'
    | 'command:execute'
    | 'command:git'
    | 'network:fetch'
    | 'browser:navigate';

/** Skill manifest schema (skill.json) */
export interface SkillManifest {
    /** Skill name (unique identifier) */
    name: string;
    /** Semantic version */
    version: string;
    /** Human-readable description */
    description: string;
    /** Entry point file (relative path) */
    entry: string;
    /** Entry point type */
    entryType: SkillEntryType;
    /** Discovery tags */
    tags?: string[];
    /** Skill dependencies */
    dependencies?: string[];
    /** SDK compatibility requirements */
    compatibility?: {
        /** Minimum SDK version (semver) */
        sdk?: string;
    };
    /** Required permissions */
    permissions?: SkillPermission[];
    /** Author information */
    author?: {
        name?: string;
        email?: string;
        url?: string;
    };
    /** Repository URL */
    repository?: string;
    /** License identifier (SPDX) */
    license?: string;
    /**
     * Reserved: Package signature for future trust chain verification.
     * Not currently validated — will be enforced in a future SDK version.
     */
    signature?: {
        /** Signature algorithm (e.g., 'ed25519') */
        algorithm: string;
        /** Base64-encoded signature of the canonical manifest content */
        value: string;
        /** Public key identifier or URL for verification */
        publicKey: string;
    };
    /** V2: File-level integrity digests (path → {sha256, size}) */
    files?: Record<string, { sha256: string; size: number }>;
    /** V2: Action scripts */
    actions?: SkillAction[];
    /** V2: Runtime configuration */
    runtime?: SkillRuntime;
}

/** Skill action declaration */
export interface SkillAction {
    name: string;
    script: string;
    description?: string;
}

/** Skill runtime configuration */
export interface SkillRuntime {
    engine: 'sandbox' | 'node';
    entryCommand?: string;
}

/**
 * Check if a manifest is v2 (has file-level integrity digests).
 */
export function isManifestV2(manifest: unknown): boolean {
    if (typeof manifest !== 'object' || manifest === null) return false;
    const m = manifest as Record<string, unknown>;
    return typeof m.files === 'object' && m.files !== null && !Array.isArray(m.files);
}

/** Parse result */
export interface ManifestParseResult {
    valid: boolean;
    manifest?: SkillManifest;
    errors: string[];
}

/** Compatibility check result */
export interface CompatibilityCheckResult {
    compatible: boolean;
    reason?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Required manifest fields */
const REQUIRED_FIELDS = ['name', 'version', 'description', 'entry', 'entryType'] as const;

/** Valid entry types */
const VALID_ENTRY_TYPES: SkillEntryType[] = ['markdown', 'json'];

/** Valid permissions */
const VALID_PERMISSIONS: SkillPermission[] = [
    'file:read',
    'file:write',
    'command:execute',
    'command:git',
    'network:fetch',
    'browser:navigate',
];

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse and validate a skill manifest.
 * 
 * @param content - Raw JSON string content of skill.json
 * @returns Parse result with validation errors
 * 
 * @example
 * ```typescript
 * const result = parseManifest(fs.readFileSync('skill.json', 'utf-8'));
 * if (result.valid) {
 *     console.log(result.manifest.name);
 * }
 * ```
 */
export function parseManifest(content: string): ManifestParseResult {
    const errors: string[] = [];

    // Parse JSON
    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch (e) {
        return {
            valid: false,
            errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
        };
    }

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        return {
            valid: false,
            errors: ['Manifest must be a JSON object'],
        };
    }

    const obj = raw as Record<string, unknown>;

    // Validate required fields
    for (const field of REQUIRED_FIELDS) {
        if (!(field in obj)) {
            errors.push(`Missing required field: ${field}`);
        }
    }

    // Validate field types
    if ('name' in obj && typeof obj.name !== 'string') {
        errors.push('Field "name" must be a string');
    }
    if ('version' in obj && typeof obj.version !== 'string') {
        errors.push('Field "version" must be a string');
    }
    if ('description' in obj && typeof obj.description !== 'string') {
        errors.push('Field "description" must be a string');
    }
    if ('entry' in obj && typeof obj.entry !== 'string') {
        errors.push('Field "entry" must be a string');
    }

    // Validate entryType
    if ('entryType' in obj) {
        if (!VALID_ENTRY_TYPES.includes(obj.entryType as SkillEntryType)) {
            errors.push(`Invalid entryType: must be one of ${VALID_ENTRY_TYPES.join(', ')}`);
        }
    }

    // Validate optional fields
    if ('tags' in obj && obj.tags !== undefined) {
        if (!Array.isArray(obj.tags) || !obj.tags.every(t => typeof t === 'string')) {
            errors.push('Field "tags" must be an array of strings');
        }
    }

    if ('dependencies' in obj && obj.dependencies !== undefined) {
        if (!Array.isArray(obj.dependencies) || !obj.dependencies.every(d => typeof d === 'string')) {
            errors.push('Field "dependencies" must be an array of strings');
        }
    }

    if ('permissions' in obj && obj.permissions !== undefined) {
        if (!Array.isArray(obj.permissions)) {
            errors.push('Field "permissions" must be an array');
        } else {
            for (const perm of obj.permissions) {
                if (!VALID_PERMISSIONS.includes(perm as SkillPermission)) {
                    errors.push(`Invalid permission: ${perm}`);
                }
            }
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    // Construct validated manifest
    const manifest: SkillManifest = {
        name: obj.name as string,
        version: obj.version as string,
        description: obj.description as string,
        entry: obj.entry as string,
        entryType: obj.entryType as SkillEntryType,
        tags: obj.tags as string[] | undefined,
        dependencies: obj.dependencies as string[] | undefined,
        permissions: obj.permissions as SkillPermission[] | undefined,
    };

    if (obj.compatibility && typeof obj.compatibility === 'object') {
        manifest.compatibility = obj.compatibility as SkillManifest['compatibility'];
    }
    if (obj.author && typeof obj.author === 'object') {
        manifest.author = obj.author as SkillManifest['author'];
    }
    if (typeof obj.repository === 'string') {
        manifest.repository = obj.repository;
    }
    if (typeof obj.license === 'string') {
        manifest.license = obj.license;
    }
    if (obj.files && typeof obj.files === 'object' && !Array.isArray(obj.files)) {
        manifest.files = obj.files as SkillManifest['files'];
    }
    if (Array.isArray(obj.actions)) {
        manifest.actions = obj.actions as SkillAction[];
    }
    if (obj.runtime && typeof obj.runtime === 'object') {
        manifest.runtime = obj.runtime as SkillRuntime;
    }
    if (obj.signature && typeof obj.signature === 'object') {
        manifest.signature = obj.signature as SkillManifest['signature'];
    }

    return { valid: true, manifest, errors: [] };
}

/**
 * Parse manifest with strict validation (throws on error).
 * 
 * @param content - Raw JSON string content
 * @returns Validated manifest
 * @throws RecoverableError if validation fails
 */
export function parseManifestStrict(content: string): SkillManifest {
    const result = parseManifest(content);
    if (!result.valid) {
        throw new RecoverableError(
            `Invalid skill manifest: ${result.errors.join('; ')}`,
            'manifest-parser',
            'Fix the manifest errors and retry'
        );
    }
    return result.manifest!;
}

// ============================================================================
// Version Compatibility
// ============================================================================

/**
 * Check if a skill is compatible with the current SDK version.
 * 
 * @param manifest - Skill manifest
 * @param sdkVersion - Current SDK version
 * @returns Compatibility result
 */
export function checkCompatibility(
    manifest: SkillManifest,
    sdkVersion: string
): CompatibilityCheckResult {
    if (!manifest.compatibility?.sdk) {
        return { compatible: true };
    }

    const requirement = manifest.compatibility.sdk;

    // Parse semver requirement (supports >=, >, <, <=, ^, ~)
    const match = requirement.match(/^([><=^~]+)?(\d+)\.(\d+)\.(\d+)/);
    if (!match) {
        return { compatible: false, reason: `Invalid SDK requirement: ${requirement}` };
    }

    const [, operator = '>=', reqMajor, reqMinor, reqPatch] = match;
    const reqVersion = [parseInt(reqMajor), parseInt(reqMinor), parseInt(reqPatch)];

    const sdkMatch = sdkVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!sdkMatch) {
        return { compatible: false, reason: `Invalid SDK version format: ${sdkVersion}` };
    }

    const [, sdkMajor, sdkMinor, sdkPatch] = sdkMatch;
    const currentVersion = [parseInt(sdkMajor), parseInt(sdkMinor), parseInt(sdkPatch)];

    const compare = compareVersions(currentVersion, reqVersion);

    switch (operator) {
        case '>=':
            return compare >= 0
                ? { compatible: true }
                : { compatible: false, reason: `Requires SDK ${requirement}, current: ${sdkVersion}` };
        case '>':
            return compare > 0
                ? { compatible: true }
                : { compatible: false, reason: `Requires SDK ${requirement}, current: ${sdkVersion}` };
        case '<=':
            return compare <= 0
                ? { compatible: true }
                : { compatible: false, reason: `Requires SDK ${requirement}, current: ${sdkVersion}` };
        case '<':
            return compare < 0
                ? { compatible: true }
                : { compatible: false, reason: `Requires SDK ${requirement}, current: ${sdkVersion}` };
        case '^':
            // Compatible if same major and >= minor.patch
            return currentVersion[0] === reqVersion[0] && compare >= 0
                ? { compatible: true }
                : { compatible: false, reason: `Requires SDK ${requirement}, current: ${sdkVersion}` };
        case '~':
            // Compatible if same major.minor and >= patch
            return currentVersion[0] === reqVersion[0] && currentVersion[1] === reqVersion[1] && compare >= 0
                ? { compatible: true }
                : { compatible: false, reason: `Requires SDK ${requirement}, current: ${sdkVersion}` };
        default:
            return compare === 0
                ? { compatible: true }
                : { compatible: false, reason: `Requires SDK ${requirement}, current: ${sdkVersion}` };
    }
}

/**
 * Compare two version arrays.
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareVersions(a: number[], b: number[]): number {
    for (let i = 0; i < 3; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
    }
    return 0;
}
