/**
 * Tests for Manifest v2 actions, dual whitelist, and skill lockfile.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ============================================================================
// Manifest v2 actions[] + runtime
// ============================================================================
describe('Manifest v2 actions and runtime', () => {
    it('actions field declares action scripts', async () => {
        const { parseManifest } = await import('../../../src/modules/skills/manifest');
        const manifest = JSON.stringify({
            name: 'deploy-skill',
            version: '1.0.0',
            description: 'Deployment skill',
            entry: 'SKILL.md',
            entryType: 'markdown',
            actions: [
                { name: 'deploy', script: 'scripts/deploy.sh', description: 'Deploy to prod' },
                { name: 'rollback', script: 'scripts/rollback.sh', description: 'Rollback' },
            ],
            runtime: { engine: 'sandbox' },
        });

        const result = parseManifest(manifest);
        expect(result.valid).toBe(true);
        expect(result.manifest!.actions).toHaveLength(2);
        expect(result.manifest!.actions![0].name).toBe('deploy');
        expect(result.manifest!.runtime?.engine).toBe('sandbox');
    });

    it('runtime field with node engine and entryCommand', async () => {
        const { parseManifest } = await import('../../../src/modules/skills/manifest');
        const manifest = JSON.stringify({
            name: 'node-skill',
            version: '1.0.0',
            description: 'Node skill',
            entry: 'SKILL.md',
            entryType: 'markdown',
            runtime: { engine: 'node', entryCommand: 'node scripts/run.js' },
        });

        const result = parseManifest(manifest);
        expect(result.valid).toBe(true);
        expect(result.manifest!.runtime?.engine).toBe('node');
        expect(result.manifest!.runtime?.entryCommand).toBe('node scripts/run.js');
    });
});

// ============================================================================
// Dual whitelist
// ============================================================================
describe('Dual whitelist (content vs action extensions)', () => {
    it('SkillValidator allows content extensions by default', async () => {
        const { SkillValidator } = await import('../../../src/modules/skills/validator');
        const v = new SkillValidator();

        expect(v.isAllowedExtension('SKILL.md', ['.md', '.txt', '.json'])).toBe(true);
        expect(v.isAllowedExtension('ref.txt', ['.md', '.txt', '.json'])).toBe(true);
        expect(v.isAllowedExtension('config.json', ['.md', '.txt', '.json'])).toBe(true);
    });

    it('SkillValidator allows action extensions when enabled', async () => {
        const { SkillValidator } = await import('../../../src/modules/skills/validator');
        const v = new SkillValidator();

        const actionExts = ['.ts', '.js', '.mjs', '.sh'];
        expect(v.isAllowedExtension('deploy.sh', actionExts)).toBe(true);
        expect(v.isAllowedExtension('run.ts', actionExts)).toBe(true);
        expect(v.isAllowedExtension('build.js', actionExts)).toBe(true);
    });

    it('SkillValidator rejects unknown extensions in both lists', async () => {
        const { SkillValidator } = await import('../../../src/modules/skills/validator');
        const v = new SkillValidator();

        const allExts = ['.md', '.txt', '.json', '.ts', '.js', '.mjs', '.sh'];
        expect(v.isAllowedExtension('exploit.exe', allExts)).toBe(false);
        expect(v.isAllowedExtension('photo.png', allExts)).toBe(false);
    });

    it('DEFAULT_CONTENT_EXTENSIONS and DEFAULT_ACTION_EXTENSIONS are exported', async () => {
        const { DEFAULT_CONTENT_EXTENSIONS, DEFAULT_ACTION_EXTENSIONS } = await import('../../../src/modules/skills/validator');

        expect(DEFAULT_CONTENT_EXTENSIONS).toContain('.md');
        expect(DEFAULT_CONTENT_EXTENSIONS).toContain('.txt');
        expect(DEFAULT_CONTENT_EXTENSIONS).toContain('.json');

        expect(DEFAULT_ACTION_EXTENSIONS).toContain('.ts');
        expect(DEFAULT_ACTION_EXTENSIONS).toContain('.js');
        expect(DEFAULT_ACTION_EXTENSIONS).toContain('.sh');
    });
});

// ============================================================================
// Skill lockfile
// ============================================================================
describe('Skill lockfile (skill-lock.json)', () => {
    it('writeLockEntry creates a valid lock entry', async () => {
        const { createLockEntry } = await import('../../../src/modules/skills/lockfile');

        const entry = createLockEntry({
            name: 'my-skill',
            version: '1.0.0',
            manifestHash: 'abc123def456',
            files: {
                'SKILL.md': { sha256: 'aaa111', size: 100 },
                'scripts/run.sh': { sha256: 'bbb222', size: 200 },
            },
            allowActions: false,
        });

        expect(entry.name).toBe('my-skill');
        expect(entry.version).toBe('1.0.0');
        expect(entry.manifestHash).toBe('abc123def456');
        expect(entry.installedAt).toBeTruthy();
        expect(entry.files['SKILL.md'].sha256).toBe('aaa111');
    });

    it('writeLockfile + readLockfile round-trips correctly', async () => {
        const { writeLockfile, readLockfile, createLockEntry } = await import('../../../src/modules/skills/lockfile');

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-'));
        const lockPath = path.join(tmpDir, 'skill-lock.json');

        const entry1 = createLockEntry({
            name: 'skill-a',
            version: '1.0.0',
            manifestHash: 'hash-a',
            files: { 'SKILL.md': { sha256: 'aaa', size: 10 } },
            allowActions: false,
        });

        const entry2 = createLockEntry({
            name: 'skill-b',
            version: '2.0.0',
            manifestHash: 'hash-b',
            files: { 'SKILL.md': { sha256: 'bbb', size: 20 } },
            allowActions: false,
        });

        writeLockfile(lockPath, [entry1, entry2]);

        const loaded = readLockfile(lockPath);
        expect(loaded).toHaveLength(2);
        expect(loaded[0].name).toBe('skill-a');
        expect(loaded[1].name).toBe('skill-b');

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('readLockfile returns empty array for missing file', async () => {
        const { readLockfile } = await import('../../../src/modules/skills/lockfile');

        const result = readLockfile('/nonexistent/skill-lock.json');
        expect(result).toEqual([]);
    });
});
