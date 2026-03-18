import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    compareEvalGateResults,
    type EvalGateResult,
    type EvalRunReport,
} from '../lib/eval-gate';

export interface EvalGateOptions {
    baselinePath: string;
    candidatePath: string;
}

function readEvalReport(filePath: string): EvalRunReport {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as EvalRunReport;
}

export async function runEvalGate(options: EvalGateOptions): Promise<EvalGateResult> {
    const baseline = readEvalReport(path.resolve(options.baselinePath));
    const candidate = readEvalReport(path.resolve(options.candidatePath));
    return compareEvalGateResults(baseline, candidate);
}

export function renderEvalGateMarkdown(result: EvalGateResult): string {
    const lines = [
        '# Eval Gate',
        '',
        `- Status: ${result.status}`,
        `- Baseline: ${result.baselineId}`,
        `- Candidate: ${result.candidateId}`,
        `- Cases: ${result.passingCases}/${result.totalCases} passing`,
        '',
        '## Checks',
        ...result.checks.map((check) => `- [${check.status}] ${check.message}`),
    ];

    if (result.metrics.length > 0) {
        lines.push('', '## Metrics');
        for (const metric of result.metrics) {
            lines.push(`- ${metric.metric}: baseline=${metric.baseline}, candidate=${metric.candidate}, delta=${metric.delta}`);
        }
    }

    return lines.join('\n');
}
