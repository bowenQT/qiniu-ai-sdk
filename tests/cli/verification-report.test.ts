import { describe, expect, it } from 'vitest';
import {
    renderPromotionDecisionSummary,
    renderPromotionGateSummary,
    renderReviewPacketFallback,
    renderVerificationReport,
} from '../../src/cli/verification-report';

describe('verification report renderer', () => {
    it('combines the capability scorecard and live verification summary', () => {
        const output = renderVerificationReport({
            generatedAt: '2026-03-16T00:00:00.000Z',
            phasePolicyAvailable: true,
            phasePolicySummary: '# Phase Policy\n\n- Status: closeout-candidate\n- New packages allowed: no\n',
            capabilityScorecard: '# Capability Scorecard\n\nTracked capability truth.\n',
            capabilityEvidenceAvailable: true,
            capabilityEvidenceSummary: '# Capability Evidence Snapshot\n\nTracked promotion decisions: 1.\n\nLatest gate artifact:\n- Path: artifacts/live-verify-gate.json\n- Status: ok\n- Promotion gate: unavailable\n- Blocking failures: 0\n- Held evidence: 0\n- Unavailable evidence: 1\n',
            liveVerifyAvailable: true,
            liveVerifySummary: '# Live Verification Gate\n\nLatest live evidence.\n',
            reviewPacketAvailable: true,
            reviewPacket: '# Review Packet\n\nBounded package summary.\n',
            promotionDecisionsAvailable: true,
            promotionDecisions: '# Promotion Decisions\n\nRecorded maturity changes.\n',
        });

        expect(output).toContain('# Verification Report');
        expect(output).toContain('Generated at: 2026-03-16T00:00:00.000Z');
        expect(output).toContain('## Phase Policy');
        expect(output).toContain('- Status: closeout-candidate');
        expect(output).toContain('## Capability Scorecard');
        expect(output).toContain('Tracked capability truth.');
        expect(output).toContain('## Capability Evidence Snapshot');
        expect(output).toContain('Tracked promotion decisions: 1.');
        expect(output).toContain('Latest gate artifact:');
        expect(output).toContain('## Live Verification');
        expect(output).toContain('Latest live evidence.');
        expect(output).toContain('## Review Packet');
        expect(output).toContain('Bounded package summary.');
        expect(output).toContain('## Promotion Decisions');
        expect(output).toContain('Recorded maturity changes.');
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
            liveVerifyAvailable: false,
            reviewPacketAvailable: false,
            promotionDecisionsAvailable: false,
        });

        expect(output).toContain('Phase policy summary was not produced for this run.');
        expect(output).toContain('Capability evidence snapshot was not produced for this run.');
        expect(output).toContain('Live verification artifact was not produced for this run.');
        expect(output).toContain('Review packet artifact was not produced for this run.');
        expect(output).toContain('Promotion decision artifact was not produced for this run.');
    });

    it('renders tracked review handoffs as a review-packet fallback artifact', () => {
        const output = renderReviewPacketFallback({
            handoffPath: '.trellis/integrations/2026-03-16-phase2-batch2-review-handoff.md',
            handoffContent: '# Phase 2 Batch 2 Review Handoff\n\nCheckpoint summary.\n',
        });

        expect(output).toContain('# Phase 2 Batch 2 Review Handoff');
        expect(output).toContain('Checkpoint summary.');
    });

    it('renders tracked promotion decisions when no package-scoped decision input exists', () => {
        const output = renderPromotionDecisionSummary([
            {
                module: 'NodeMCPHost',
                oldMaturity: 'beta',
                newMaturity: 'beta',
                trackedPath: '.trellis/decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json',
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
});
