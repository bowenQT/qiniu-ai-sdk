import type { LiveVerifyGateResult } from './live-verify.internal';

export function renderLiveVerifyGateMarkdown(result: LiveVerifyGateResult): string {
    const lines: string[] = [
        '# Live Verification Gate',
        '',
        `Generated at: ${result.generatedAt}`,
        ...(result.policyProfile ? [`Policy profile: ${result.policyProfile}`] : []),
        ...(result.policyPath ? [`Policy path: ${result.policyPath}`] : []),
        '',
        `Overall status: ${result.status.toUpperCase()} (exit ${result.exitCode})`,
        '',
    ];

    if (result.blockingFailures && result.blockingFailures.length > 0) {
        lines.push('## Blocking Failures');
        lines.push('');
        for (const failure of result.blockingFailures) {
            lines.push(`- ${failure}`);
        }
        lines.push('');
    }

    lines.push('## Lanes');
    lines.push('');

    for (const entry of result.lanes) {
        lines.push(`### ${entry.lane}`);
        lines.push('');
        lines.push(`- Status: ${entry.result.status.toUpperCase()} (exit ${entry.result.exitCode})`);
        lines.push(`- Checks: ${entry.result.checks.length}`);
        if (entry.result.probes.length > 0) {
            lines.push(`- Probes: ${entry.result.probes.length}`);
        }
        lines.push('');
        for (const check of entry.result.checks) {
            lines.push(`- [${check.level}] ${check.message}`);
        }
        if (entry.result.probes.length > 0) {
            lines.push('');
            lines.push('#### Probes');
            lines.push('');
            for (const probe of entry.result.probes) {
                lines.push(`- [${probe.status}] ${probe.id}: ${probe.message}`);
                if (probe.details) {
                    lines.push(`  details: \`${JSON.stringify(probe.details)}\``);
                }
            }
        }
        lines.push('');
    }

    lines.push('## Aggregated Checks');
    lines.push('');
    for (const check of result.checks) {
        lines.push(`- [${check.level}] ${check.message}`);
    }
    lines.push('');

    return lines.join('\n');
}
