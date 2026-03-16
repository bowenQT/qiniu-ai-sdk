import { describe, expect, it } from 'vitest';
import {
    buildCapabilityEvidenceSnapshot,
    collectPromotionDecisions,
    renderCapabilityEvidenceGeneratedModule,
} from '../../scripts/lib/capability-evidence.mjs';

describe('capability evidence helpers', () => {
    it('applies tracked promotion decisions to the baseline snapshot deterministically', () => {
        const decisions = collectPromotionDecisions(
            ['/repo/.trellis/decisions/phase2/phase2-foundation-response.json'],
            {
                readJsonFile: () => ({
                    version: 1,
                    packageId: 'phase2/foundation/response-promotion',
                    generatedAt: '2026-03-16T00:00:00.000Z',
                    decisions: [
                        {
                            module: 'ResponseAPI',
                            oldMaturity: 'experimental',
                            newMaturity: 'beta',
                            evidenceBasis: ['artifacts/verification-report.md'],
                            decisionSource: 'antigravity',
                            decisionAt: '2026-03-16T09:00:00.000Z',
                        },
                    ],
                }),
                relativeToRoot: (value: string) => value.replace('/repo/', ''),
            },
        );

        const snapshot = buildCapabilityEvidenceSnapshot({
            version: 1,
            modules: [
                {
                    name: 'ResponseAPI',
                    maturity: 'experimental',
                    docsUrl: 'https://apidocs.qnaigc.com/417773141e0',
                    sourceUpdatedAt: '2026-03-14',
                    validatedAt: '2026-03-15',
                    validationLevel: 'unit',
                },
            ],
        }, decisions, ['.trellis/decisions/phase2/phase2-foundation-response.json']);

        expect(snapshot.generatedAt).toBe('2026-03-16T09:00:00.000Z');
        expect(snapshot.modules[0]?.maturity).toBe('beta');
        expect(snapshot.promotionDecisions).toHaveLength(1);

        const generatedModule = renderCapabilityEvidenceGeneratedModule(snapshot);
        expect(generatedModule).toContain('export const MODULE_MATURITY_SOURCE');
        expect(generatedModule).toContain('"maturity": "beta"');
    });

    it('rejects tracked promotion decisions for unknown modules', () => {
        expect(() => buildCapabilityEvidenceSnapshot({
            version: 1,
            modules: [],
        }, [
            {
                packageId: 'phase2/foundation/missing-module',
                module: 'UnknownModule',
                oldMaturity: 'experimental',
                newMaturity: 'beta',
                evidenceBasis: [],
                decisionSource: 'antigravity',
                decisionAt: '2026-03-16T09:00:00.000Z',
                trackedPath: '.trellis/decisions/phase2/phase2-foundation-missing-module.json',
            },
        ], [])).toThrow('UnknownModule');
    });
});
