/**
 * Unit tests for SkillRegistry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SkillRegistry } from '../../../src/node/skills/registry';
import { InMemorySkillTrialStore } from '../../../src/node/skills/trial';
import { InMemorySkillPromotionStore } from '../../../src/node/skills/promotion';

describe('SkillRegistry', () => {
    describe('constructor', () => {
        it('should create registry with default config', () => {
            const registry = new SkillRegistry();
            expect(registry.list()).toEqual([]);
        });

        it('should accept custom config', () => {
            const registry = new SkillRegistry({
                allowRemote: true,
                allowedDomains: ['example.com'],
                remoteTimeout: 10000,
            });
            expect(registry.list()).toEqual([]);
        });
    });

    describe('registerRemote', () => {
        it('should reject when remote loading is disabled', async () => {
            const registry = new SkillRegistry({ allowRemote: false });
            await expect(registry.registerRemote({
                url: 'https://example.com/skill.json',
            })).rejects.toThrow('Remote skill loading is disabled');
        });

        it('should reject when domain is not in allowlist', async () => {
            const registry = new SkillRegistry({
                allowRemote: true,
                allowedDomains: ['allowed.com'],
            });
            await expect(registry.registerRemote({
                url: 'https://notallowed.com/skill.json',
            })).rejects.toThrow('not in the allowlist');
        });

        it('should allow domain when allowlist is empty', async () => {
            const registry = new SkillRegistry({
                allowRemote: true,
                allowedDomains: [], // Empty = allow all
            });

            // Mock fetch to avoid actual network request
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

            await expect(registry.registerRemote({
                url: 'https://any-domain.com/skill.json',
            })).rejects.toThrow('Network error');

            vi.unstubAllGlobals();
        });

        it('should support wildcard domain matching', async () => {
            const registry = new SkillRegistry({
                allowRemote: true,
                allowedDomains: ['*.example.com'],
            });

            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Expected')));

            // Should allow subdomain
            await expect(registry.registerRemote({
                url: 'https://skills.example.com/skill.json',
            })).rejects.toThrow('Expected');

            // Should reject different domain
            await expect(registry.registerRemote({
                url: 'https://other.com/skill.json',
            })).rejects.toThrow('not in the allowlist');

            vi.unstubAllGlobals();
        });

        it('should verify integrity hash', async () => {
            const manifestContent = JSON.stringify({
                name: 'test-skill',
                version: '1.0.0',
                description: 'Test',
                entry: 'SKILL.md',
                entryType: 'markdown',
            });

            // Mock fetch with manifest content
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(manifestContent),
            }));

            const registry = new SkillRegistry({
                allowRemote: true,
                verifyIntegrity: true,
            });

            // Wrong hash should fail
            await expect(registry.registerRemote({
                url: 'https://example.com/skill.json',
                integrityHash: 'sha256:wrong',
            })).rejects.toThrow('Integrity verification failed');

            vi.unstubAllGlobals();
        });

        it('should register skill with valid manifest', async () => {
            const manifestContent = JSON.stringify({
                name: 'test-skill',
                version: '1.0.0',
                description: 'Test skill',
                entry: 'SKILL.md',
                entryType: 'markdown',
            });

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(manifestContent),
            }));

            const registry = new SkillRegistry({
                allowRemote: true,
                verifyIntegrity: false,
            });

            await registry.registerRemote({
                url: 'https://example.com/skill.json',
            });

            expect(registry.has('test-skill')).toBe(true);
            expect(registry.list()).toEqual(['test-skill']);

            const skill = registry.get('test-skill');
            expect(skill?.source).toBe('remote');
            expect(skill?.manifest.name).toBe('test-skill');

            vi.unstubAllGlobals();
        });

        it('should seed a quarantine trial record for registered skills', async () => {
            const manifestContent = JSON.stringify({
                name: 'trial-skill',
                version: '1.0.0',
                description: 'Trial skill',
                entry: 'SKILL.md',
                entryType: 'markdown',
            });

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(manifestContent),
            }));

            const trialStore = new InMemorySkillTrialStore();
            const registry = new SkillRegistry({
                allowRemote: true,
                verifyIntegrity: false,
                trialStore,
            });

            await registry.registerRemote({
                url: 'https://example.com/skill.json',
            });

            await expect(registry.getTrialRecord('trial-skill')).resolves.toMatchObject({
                skillName: 'trial-skill',
                state: 'quarantine',
                metadata: {
                    source: 'remote',
                    version: '1.0.0',
                },
            });

            vi.unstubAllGlobals();
        });

        it('should seed a quarantine promotion record for registered skills', async () => {
            const manifestContent = JSON.stringify({
                name: 'promotion-skill',
                version: '1.0.0',
                description: 'Promotion skill',
                entry: 'SKILL.md',
                entryType: 'markdown',
            });

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(manifestContent),
            }));

            const promotionStore = new InMemorySkillPromotionStore();
            const registry = new SkillRegistry({
                allowRemote: true,
                verifyIntegrity: false,
                promotionStore,
            });

            await registry.registerRemote({
                url: 'https://example.com/skill.json',
            });

            await expect(registry.getPromotionRecord('promotion-skill')).resolves.toMatchObject({
                skillName: 'promotion-skill',
                state: 'quarantine',
                decision: {
                    targetKind: 'skill',
                    decisionStatus: 'hold',
                },
            });

            vi.unstubAllGlobals();
        });
    });

    describe('refreshSkill', () => {
        it('should reject for non-existent skill', async () => {
            const registry = new SkillRegistry({ allowRemote: true });
            await expect(registry.refreshSkill('non-existent', 'sha256:new'))
                .rejects.toThrow('not found');
        });
    });

    describe('search', () => {
        let registry: SkillRegistry;

        beforeEach(async () => {
            const manifests = [
                { name: 'git-workflow', version: '1.0.0', description: 'Git best practices', entry: 'SKILL.md', entryType: 'markdown', tags: ['git', 'workflow'] },
                { name: 'code-review', version: '2.0.0', description: 'Code review guide', entry: 'SKILL.md', entryType: 'markdown', tags: ['review', 'quality'] },
                { name: 'debugging', version: '1.5.0', description: 'Debugging techniques with git bisect', entry: 'SKILL.md', entryType: 'markdown', tags: ['debug', 'troubleshoot'] },
            ];

            vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
                const idx = parseInt(url.match(/skill(\d)\.json/)?.[1] ?? '0');
                return Promise.resolve({
                    ok: true,
                    text: () => Promise.resolve(JSON.stringify(manifests[idx])),
                });
            }));

            registry = new SkillRegistry({ allowRemote: true, verifyIntegrity: false });

            for (let i = 0; i < manifests.length; i++) {
                await registry.registerRemote({ url: `https://example.com/skill${i}.json` });
            }
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('should find skills by name', () => {
            const results = registry.search('git');
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results[0].name).toBe('git-workflow');
        });

        it('should find skills by tag', () => {
            const results = registry.search('workflow');
            expect(results.some(r => r.name === 'git-workflow')).toBe(true);
        });

        it('should find skills by description', () => {
            const results = registry.search('bisect');
            expect(results.some(r => r.name === 'debugging')).toBe(true);
        });

        it('should rank exact name match higher', () => {
            const results = registry.search('debugging');
            expect(results[0].name).toBe('debugging');
        });

        it('should return empty for no matches', () => {
            const results = registry.search('nonexistent');
            expect(results).toHaveLength(0);
        });
    });

    describe('unregister', () => {
        it('should remove registered skill', async () => {
            const manifest = JSON.stringify({
                name: 'test',
                version: '1.0.0',
                description: 'Test',
                entry: 'SKILL.md',
                entryType: 'markdown',
            });

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(manifest),
            }));

            const registry = new SkillRegistry({ allowRemote: true, verifyIntegrity: false });
            await registry.registerRemote({ url: 'https://example.com/skill.json' });

            expect(registry.has('test')).toBe(true);
            expect(registry.unregister('test')).toBe(true);
            expect(registry.has('test')).toBe(false);

            vi.unstubAllGlobals();
        });

        it('should delete trial state when unregistering a skill', async () => {
            const manifest = JSON.stringify({
                name: 'trial-test',
                version: '1.0.0',
                description: 'Test',
                entry: 'SKILL.md',
                entryType: 'markdown',
            });

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(manifest),
            }));

            const trialStore = new InMemorySkillTrialStore();
            const registry = new SkillRegistry({
                allowRemote: true,
                verifyIntegrity: false,
                trialStore,
            });
            await registry.registerRemote({ url: 'https://example.com/skill.json' });
            expect(await registry.getTrialRecord('trial-test')).not.toBeNull();

            expect(registry.unregister('trial-test')).toBe(true);
            expect(await registry.getTrialRecord('trial-test')).toBeNull();

            vi.unstubAllGlobals();
        });

        it('should delete promotion state when unregistering a skill', async () => {
            const manifest = JSON.stringify({
                name: 'promotion-test',
                version: '1.0.0',
                description: 'Test',
                entry: 'SKILL.md',
                entryType: 'markdown',
            });

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(manifest),
            }));

            const promotionStore = new InMemorySkillPromotionStore();
            const registry = new SkillRegistry({
                allowRemote: true,
                verifyIntegrity: false,
                promotionStore,
            });
            await registry.registerRemote({ url: 'https://example.com/skill.json' });
            expect(await registry.getPromotionRecord('promotion-test')).not.toBeNull();

            expect(registry.unregister('promotion-test')).toBe(true);
            expect(await registry.getPromotionRecord('promotion-test')).toBeNull();

            vi.unstubAllGlobals();
        });

        it('should return false for non-existent skill', () => {
            const registry = new SkillRegistry();
            expect(registry.unregister('non-existent')).toBe(false);
        });
    });
});
