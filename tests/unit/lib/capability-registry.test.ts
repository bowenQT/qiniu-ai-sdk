import { describe, expect, it } from 'vitest';
import {
    getModelCapabilities,
    getModuleMaturity,
    listModels,
    listModuleMaturities,
} from '../../../src/lib/capability-registry';

describe('capability registry', () => {
    it('lists provider models with docs and maturity metadata', () => {
        const models = listModels({ type: 'chat' });
        expect(models.length).toBeGreaterThan(10);
        expect(models.some((model) => model.id === 'gemini-2.5-flash')).toBe(true);
        expect(models.every((model) => model.docsUrl.startsWith('https://'))).toBe(true);
        expect(models.some((model) => model.stability === 'ga')).toBe(true);
        expect(models.some((model) => model.stability === 'beta')).toBe(true);
    });

    it('returns rich metadata for a known model id', () => {
        const model = getModelCapabilities('claude-4.5-sonnet');
        expect(model).toMatchObject({
            id: 'claude-4.5-sonnet',
            provider: 'Anthropic',
            type: 'chat',
            docsUrl: 'https://apidocs.qnaigc.com/413432574e0',
            stability: 'beta',
            validationLevel: 'static',
        });
        expect(model?.validatedAt).toBeUndefined();
    });

    it('only marks explicitly curated models as validated', () => {
        const featured = getModelCapabilities('gemini-2.5-flash');
        const nonFeatured = getModelCapabilities('claude-4.5-sonnet');

        expect(featured).toMatchObject({
            stability: 'ga',
            validationLevel: 'live',
            validatedAt: '2026-03-14',
        });
        expect(nonFeatured).toMatchObject({
            stability: 'beta',
            validationLevel: 'static',
        });
        expect(nonFeatured?.validatedAt).toBeUndefined();
    });

    it('returns module maturity records for roadmap tracking', () => {
        const allModules = listModuleMaturities();
        expect(allModules.some((entry) => entry.name === 'ResponseAPI')).toBe(true);

        expect(getModuleMaturity('ResponseAPI')).toMatchObject({
            maturity: 'experimental',
            validationLevel: 'static',
        });
        expect(getModuleMaturity('NodeMCPHost')).toMatchObject({
            maturity: 'beta',
        });
    });
});
