import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillLoader, SkillSecurityError, SkillNotFoundError } from '../../../src/modules/skills/loader';

describe('SkillLoader', () => {
    let tempDir: string;
    let loader: SkillLoader;

    beforeEach(() => {
        // Create temp directory for test skills
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-test-'));
    });

    afterEach(() => {
        // Cleanup
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    function createSkill(name: string, content: string, refs?: Record<string, string>) {
        const skillDir = path.join(tempDir, name);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);

        if (refs) {
            for (const [refPath, refContent] of Object.entries(refs)) {
                const fullPath = path.join(skillDir, refPath);
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                fs.writeFileSync(fullPath, refContent);
            }
        }
    }

    describe('B1: File Security Validation', () => {
        it('should reject absolute paths in references', async () => {
            createSkill('test-skill', 'See [ref](/etc/passwd)');
            loader = new SkillLoader({ skillsDir: tempDir });

            await expect(loader.load('test-skill')).rejects.toThrow(SkillSecurityError);
        });

        it('should reject path traversal in skill name', async () => {
            createSkill('valid', 'Content');
            loader = new SkillLoader({ skillsDir: tempDir });

            await expect(loader.load('../etc')).rejects.toThrow(SkillSecurityError);
            await expect(loader.load('foo/bar')).rejects.toThrow(SkillSecurityError);
        });

        it('should reject files exceeding size limit', async () => {
            const largeContent = 'x'.repeat(65 * 1024); // 65KB > 64KB limit
            createSkill('large-skill', largeContent);
            loader = new SkillLoader({ skillsDir: tempDir });

            await expect(loader.load('large-skill')).rejects.toThrow(SkillSecurityError);
        });

        it('should reject disallowed extensions', async () => {
            createSkill('test-skill', 'See [script](run.sh)', { 'run.sh': '#!/bin/bash' });
            loader = new SkillLoader({ skillsDir: tempDir });

            // Should load but skip .sh reference
            const skill = await loader.load('test-skill');
            expect(skill.references).toHaveLength(0);
        });

        it('should allow valid relative references', async () => {
            createSkill('test-skill', 'See [ref](docs/guide.md)', { 'docs/guide.md': 'Guide content' });
            loader = new SkillLoader({ skillsDir: tempDir });

            const skill = await loader.load('test-skill');
            expect(skill.references).toHaveLength(1);
            expect(skill.references[0].content).toBe('Guide content');
        });
    });

    describe('B2: Reference Depth', () => {
        it('should respect max reference depth', async () => {
            createSkill('deep-skill', 'See [level1](level1.md)', {
                'level1.md': 'See [level2](level2.md)',
                'level2.md': 'Deep content',
            });
            loader = new SkillLoader({ skillsDir: tempDir, maxReferenceDepth: 1 });

            const skill = await loader.load('deep-skill');
            // Only level1 should be loaded (depth=0)
            expect(skill.references).toHaveLength(1);
            expect(skill.references[0].path).toBe('level1.md');
        });
    });

    describe('B3: Deterministic Order', () => {
        it('should load skills in alphabetical order', async () => {
            createSkill('zebra', 'Zebra skill');
            createSkill('alpha', 'Alpha skill');
            createSkill('beta', 'Beta skill');
            loader = new SkillLoader({ skillsDir: tempDir });

            const skills = await loader.loadAll();
            const names = skills.map(s => s.name);
            expect(names).toEqual(['alpha', 'beta', 'zebra']);
        });
    });

    describe('B4: Token Estimation', () => {
        it('should apply CJK multiplier for Chinese content', async () => {
            const chineseContent = '这是一段测试中文内容，用于验证 CJK 倍率是否正确应用。';
            const englishContent = 'This is test English content for comparison.';

            createSkill('chinese-skill', chineseContent);
            createSkill('english-skill', englishContent);
            loader = new SkillLoader({ skillsDir: tempDir });

            const chineseSkill = await loader.load('chinese-skill');
            const englishSkill = await loader.load('english-skill');

            // Chinese should have higher token estimate due to 1.5x multiplier
            const chineseRatio = chineseSkill.tokenCount / chineseContent.length;
            const englishRatio = englishSkill.tokenCount / englishContent.length;

            expect(chineseRatio).toBeGreaterThan(englishRatio);
        });
    });

    describe('Error Handling', () => {
        it('should throw SkillNotFoundError for missing skill', async () => {
            loader = new SkillLoader({ skillsDir: tempDir });

            await expect(loader.load('nonexistent')).rejects.toThrow(SkillNotFoundError);
        });

        it('should throw SkillSecurityError for missing skills directory', () => {
            expect(() => new SkillLoader({ skillsDir: '/nonexistent/path' })).toThrow(SkillSecurityError);
        });
    });
});
