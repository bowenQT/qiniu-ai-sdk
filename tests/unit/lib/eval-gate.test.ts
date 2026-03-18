import { describe, expect, it } from 'vitest';
import {
    buildEvalCandidateReport,
    compareEvalGateResults,
    summarizeEvalGateStatus,
    type EvalRunReport,
} from '../../../src/lib/eval-gate';

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

    it('builds a machine-readable candidate report with warnings, blockers, and artifact refs', () => {
        const baseline: EvalRunReport = {
            reportId: 'baseline-2',
            generatedAt: '2026-03-18T00:00:00.000Z',
            cases: [
                {
                    caseId: 'case-1',
                    graders: [{ graderId: 'tool', status: 'warn', message: 'baseline weak' }],
                    artifact: { traceId: 'trace-baseline', artifactPath: 'artifacts/baseline.json' },
                    metrics: { score: 0.5 },
                },
            ],
        };
        const candidate: EvalRunReport = {
            reportId: 'candidate-2',
            generatedAt: '2026-03-18T00:00:00.000Z',
            cases: [
                {
                    caseId: 'case-1',
                    graders: [{ graderId: 'tool', status: 'fail', message: 'candidate blocked' }],
                    artifact: { traceId: 'trace-candidate', artifactPath: 'artifacts/candidate.json' },
                    metrics: { score: 0.4 },
                },
            ],
        };

        const report = buildEvalCandidateReport(baseline, candidate, { suite: 'smoke' });

        expect(report.reportId).toBe('eval-candidate-candidate-2-vs-baseline-2');
        expect(report.decision).toBe('fail');
        expect(report.blockers).toHaveLength(1);
        expect(report.warnings).toHaveLength(0);
        expect(report.artifactRefs).toEqual([
            'artifact:artifacts/baseline.json',
            'artifact:artifacts/candidate.json',
            'trace:trace-baseline',
            'trace:trace-candidate',
        ]);
        expect(report.metadata).toEqual({ suite: 'smoke' });
    });
});
