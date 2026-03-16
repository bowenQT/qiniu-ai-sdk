import {
    DEFAULT_LIVE_VERIFY_GATE_LANES,
    resolveLiveVerifyPolicyProfile,
    type LiveVerifyCheck,
    type LiveVerifyGateLaneResult,
    type LiveVerifyGateOptions,
    type LiveVerifyGateResult,
    type LiveVerifyProbe,
    type LiveVerifyResult,
    verifyLiveLane,
} from './live-verify.internal';

function addGateCheck(checks: LiveVerifyCheck[], level: 'ok' | 'warn' | 'fail', message: string): void {
    checks.push({ level, message });
}

function summarizeGate(checks: LiveVerifyCheck[]): 'ok' | 'warn' | 'fail' {
    if (checks.some((check) => check.level === 'fail')) return 'fail';
    if (checks.some((check) => check.level === 'warn')) return 'warn';
    return 'ok';
}

export async function verifyLiveGate(options: LiveVerifyGateOptions): Promise<LiveVerifyGateResult> {
    const checks: LiveVerifyCheck[] = [];
    const laneResults: LiveVerifyGateLaneResult[] = [];
    const env = options.env ?? process.env;
    const lanes = options.lanes.length > 0 ? options.lanes : [...DEFAULT_LIVE_VERIFY_GATE_LANES];
    const strict = options.strict ?? env.QINIU_REQUIRE_LIVE_VERIFY === '1';
    const generatedAt = new Date().toISOString();
    const policyProfile = resolveLiveVerifyPolicyProfile(options);
    const blockingFailures: string[] = [];
    const collectGateProbes = (): LiveVerifyProbe[] => laneResults.flatMap((entry) => entry.result.probes);

    addGateCheck(
        checks,
        'ok',
        `Running live verification gate for lanes: ${lanes.join(', ')}${policyProfile ? ` (profile=${policyProfile.name})` : ''}${strict ? ' (strict)' : ''}`,
    );
    if (policyProfile?.description) {
        addGateCheck(checks, 'ok', `Live verification policy profile ${policyProfile.name}: ${policyProfile.description}`);
    }

    for (const lane of lanes) {
        let result: LiveVerifyResult;
        try {
            result = await verifyLiveLane({
                lane,
                env,
                createQiniuClient: options.createQiniuClient,
                createNodeClient: options.createNodeClient,
                createMcpTransport: options.createMcpTransport,
                createMcpHost: options.createMcpHost,
            });
        } catch (error) {
            result = {
                status: 'fail',
                exitCode: 1,
                checks: [
                    {
                        level: 'fail',
                        message: error instanceof Error ? error.message : String(error),
                    },
                ],
                probes: [],
            };
        }
        const lanePolicy = policyProfile?.lanePolicies[lane];

        if (lanePolicy?.description) {
            addGateCheck(checks, 'ok', `[${lane}] Policy: ${lanePolicy.description}`);
        }
        if (lanePolicy?.promotionModules.length) {
            addGateCheck(checks, 'ok', `[${lane}] Promotion modules: ${lanePolicy.promotionModules.join(', ')}`);
        }
        if (lanePolicy?.trackedDecisionPaths.length) {
            addGateCheck(checks, 'ok', `[${lane}] Tracked decision files: ${lanePolicy.trackedDecisionPaths.join(', ')}`);
        }
        if (lanePolicy?.optionalProbes.length) {
            addGateCheck(
                checks,
                'ok',
                `[${lane}] Optional probes for profile ${policyProfile?.name}: ${lanePolicy.optionalProbes.join(', ')}`,
            );
        }
        if (lanePolicy?.deferredRisks.length) {
            addGateCheck(checks, 'ok', `[${lane}] Deferred policy risks tracked: ${lanePolicy.deferredRisks.length}`);
        }

        laneResults.push({ lane, result, policy: lanePolicy });

        for (const check of result.checks) {
            addGateCheck(checks, check.level, `[${lane}] ${check.message}`);
        }
    }

    if (policyProfile) {
        for (const lane of lanes) {
            const required = policyProfile.requiredProbes[lane] ?? [];
            if (required.length === 0) continue;

            const laneResult = laneResults.find((entry) => entry.lane === lane);
            const probes = laneResult?.result.probes ?? [];
            for (const probeId of required) {
                const probe = probes.find((entry) => entry.id === probeId);
                if (!probe) {
                    const failure = `[${lane}] Missing required probe record: ${probeId}`;
                    blockingFailures.push(failure);
                    addGateCheck(checks, 'fail', failure);
                    continue;
                }
                if (probe.status !== 'ok') {
                    const failure = `[${lane}] Required probe ${probeId} was ${probe.status}: ${probe.message}`;
                    blockingFailures.push(failure);
                    addGateCheck(checks, 'fail', failure);
                }
            }
        }
    }

    if (strict) {
        const blocking = laneResults.filter((entry) => entry.result.exitCode !== 0);
        if (blocking.length > 0) {
            addGateCheck(
                checks,
                'fail',
                `Strict live verification gate failed for lanes: ${blocking.map((entry) => entry.lane).join(', ')}`,
            );
            return {
                status: 'fail',
                exitCode: 1,
                checks,
                probes: collectGateProbes(),
                generatedAt,
                lanes: laneResults,
                policyProfile: policyProfile?.name,
                policyPath: policyProfile?.policyPath,
                blockingFailures,
            };
        }
    }

    if (blockingFailures.length > 0) {
        addGateCheck(
            checks,
            'fail',
            `Live verification policy profile ${policyProfile?.name} failed for required probes.`,
        );
        return {
            status: 'fail',
            exitCode: 1,
            checks,
            probes: collectGateProbes(),
            generatedAt,
            lanes: laneResults,
            policyProfile: policyProfile?.name,
            policyPath: policyProfile?.policyPath,
            blockingFailures,
        };
    }

    if (policyProfile && checks.some((check) => check.level === 'warn')) {
        addGateCheck(
            checks,
            'ok',
            `Non-blocking live warnings remain for profile ${policyProfile.name}, but no required probe failed.`,
        );
    }

    const status = policyProfile ? (checks.some((check) => check.level === 'fail') ? 'fail' : 'ok') : summarizeGate(checks);
    return {
        status,
        exitCode: status === 'ok' ? 0 : status === 'warn' ? 2 : 1,
        checks,
        probes: collectGateProbes(),
        generatedAt,
        lanes: laneResults,
        policyProfile: policyProfile?.name,
        policyPath: policyProfile?.policyPath,
        blockingFailures,
    };
}
