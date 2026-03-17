import type { LiveVerifyGateResult } from './live-verify.internal';

export function renderLiveVerifyGateMarkdown(result: LiveVerifyGateResult): string {
    const lines: string[] = [
        '# Live Verification Gate',
        '',
        `Generated at: ${result.generatedAt}`,
        ...(result.packageId ? [`Package: ${result.packageId}`] : []),
        ...(result.packageCategory ? [`Package category: ${result.packageCategory}`] : []),
        ...(result.policyProfile ? [`Policy profile: ${result.policyProfile}`] : []),
        ...(result.policyPath ? [`Policy path: ${result.policyPath}`] : []),
        ...(result.promotionGateStatus ? [`Promotion gate status: ${result.promotionGateStatus}`] : []),
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

    if (result.heldEvidence && result.heldEvidence.length > 0) {
        lines.push('## Held Evidence');
        lines.push('');
        for (const item of result.heldEvidence) {
            lines.push(`- ${item}`);
        }
        lines.push('');
    }

    if (result.promotionDecisionBasis && result.promotionDecisionBasis.length > 0) {
        lines.push('## Promotion Decision Basis');
        lines.push('');
        for (const basis of result.promotionDecisionBasis) {
            lines.push(`### ${basis.lane}`);
            lines.push('');
            if (basis.promotionModules.length > 0) {
                lines.push(`- Promotion modules: ${basis.promotionModules.join(', ')}`);
            }
            if (basis.trackedDecisionPaths.length > 0) {
                lines.push(`- Tracked decision files: ${basis.trackedDecisionPaths.join(', ')}`);
            }
            if (basis.requiredProbes.length > 0) {
                lines.push(`- Required probes: ${basis.requiredProbes.join(', ')}`);
            }
            if (basis.promotionSensitiveRequiredProbes.length > 0) {
                lines.push(`- Promotion-sensitive required probes: ${basis.promotionSensitiveRequiredProbes.join(', ')}`);
            }
            if (basis.deferredRisks.length > 0) {
                lines.push(`- Deferred risks: ${basis.deferredRisks.join(' | ')}`);
            }
            lines.push('');
        }
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
        if (entry.policy) {
            lines.push('#### Policy');
            lines.push('');
            if (entry.policy.description) {
                lines.push(`- Description: ${entry.policy.description}`);
            }
            if (entry.policy.requiredProbes.length > 0) {
                lines.push(`- Required probes: ${entry.policy.requiredProbes.join(', ')}`);
            }
            if (entry.policy.promotionSensitiveRequiredProbes.length > 0) {
                lines.push(`- Promotion-sensitive required probes: ${entry.policy.promotionSensitiveRequiredProbes.join(', ')}`);
            }
            if (entry.policy.optionalProbes.length > 0) {
                lines.push(`- Optional probes: ${entry.policy.optionalProbes.join(', ')}`);
            }
            if (entry.policy.promotionModules.length > 0) {
                lines.push(`- Promotion modules: ${entry.policy.promotionModules.join(', ')}`);
            }
            if (entry.policy.trackedDecisionPaths.length > 0) {
                lines.push(`- Tracked decision files: ${entry.policy.trackedDecisionPaths.join(', ')}`);
            }
            if (entry.policy.deferredRisks.length > 0) {
                lines.push(`- Deferred risks: ${entry.policy.deferredRisks.join(' | ')}`);
            }
            lines.push('');
        }
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
