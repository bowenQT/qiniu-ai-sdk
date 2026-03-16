import {
    DEFAULT_LIVE_VERIFY_GATE_LANES,
    resolveLiveVerifyPackageContext,
    resolveLiveVerifyPolicyProfile,
    type LiveVerifyCheck,
    type LiveVerifyGateLaneResult,
    type LiveVerifyGateOptions,
    type LiveVerifyGateResult,
    type LiveVerifyPromotionDecisionBasis,
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
    const packageContext = resolveLiveVerifyPackageContext(options);
    const lanes = options.lanes.length > 0
        ? options.lanes
        : packageContext.ownerLane
            ? [packageContext.ownerLane]
            : [...DEFAULT_LIVE_VERIFY_GATE_LANES];
    const promotionSensitive = packageContext.packageCategory === 'promotion-sensitive';
    const strict = options.strict ?? (env.QINIU_LIVE_VERIFY_GATE_STRICT === '1' || env.QINIU_REQUIRE_LIVE_VERIFY === '1');
    const generatedAt = new Date().toISOString();
    const policyProfile = resolveLiveVerifyPolicyProfile(options);
    const blockingFailures: string[] = [];
    const heldEvidence: string[] = [];
    const promotionDecisionBasis = new Map<string, LiveVerifyPromotionDecisionBasis>();
    const collectGateProbes = (): LiveVerifyProbe[] => laneResults.flatMap((entry) => entry.result.probes);

    addGateCheck(
        checks,
        'ok',
        `Running live verification gate for lanes: ${lanes.join(', ')}${policyProfile ? ` (profile=${policyProfile.name})` : ''}${strict ? ' (strict)' : ''}`,
    );
    if (packageContext.packageId) {
        addGateCheck(
            checks,
            'ok',
            `Evaluating package ${packageContext.packageId} as ${packageContext.packageCategory}`,
        );
    }
    if (policyProfile?.description) {
        addGateCheck(checks, 'ok', `Live verification policy profile ${policyProfile.name}: ${policyProfile.description}`);
    }

    for (const lane of lanes) {
        const lanePolicy = policyProfile?.lanePolicies[lane];
        let result: LiveVerifyResult;
        try {
            result = await verifyLiveLane({
                lane,
                env,
                nonBlockingProbeIds: lanePolicy?.optionalProbes,
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
        if (lanePolicy?.description) {
            addGateCheck(checks, 'ok', `[${lane}] Policy: ${lanePolicy.description}`);
        }
        if (lanePolicy?.promotionModules.length) {
            addGateCheck(checks, 'ok', `[${lane}] Promotion modules: ${lanePolicy.promotionModules.join(', ')}`);
        }
        if (lanePolicy?.promotionSensitiveRequiredProbes.length) {
            addGateCheck(
                checks,
                'ok',
                `[${lane}] Promotion-sensitive required probes for profile ${policyProfile?.name}: ${lanePolicy.promotionSensitiveRequiredProbes.join(', ')}`,
            );
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
        if (lanePolicy && (lanePolicy.promotionModules.length > 0 || lanePolicy.trackedDecisionPaths.length > 0)) {
            promotionDecisionBasis.set(lane, {
                lane,
                promotionModules: [...lanePolicy.promotionModules],
                trackedDecisionPaths: [...lanePolicy.trackedDecisionPaths],
                requiredProbes: [...lanePolicy.requiredProbes],
                promotionSensitiveRequiredProbes: [...lanePolicy.promotionSensitiveRequiredProbes],
                deferredRisks: [...lanePolicy.deferredRisks],
            });
        }

        for (const check of result.checks) {
            addGateCheck(checks, check.level, `[${lane}] ${check.message}`);
        }
    }

    if (policyProfile) {
        for (const lane of lanes) {
            const lanePolicy = policyProfile.lanePolicies[lane];
            const baseRequired = new Set<string>(policyProfile.requiredProbes[lane] ?? []);
            for (const probeId of lanePolicy?.requiredProbes ?? []) {
                baseRequired.add(probeId);
            }
            const promotionRequired = new Set<string>(lanePolicy?.promotionSensitiveRequiredProbes ?? []);
            for (const probeId of baseRequired) {
                promotionRequired.delete(probeId);
            }
            if (baseRequired.size === 0 && promotionRequired.size === 0) continue;

            const laneResult = laneResults.find((entry) => entry.lane === lane);
            const probes = laneResult?.result.probes ?? [];
            for (const probeId of baseRequired) {
                const probe = probes.find((entry) => entry.id === probeId);
                if (!probe) {
                    const message = `[${lane}] Missing required probe record: ${probeId}`;
                    if (promotionSensitive) {
                        blockingFailures.push(message);
                        addGateCheck(checks, 'fail', message);
                    } else {
                        heldEvidence.push(message);
                        addGateCheck(checks, 'warn', `${message} (held until promotion-sensitive package supplies live evidence)`);
                    }
                    continue;
                }
                if (probe.status !== 'ok') {
                    const message = `[${lane}] Required probe ${probeId} was ${probe.status}: ${probe.message}`;
                    if (promotionSensitive) {
                        blockingFailures.push(message);
                        addGateCheck(checks, 'fail', message);
                    } else {
                        heldEvidence.push(message);
                        addGateCheck(checks, 'warn', `${message} (held until promotion-sensitive package supplies live evidence)`);
                    }
                }
            }
            for (const probeId of promotionRequired) {
                const probe = probes.find((entry) => entry.id === probeId);
                if (!probe) {
                    const message = `[${lane}] Missing promotion-sensitive probe record: ${probeId}`;
                    if (promotionSensitive) {
                        blockingFailures.push(message);
                        addGateCheck(checks, 'fail', message);
                    } else {
                        heldEvidence.push(message);
                        addGateCheck(checks, 'warn', `${message} (held until promotion-sensitive package supplies live evidence)`);
                    }
                    continue;
                }
                if (probe.status !== 'ok') {
                    const message = `[${lane}] Promotion-sensitive probe ${probeId} was ${probe.status}: ${probe.message}`;
                    if (promotionSensitive) {
                        blockingFailures.push(message);
                        addGateCheck(checks, 'fail', message);
                    } else {
                        heldEvidence.push(message);
                        addGateCheck(checks, 'warn', `${message} (held until promotion-sensitive package supplies live evidence)`);
                    }
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
                packageId: packageContext.packageId,
                packageCategory: packageContext.packageCategory,
                promotionSensitive,
                promotionGateStatus: 'blocking',
                heldEvidence,
                promotionDecisionBasis: [...promotionDecisionBasis.values()],
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
            packageId: packageContext.packageId,
            packageCategory: packageContext.packageCategory,
            promotionSensitive,
            promotionGateStatus: 'blocking',
            heldEvidence,
            promotionDecisionBasis: [...promotionDecisionBasis.values()],
        };
    }

    if (heldEvidence.length > 0) {
        addGateCheck(
            checks,
            'warn',
            'Promotion-sensitive live evidence is incomplete for at least one module; tracked decisions should remain held.',
        );
    }
    if (policyProfile && checks.some((check) => check.level === 'warn')) {
        addGateCheck(
            checks,
            'ok',
            `Non-blocking live warnings remain for profile ${policyProfile.name}, but no required probe failed.`,
        );
    }

    const status = policyProfile ? (blockingFailures.length > 0 ? 'fail' : 'ok') : summarizeGate(checks);
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
        packageId: packageContext.packageId,
        packageCategory: packageContext.packageCategory,
        promotionSensitive,
        promotionGateStatus: heldEvidence.length > 0 ? 'held' : 'clear',
        heldEvidence,
        promotionDecisionBasis: [...promotionDecisionBasis.values()],
    };
}
