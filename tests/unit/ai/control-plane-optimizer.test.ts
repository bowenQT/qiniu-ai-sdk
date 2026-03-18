import { describe, expect, it } from 'vitest';
import {
    DefaultOptimizerPolicy,
    deriveBudgetSnapshotFromGate,
    InMemoryCandidateStore,
    type CandidateVersion,
} from '../../../src/ai/control-plane';

function createCandidate(overrides: Partial<CandidateVersion> = {}): CandidateVersion {
    return {
        candidateId: 'cand-1',
        kind: 'prompt',
        createdAt: '2026-03-18T00:00:00.000Z',
        revision: {
            kind: 'prompt',
            revisionId: 'rev-1',
            labels: ['candidate'],
        },
        sourceTraceIds: ['trace-1'],
        benchmarkIds: ['bench-1'],
        budgetProfile: {
            maxRunCost: 2,
            maxStepCost: 1,
            maxLatencyMs: 800,
        },
        ...overrides,
    };
}

describe('control-plane optimizer scaffold', () => {
    it('stores candidate versions in memory', () => {
        const store = new InMemoryCandidateStore();
        const candidate = createCandidate();

        store.putCandidate(candidate);

        expect(store.getCandidate('cand-1')).toEqual(candidate);
    });

    it('derives budget snapshots from gate metrics', () => {
        const snapshot = deriveBudgetSnapshotFromGate(createCandidate(), {
            generatedAt: '2026-03-18T00:00:00.000Z',
            decision: 'pass',
            metrics: [
                { metric: 'cost', baseline: 0.8, candidate: 1.4, delta: 0.6 },
                { metric: 'latency_ms', baseline: 400, candidate: 720, delta: 320 },
                { metric: 'step_cost', baseline: 0.2, candidate: 0.6, delta: 0.4 },
            ],
            blockers: [],
            warnings: [],
            artifactRefs: ['artifact:gate'],
        });

        expect(snapshot).toMatchObject({
            runCost: 1.4,
            stepCost: 0.6,
            latencyMs: 720,
        });
        expect(snapshot.metrics).toHaveLength(3);
    });

    it('promotes candidates that pass gates and stay within budget', () => {
        const policy = new DefaultOptimizerPolicy();
        const result = policy.evaluateCandidate({
            candidate: createCandidate(),
            gate: {
                generatedAt: '2026-03-18T00:00:00.000Z',
                decision: 'pass',
                metrics: [
                    { metric: 'cost', baseline: 0.8, candidate: 1.2, delta: 0.4 },
                    { metric: 'step_cost', baseline: 0.2, candidate: 0.8, delta: 0.6 },
                    { metric: 'latency_ms', baseline: 500, candidate: 700, delta: 200 },
                ],
                blockers: [],
                warnings: [],
                artifactRefs: [],
            },
        });

        expect(result.decisionStatus).toBe('promote');
        expect(result.score).toBe(1);
    });

    it('holds candidates that exceed latency budget but have no blockers', () => {
        const policy = new DefaultOptimizerPolicy();
        const result = policy.evaluateCandidate({
            candidate: createCandidate(),
            gate: {
                generatedAt: '2026-03-18T00:00:00.000Z',
                decision: 'pass',
                metrics: [
                    { metric: 'cost', baseline: 0.8, candidate: 1.2, delta: 0.4 },
                    { metric: 'step_cost', baseline: 0.2, candidate: 0.8, delta: 0.6 },
                    { metric: 'latency_ms', baseline: 500, candidate: 1200, delta: 700 },
                ],
                blockers: [],
                warnings: [],
                artifactRefs: [],
            },
        });

        expect(result.decisionStatus).toBe('hold');
        expect(result.warnings).toEqual(expect.arrayContaining([
            'Latency 1200ms exceeds budget 800ms.',
        ]));
    });

    it('rejects candidates when the gate already has blockers', () => {
        const policy = new DefaultOptimizerPolicy({ rejectOnBudgetExceeded: true });
        const result = policy.evaluateCandidate({
            candidate: createCandidate(),
            gate: {
                generatedAt: '2026-03-18T00:00:00.000Z',
                decision: 'fail',
                metrics: [
                    { metric: 'cost', baseline: 0.8, candidate: 3, delta: 2.2 },
                ],
                blockers: ['Regression detected.'],
                warnings: [],
                artifactRefs: [],
            },
        });

        expect(result.decisionStatus).toBe('reject');
        expect(result.reasons).toContain('Regression detected.');
    });
});
