/**
 * Phase 5A — registerRemoteAndGetName wrapper test.
 *
 * Tests that registerRemoteAndGetName() reuses _registerRemoteInternal(),
 * only triggers one fetch, and returns the correct manifest name.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkillRegistry } from '../../../src/node/skills/index';
import type { RemoteSkillSource } from '../../../src/node/skills/index';

// Minimal valid manifest for testing
const MOCK_MANIFEST = JSON.stringify({
    name: 'test-skill',
    version: '1.0.0',
    description: 'Test skill for 5A',
    entry: 'SKILL.md',
    entryType: 'markdown',
});

describe('registerRemoteAndGetName (5A.1)', () => {
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            text: () => Promise.resolve(MOCK_MANIFEST),
        });
        vi.stubGlobal('fetch', fetchSpy);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns manifest.name after registering', async () => {
        const registry = new SkillRegistry({
            allowRemote: true,
            allowedDomains: [],
            fetcher: fetchSpy as any,
        });

        const source: RemoteSkillSource = {
            url: 'https://example.com/skill.json',
        };

        const name = await registry.registerRemoteAndGetName(source);

        expect(name).toBe('test-skill');
    });

    it('only triggers one fetch (no double-registration)', async () => {
        const registry = new SkillRegistry({
            allowRemote: true,
            allowedDomains: [],
            fetcher: fetchSpy as any,
        });

        const source: RemoteSkillSource = {
            url: 'https://example.com/skill.json',
        };

        await registry.registerRemoteAndGetName(source);

        // Should only fetch once
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('skill is registered and retrievable via get()', async () => {
        const registry = new SkillRegistry({
            allowRemote: true,
            allowedDomains: [],
            fetcher: fetchSpy as any,
        });

        const source: RemoteSkillSource = {
            url: 'https://example.com/skill.json',
        };

        const name = await registry.registerRemoteAndGetName(source);
        const skill = registry.get(name);

        expect(skill).toBeDefined();
        expect(skill!.manifest.name).toBe('test-skill');
        expect(skill!.manifest.version).toBe('1.0.0');
    });

    it('registerRemote() still works and returns void', async () => {
        const registry = new SkillRegistry({
            allowRemote: true,
            allowedDomains: [],
            fetcher: fetchSpy as any,
        });

        const source: RemoteSkillSource = {
            url: 'https://example.com/skill.json',
        };

        const result = await registry.registerRemote(source);

        expect(result).toBeUndefined();
        expect(registry.get('test-skill')).toBeDefined();
    });

    it('rejects when allowRemote is false', async () => {
        const registry = new SkillRegistry({
            allowRemote: false,
            allowedDomains: [],
        });

        const source: RemoteSkillSource = {
            url: 'https://example.com/skill.json',
        };

        await expect(registry.registerRemoteAndGetName(source))
            .rejects.toThrow('Remote skill loading is disabled');
    });

    it('verifies integrityHash when provided', async () => {
        const registry = new SkillRegistry({
            allowRemote: true,
            allowedDomains: [],
            verifyIntegrity: true,
            fetcher: fetchSpy as any,
        });

        const source: RemoteSkillSource = {
            url: 'https://example.com/skill.json',
            integrityHash: 'sha256:wrong-hash',
        };

        await expect(registry.registerRemoteAndGetName(source))
            .rejects.toThrow('Integrity verification failed');
    });
});
