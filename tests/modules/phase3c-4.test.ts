/**
 * Phase 3C + 4 tests:
 * - 3.5 SkillManifest.signature type reservation
 * - 4.1 CLI skill commands (list, verify, remove, verify --fix)
 * - 4.2 MCPClient @deprecated
 * - 4.3 Registry Protocol v2 stub
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ============================================================================
// 3.5 Signature type reservation
// ============================================================================
describe('3.5 SkillManifest.signature', () => {
    it('parseManifest accepts manifest with signature field', async () => {
        const { parseManifest } = await import('../../src/modules/skills/manifest');
        const manifest = JSON.stringify({
            name: 'signed-skill',
            version: '1.0.0',
            description: 'A signed skill',
            entry: 'SKILL.md',
            entryType: 'markdown',
            signature: {
                algorithm: 'ed25519',
                value: 'base64encodedSignature',
                publicKey: 'https://keys.example.com/publisher.pub',
            },
        });

        const result = parseManifest(manifest);
        expect(result.valid).toBe(true);
        expect(result.manifest!.signature?.algorithm).toBe('ed25519');
    });

    it('parseManifest still works without signature', async () => {
        const { parseManifest } = await import('../../src/modules/skills/manifest');
        const result = parseManifest(JSON.stringify({
            name: 'unsigned',
            version: '1.0.0',
            description: 'No sig',
            entry: 'SKILL.md',
            entryType: 'markdown',
        }));

        expect(result.valid).toBe(true);
        expect(result.manifest!.signature).toBeUndefined();
    });
});

// ============================================================================
// 4.1 CLI skill commands
// ============================================================================
describe('4.1 Skill CLI', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function setupSkillDir(name: string, version: string, files: Record<string, string>) {
        const skillDir = path.join(tmpDir, name);
        fs.mkdirSync(skillDir, { recursive: true });

        const manifestFiles: Record<string, { sha256: string; size: number }> = {};
        for (const [filePath, content] of Object.entries(files)) {
            const fullPath = path.join(skillDir, filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content, 'utf-8');
            manifestFiles[filePath] = {
                sha256: crypto.createHash('sha256').update(content).digest('hex'),
                size: Buffer.byteLength(content, 'utf-8'),
            };
        }

        // Write manifest
        const manifest = { name, version, description: `Skill ${name}`, entry: 'SKILL.md', entryType: 'markdown', files: manifestFiles };
        fs.writeFileSync(path.join(skillDir, 'skill.json'), JSON.stringify(manifest), 'utf-8');

        return { manifestFiles, manifest };
    }

    function writeLockfile(entries: any[]) {
        const lockPath = path.join(tmpDir, 'skill-lock.json');
        fs.writeFileSync(lockPath, JSON.stringify({ version: 1, skills: entries }, null, 2), 'utf-8');
    }

    it('commandList returns entries from lockfile', async () => {
        const { commandList } = await import('../../src/cli/skill-cli');

        writeLockfile([
            { name: 'git-workflow', version: '1.0.0', manifestHash: 'abc', files: {}, allowActions: false, installedAt: new Date().toISOString() },
        ]);

        // Also create the directory so it shows as present
        fs.mkdirSync(path.join(tmpDir, 'git-workflow'), { recursive: true });

        const items = commandList(tmpDir);
        expect(items).toHaveLength(1);
        expect(items[0]).toBe('git-workflow@1.0.0');
    });

    it('commandList marks MISSING when directory is absent', async () => {
        const { commandList } = await import('../../src/cli/skill-cli');

        writeLockfile([
            { name: 'ghost-skill', version: '2.0.0', manifestHash: 'def', files: {}, allowActions: false, installedAt: new Date().toISOString() },
        ]);
        // Do NOT create the directory

        const items = commandList(tmpDir);
        expect(items[0]).toContain('MISSING');
    });

    it('commandVerify validates skill files against lockfile', async () => {
        const { commandVerify } = await import('../../src/cli/skill-cli');

        const { manifestFiles } = setupSkillDir('my-skill', '1.0.0', {
            'SKILL.md': '# My Skill',
        });

        writeLockfile([
            { name: 'my-skill', version: '1.0.0', manifestHash: 'xxx', files: manifestFiles, allowActions: false, installedAt: new Date().toISOString() },
        ]);

        const result = commandVerify(tmpDir);
        expect(result.valid).toBe(true);
    });

    it('commandVerify detects hash mismatch', async () => {
        const { commandVerify } = await import('../../src/cli/skill-cli');

        setupSkillDir('broken', '1.0.0', { 'SKILL.md': '# Broken' });

        writeLockfile([
            { name: 'broken', version: '1.0.0', manifestHash: 'xxx', files: { 'SKILL.md': { sha256: 'wrong-hash', size: 8 } }, allowActions: false, installedAt: new Date().toISOString() },
        ]);

        const result = commandVerify(tmpDir);
        expect(result.valid).toBe(false);
        expect(result.messages.some(m => m.includes('SHA256 mismatch') || m.includes('HASH MISMATCH'))).toBe(true);
    });

    it('commandVerify --fix reconstructs lockfile from directory', async () => {
        const { commandVerify } = await import('../../src/cli/skill-cli');

        setupSkillDir('rebuild-skill', '2.0.0', {
            'SKILL.md': '# Rebuild',
        });

        // No lockfile exists
        const result = commandVerify(tmpDir, true);
        expect(result.valid).toBe(true);
        expect(result.messages[0]).toContain('Reconstructed lockfile with 1 skill');

        // Verify lockfile was created
        const lockPath = path.join(tmpDir, 'skill-lock.json');
        expect(fs.existsSync(lockPath)).toBe(true);
        const data = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        expect(data.skills[0].name).toBe('rebuild-skill');
    });

    it('commandVerify --fix sets allowActions from manifest.actions', async () => {
        const { commandVerify } = await import('../../src/cli/skill-cli');

        const skillDir = path.join(tmpDir, 'action-skill');
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Action Skill', 'utf-8');

        const manifest = {
            name: 'action-skill',
            version: '1.0.0',
            description: 'Has actions',
            entry: 'SKILL.md',
            entryType: 'markdown',
            actions: [{ name: 'deploy', script: 'deploy.sh' }],
            files: {
                'SKILL.md': {
                    sha256: crypto.createHash('sha256').update('# Action Skill').digest('hex'),
                    size: Buffer.byteLength('# Action Skill', 'utf-8'),
                },
            },
        };
        fs.writeFileSync(path.join(skillDir, 'skill.json'), JSON.stringify(manifest), 'utf-8');

        commandVerify(tmpDir, true);

        const lockPath = path.join(tmpDir, 'skill-lock.json');
        const data = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        expect(data.skills[0].allowActions).toBe(true);
    });

    it('commandRemove deletes directory and lockfile entry', async () => {
        const { commandRemove } = await import('../../src/cli/skill-cli');

        setupSkillDir('doomed', '1.0.0', { 'SKILL.md': '# Doomed' });
        writeLockfile([
            { name: 'doomed', version: '1.0.0', manifestHash: 'xxx', files: {}, allowActions: false, installedAt: new Date().toISOString() },
        ]);

        const result = commandRemove(tmpDir, 'doomed');
        expect(result).toContain('Removed');
        expect(fs.existsSync(path.join(tmpDir, 'doomed'))).toBe(false);

        const lockData = JSON.parse(fs.readFileSync(path.join(tmpDir, 'skill-lock.json'), 'utf-8'));
        expect(lockData.skills).toHaveLength(0);
    });
});

// ============================================================================
// 4.2 MCPClient removed (v0.40.0)
// ============================================================================
describe('4.2 MCPClient removed', () => {
    it('MCPClient has been removed from internal module', async () => {
        const mod = await import('../../src/modules/mcp/index');
        expect((mod as any).MCPClient).toBeUndefined();
        expect((mod as any).adaptMCPToolsToRegistry).toBeUndefined();
        expect((mod as any).getAllMCPToolsAsRegistered).toBeUndefined();
    });

    it('MCPClient has been removed from root public API', async () => {
        const root = await import('../../src/index');
        expect((root as any).MCPClient).toBeUndefined();
        expect((root as any).MCPClientError).toBeUndefined();
        expect((root as any).adaptMCPToolsToRegistry).toBeUndefined();
        expect((root as any).getAllMCPToolsAsRegistered).toBeUndefined();
    });

    it('MCPClient has been removed from node public API', async () => {
        const node = await import('../../src/node/index');
        expect((node as any).MCPClient).toBeUndefined();
        expect((node as any).MCPClientError).toBeUndefined();
    });
});

// ============================================================================
// 4.3 Registry Protocol v2
// ============================================================================
describe('4.3 Registry Protocol v2', () => {
    it('RegistryProtocolStub.search returns empty array', async () => {
        const { RegistryProtocolStub } = await import('../../src/modules/skills/registry-protocol');
        const stub = new RegistryProtocolStub();
        const results = await stub.search({ query: 'test' });
        expect(results).toEqual([]);
    });

    it('RegistryProtocolStub.resolve returns null', async () => {
        const { RegistryProtocolStub } = await import('../../src/modules/skills/registry-protocol');
        const stub = new RegistryProtocolStub();
        const result = await stub.resolve('nonexistent');
        expect(result).toBeNull();
    });

    it('SkillRegistryProtocol interface types are correctly exported', async () => {
        const mod = await import('../../src/modules/skills/registry-protocol');
        expect(mod.RegistryProtocolStub).toBeDefined();
    });
});
