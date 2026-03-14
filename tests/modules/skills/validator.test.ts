import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

describe('SkillValidator', () => {
    // =========================================================================
    // isWithinRoot
    // =========================================================================
    describe('isWithinRoot', () => {
        it('returns true for path inside root', async () => {
            const { SkillValidator } = await import('../../../src/node/skills/validator');
            const v = new SkillValidator();
            expect(v.isWithinRoot('/skills/my-skill/SKILL.md', '/skills')).toBe(true);
        });

        it('returns false for path outside root', async () => {
            const { SkillValidator } = await import('../../../src/node/skills/validator');
            const v = new SkillValidator();
            expect(v.isWithinRoot('/etc/passwd', '/skills')).toBe(false);
        });

        it('returns false for path traversal attack', async () => {
            const { SkillValidator } = await import('../../../src/node/skills/validator');
            const v = new SkillValidator();
            expect(v.isWithinRoot('/skills/../etc/passwd', '/skills')).toBe(false);
        });

        it('returns true for root itself', async () => {
            const { SkillValidator } = await import('../../../src/node/skills/validator');
            const v = new SkillValidator();
            expect(v.isWithinRoot('/skills', '/skills')).toBe(true);
        });
    });

    // =========================================================================
    // isAllowedExtension
    // =========================================================================
    describe('isAllowedExtension', () => {
        it('returns true for allowed extension', async () => {
            const { SkillValidator } = await import('../../../src/node/skills/validator');
            const v = new SkillValidator();
            expect(v.isAllowedExtension('SKILL.md', ['.md', '.txt', '.json'])).toBe(true);
        });

        it('returns false for disallowed extension', async () => {
            const { SkillValidator } = await import('../../../src/node/skills/validator');
            const v = new SkillValidator();
            expect(v.isAllowedExtension('malicious.exe', ['.md', '.txt', '.json'])).toBe(false);
        });

        it('is case-insensitive', async () => {
            const { SkillValidator } = await import('../../../src/node/skills/validator');
            const v = new SkillValidator();
            expect(v.isAllowedExtension('README.MD', ['.md'])).toBe(true);
        });
    });

    // =========================================================================
    // checkFileSize
    // =========================================================================
    describe('checkFileSize', () => {
        it('passes for file under limit', async () => {
            const { SkillValidator } = await import('../../../src/node/skills/validator');
            const v = new SkillValidator();

            const tmpFile = path.join(os.tmpdir(), `sv-test-${Date.now()}.txt`);
            fs.writeFileSync(tmpFile, 'hello');
            try {
                expect(() => v.checkFileSize(tmpFile, 1024)).not.toThrow();
            } finally {
                fs.unlinkSync(tmpFile);
            }
        });

        it('throws for file over limit', async () => {
            const { SkillValidator } = await import('../../../src/node/skills/validator');
            const v = new SkillValidator();

            const tmpFile = path.join(os.tmpdir(), `sv-test-big-${Date.now()}.txt`);
            fs.writeFileSync(tmpFile, 'x'.repeat(2048));
            try {
                expect(() => v.checkFileSize(tmpFile, 1024)).toThrow(/exceeds/i);
            } finally {
                fs.unlinkSync(tmpFile);
            }
        });
    });

    // =========================================================================
    // verifyIntegrity
    // =========================================================================
    describe('verifyIntegrity', () => {
        it('returns true for matching SHA256', async () => {
            const { SkillValidator } = await import('../../../src/node/skills/validator');
            const v = new SkillValidator();

            const tmpFile = path.join(os.tmpdir(), `sv-hash-${Date.now()}.txt`);
            const content = 'integrity check content';
            fs.writeFileSync(tmpFile, content);

            const expectedHash = crypto.createHash('sha256').update(content).digest('hex');
            try {
                expect(v.verifyIntegrity(tmpFile, expectedHash)).toBe(true);
            } finally {
                fs.unlinkSync(tmpFile);
            }
        });

        it('returns false for mismatched SHA256', async () => {
            const { SkillValidator } = await import('../../../src/node/skills/validator');
            const v = new SkillValidator();

            const tmpFile = path.join(os.tmpdir(), `sv-hash-bad-${Date.now()}.txt`);
            fs.writeFileSync(tmpFile, 'real content');
            try {
                expect(v.verifyIntegrity(tmpFile, 'deadbeef0000')).toBe(false);
            } finally {
                fs.unlinkSync(tmpFile);
            }
        });
    });
});
