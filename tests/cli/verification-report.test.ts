import { describe, expect, it } from 'vitest';
import {
    renderCapabilityEvidenceSummary,
    renderFinalPromotionGateSummary,
    renderPromotionDecisionSummary,
    renderPromotionGateSummary,
    renderReviewPacketFallback,
    renderVerificationReport,
    selectPreferredReviewHandoff,
    toFinalPromotionGateSummaryJson,
} from '../../src/cli/verification-report';

describe('verification report renderer', () => {
    it('combines the capability scorecard and live verification summary', () => {
        const finalPromotionGateSummary = renderFinalPromotionGateSummary({
            generatedAt: '2026-03-16T00:00:00.000Z',
            packageId: 'phase3/dx-validation/final-promotion-gate',
            policyProfile: 'phase3',
            decisionFiles: ['.trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json'],
            entries: [
                {
                    targetKind: 'prompt',
                    targetName: 'prompt-policy revision',
                    oldState: 'candidate',
                    newState: 'staging',
                    decisionStatus: 'promote',
                    decisionSource: 'antigravity',
                    decisionAt: '2026-03-16T12:00:00.000Z',
                    evidenceRefs: ['artifact:prompt-policy-revision'],
                },
                {
                    targetKind: 'policy',
                    targetName: 'guardrail policy',
                    oldState: 'staging',
                    newState: 'production',
                    decisionStatus: 'hold',
                    blockers: ['Awaiting final approval.'],
                    warnings: ['Budget tracker review pending.'],
                },
                {
                    targetKind: 'skill',
                    targetName: 'skill promotion',
                    oldState: 'quarantine',
                    newState: 'production',
                    decisionStatus: 'promote',
                    trackedPath: '.trellis/skills/skill-promotion.json',
                    evidenceRefs: ['trial:skill-promotion', 'benchmark:skill-promotion-bench'],
                },
            ],
            evalCandidateReport: {
                reportId: 'eval-candidate-1',
                generatedAt: '2026-03-16T12:30:00.000Z',
                baselineId: 'baseline-1',
                candidateId: 'candidate-2',
                decision: 'pass',
                gateStatus: 'pass',
                blockingFailuresCount: 0,
                warningCount: 0,
                artifactRefs: ['artifact:eval-candidate-report'],
            },
        });

        const output = renderVerificationReport({
            generatedAt: '2026-03-16T00:00:00.000Z',
            phasePolicyAvailable: true,
            phasePolicySummary: '# Phase Policy\n\n- Status: closeout-candidate\n- New packages allowed: no\n',
            capabilityScorecard: '# Capability Scorecard\n\nTracked capability truth.\n',
            capabilityEvidenceAvailable: true,
            capabilityEvidenceSummary: '# Capability Evidence Snapshot\n\nTracked decision files: 1\nPublic surfaces tracked: 1\nSurface exclusions tracked: 1\n\nTracked promotion decisions: 1.\n\nLatest gate artifact:\n- Path: artifacts/live-verify-gate.json\n- Status: ok\n- Promotion gate: unavailable\n- Blocking failures: 0\n- Held evidence: 0\n- Unavailable evidence: 1\n- Reason: Live verify gate artifact was not found for the configured input path.\n',
            promotionGateSummaryAvailable: true,
            promotionGateSummary: '# Promotion Gate Summary\n\n- Status: unavailable\n- Unavailable evidence: 1\n',
            liveVerifyAvailable: true,
            liveVerifySummary: '# Live Verification Gate\n\nLatest live evidence.\n',
            reviewPacketAvailable: true,
            reviewPacket: '# Review Packet\n\nBounded package summary.\n',
            promotionDecisionsAvailable: true,
            promotionDecisions: '# Promotion Decisions\n\nRecorded maturity changes.\n',
            finalPromotionGateSummaryAvailable: true,
            finalPromotionGateSummary,
        });

        expect(output).toContain('# Verification Report');
        expect(output).toContain('Generated at: 2026-03-16T00:00:00.000Z');
        expect(output).toContain('## Phase Policy');
        expect(output).toContain('- Status: closeout-candidate');
        expect(output).toContain('## Capability Scorecard');
        expect(output).toContain('Tracked capability truth.');
        expect(output).toContain('## Capability Evidence Snapshot');
        expect(output).toContain('Public surfaces tracked: 1');
        expect(output).toContain('Surface exclusions tracked: 1');
        expect(output).toContain('Tracked promotion decisions: 1.');
        expect(output).toContain('Latest gate artifact:');
        expect(output).toContain('Reason: Live verify gate artifact was not found for the configured input path.');
        expect(output).toContain('## Promotion Gate Summary');
        expect(output).toContain('- Status: unavailable');
        expect(output).toContain('## Gate Visibility Contract');
        expect(output).toContain('Latest gate path, status, package, and reason are tracked through the Capability Evidence Snapshot and generated scorecard.');
        expect(output).toContain('absence never implies an unexplained blank gate state.');
        expect(output).toContain('## Live Verification');
        expect(output).toContain('Latest live evidence.');
        expect(output).toContain('## Review Packet');
        expect(output).toContain('Bounded package summary.');
        expect(output).toContain('## Promotion Decisions');
        expect(output).toContain('Recorded maturity changes.');
        expect(output).toContain('## Final Promotion Gate Summary');
        expect(output).toContain('## Prompt Decisions');
        expect(output).toContain('## Policy Decisions');
        expect(output).toContain('## Skill Promotions');
        expect(output).toContain('Eval Candidate Report');
        expect(output).not.toContain('## Capability Scorecard\n\n# Capability Scorecard');
        expect(output).not.toContain('## Capability Evidence Snapshot\n\n# Capability Evidence Snapshot');
        expect(output).not.toContain('## Live Verification\n\n# Live Verification Gate');
        expect(output).not.toContain('## Review Packet\n\n# Review Packet');
    });

    it('renders fallback messages when optional artifacts do not exist', () => {
        const output = renderVerificationReport({
            generatedAt: '2026-03-16T00:00:00.000Z',
            capabilityScorecard: '# Capability Scorecard\n\nTracked capability truth.\n',
            phasePolicyAvailable: false,
            capabilityEvidenceAvailable: false,
            promotionGateSummaryAvailable: false,
            liveVerifyAvailable: false,
            reviewPacketAvailable: false,
            promotionDecisionsAvailable: false,
        });

        expect(output).toContain('Phase policy summary was not produced for this run.');
        expect(output).toContain('Capability evidence snapshot was not produced for this run.');
        expect(output).toContain('Promotion gate summary was not produced for this run.');
        expect(output).toContain('## Gate Visibility Contract');
        expect(output).toContain('Review packet, promotion decisions, and final promotion gate sections must render explicit fallback text whenever their artifacts are unavailable.');
        expect(output).toContain('Live verification artifact was not produced for this run.');
        expect(output).toContain('Review packet artifact was not produced for this run.');
        expect(output).toContain('Promotion decision artifact was not produced for this run.');
        expect(output).toContain('Final promotion gate summary was not produced for this run.');
    });

    it('renders capability evidence summaries from a tracked snapshot', () => {
        const output = renderCapabilityEvidenceSummary({
            generatedAt: '2026-03-17T00:00:00.000Z',
            decisionFiles: ['.trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json'],
            publicSurfaces: [
                {
                    name: 'streamObject',
                    kind: 'runtime-surface',
                    maturity: 'beta',
                    validationLevel: 'contract',
                    validatedAt: '2026-03-20',
                },
            ],
            surfaceExclusions: [
                {
                    surface: 'Internal glue exports',
                    reasonCode: 'internal-only',
                    reason: 'Implementation detail or transitive glue that is not intended for direct consumer use.',
                },
            ],
            surfaceTruthPolicy: {
                firstClassSurfaceDefinition: ['User-facing package entrypoints are first-class surfaces.'],
                exclusionReasonSemantics: {
                    'internal-only': 'Implementation detail or transitive glue that is not intended for direct consumer use.',
                },
                gateBlankReasonSemantics: {
                    unavailable: 'A live verify gate artifact is intentionally unavailable for this package or run.',
                },
            },
            promotionDecisions: [
                {
                    module: 'NodeMCPHost',
                    oldMaturity: 'beta',
                    newMaturity: 'beta',
                    trackedPath: '.trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json',
                },
            ],
            latestLiveVerifyGate: {
                path: 'artifacts/live-verify-gate.json',
                status: 'ok',
                promotionGateStatus: 'held',
                heldEvidenceCount: 1,
                reasonCode: 'missing-artifact',
                reason: 'Live verify gate artifact was not found for the configured input path.',
            },
        });

        expect(output).toContain('# Capability Evidence Snapshot');
        expect(output).toContain('Tracked decision files: 1');
        expect(output).toContain('Public surfaces tracked: 1');
        expect(output).toContain('Surface exclusions tracked: 1');
        expect(output).toContain('Surface truth policy:');
        expect(output).toContain('- Gate blank unavailable: A live verify gate artifact is intentionally unavailable for this package or run.');
        expect(output).toContain('Public surface records:');
        expect(output).toContain('Surface exclusions:');
        expect(output).toContain('NodeMCPHost: beta (held)');
        expect(output).toContain('- Promotion gate: held');
        expect(output).toContain('- Reason: Live verify gate artifact was not found for the configured input path.');
    });

    it('renders tracked review handoffs as a review-packet fallback artifact', () => {
        const output = renderReviewPacketFallback({
            handoffPath: '.trellis/integrations/2026-03-16-phase2-batch2-review-handoff.md',
            handoffContent: '# Phase 2 Batch 2 Review Handoff\n\nCheckpoint summary.\n',
        });

        expect(output).toContain('# Phase 2 Batch 2 Review Handoff');
        expect(output).toContain('Checkpoint summary.');
    });

    it('prefers closeout review handoffs over same-day wave handoffs', () => {
        expect(selectPreferredReviewHandoff([
            '.trellis/integrations/2026-03-20-phase3-wave-a-review-handoff.md',
            '.trellis/integrations/2026-03-20-phase3-closeout-review-handoff.md',
            '.trellis/integrations/2026-03-18-phase3-batch2-review-handoff.md',
        ])).toBe('.trellis/integrations/2026-03-20-phase3-closeout-review-handoff.md');
    });

    it('renders tracked promotion decisions when no package-scoped decision input exists', () => {
        const output = renderPromotionDecisionSummary([
            {
                module: 'NodeMCPHost',
                oldMaturity: 'beta',
                newMaturity: 'beta',
                trackedPath: '.trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json',
                decisionSource: 'antigravity',
                decisionAt: '2026-03-16T13:30:00.000Z',
            },
        ]);

        expect(output).toContain('# Promotion Decisions');
        expect(output).toContain('## NodeMCPHost');
        expect(output).toContain('beta (held)');
        expect(output).toContain('antigravity');
    });

    it('renders a machine-readable promotion gate summary', () => {
        const output = renderPromotionGateSummary({
            status: 'unavailable',
            packageId: 'phase2/dx-validation/promotion-gate-hardening',
            policyProfile: 'pr',
            blockingFailuresCount: 0,
            heldEvidenceCount: 0,
            unavailableEvidenceCount: 2,
        });

        expect(output).toContain('# Promotion Gate Summary');
        expect(output).toContain('- Status: unavailable');
        expect(output).toContain('- Package: phase2/dx-validation/promotion-gate-hardening');
        expect(output).toContain('- Policy profile: pr');
        expect(output).toContain('- Unavailable evidence: 2');
    });

    it('renders a unified final promotion gate summary and derived JSON artifact', () => {
        const input = {
            generatedAt: '2026-03-18T00:00:00.000Z',
            packageId: 'phase3/dx-validation/final-promotion-gate',
            policyProfile: 'phase3',
            decisionFiles: [
                '.trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json',
            ],
            entries: [
                {
                    targetKind: 'prompt' as const,
                    targetName: 'prompt policy revision',
                    oldState: 'candidate',
                    newState: 'staging',
                    decisionStatus: 'promote' as const,
                    decisionSource: 'antigravity',
                    decisionAt: '2026-03-18T10:00:00.000Z',
                    evidenceRefs: ['artifact:prompt-policy'],
                },
                {
                    targetKind: 'skill' as const,
                    targetName: 'skill promotion',
                    oldState: 'quarantine',
                    newState: 'production',
                    decisionStatus: 'hold' as const,
                    warnings: ['Awaiting sandbox validation.'],
                },
            ],
            evalCandidateReport: {
                reportId: 'eval-candidate-2',
                baselineId: 'baseline-2',
                candidateId: 'candidate-2',
                decision: 'warn',
                gateStatus: 'warn',
                warningCount: 1,
                artifactRefs: ['artifact:eval-candidate'],
            },
        };

        const markdown = renderFinalPromotionGateSummary(input);
        const json = JSON.parse(toFinalPromotionGateSummaryJson(input)) as {
            overallStatus: string;
            promptCount: number;
            policyCount: number;
            skillCount: number;
        };

        expect(markdown).toContain('# Final Promotion Gate Summary');
        expect(markdown).toContain('- Overall status: held');
        expect(markdown).toContain('## Prompt Decisions');
        expect(markdown).toContain('## Skill Promotions');
        expect(markdown).toContain('Awaiting sandbox validation.');
        expect(json.overallStatus).toBe('held');
        expect(json.promptCount).toBe(1);
        expect(json.policyCount).toBe(0);
        expect(json.skillCount).toBe(1);
    });

    it('renders unchanged final promotion states without forcing a held label', () => {
        const markdown = renderFinalPromotionGateSummary({
            generatedAt: '2026-03-18T00:00:00.000Z',
            entries: [
                {
                    targetKind: 'policy',
                    targetName: 'guardrail policy',
                    oldState: 'staging',
                    newState: 'staging',
                    decisionStatus: 'reject',
                    blockers: ['Safety regression detected.'],
                },
            ],
        });

        expect(markdown).toContain('- State: staging (unchanged)');
        expect(markdown).toContain('- Decision: reject');
        expect(markdown).not.toContain('- State: staging (held)');
    });

    it('treats empty eval candidate payloads as unavailable rather than passing silently', () => {
        const json = JSON.parse(toFinalPromotionGateSummaryJson({
            generatedAt: '2026-03-18T00:00:00.000Z',
            entries: [],
            evalCandidateReport: {},
        })) as {
            overallStatus: string;
        };

        const markdown = renderFinalPromotionGateSummary({
            generatedAt: '2026-03-18T00:00:00.000Z',
            entries: [],
            evalCandidateReport: {},
        });

        expect(json.overallStatus).toBe('unavailable');
        expect(markdown).toContain('No eval candidate report was provided.');
    });

    it('marks summary as unavailable when eval candidate metadata lacks an outcome', () => {
        const json = JSON.parse(toFinalPromotionGateSummaryJson({
            generatedAt: '2026-03-18T00:00:00.000Z',
            entries: [],
            evalCandidateReport: {
                reportId: 'eval-candidate-3',
                generatedAt: '2026-03-18T12:00:00.000Z',
            },
        })) as {
            overallStatus: string;
        };

        expect(json.overallStatus).toBe('unavailable');
    });
});
