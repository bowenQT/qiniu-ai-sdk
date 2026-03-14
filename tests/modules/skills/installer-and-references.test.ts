import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ============================================================================
// Manifest v2 type tests
// ============================================================================
describe('SkillManifest v2 types', () => {
    it('Manifest v2 includes files field with sha256', async () => {
        const { isManifestV2 } = await import('../../../src/modules/skills/manifest');
        const manifest = {
            name: 'test-skill',
            version: '1.0.0',
            description: 'test',
            files: {
                'SKILL.md': { sha256: 'abc123', size: 100 },
                'scripts/run.sh': { sha256: 'def456', size: 200 },
            },
        };
        expect(isManifestV2(manifest)).toBe(true);
    });

    it('Manifest v1 (without files) is not v2', async () => {
        const { isManifestV2 } = await import('../../../src/modules/skills/manifest');
        const manifest = {
            name: 'test-skill',
            version: '1.0.0',
            description: 'test',
        };
        expect(isManifestV2(manifest)).toBe(false);
    });
});

// ============================================================================
// SkillInstaller tests
// ============================================================================
describe('SkillInstaller', () => {
    let tmpDir: string;

    function setupSkillDir(files: Record<string, string>): { dir: string; manifest: any } {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-test-'));
        const fileEntries: Record<string, { sha256: string; size: number }> = {};

        for (const [filePath, content] of Object.entries(files)) {
            const fullPath = path.join(tmpDir, filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content);
            fileEntries[filePath] = {
                sha256: crypto.createHash('sha256').update(content).digest('hex'),
                size: Buffer.byteLength(content),
            };
        }

        const manifest = {
            name: 'test-skill',
            version: '1.0.0',
            description: 'A test skill',
            files: fileEntries,
        };

        // Write manifest
        fs.writeFileSync(path.join(tmpDir, 'skill.json'), JSON.stringify(manifest));

        return { dir: tmpDir, manifest };
    }

    it('validates all files against manifest hashes', async () => {
        const { SkillInstaller } = await import('../../../src/node/skills/installer');
        const { dir, manifest } = setupSkillDir({
            'SKILL.md': '# My Skill\nInstructions here.',
            'references/guide.txt': 'Reference content.',
        });

        const installer = new SkillInstaller();
        const result = await installer.validate(dir, manifest);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('detects tampered file (hash mismatch)', async () => {
        const { SkillInstaller } = await import('../../../src/node/skills/installer');
        const { dir, manifest } = setupSkillDir({
            'SKILL.md': '# Original content',
        });

        // Tamper the file
        fs.writeFileSync(path.join(dir, 'SKILL.md'), '# TAMPERED content');

        const installer = new SkillInstaller();
        const result = await installer.validate(dir, manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('SKILL.md'))).toBe(true);

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('detects missing file', async () => {
        const { SkillInstaller } = await import('../../../src/node/skills/installer');
        const { dir, manifest } = setupSkillDir({
            'SKILL.md': '# Skill',
            'extra.txt': 'extra content',
        });

        // Delete a file that manifest expects
        fs.unlinkSync(path.join(dir, 'extra.txt'));

        const installer = new SkillInstaller();
        const result = await installer.validate(dir, manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('extra.txt'))).toBe(true);

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('detects size mismatch', async () => {
        const { SkillInstaller } = await import('../../../src/node/skills/installer');
        const content = '# Skill';
        const { dir, manifest } = setupSkillDir({ 'SKILL.md': content });

        // Corrupt the manifest size
        manifest.files['SKILL.md'].size = 9999;

        const installer = new SkillInstaller();
        const result = await installer.validate(dir, manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('size'))).toBe(true);

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('[security] rejects path traversal (../outside.sh)', async () => {
        const { SkillInstaller } = await import('../../../src/node/skills/installer');
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-traverse-'));

        // Create a file outside skillDir
        const outsideFile = path.join(os.tmpdir(), 'outside.sh');
        fs.writeFileSync(outsideFile, '#!/bin/bash\necho pwned');

        const hash = crypto.createHash('sha256').update(fs.readFileSync(outsideFile)).digest('hex');
        const manifest = {
            name: 'evil-skill',
            version: '1.0.0',
            description: 'evil',
            files: {
                '../outside.sh': {
                    sha256: hash,
                    size: fs.statSync(outsideFile).size,
                },
            },
        };

        const installer = new SkillInstaller();
        const result = await installer.validate(tmpDir, manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('traversal'))).toBe(true);

        fs.unlinkSync(outsideFile);
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('[security] rejects blocked extension (.exe)', async () => {
        const { SkillInstaller } = await import('../../../src/node/skills/installer');
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'si-ext-'));

        // Create file with blocked extension
        const evilPath = path.join(tmpDir, 'payload.exe');
        fs.writeFileSync(evilPath, 'MZ...');

        const hash = crypto.createHash('sha256').update(fs.readFileSync(evilPath)).digest('hex');
        const manifest = {
            name: 'evil-skill',
            version: '1.0.0',
            description: 'evil',
            files: {
                'payload.exe': {
                    sha256: hash,
                    size: fs.statSync(evilPath).size,
                },
            },
        };

        const installer = new SkillInstaller();
        const result = await installer.validate(tmpDir, manifest);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Blocked extension'))).toBe(true);

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('[security] allows whitelisted extensions (.md, .ts, .json, .sh)', async () => {
        const { SkillInstaller } = await import('../../../src/node/skills/installer');
        const { dir, manifest } = setupSkillDir({
            'SKILL.md': '# Skill Instructions',
            'scripts/helper.ts': 'export const x = 1;',
            'config.json': '{"key": "value"}',
        });

        // allowActions: true to permit .ts files
        const installer = new SkillInstaller({ allowActions: true });
        const result = await installer.validate(dir, manifest);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);

        fs.rmSync(tmpDir, { recursive: true, force: true });
    });
});

// ============================================================================
// referenceMode tests
// ============================================================================
describe('referenceMode', () => {
    it('none — no references injected', async () => {
        const { applyReferenceMode } = await import('../../../src/modules/skills/reference-mode');
        const skill = {
            instruction: '# My Skill',
            references: [
                { path: 'ref.md', content: 'Reference content here' },
            ],
        };

        const result = applyReferenceMode(skill, 'none');
        expect(result.injectedContent).toBe(skill.instruction);
        expect(result.injectedTokenCount).toBeGreaterThan(0);
    });

    it('summary — injects summary of references', async () => {
        const { applyReferenceMode } = await import('../../../src/modules/skills/reference-mode');
        const skill = {
            instruction: '# My Skill',
            references: [
                { path: 'ref.md', content: 'This is a detailed reference guide about testing.' },
            ],
        };

        const result = applyReferenceMode(skill, 'summary');
        expect(result.injectedContent).toContain('ref.md');
        expect(result.injectedTokenCount).toBeGreaterThan(0);
    });

    it('full — injects complete references', async () => {
        const { applyReferenceMode } = await import('../../../src/modules/skills/reference-mode');
        const skill = {
            instruction: '# My Skill',
            references: [
                { path: 'ref.md', content: 'Full reference content with all details.' },
            ],
        };

        const result = applyReferenceMode(skill, 'full');
        expect(result.injectedContent).toContain('Full reference content');
        expect(result.injectedTokenCount).toBeGreaterThan(0);
    });

    it('no references property defaults gracefully', async () => {
        const { applyReferenceMode } = await import('../../../src/modules/skills/reference-mode');
        const skill = { instruction: '# No Refs' };

        const result = applyReferenceMode(skill, 'full');
        expect(result.injectedContent).toBe('# No Refs');
    });
});
