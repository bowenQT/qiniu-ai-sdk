/**
 * Skill lockfile — tracks installed skill integrity.
 *
 * skill-lock.json stores per-file SHA256 digests captured at install time.
 * Used by SkillInstaller to verify integrity on subsequent loads.
 *
 * @module
 */

import * as fs from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface SkillLockEntry {
    name: string;
    version: string;
    manifestHash: string;
    files: Record<string, { sha256: string; size: number }>;
    /** Install-time policy: were action extensions permitted? */
    allowActions: boolean;
    installedAt: string;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Create a lock entry from install data.
 */
export function createLockEntry(data: {
    name: string;
    version: string;
    manifestHash: string;
    files: Record<string, { sha256: string; size: number }>;
    allowActions: boolean;
}): SkillLockEntry {
    return {
        ...data,
        installedAt: new Date().toISOString(),
    };
}

/**
 * Write lock entries to a skill-lock.json file.
 */
export function writeLockfile(filePath: string, entries: SkillLockEntry[]): void {
    const content = JSON.stringify({ skills: entries }, null, 2);
    fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Read lock entries from a skill-lock.json file.
 * Returns empty array if file doesn't exist.
 */
export function readLockfile(filePath: string): SkillLockEntry[] {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        return data.skills ?? [];
    } catch {
        return [];
    }
}
