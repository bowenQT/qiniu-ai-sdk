import type {
    CandidateBudgetProfile,
    CandidateStore,
    CandidateVersion,
    GateMetricSummary,
    GateResult,
    PromotionDecisionStatus,
} from './contracts';

export const OPTIMIZABLE_CONTROL_PLANE_ARTIFACT_KINDS = [
    'prompt',
    'tool-contract',
    'routing-policy',
    'memory-policy',
] as const;

export type OptimizableControlPlaneArtifactKind = typeof OPTIMIZABLE_CONTROL_PLANE_ARTIFACT_KINDS[number];

export interface BudgetSnapshot {
    runCost?: number;
    stepCost?: number;
    latencyMs?: number;
    notes?: string[];
    metrics?: GateMetricSummary[];
}

export interface BudgetTracker {
    snapshotCandidate: (
        candidate: CandidateVersion,
        gate?: GateResult,
    ) => Promise<BudgetSnapshot> | BudgetSnapshot;
}

export interface OptimizerEvaluationInput {
    candidate: CandidateVersion;
    gate?: GateResult;
    budgetSnapshot?: BudgetSnapshot;
}

export interface OptimizerEvaluationResult {
    decisionStatus: PromotionDecisionStatus;
    score: number;
    reasons: string[];
    warnings: string[];
    budgetSnapshot?: BudgetSnapshot;
}

export interface OptimizerPolicy {
    evaluateCandidate: (
        input: OptimizerEvaluationInput,
    ) => Promise<OptimizerEvaluationResult> | OptimizerEvaluationResult;
}

export interface DefaultOptimizerPolicyConfig {
    rejectOnBudgetExceeded?: boolean;
}

export class InMemoryCandidateStore implements CandidateStore {
    private readonly records = new Map<string, CandidateVersion>();

    getCandidate(candidateId: string): CandidateVersion | null {
        return this.records.get(candidateId) ?? null;
    }

    putCandidate(candidate: CandidateVersion): void {
        this.records.set(candidate.candidateId, candidate);
    }
}

export class StaticBudgetTracker implements BudgetTracker {
    constructor(private readonly snapshot: BudgetSnapshot = {}) {}

    snapshotCandidate(): BudgetSnapshot {
        return {
            ...this.snapshot,
            notes: this.snapshot.notes ? [...this.snapshot.notes] : undefined,
            metrics: this.snapshot.metrics ? [...this.snapshot.metrics] : undefined,
        };
    }
}

function findMetric(metrics: readonly GateMetricSummary[] | undefined, acceptedNames: readonly string[]): number | undefined {
    const normalizedNames = acceptedNames.map((name) => name.toLowerCase());
    const match = metrics?.find((metric) => normalizedNames.includes(metric.metric.toLowerCase()));
    return match?.candidate;
}

export function deriveBudgetSnapshotFromGate(candidate: CandidateVersion, gate?: GateResult): BudgetSnapshot {
    const metrics = gate?.metrics ?? [];
    return {
        runCost: findMetric(metrics, ['cost', 'run_cost', 'estimated_cost']),
        stepCost: findMetric(metrics, ['step_cost', 'max_step_cost']),
        latencyMs: findMetric(metrics, ['latency', 'latency_ms', 'run_latency_ms']),
        notes: candidate.budgetProfile?.notes ? [...candidate.budgetProfile.notes] : undefined,
        metrics: metrics.length > 0 ? [...metrics] : undefined,
    };
}

function evaluateBudgetProfile(
    profile: CandidateBudgetProfile | undefined,
    snapshot: BudgetSnapshot | undefined,
): { blockers: string[]; warnings: string[] } {
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (!profile || !snapshot) {
        return { blockers, warnings };
    }

    if (typeof profile.maxRunCost === 'number' && typeof snapshot.runCost === 'number' && snapshot.runCost > profile.maxRunCost) {
        blockers.push(`Run cost ${snapshot.runCost} exceeds budget ${profile.maxRunCost}.`);
    }

    if (typeof profile.maxStepCost === 'number' && typeof snapshot.stepCost === 'number' && snapshot.stepCost > profile.maxStepCost) {
        blockers.push(`Step cost ${snapshot.stepCost} exceeds budget ${profile.maxStepCost}.`);
    }

    if (typeof profile.maxLatencyMs === 'number' && typeof snapshot.latencyMs === 'number' && snapshot.latencyMs > profile.maxLatencyMs) {
        warnings.push(`Latency ${snapshot.latencyMs}ms exceeds budget ${profile.maxLatencyMs}ms.`);
    }

    return { blockers, warnings };
}

export class DefaultOptimizerPolicy implements OptimizerPolicy {
    constructor(private readonly config: DefaultOptimizerPolicyConfig = {}) {}

    evaluateCandidate(input: OptimizerEvaluationInput): OptimizerEvaluationResult {
        const budgetSnapshot = input.budgetSnapshot ?? deriveBudgetSnapshotFromGate(input.candidate, input.gate);
        const reasons: string[] = [];
        const warnings = [...(input.gate?.warnings ?? [])];
        const blockers = [...(input.gate?.blockers ?? [])];

        const budgetEvaluation = evaluateBudgetProfile(input.candidate.budgetProfile, budgetSnapshot);
        blockers.push(...budgetEvaluation.blockers);
        warnings.push(...budgetEvaluation.warnings);

        if (blockers.length > 0) {
            reasons.push(...blockers);
            return {
                decisionStatus: this.config.rejectOnBudgetExceeded ? 'reject' : 'hold',
                score: 0,
                reasons,
                warnings,
                budgetSnapshot,
            };
        }

        if (input.gate?.decision === 'warn' || warnings.length > 0) {
            reasons.push('Candidate requires manual review before promotion.');
            return {
                decisionStatus: 'hold',
                score: 0.5,
                reasons,
                warnings,
                budgetSnapshot,
            };
        }

        reasons.push('Candidate passed gate checks within configured budget.');
        return {
            decisionStatus: 'promote',
            score: 1,
            reasons,
            warnings,
            budgetSnapshot,
        };
    }
}
