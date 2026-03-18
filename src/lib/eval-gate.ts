export type EvalGateStatus = 'pass' | 'warn' | 'fail';

export interface EvalBenchmarkCase {
    caseId: string;
    taskId: string;
    metadata?: Record<string, unknown>;
}

export interface EvalBenchmarkSuite {
    suiteId: string;
    generatedAt: string;
    cases: EvalBenchmarkCase[];
    metadata?: Record<string, unknown>;
}

export interface EvalRunArtifactRef {
    traceId?: string;
    artifactPath?: string;
    metadata?: Record<string, unknown>;
}

export interface EvalGraderResult {
    graderId: string;
    status: EvalGateStatus;
    score?: number;
    message?: string;
    metadata?: Record<string, unknown>;
}

export interface EvalCaseReport {
    caseId: string;
    taskId?: string;
    graders: EvalGraderResult[];
    metrics?: Record<string, number>;
    artifact?: EvalRunArtifactRef;
    metadata?: Record<string, unknown>;
}

export interface EvalRunReport {
    reportId: string;
    generatedAt: string;
    suite?: EvalBenchmarkSuite;
    cases: EvalCaseReport[];
    metadata?: Record<string, unknown>;
}

export interface EvalCaseResult {
    caseId: string;
    taskId?: string;
    status: EvalGateStatus;
    baseline?: EvalCaseReport;
    candidate?: EvalCaseReport;
    graders: EvalGraderResult[];
    metrics?: Record<string, number>;
}

export interface EvalGateCheck {
    status: EvalGateStatus;
    message: string;
    caseId?: string;
    graderId?: string;
}

export interface EvalGateMetricSummary {
    metric: string;
    baseline: number;
    candidate: number;
    delta: number;
}

export interface EvalGateResult {
    generatedAt: string;
    baselineId: string;
    candidateId: string;
    status: EvalGateStatus;
    totalCases: number;
    passingCases: number;
    checks: EvalGateCheck[];
    metrics: EvalGateMetricSummary[];
    cases: EvalCaseResult[];
}

export function summarizeEvalGateStatus(statuses: readonly EvalGateStatus[]): EvalGateStatus {
    if (statuses.some((status) => status === 'fail')) {
        return 'fail';
    }
    if (statuses.some((status) => status === 'warn')) {
        return 'warn';
    }
    return 'pass';
}

function summarizeCaseStatus(report?: EvalCaseReport): EvalGateStatus {
    if (!report || report.graders.length === 0) {
        return 'warn';
    }
    return summarizeEvalGateStatus(report.graders.map((grader) => grader.status));
}

function averageMetric(cases: readonly EvalCaseReport[], metric: string): number {
    const values = cases
        .map((entry) => entry.metrics?.[metric])
        .filter((value): value is number => typeof value === 'number');

    if (values.length === 0) {
        return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number): number {
    return Number(value.toFixed(6));
}

export function compareEvalGateResults(
    baseline: EvalRunReport,
    candidate: EvalRunReport,
): EvalGateResult {
    const checks: EvalGateCheck[] = [];
    const caseIds = new Set<string>([
        ...baseline.cases.map((entry) => entry.caseId),
        ...candidate.cases.map((entry) => entry.caseId),
    ]);
    const cases: EvalCaseResult[] = [];

    for (const caseId of caseIds) {
        const baselineCase = baseline.cases.find((entry) => entry.caseId === caseId);
        const candidateCase = candidate.cases.find((entry) => entry.caseId === caseId);

        if (!baselineCase) {
            checks.push({
                status: 'fail',
                caseId,
                message: `Missing baseline result for case ${caseId}.`,
            });
        }
        if (!candidateCase) {
            checks.push({
                status: 'fail',
                caseId,
                message: `Missing candidate result for case ${caseId}.`,
            });
        }

        const graders = candidateCase?.graders ?? [];
        const status = summarizeEvalGateStatus([
            baselineCase ? summarizeCaseStatus(baselineCase) : 'fail',
            candidateCase ? summarizeCaseStatus(candidateCase) : 'fail',
        ]);

        for (const grader of graders) {
            checks.push({
                status: grader.status,
                caseId,
                graderId: grader.graderId,
                message: grader.message ?? `Candidate grader ${grader.graderId} returned ${grader.status}.`,
            });
        }

        cases.push({
            caseId,
            taskId: candidateCase?.taskId ?? baselineCase?.taskId,
            status,
            baseline: baselineCase,
            candidate: candidateCase,
            graders,
            metrics: candidateCase?.metrics,
        });
    }

    const metricNames = new Set<string>([
        ...baseline.cases.flatMap((entry) => Object.keys(entry.metrics ?? {})),
        ...candidate.cases.flatMap((entry) => Object.keys(entry.metrics ?? {})),
    ]);
    const metrics = [...metricNames].sort().map((metric) => {
        const baselineValue = averageMetric(baseline.cases, metric);
        const candidateValue = averageMetric(candidate.cases, metric);
        return {
            metric,
            baseline: roundMetric(baselineValue),
            candidate: roundMetric(candidateValue),
            delta: roundMetric(candidateValue - baselineValue),
        };
    });

    const status = summarizeEvalGateStatus([
        ...checks.map((check) => check.status),
        ...cases.map((entry) => entry.status),
    ]);
    const passingCases = cases.filter((entry) => entry.status === 'pass').length;

    return {
        generatedAt: new Date().toISOString(),
        baselineId: baseline.reportId,
        candidateId: candidate.reportId,
        status,
        totalCases: cases.length,
        passingCases,
        checks,
        metrics,
        cases,
    };
}
