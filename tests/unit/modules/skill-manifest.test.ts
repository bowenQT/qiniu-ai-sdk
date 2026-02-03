/**
 * Unit tests for skill manifest parser and compatibility checker.
 */

import { describe, it, expect } from 'vitest';
import {
    parseManifest,
    parseManifestStrict,
    checkCompatibility,
    type SkillManifest,
} from '../../../src/modules/skills/manifest';

describe('parseManifest', () => {
    const validManifest = {
        name: 'git-workflow',
        version: '1.0.0',
        description: 'Git best practices',
        entry: 'SKILL.md',
        entryType: 'markdown',
    };

    describe('valid manifests', () => {
        it('should parse minimal valid manifest', () => {
            const result = parseManifest(JSON.stringify(validManifest));
            expect(result.valid).toBe(true);
            expect(result.manifest?.name).toBe('git-workflow');
            expect(result.manifest?.version).toBe('1.0.0');
            expect(result.errors).toHaveLength(0);
        });

        it('should parse manifest with all optional fields', () => {
            const full = {
                ...validManifest,
                tags: ['git', 'workflow'],
                dependencies: ['@skills/code-review'],
                permissions: ['file:read', 'command:git'],
                compatibility: { sdk: '>=0.30.0' },
                author: { name: 'Test', email: 'test@example.com' },
                repository: 'https://github.com/example/skill',
                license: 'MIT',
            };
            const result = parseManifest(JSON.stringify(full));
            expect(result.valid).toBe(true);
            expect(result.manifest?.tags).toEqual(['git', 'workflow']);
            expect(result.manifest?.permissions).toEqual(['file:read', 'command:git']);
        });

        it('should handle json entryType', () => {
            const result = parseManifest(JSON.stringify({ ...validManifest, entryType: 'json' }));
            expect(result.valid).toBe(true);
            expect(result.manifest?.entryType).toBe('json');
        });
    });

    describe('invalid manifests', () => {
        it('should reject invalid JSON', () => {
            const result = parseManifest('{ invalid json }');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid JSON');
        });

        it('should reject non-object JSON', () => {
            const result = parseManifest('"string"');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toBe('Manifest must be a JSON object');
        });

        it('should reject array JSON', () => {
            const result = parseManifest('[]');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toBe('Manifest must be a JSON object');
        });

        it('should require all required fields', () => {
            const result = parseManifest('{}');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Missing required field: name');
            expect(result.errors).toContain('Missing required field: version');
            expect(result.errors).toContain('Missing required field: description');
            expect(result.errors).toContain('Missing required field: entry');
            expect(result.errors).toContain('Missing required field: entryType');
        });

        it('should reject invalid entryType', () => {
            const result = parseManifest(JSON.stringify({ ...validManifest, entryType: 'invalid' }));
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid entryType');
        });

        it('should reject invalid permissions', () => {
            const result = parseManifest(JSON.stringify({ ...validManifest, permissions: ['invalid:perm'] }));
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid permission');
        });

        it('should reject non-array tags', () => {
            const result = parseManifest(JSON.stringify({ ...validManifest, tags: 'not-array' }));
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Field "tags" must be an array of strings');
        });
    });
});

describe('parseManifestStrict', () => {
    it('should return manifest on valid input', () => {
        const manifest = parseManifestStrict(JSON.stringify({
            name: 'test',
            version: '1.0.0',
            description: 'Test skill',
            entry: 'SKILL.md',
            entryType: 'markdown',
        }));
        expect(manifest.name).toBe('test');
    });

    it('should throw RecoverableError on invalid input', () => {
        expect(() => parseManifestStrict('{}')).toThrow('Invalid skill manifest');
    });
});

describe('checkCompatibility', () => {
    const createManifest = (sdk?: string): SkillManifest => ({
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        entry: 'SKILL.md',
        entryType: 'markdown',
        compatibility: sdk ? { sdk } : undefined,
    });

    describe('no requirement', () => {
        it('should be compatible when no SDK requirement', () => {
            const result = checkCompatibility(createManifest(), '0.30.0');
            expect(result.compatible).toBe(true);
        });
    });

    describe('>= operator', () => {
        it('should be compatible when current >= required', () => {
            const result = checkCompatibility(createManifest('>=0.30.0'), '0.32.0');
            expect(result.compatible).toBe(true);
        });

        it('should be compatible when current == required', () => {
            const result = checkCompatibility(createManifest('>=0.30.0'), '0.30.0');
            expect(result.compatible).toBe(true);
        });

        it('should be incompatible when current < required', () => {
            const result = checkCompatibility(createManifest('>=0.30.0'), '0.29.0');
            expect(result.compatible).toBe(false);
            expect(result.reason).toContain('Requires SDK >=0.30.0');
        });
    });

    describe('> operator', () => {
        it('should be compatible when current > required', () => {
            const result = checkCompatibility(createManifest('>0.30.0'), '0.31.0');
            expect(result.compatible).toBe(true);
        });

        it('should be incompatible when current == required', () => {
            const result = checkCompatibility(createManifest('>0.30.0'), '0.30.0');
            expect(result.compatible).toBe(false);
        });
    });

    describe('^ caret operator', () => {
        it('should be compatible with same major and higher minor', () => {
            const result = checkCompatibility(createManifest('^0.30.0'), '0.32.0');
            expect(result.compatible).toBe(true);
        });

        it('should be incompatible with different major', () => {
            const result = checkCompatibility(createManifest('^1.0.0'), '2.0.0');
            expect(result.compatible).toBe(false);
        });
    });

    describe('~ tilde operator', () => {
        it('should be compatible with same major.minor and higher patch', () => {
            const result = checkCompatibility(createManifest('~0.30.0'), '0.30.5');
            expect(result.compatible).toBe(true);
        });

        it('should be incompatible with different minor', () => {
            const result = checkCompatibility(createManifest('~0.30.0'), '0.31.0');
            expect(result.compatible).toBe(false);
        });
    });

    describe('invalid versions', () => {
        it('should handle invalid SDK requirement', () => {
            const result = checkCompatibility(createManifest('invalid'), '0.30.0');
            expect(result.compatible).toBe(false);
            expect(result.reason).toContain('Invalid SDK requirement');
        });

        it('should handle invalid current SDK version', () => {
            const result = checkCompatibility(createManifest('>=0.30.0'), 'invalid');
            expect(result.compatible).toBe(false);
            expect(result.reason).toContain('Invalid SDK version format');
        });
    });
});
