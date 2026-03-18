import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    buildEvalCandidateReport,
    type EvalCandidateReport,
    type EvalRunReport,
} from '../lib/eval-gate';

export interface EvalGateOptions {
    baselinePath: string;
    candidatePath: string;
}

function readEvalReport(filePath: string): EvalRunReport {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as EvalRunReport;
}

export async function runEvalGate(options: EvalGateOptions): Promise<EvalCandidateReport> {
    const baseline = readEvalReport(path.resolve(options.baselinePath));
    const candidate = readEvalReport(path.resolve(options.candidatePath));
    return buildEvalCandidateReport(baseline, candidate);
}

export function renderEvalGateMarkdown(result: EvalCandidateReport): string {
    const lines = [
        '# Eval Candidate Report',
        '',
        `- Decision: ${result.decision}`,
        `- Baseline: ${result.baselineId}`,
        `- Candidate: ${result.candidateId}`,
        `- Cases: ${result.gate.passingCases}/${result.gate.totalCases} passing`,
        '',
        '## Summary',
        `- Gate status: ${result.gate.status}`,
        `- Check count: ${result.gate.checks.length}`,
        `- Blockers: ${result.blockers.length}`,
        `- Warnings: ${result.warnings.length}`,
    ];

    if (result.gate.checks.length > 0) {
        lines.push('', '## Checks');
        for (const check of result.gate.checks) {
            lines.push(`- [${check.status}] ${check.message}`);
        }
    }

    if (result.metrics.length > 0) {
        lines.push('', '## Metrics');
        for (const metric of result.metrics) {
            lines.push(`- ${metric.metric}: baseline=${metric.baseline}, candidate=${metric.candidate}, delta=${metric.delta}`);
        }
    }

    if (result.artifactRefs.length > 0) {
        lines.push('', '## Artifacts');
        for (const ref of result.artifactRefs) {
            lines.push(`- ${ref}`);
        }
    }

    return lines.join('\n');
}

export function renderEvalCandidateReportMarkdown(result: EvalCandidateReport): string {
    return renderEvalGateMarkdown(result);
}

export function toEvalCandidateReportJson(result: EvalCandidateReport): string {
    return JSON.stringify(result, null, 2) + '\n';
}
