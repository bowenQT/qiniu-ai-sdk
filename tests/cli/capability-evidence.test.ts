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
        }, decisions, ['.trellis/decisions/phase2/phase2-foundation-response.json'], {
            path: 'artifacts/live-verify-gate.json',
            status: 'ok',
            promotionGateStatus: 'held',
        });

        expect(snapshot.generatedAt).toBe('2026-03-16T09:00:00.000Z');
        expect(snapshot.modules[0]?.maturity).toBe('beta');
        expect(snapshot.modules[0]?.trackedDecision?.module).toBe('ResponseAPI');
        expect(snapshot.promotionDecisions).toHaveLength(1);
        expect(snapshot.latestLiveVerifyGate?.promotionGateStatus).toBe('held');

        const generatedModule = renderCapabilityEvidenceGeneratedModule(snapshot);
        expect(generatedModule).toContain('LATEST_LIVE_VERIFY_GATE');
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

    it('keeps tracked hold decisions even when maturity does not change', () => {
        const decisions = collectPromotionDecisions(
            ['/repo/.trellis/decisions/phase2/phase2-node-integrations-mcp-policy.json'],
            {
                readJsonFile: () => ({
                    version: 1,
                    packageId: 'phase2/node-integrations/mcp-policy',
                    generatedAt: '2026-03-16T00:00:00.000Z',
                    decisions: [
                        {
                            module: 'NodeMCPHost',
                            oldMaturity: 'beta',
                            newMaturity: 'beta',
                            evidenceBasis: ['artifacts/verification-report.md'],
                            decisionSource: 'antigravity',
                            decisionAt: '2026-03-16T10:00:00.000Z',
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
                    name: 'NodeMCPHost',
                    maturity: 'beta',
                    docsUrl: 'https://modelcontextprotocol.io/specification/2025-11-25/basic/transports',
                    sourceUpdatedAt: '2026-03-14',
                    validationLevel: 'unit',
                },
            ],
        }, decisions, ['.trellis/decisions/phase2/phase2-node-integrations-mcp-policy.json']);

        expect(snapshot.modules[0]?.maturity).toBe('beta');
        expect(snapshot.modules[0]?.trackedDecision?.newMaturity).toBe('beta');
        expect(snapshot.promotionDecisions).toHaveLength(1);
        expect(snapshot.promotionDecisions[0]?.trackedPath).toContain('phase2-node-integrations-mcp-policy.json');
    });

    it('uses the latest tracked hold decision when multiple packages reference the same module', () => {
        const decisions = collectPromotionDecisions(
            [
                '/repo/.trellis/decisions/phase2/phase2-node-integrations-mcp-policy.json',
                '/repo/.trellis/decisions/phase2/phase2-node-integrations-mcp-readiness.json',
            ],
            {
                readJsonFile: (filePath: string) => ({
                    version: 1,
                    packageId: filePath.includes('readiness')
                        ? 'phase2/node-integrations/node-mcphost-promotion-readiness'
                        : 'phase2/node-integrations/mcp-policy',
                    generatedAt: '2026-03-17T00:00:00.000Z',
                    decisions: [
                        {
                            module: 'NodeMCPHost',
                            oldMaturity: 'beta',
                            newMaturity: 'beta',
                            evidenceBasis: [filePath],
                            decisionSource: filePath.includes('readiness') ? 'codex' : 'antigravity',
                            decisionAt: filePath.includes('readiness')
                                ? '2026-03-17T13:10:00.000Z'
                                : '2026-03-16T10:00:00.000Z',
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
                    name: 'NodeMCPHost',
                    maturity: 'beta',
                    docsUrl: 'https://modelcontextprotocol.io/specification/2025-11-25/basic/transports',
                    sourceUpdatedAt: '2026-03-14',
                    validationLevel: 'unit',
                },
            ],
        }, decisions, [
            '.trellis/decisions/phase2/phase2-node-integrations-mcp-policy.json',
            '.trellis/decisions/phase2/phase2-node-integrations-mcp-readiness.json',
        ]);

        expect(snapshot.modules[0]?.trackedDecision?.packageId).toBe(
            'phase2/node-integrations/node-mcphost-promotion-readiness',
        );
        expect(snapshot.modules[0]?.trackedDecision?.decisionSource).toBe('codex');
        expect(snapshot.generatedAt).toBe('2026-03-17T13:10:00.000Z');
    });
});
