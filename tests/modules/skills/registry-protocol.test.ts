/**
 * Phase 5B — Registry Protocol export verification.
 *
 * Verifies that RegistryProtocolStub and related types are
 * properly exported from the public API surface.
 */
import { describe, it, expect } from 'vitest';
import {
    RegistryProtocolStub,
} from '../../../src/node/skills/index';
import type {
    SkillRegistryProtocol,
    RegistrySkillEntry,
    RegistrySearchOptions,
} from '../../../src/node/skills/index';

describe('RegistryProtocolStub (5B export)', () => {
    it('is importable and instantiable', () => {
        const stub = new RegistryProtocolStub();
        expect(stub).toBeDefined();
    });

    it('search() returns empty array', async () => {
        const stub = new RegistryProtocolStub();
        const results = await stub.search({ query: 'test' });
        expect(results).toEqual([]);
    });

    it('resolve() returns null', async () => {
        const stub = new RegistryProtocolStub();
        const result = await stub.resolve('nonexistent');
        expect(result).toBeNull();
    });

    it('implements SkillRegistryProtocol interface', () => {
        const stub: SkillRegistryProtocol = new RegistryProtocolStub();
        expect(typeof stub.search).toBe('function');
        expect(typeof stub.resolve).toBe('function');
    });

    it('RegistrySearchOptions type is usable', () => {
        const opts: RegistrySearchOptions = {
            query: 'test',
            limit: 10,
            tags: ['ai'],
            sort: 'relevance',
        };
        expect(opts.query).toBe('test');
    });

    it('RegistrySkillEntry type is usable', () => {
        const entry: RegistrySkillEntry = {
            name: 'test-skill',
            version: '1.0.0',
            description: 'A test skill',
            tags: ['test'],
            manifestUrl: 'https://example.com/skill.json',
            integrityHash: 'sha256:abc123',
        };
        expect(entry.name).toBe('test-skill');
    });
});
