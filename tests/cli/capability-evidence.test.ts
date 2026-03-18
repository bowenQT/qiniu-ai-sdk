import { describe, expect, it } from 'vitest';
import {
    buildCapabilityEvidenceSnapshot,
    collectPromotionDecisions,
    renderCapabilityEvidenceGeneratedModule,
    resolveCapabilityEvidenceGateArtifact,
} from '../../scripts/lib/capability-evidence.mjs';

describe('capability evidence helpers', () => {
    it('applies tracked promotion decisions to the baseline snapshot deterministically', () => {
        const decisions = collectPromotionDecisions(
            ['/repo/.trellis/decisions/phase3/phase3-cloud-surface-responseapi-evidence-hardening.json'],
            {
                readJsonFile: () => ({
                    version: 1,
                    packageId: 'phase3/cloud-surface/responseapi-evidence-hardening',
                    generatedAt: '2026-03-16T00:00:00.000Z',
                    decisions: [
                        {
                            module: 'ResponseAPI',
                            oldMaturity: 'experimental',
                            newMaturity: 'beta',
                            evidenceBasis: ['artifacts/verification-report.md'],
                            requirements: {
                                liveVerifyGate: {
                                    policyProfile: 'nightly',
                                    promotionGateStatus: 'pass',
                                },
                            },
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
        }, decisions, ['.trellis/decisions/phase3/phase3-cloud-surface-responseapi-evidence-hardening.json'], {
            path: 'artifacts/live-verify-gate.json',
            status: 'ok',
            policyProfile: 'nightly',
            promotionGateStatus: 'pass',
        });

        expect(snapshot.generatedAt).toBe('2026-03-16T09:00:00.000Z');
        expect(snapshot.modules[0]?.maturity).toBe('beta');
        expect(snapshot.modules[0]?.trackedDecision?.module).toBe('ResponseAPI');
        expect(snapshot.promotionDecisions).toHaveLength(1);
        expect(snapshot.latestLiveVerifyGate?.promotionGateStatus).toBe('pass');

        const generatedModule = renderCapabilityEvidenceGeneratedModule(snapshot);
        expect(generatedModule).toContain('LATEST_LIVE_VERIFY_GATE');
        expect(generatedModule).toContain('export const MODULE_MATURITY_SOURCE');
        expect(generatedModule).toContain('"maturity": "beta"');
    });

    it('keeps the earlier applicable decision when nightly-gated evidence is unavailable', () => {
        const decisions = collectPromotionDecisions(
            [
                '/repo/.trellis/decisions/phase3/phase3-cloud-surface-responseapi-beta-promotion.json',
                '/repo/.trellis/decisions/phase3/phase3-cloud-surface-responseapi-evidence-hardening.json',
            ],
            {
                readJsonFile: (filePath: string) => ({
                    version: 1,
                    packageId: filePath.includes('evidence-hardening')
                        ? 'phase3/cloud-surface/responseapi-evidence-hardening'
                        : 'phase3/cloud-surface/responseapi-beta-promotion',
                    generatedAt: '2026-03-16T00:00:00.000Z',
                    decisions: [
                        filePath.includes('evidence-hardening')
                            ? {
                                module: 'ResponseAPI',
                                oldMaturity: 'experimental',
                                newMaturity: 'beta',
                                evidenceBasis: ['artifacts/live-verify-gate-nightly.json'],
                                requirements: {
                                    liveVerifyGate: {
                                        path: 'artifacts/live-verify-gate-nightly.json',
                                        policyProfile: 'nightly',
                                        promotionGateStatus: 'pass',
                                    },
                                },
                                decisionSource: 'codex',
                                decisionAt: '2026-03-18T00:00:00.000Z',
                            }
                            : {
                                module: 'ResponseAPI',
                                oldMaturity: 'experimental',
                                newMaturity: 'beta',
                                evidenceBasis: ['tests/unit/modules/response.test.ts'],
                                decisionSource: 'codex',
                                decisionAt: '2026-03-17T13:02:32.000Z',
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
        }, decisions, [
            '.trellis/decisions/phase3/phase3-cloud-surface-responseapi-beta-promotion.json',
            '.trellis/decisions/phase3/phase3-cloud-surface-responseapi-evidence-hardening.json',
        ]);

        expect(snapshot.modules[0]?.maturity).toBe('beta');
        expect(snapshot.modules[0]?.trackedDecision?.packageId).toBe(
            'phase3/cloud-surface/responseapi-beta-promotion',
        );
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
            ['/repo/.trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json'],
            {
                readJsonFile: () => ({
                    version: 1,
                    packageId: 'phase3/node-integrations/mcphost-oauth-boundary',
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
        }, decisions, ['.trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json']);

        expect(snapshot.modules[0]?.maturity).toBe('beta');
        expect(snapshot.modules[0]?.trackedDecision?.newMaturity).toBe('beta');
        expect(snapshot.promotionDecisions).toHaveLength(1);
        expect(snapshot.promotionDecisions[0]?.trackedPath).toContain('phase3-node-integrations-mcphost-oauth-boundary.json');
    });

    it('uses the latest tracked hold decision when multiple packages reference the same module', () => {
        const decisions = collectPromotionDecisions(
            [
                '/repo/.trellis/decisions/phase2/phase2-node-integrations-mcp-policy.json',
                '/repo/.trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json',
            ],
            {
                readJsonFile: (filePath: string) => ({
                    version: 1,
                    packageId: filePath.includes('phase3')
                        ? 'phase3/node-integrations/mcphost-oauth-boundary'
                        : 'phase2/node-integrations/mcp-policy',
                    generatedAt: '2026-03-17T00:00:00.000Z',
                    decisions: [
                        {
                            module: 'NodeMCPHost',
                            oldMaturity: 'beta',
                            newMaturity: 'beta',
                            evidenceBasis: [filePath],
                            decisionSource: filePath.includes('phase3') ? 'codex' : 'antigravity',
                            decisionAt: filePath.includes('phase3')
                                ? '2026-03-17T13:20:00.000Z'
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
            '.trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json',
        ]);

        expect(snapshot.modules[0]?.trackedDecision?.packageId).toBe(
            'phase3/node-integrations/mcphost-oauth-boundary',
        );
        expect(snapshot.modules[0]?.trackedDecision?.decisionSource).toBe('codex');
        expect(snapshot.generatedAt).toBe('2026-03-17T13:20:00.000Z');
    });

    it('requires a live verify gate artifact when nightly evidence ingestion marks it as required', () => {
        expect(() => resolveCapabilityEvidenceGateArtifact({
            gatePath: '/repo/artifacts/live-verify-gate-nightly.json',
            required: true,
            fileExists: () => false,
        })).toThrow('Required live verify gate artifact not found');
    });

    it('rejects gate artifacts with the wrong policy profile', () => {
        expect(() => resolveCapabilityEvidenceGateArtifact({
            gatePath: '/repo/artifacts/live-verify-gate-nightly.json',
            required: true,
            expectedPolicyProfile: 'nightly',
            fileExists: () => true,
            readJsonFile: () => ({
                generatedAt: '2026-03-18T00:00:00.000Z',
                status: 'ok',
                policyProfile: 'pr',
                promotionGateStatus: 'held',
            }),
        })).toThrow('policy profile mismatch');
    });

    it('rejects stale gate artifacts when max age is enforced', () => {
        expect(() => resolveCapabilityEvidenceGateArtifact({
            gatePath: '/repo/artifacts/live-verify-gate-nightly.json',
            required: true,
            expectedPolicyProfile: 'nightly',
            maxAgeHours: 24,
            now: () => Date.parse('2026-03-18T12:00:00.000Z'),
            fileExists: () => true,
            readJsonFile: () => ({
                generatedAt: '2026-03-16T00:00:00.000Z',
                status: 'ok',
                policyProfile: 'nightly',
                promotionGateStatus: 'held',
            }),
        })).toThrow('stale');
    });

    it('summarizes valid nightly gate artifacts for capability truth', () => {
        const summary = resolveCapabilityEvidenceGateArtifact({
            gatePath: '/repo/artifacts/live-verify-gate-nightly.json',
            required: true,
            expectedPolicyProfile: 'nightly',
            maxAgeHours: 24,
            now: () => Date.parse('2026-03-18T12:00:00.000Z'),
            fileExists: () => true,
            readJsonFile: () => ({
                generatedAt: '2026-03-18T00:00:00.000Z',
                status: 'ok',
                policyProfile: 'nightly',
                packageId: 'phase3/cloud-surface/responseapi-beta-promotion',
                packageCategory: 'promotion-sensitive',
                promotionGateStatus: 'pass',
                blockingFailures: [],
                heldEvidence: [],
                unavailableEvidence: [],
            }),
        });

        expect(summary).toMatchObject({
            path: '/repo/artifacts/live-verify-gate-nightly.json',
            policyProfile: 'nightly',
            promotionGateStatus: 'pass',
            blockingFailuresCount: 0,
            heldEvidenceCount: 0,
            unavailableEvidenceCount: 0,
        });
    });
});
