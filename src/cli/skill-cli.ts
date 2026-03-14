#!/usr/bin/env node
/**
 * qiniu-ai CLI — Skill management and SDK utility commands.
 *
 * Usage:
 *   qiniu-ai skill list [--dir <skills-dir>]
 *   qiniu-ai skill add <manifest-url> [--sha256 <hash>] [--auth <token>] [--allow-actions] [--dir <dir>]
 *   qiniu-ai skill verify [--fix] [--dir <skills-dir>]
 *   qiniu-ai skill remove <name> [--dir <skills-dir>]
 *
 * @module
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
    SkillValidator,
    DEFAULT_CONTENT_EXTENSIONS,
    DEFAULT_ACTION_EXTENSIONS,
} from '../node/skills';
import { SkillRegistry } from '../node/skills';
import type { RemoteSkillSource } from '../node/skills';

// ============================================================================
// Lockfile helpers (re-import to keep CLI standalone-ish)
// ============================================================================

interface SkillLockEntry {
    name: string;
    version: string;
    manifestHash: string;
    files: Record<string, { sha256: string; size: number }>;
    allowActions: boolean;
    installedAt: string;
}

interface LockfileData {
    version: 1;
    skills: SkillLockEntry[];
}

function readLockfileSafe(lockPath: string): SkillLockEntry[] {
    try {
        if (!fs.existsSync(lockPath)) return [];
        const data = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as LockfileData;
        return data.skills ?? [];
    } catch {
        return [];
    }
}

function writeLockfileSafe(lockPath: string, entries: SkillLockEntry[]): void {
    const data: LockfileData = { version: 1, skills: entries };
    fs.writeFileSync(lockPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ============================================================================
// CLI Commands
// ============================================================================

export function resolveSkillsDir(args: string[]): string {
    const dirIdx = args.indexOf('--dir');
    if (dirIdx >= 0 && args[dirIdx + 1]) {
        return path.resolve(args[dirIdx + 1]);
    }
    return path.resolve('.agent/skills');
}

/** skill list — Lists installed skills from lockfile. */
export function commandList(skillsDir: string): string[] {
    const lockPath = path.join(skillsDir, 'skill-lock.json');
    const entries = readLockfileSafe(lockPath);

    if (entries.length === 0) {
        // Degraded: lockfile missing or empty — check directories
        if (fs.existsSync(skillsDir)) {
            const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
                .filter(d => d.isDirectory() && !d.name.startsWith('.'))
                .map(d => d.name);
            if (dirs.length > 0) {
                console.warn('⚠ No lockfile found. Showing directory scan. Run `skill verify --fix` to reconstruct.');
                return dirs.map(d => `${d} (untracked)`);
            }
        }
        return [];
    }

    const lines: string[] = [];
    for (const entry of entries) {
        // Check if directory actually exists
        const dirExists = fs.existsSync(path.join(skillsDir, entry.name));
        const status = dirExists ? '' : ' ⚠ MISSING';
        lines.push(`${entry.name}@${entry.version}${status}`);
    }
    return lines;
}

/** skill verify — Validates installed skills against lockfile. */
export function commandVerify(skillsDir: string, fix: boolean = false): { valid: boolean; messages: string[] } {
    const lockPath = path.join(skillsDir, 'skill-lock.json');
    const messages: string[] = [];
    let valid = true;

    if (fix) {
        // Reconstruct lockfile from local files (truth source = local)
        const entries = reconstructLockfile(skillsDir);
        writeLockfileSafe(lockPath, entries);
        messages.push(`Reconstructed lockfile with ${entries.length} skill(s).`);
        return { valid: true, messages };
    }

    const entries = readLockfileSafe(lockPath);
    if (entries.length === 0) {
        messages.push('No lockfile found. Run `skill verify --fix` to reconstruct.');
        return { valid: false, messages };
    }

    // SkillValidator is statically imported — always available
    const useValidation = true;

    for (const entry of entries) {
        const skillDir = path.join(skillsDir, entry.name);
        if (!fs.existsSync(skillDir)) {
            messages.push(`MISSING: ${entry.name} — directory not found`);
            valid = false;
            continue;
        }

        // Use SkillValidator for full validation (path traversal + extension whitelist + hash)
        if (useValidation) {
            const validation = validateSync(skillDir, entry);
            if (!validation.valid) {
                for (const err of validation.errors) {
                    messages.push(`${entry.name}: ${err}`);
                }
                valid = false;
                continue;
            }
        } else {
            // Fallback: direct file hash check
            for (const [filePath, expected] of Object.entries(entry.files)) {
                const fullPath = path.join(skillDir, filePath);
                if (!fs.existsSync(fullPath)) {
                    messages.push(`MISSING FILE: ${entry.name}/${filePath}`);
                    valid = false;
                    continue;
                }

                const actual = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
                if (actual !== expected.sha256) {
                    messages.push(`HASH MISMATCH: ${entry.name}/${filePath}`);
                    valid = false;
                }
            }
        }
    }

    if (valid) {
        messages.push(`All ${entries.length} skill(s) verified.`);
    }

    return { valid, messages };
}

/** Synchronous wrapper around SkillInstaller.validate */
function validateSync(
    skillDir: string, entry: SkillLockEntry,
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const validator = new SkillValidator();

    const allowedExtensions = entry.allowActions
        ? [...DEFAULT_CONTENT_EXTENSIONS, ...DEFAULT_ACTION_EXTENSIONS]
        : [...DEFAULT_CONTENT_EXTENSIONS];

    for (const [filePath, expected] of Object.entries(entry.files)) {
        const fullPath = path.resolve(skillDir, filePath);

        // Path traversal check
        if (!validator.isWithinRoot(fullPath, skillDir)) {
            errors.push(`Path traversal blocked: "${filePath}"`);
            continue;
        }

        // Extension whitelist check (respects allowActions)
        if (!validator.isAllowedExtension(filePath, allowedExtensions)) {
            const ext = path.extname(filePath).toLowerCase();
            errors.push(`Blocked extension: "${filePath}" ("${ext}" not in whitelist)`);
            continue;
        }

        if (!fs.existsSync(fullPath)) {
            errors.push(`Missing file: ${filePath}`);
            continue;
        }

        const actual = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
        if (actual !== expected.sha256) {
            errors.push(`SHA256 mismatch: ${filePath}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

/** skill remove — Removes an installed skill. */
export function commandRemove(skillsDir: string, name: string): string {
    const skillDir = path.join(skillsDir, name);
    const lockPath = path.join(skillsDir, 'skill-lock.json');

    // Record existence BEFORE deletion
    const hadDir = fs.existsSync(skillDir);

    // Remove directory
    if (hadDir) {
        fs.rmSync(skillDir, { recursive: true, force: true });
    }

    // Remove from lockfile
    const entries = readLockfileSafe(lockPath);
    const filtered = entries.filter(e => e.name !== name);
    const wasTracked = filtered.length !== entries.length;

    if (wasTracked) {
        writeLockfileSafe(lockPath, filtered);
        return `Removed skill "${name}"`;
    }

    // Directory existed but no lockfile entry
    if (hadDir) {
        return `Removed skill "${name}" (was untracked — no lockfile entry)`;
    }

    return `Skill "${name}" not found`;
}

// ============================================================================
// verify --fix: Reconstruct lockfile from local files
// ============================================================================

function reconstructLockfile(skillsDir: string): SkillLockEntry[] {
    if (!fs.existsSync(skillsDir)) return [];

    const entries: SkillLockEntry[] = [];
    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'));

    for (const dir of dirs) {
        const manifestPath = path.join(skillsDir, dir.name, 'skill.json');
        if (!fs.existsSync(manifestPath)) continue;

        try {
            const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestContent);

            // Build files map by scanning manifest.files or from directory
            const filesMap: Record<string, { sha256: string; size: number }> = {};
            if (manifest.files) {
                for (const [filePath, _expected] of Object.entries(manifest.files)) {
                    const fullPath = path.join(skillsDir, dir.name, filePath);
                    if (fs.existsSync(fullPath)) {
                        const content = fs.readFileSync(fullPath);
                        filesMap[filePath] = {
                            sha256: crypto.createHash('sha256').update(content).digest('hex'),
                            size: content.length,
                        };
                    }
                }
            }

            // Determine allowActions from manifest.actions
            const hasActions = Array.isArray(manifest.actions) && manifest.actions.length > 0;

            entries.push({
                name: manifest.name ?? dir.name,
                version: manifest.version ?? '0.0.0',
                manifestHash: crypto.createHash('sha256').update(manifestContent, 'utf-8').digest('hex'),
                files: filesMap,
                allowActions: hasActions,
                installedAt: new Date().toISOString(),
            });
        } catch {
            // Skip unparseable manifests
        }
    }

    return entries;
}

// ============================================================================
// add: Install a remote skill from URL
// ============================================================================

function warnDependencies(deps: string[]): void {
    console.warn(
        `⚠️  This skill declares ${deps.length} unresolved dependencies:\n` +
        deps.map(d => `   - ${d}`).join('\n') + '\n' +
        `   Automatic dependency resolution is not yet supported.\n` +
        `   The skill may not work correctly if dependencies are missing.`
    );
}

async function commandAdd(
    url: string,
    opts: { dir: string; allowActions: boolean; sha256?: string; auth?: string },
): Promise<void> {
    const registry = new SkillRegistry({
        skillsDir: opts.dir,
        allowRemote: true,
        allowedDomains: [],  // CLI = trust user's explicit URL
    });

    // 1. register + get name (single fetch)
    const source: RemoteSkillSource = {
        url,
        integrityHash: opts.sha256 ? `sha256:${opts.sha256}` : undefined,
        authorization: opts.auth,
    };
    const name = await registry.registerRemoteAndGetName(source);

    // 2. dependencies warn
    const skill = registry.get(name);
    if (skill?.manifest.dependencies?.length) {
        warnDependencies(skill.manifest.dependencies);
    }

    // 3. installRemote
    await registry.installRemote(name, {
        installDir: opts.dir,
        allowActions: opts.allowActions,
    });

    console.log(`✅ Installed "${name}" v${skill?.manifest.version ?? 'unknown'}`);
}

// ============================================================================
// CLI Entry Point
// ============================================================================

export function runCLI(args: string[]): void {
    const command = args[0];

    if (command !== 'skill') {
        console.log('qiniu-ai CLI v0.38.0');
        console.log('');
        console.log('Usage: qiniu-ai skill <command> [options]');
        console.log('');
        console.log('Available commands:');
        console.log('  list              List installed skills');
        console.log('  add <url>         Install a remote skill from manifest URL');
        console.log('  verify [--fix]    Verify integrity / reconstruct lockfile');
        console.log('  remove <name>     Remove an installed skill');
        console.log('');
        console.log('Options:');
        console.log('  --dir <path>      Skills directory (default: .agent/skills)');
        console.log('  --sha256 <hash>   Verify manifest integrity (for add)');
        console.log('  --auth <token>    Authorization header (for add)');
        console.log('  --allow-actions   Allow installing skill actions (for add)');
        return;
    }

    const subcommand = args[1];
    const skillsDir = resolveSkillsDir(args);

    switch (subcommand) {
        case 'list': {
            const items = commandList(skillsDir);
            if (items.length === 0) {
                console.log('No skills installed.');
            } else {
                console.log('Installed skills:');
                for (const item of items) {
                    console.log(`  ${item}`);
                }
            }
            break;
        }

        case 'verify': {
            const fix = args.includes('--fix');
            const result = commandVerify(skillsDir, fix);
            for (const msg of result.messages) {
                console.log(msg);
            }
            process.exitCode = result.valid ? 0 : 1;
            break;
        }

        case 'remove': {
            const name = args[2];
            if (!name || name.startsWith('--')) {
                console.error('Usage: qiniu-ai skill remove <name>');
                process.exitCode = 1;
                return;
            }
            console.log(commandRemove(skillsDir, name));
            break;
        }

        case 'add': {
            const url = args[2];
            if (!url || url.startsWith('--')) {
                console.error('Usage: qiniu-ai skill add <manifest-url> [--sha256 <hash>] [--auth <token>] [--allow-actions]');
                process.exitCode = 1;
                return;
            }
            const sha256 = getArgValue(args, '--sha256');
            const auth = getArgValue(args, '--auth');
            // Bail out if any value-taking flag was invalid
            if (process.exitCode === 1) return;
            const allowActions = args.includes('--allow-actions');
            commandAdd(url, { dir: skillsDir, allowActions, sha256, auth })
                .catch(err => {
                    console.error(`❌ Failed to install skill: ${err.message}`);
                    process.exitCode = 1;
                });
            break;
        }

        default:
            console.log('Usage: qiniu-ai skill <list|add|verify|remove> [options]');
            break;
    }
}

/** Extract --key value from args. Rejects missing or flag-like values. */
function getArgValue(args: string[], key: string): string | undefined {
    const idx = args.indexOf(key);
    if (idx === -1 || idx >= args.length - 1) return undefined;
    const value = args[idx + 1];
    if (value.startsWith('--')) {
        console.error(`Error: ${key} requires a value, got "${value}"`);
        process.exitCode = 1;
        return undefined;
    }
    return value;
}

// Run only when executed directly (not imported for testing)
if (typeof require !== 'undefined' && require.main === module) {
    runCLI(process.argv.slice(2));
}
