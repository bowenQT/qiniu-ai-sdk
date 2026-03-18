import { describe, expect, it } from 'vitest';
import {
    evaluatePhase2PlanningReadiness,
    renderPhase2CloseoutReport,
} from '../../src/cli/verification-report';

describe('phase2 closeout report helpers', () => {
    it('marks Phase 2 ready for Phase 3 planning when policy is closeout-candidate and tracked decisions exist', () => {
        const readiness = evaluatePhase2PlanningReadiness({
            phaseStatus: 'closeout-candidate',
            allowNewPackages: false,
            promotionGateStatus: 'held',
            modules: [
                {
                    module: 'ResponseAPI',
                    maturity: 'experimental',
                    decisionStatus: 'held',
                },
                {
                    module: 'NodeMCPHost',
                    maturity: 'beta',
                    decisionStatus: 'held',
                },
            ],
        });

        expect(readiness.ready).toBe(true);
        expect(readiness.reasons).toEqual([]);
    });

    it('blocks Phase 3 planning when the phase is still active or missing tracked decisions', () => {
        const readiness = evaluatePhase2PlanningReadiness({
            phaseStatus: 'active',
            allowNewPackages: true,
            promotionGateStatus: 'block',
            modules: [
                {
                    module: 'ResponseAPI',
                    maturity: 'experimental',
                    decisionStatus: 'untracked',
                },
            ],
        });

        expect(readiness.ready).toBe(false);
        expect(readiness.reasons).toContain('Phase 2 policy is still active.');
        expect(readiness.reasons).toContain('Phase 2 policy still allows new packages.');
        expect(readiness.reasons).toContain('Latest promotion gate status is block.');
        expect(readiness.reasons).toContain('Missing tracked promotion decision for ResponseAPI.');
    });

    it('renders a closeout artifact with tracked module and readiness sections', () => {
        const output = renderPhase2CloseoutReport({
            generatedAt: '2026-03-17T18:00:00.000Z',
            phaseStatus: 'closeout-candidate',
            allowNewPackages: false,
            policyPath: '.trellis/spec/sdk/phase-policy.json',
            closeoutReportPath: 'artifacts/phase2-closeout-report.md',
            verificationReportPath: 'artifacts/verification-report.md',
            closeoutCriteria: ['A single Phase 2 closeout report exists.'],
            overrideRules: ['Tracked reopen package required.'],
            promotionGateStatus: 'held',
            modules: [
                {
                    module: 'NodeMCPHost',
                    maturity: 'beta',
                    validationLevel: 'unit',
                    decisionStatus: 'held',
                    trackedPath: '.trellis/decisions/phase2/phase2-node-integrations-node-mcphost-promotion-readiness.json',
                    decisionSource: 'codex',
                    decisionAt: '2026-03-17T13:10:00.000Z',
                    deferredRisks: ['HTTP interop evidence is still scoped per server.'],
                },
            ],
            remainingDeferredRisks: ['HTTP interop evidence is still scoped per server.'],
            readiness: {
                ready: true,
                reasons: [],
            },
        });

        expect(output).toContain('# Phase 2 Closeout Report');
        expect(output).toContain('## Phase Policy');
        expect(output).toContain('- Status: closeout-candidate');
        expect(output).toContain('## Promotion-sensitive Modules');
        expect(output).toContain('### NodeMCPHost');
        expect(output).toContain('- Decision: held');
        expect(output).toContain('## Remaining Deferred Risks');
        expect(output).toContain('## Phase 3 Planning Readiness');
        expect(output).toContain('- Ready: yes');
    });
});
