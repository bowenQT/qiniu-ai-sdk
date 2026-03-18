import { describe, expect, it } from 'vitest';
import { compareEvalGateResults, summarizeEvalGateStatus, type EvalRunReport } from '../../../src/lib/eval-gate';

describe('eval gate helpers', () => {
    it('summarizes status with fail > warn > pass precedence', () => {
        expect(summarizeEvalGateStatus(['pass', 'warn'])).toBe('warn');
        expect(summarizeEvalGateStatus(['pass', 'fail'])).toBe('fail');
        expect(summarizeEvalGateStatus(['pass'])).toBe('pass');
    });

    it('compares baseline and candidate reports into a stable gate artifact', () => {
        const baseline: EvalRunReport = {
            reportId: 'baseline-1',
            generatedAt: '2026-03-18T00:00:00.000Z',
            cases: [
                {
                    caseId: 'case-1',
                    taskId: 'task-1',
                    graders: [{ graderId: 'tool', status: 'pass' }],
                    metrics: { score: 0.8 },
                },
            ],
        };
        const candidate: EvalRunReport = {
            reportId: 'candidate-1',
            generatedAt: '2026-03-18T00:00:00.000Z',
            cases: [
                {
                    caseId: 'case-1',
                    taskId: 'task-1',
                    graders: [{ graderId: 'tool', status: 'pass', message: 'tool call valid' }],
                    metrics: { score: 0.9 },
                },
            ],
        };

        const gate = compareEvalGateResults(baseline, candidate);

        expect(gate.status).toBe('pass');
        expect(gate.totalCases).toBe(1);
        expect(gate.passingCases).toBe(1);
        expect(gate.metrics).toEqual([
            { metric: 'score', baseline: 0.8, candidate: 0.9, delta: 0.1 },
        ]);
    });
});
