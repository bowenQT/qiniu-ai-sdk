import { describe, it, expect } from 'vitest';

describe('SDK_VERSION', () => {
    it('exports a semver version string matching package.json', async () => {
        const { SDK_VERSION } = await import('../../src/lib/version');
        // Must be a non-placeholder semver string
        expect(SDK_VERSION).toBeDefined();
        expect(SDK_VERSION).not.toBe('__SDK_VERSION__');
        expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('matches the version in package.json', async () => {
        const { SDK_VERSION } = await import('../../src/lib/version');
        const pkg = await import('../../package.json');
        expect(SDK_VERSION).toBe(pkg.version);
    });
});
