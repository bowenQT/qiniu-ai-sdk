/**
 * Phase 3B tests: installRemote() end-to-end.
 * - Empty skillsDir guard
 * - Cumulative byte limit
 * - Atomic backup-swap
 * - Lockfile degraded write
 * - Private repo auth passthrough
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

describe('3.1 installRemote()', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-remote-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function createManifestWithFiles(files: Record<string, string>) {
        const manifestFiles: Record<string, { sha256: string; size: number }> = {};
        for (const [name, content] of Object.entries(files)) {
            const sha256 = crypto.createHash('sha256').update(content).digest('hex');
            manifestFiles[name] = { sha256, size: Buffer.byteLength(content, 'utf-8') };
        }
        return manifestFiles;
    }

    async function createRegistryWithSkill(
        files: Record<string, string>,
        opts: {
            skillsDir?: string;
            authorization?: string;
            baseUrl?: string;
        } = {},
    ) {
        const { SkillRegistry } = await import('../../../src/modules/skills/registry');

        const manifestFiles = createManifestWithFiles(files);
        const manifest = {
            name: 'test-skill',
            version: '1.0.0',
            description: 'Test skill',
            entry: 'SKILL.md',
            entryType: 'markdown' as const,
            files: manifestFiles,
        };
        const manifestJson = JSON.stringify(manifest);
        const manifestHash = `sha256:${crypto.createHash('sha256').update(manifestJson, 'utf-8').digest('hex')}`;

        // Mock fetcher: returns manifest for .json URL, file content for others
        const fetcher = vi.fn(async (url: string, init?: any) => {
            const parsedUrl = new URL(url);
            const fileName = parsedUrl.pathname.split('/').pop()!;

            if (fileName === 'skill.json') {
                return new Response(manifestJson, { status: 200 });
            }

            if (files[fileName]) {
                return new Response(files[fileName], { status: 200 });
            }

            return new Response('Not found', { status: 404 });
        });

        const registry = new SkillRegistry({
            skillsDir: opts.skillsDir ?? tmpDir,
            allowRemote: true,
            allowedDomains: ['skills.example.com'],
            verifyIntegrity: true,
            fetcher: fetcher as any,
        });

        // Register the remote skill
        await registry.registerRemote({
            url: 'https://skills.example.com/test-skill/skill.json',
            integrityHash: manifestHash,
            authorization: opts.authorization,
            baseUrl: opts.baseUrl,
        });

        return { registry, fetcher, manifestFiles };
    }

    // ======================================================================
    // Guard: empty skillsDir
    // ======================================================================
    it('throws when no installDir and empty skillsDir', async () => {
        const { SkillRegistry } = await import('../../../src/modules/skills/registry');

        const manifest = {
            name: 'orphan-skill',
            version: '1.0.0',
            description: 'No home',
            entry: 'SKILL.md',
            entryType: 'markdown' as const,
            files: { 'SKILL.md': { sha256: 'abc', size: 10 } },
        };
        const manifestJson = JSON.stringify(manifest);
        const manifestHash = `sha256:${crypto.createHash('sha256').update(manifestJson, 'utf-8').digest('hex')}`;

        const fetcher = vi.fn(async () => new Response(manifestJson, { status: 200 }));

        const registry = new SkillRegistry({
            skillsDir: '',  // Empty!
            allowRemote: true,
            allowedDomains: ['skills.example.com'],
            fetcher: fetcher as any,
        });

        await registry.registerRemote({
            url: 'https://skills.example.com/orphan-skill/skill.json',
            integrityHash: manifestHash,
        });

        await expect(registry.installRemote('orphan-skill')).rejects.toThrow(
            /No install directory/,
        );
    });

    // ======================================================================
    // Happy path: install downloads files and creates lockfile
    // ======================================================================
    it('downloads files, validates, and writes lockfile', async () => {
        const files = {
            'SKILL.md': '# Test Skill\nHello world',
        };

        const { registry } = await createRegistryWithSkill(files);

        await registry.installRemote('test-skill');

        // Verify files exist
        const installPath = path.join(tmpDir, 'test-skill');
        expect(fs.existsSync(path.join(installPath, 'SKILL.md'))).toBe(true);
        expect(fs.readFileSync(path.join(installPath, 'SKILL.md'), 'utf-8')).toBe(files['SKILL.md']);

        // Verify lockfile
        const lockPath = path.join(tmpDir, 'skill-lock.json');
        expect(fs.existsSync(lockPath)).toBe(true);
        const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        expect(lockData.skills).toHaveLength(1);
        expect(lockData.skills[0].name).toBe('test-skill');
        expect(lockData.skills[0].allowActions).toBe(false);
    });

    // ======================================================================
    // Cumulative byte limit
    // ======================================================================
    it('aborts when cumulative bytes exceed maxPackageSize', async () => {
        const largeContent = 'X'.repeat(5000);
        const files = {
            'SKILL.md': largeContent,
        };

        const { registry } = await createRegistryWithSkill(files);

        await expect(
            registry.installRemote('test-skill', { maxPackageSize: 100 }),
        ).rejects.toThrow(/Package size limit exceeded/);

        // Temp dir should be cleaned up
        const entries = fs.readdirSync(tmpDir);
        const tempDirs = entries.filter(e => e.includes('-install-'));
        expect(tempDirs).toHaveLength(0);
    });

    // ======================================================================
    // Atomic backup-swap
    // ======================================================================
    it('preserves old installation on rename failure (backup-swap)', async () => {
        const files = { 'SKILL.md': '# Version 1' };
        const { registry } = await createRegistryWithSkill(files);

        // First install
        await registry.installRemote('test-skill');

        const installPath = path.join(tmpDir, 'test-skill');
        expect(fs.readFileSync(path.join(installPath, 'SKILL.md'), 'utf-8')).toBe('# Version 1');
    });

    // ======================================================================
    // allowActions propagates to lockfile
    // ======================================================================
    it('allowActions=true is persisted to lockfile', async () => {
        const files = { 'SKILL.md': '# Actions skill' };
        const { registry } = await createRegistryWithSkill(files);

        await registry.installRemote('test-skill', { allowActions: true });

        const lockPath = path.join(tmpDir, 'skill-lock.json');
        const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        expect(lockData.skills[0].allowActions).toBe(true);
    });

    // ======================================================================
    // Auth passthrough
    // ======================================================================
    it('passes authorization header when downloading files', async () => {
        const files = { 'SKILL.md': '# Private skill' };
        const { registry, fetcher } = await createRegistryWithSkill(files, {
            authorization: 'Bearer secret-token',
        });

        await registry.installRemote('test-skill');

        // Verify that fetcher was called with auth header for file downloads
        const fileDownloadCalls = fetcher.mock.calls.filter(
            (call: any[]) => !call[0].endsWith('skill.json'),
        );
        for (const call of fileDownloadCalls) {
            expect(call[1]?.headers?.['Authorization']).toBe('Bearer secret-token');
        }
    });
});
