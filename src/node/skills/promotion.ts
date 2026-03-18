import type { PromotionDecision, PromotionDecisionStatus } from '../../ai/control-plane';
import type { RegisteredSkill } from './registry';
import type { SkillPromotionState, SkillSandboxValidationResult, SkillTrialRecord, SkillTrialStore } from './trial';

export type SkillBenchmarkStatus = 'pass' | 'warn' | 'fail';

export interface SkillBenchmarkResult {
    skillName: string;
    benchmarkId: string;
    status: SkillBenchmarkStatus;
    score?: number;
    threshold?: number;
    measuredAt?: string;
    artifactRefs?: string[];
    summary?: string;
    metadata?: Record<string, unknown>;
}

export interface SkillRollbackMetadata {
    reason: string;
    fromState: SkillPromotionState;
    toState: SkillPromotionState;
    rolledBackAt: string;
    previousRevisionId?: string;
    targetRevisionId?: string;
    evidenceRefs?: string[];
    metadata?: Record<string, unknown>;
}

export interface SkillPromotionRecord {
    skillName: string;
    state: SkillPromotionState;
    decision: PromotionDecision;
    trialRecord?: SkillTrialRecord;
    benchmarkResult?: SkillBenchmarkResult;
    rollback?: SkillRollbackMetadata;
    blockers?: string[];
    warnings?: string[];
    startedAt?: string;
    finishedAt?: string;
    metadata?: Record<string, unknown>;
}

export interface SkillBenchmarkStore {
    get(skillName: string): Promise<SkillBenchmarkResult | null> | SkillBenchmarkResult | null;
    put(record: SkillBenchmarkResult): Promise<void> | void;
    delete?(skillName: string): Promise<void> | void;
}

export interface SkillPromotionStore {
    get(skillName: string): Promise<SkillPromotionRecord | null> | SkillPromotionRecord | null;
    put(record: SkillPromotionRecord): Promise<void> | void;
    delete?(skillName: string): Promise<void> | void;
}

export interface SkillPromotionPolicy {
    defaultState?: SkillPromotionState;
    benchmarkId?: string;
    minimumBenchmarkScore?: number;
    requireSandboxValidation?: boolean;
    allowBenchmarkWarnings?: boolean;
    decisionSource?: string;
}

export interface SkillPromotionGateInput {
    trialRecord?: SkillTrialRecord | null;
    benchmarkResult?: SkillBenchmarkResult | null;
    policy?: SkillPromotionPolicy;
    notes?: string[];
    metadata?: Record<string, unknown>;
}

export interface SkillPromotionRunner {
    ensureRecord(skill: RegisteredSkill, policy?: SkillPromotionPolicy): Promise<SkillPromotionRecord>;
    runPromotionGate(skill: RegisteredSkill, input?: SkillPromotionGateInput): Promise<SkillPromotionRecord>;
    recordRollback(skillName: string, rollback: SkillRollbackMetadata): Promise<SkillPromotionRecord>;
}

export class InMemorySkillPromotionStore implements SkillPromotionStore {
    private readonly records = new Map<string, SkillPromotionRecord>();

    get(skillName: string): SkillPromotionRecord | null {
        return this.records.get(skillName) ?? null;
    }

    put(record: SkillPromotionRecord): void {
        this.records.set(record.skillName, record);
    }

    delete(skillName: string): void {
        this.records.delete(skillName);
    }
}

export class InMemorySkillBenchmarkStore implements SkillBenchmarkStore {
    private readonly records = new Map<string, SkillBenchmarkResult>();

    get(skillName: string): SkillBenchmarkResult | null {
        return this.records.get(skillName) ?? null;
    }

    put(record: SkillBenchmarkResult): void {
        this.records.set(record.skillName, record);
    }

    delete(skillName: string): void {
        this.records.delete(skillName);
    }
}

function createDecision(
    candidateId: string,
    decisionStatus: PromotionDecisionStatus,
    summary: string,
    evidenceRefs: string[],
    metadata?: Record<string, unknown>,
): PromotionDecision {
    return {
        targetKind: 'skill',
        candidateId,
        decisionStatus,
        decidedAt: new Date().toISOString(),
        summary,
        evidenceRefs,
        metadata,
    };
}

function describeSandboxValidation(validation?: SkillSandboxValidationResult): string {
    if (!validation) {
        return 'Missing sandbox validation.';
    }

    if (validation.status === 'passed') {
        return 'Sandbox validation passed.';
    }

    if (validation.status === 'skipped') {
        return validation.message ?? 'Sandbox validation was skipped.';
    }

    return validation.message ?? `Sandbox validation failed with exit code ${validation.exitCode ?? 'unknown'}.`;
}

function resolveStateFromDecision(
    current: SkillPromotionState | undefined,
    decisionStatus: PromotionDecisionStatus,
): SkillPromotionState {
    if (decisionStatus === 'promote') {
        return 'production';
    }

    if (decisionStatus === 'reject') {
        return 'rejected';
    }

    return current ?? 'quarantine';
}

export class DefaultSkillPromotionRunner implements SkillPromotionRunner {
    constructor(
        private readonly store: SkillPromotionStore,
        private readonly dependencies: {
            trialStore?: SkillTrialStore;
            benchmarkStore?: SkillBenchmarkStore;
            policy?: SkillPromotionPolicy;
        } = {},
    ) {}

    async ensureRecord(skill: RegisteredSkill, policy?: SkillPromotionPolicy): Promise<SkillPromotionRecord> {
        const existing = await this.store.get(skill.manifest.name);
        if (existing) {
            return existing;
        }

        const record = this.createDefaultRecord(skill, policy);
        await this.store.put(record);
        return record;
    }

    async runPromotionGate(skill: RegisteredSkill, input: SkillPromotionGateInput = {}): Promise<SkillPromotionRecord> {
        const policy = { ...this.dependencies.policy, ...input.policy };
        const existing = await this.ensureRecord(skill, policy);
        const trialRecord = input.trialRecord ?? (await this.dependencies.trialStore?.get(skill.manifest.name)) ?? null;
        const benchmarkResult = input.benchmarkResult ?? (await this.dependencies.benchmarkStore?.get(skill.manifest.name)) ?? null;
        const startedAt = new Date().toISOString();
        const blockers: string[] = [];
        const warnings: string[] = [];
        const evidenceRefs: string[] = [];

        if (!trialRecord) {
            blockers.push('Missing skill trial record.');
        } else {
            evidenceRefs.push(`trial:${skill.manifest.name}`);
            if (trialRecord.validation?.status === 'failed') {
                blockers.push(describeSandboxValidation(trialRecord.validation));
            } else if (trialRecord.validation?.status === 'passed') {
                evidenceRefs.push(`sandbox:${trialRecord.validation.sandboxId ?? skill.manifest.name}`);
            } else {
                blockers.push(describeSandboxValidation(trialRecord.validation));
            }
        }

        if (!benchmarkResult) {
            blockers.push('Missing benchmark result.');
        } else {
            evidenceRefs.push(`benchmark:${benchmarkResult.benchmarkId}`);
            if (benchmarkResult.artifactRefs?.length) {
                evidenceRefs.push(...benchmarkResult.artifactRefs);
            }

            if (benchmarkResult.status === 'fail') {
                blockers.push(`Benchmark "${benchmarkResult.benchmarkId}" failed.`);
            } else if (benchmarkResult.status === 'warn' && !policy?.allowBenchmarkWarnings) {
                blockers.push(`Benchmark "${benchmarkResult.benchmarkId}" returned a warning.`);
            } else if (benchmarkResult.status === 'warn') {
                warnings.push(`Benchmark "${benchmarkResult.benchmarkId}" returned a warning.`);
            }

            if (typeof policy?.minimumBenchmarkScore === 'number' && typeof benchmarkResult.score === 'number' && benchmarkResult.score < policy.minimumBenchmarkScore) {
                blockers.push(
                    `Benchmark "${benchmarkResult.benchmarkId}" score ${benchmarkResult.score} is below minimum ${policy.minimumBenchmarkScore}.`,
                );
            }
        }

        const requireSandboxValidation = policy?.requireSandboxValidation ?? true;
        if (requireSandboxValidation && trialRecord?.validation?.status !== 'passed') {
            if (!blockers.includes('Missing skill trial record.')) {
                const validationMessage = describeSandboxValidation(trialRecord?.validation);
                if (!blockers.includes(validationMessage)) {
                    blockers.push(validationMessage);
                }
            }
        }

        const belowBenchmarkThreshold = typeof policy?.minimumBenchmarkScore === 'number'
            && typeof benchmarkResult?.score === 'number'
            && benchmarkResult.score < policy.minimumBenchmarkScore;
        const decisionStatus: PromotionDecisionStatus = blockers.length > 0
            ? (trialRecord?.validation?.status === 'failed' || benchmarkResult?.status === 'fail' || belowBenchmarkThreshold ? 'reject' : 'hold')
            : 'promote';

        const state = resolveStateFromDecision(existing.state, decisionStatus);
        const trialValidation = trialRecord?.validation;
        const summary = decisionStatus === 'promote'
            ? `Skill "${skill.manifest.name}" can be promoted to production.`
            : decisionStatus === 'reject'
                ? `Skill "${skill.manifest.name}" was rejected by the promotion gate.`
                : `Skill "${skill.manifest.name}" is not ready for production.`;

        const record: SkillPromotionRecord = {
            skillName: skill.manifest.name,
            state,
            decision: createDecision(`${skill.manifest.name}@${skill.manifest.version}`, decisionStatus, summary, evidenceRefs, {
                benchmarkId: benchmarkResult?.benchmarkId,
                trialState: trialRecord?.state,
                trialValidationStatus: trialValidation?.status,
                ...input.metadata,
                notes: input.notes,
                policy,
            }),
            trialRecord: trialRecord ?? undefined,
            benchmarkResult: benchmarkResult ?? undefined,
            blockers: blockers.length > 0 ? blockers : undefined,
            warnings: warnings.length > 0 ? warnings : undefined,
            startedAt,
            finishedAt: new Date().toISOString(),
            metadata: {
                source: existing.metadata?.source,
                version: existing.metadata?.version,
                ...existing.metadata,
                ...input.metadata,
            },
            rollback: existing.rollback,
        };

        await this.store.put(record);
        return record;
    }

    async recordRollback(skillName: string, rollback: SkillRollbackMetadata): Promise<SkillPromotionRecord> {
        const existing = await this.store.get(skillName);
        const state = rollback.toState;
        const record: SkillPromotionRecord = {
            skillName,
            state,
            decision: existing?.decision ?? createDecision(
                `${skillName}@${rollback.targetRevisionId ?? 'unknown'}`,
                'hold',
                `Skill "${skillName}" rolled back.`,
                rollback.evidenceRefs ?? [],
                { rollback },
            ),
            trialRecord: existing?.trialRecord,
            benchmarkResult: existing?.benchmarkResult,
            blockers: existing?.blockers,
            warnings: existing?.warnings,
            startedAt: existing?.startedAt,
            finishedAt: new Date().toISOString(),
            metadata: {
                ...existing?.metadata,
                rollback,
            },
            rollback,
        };

        await this.store.put(record);
        return record;
    }

    private createDefaultRecord(skill: RegisteredSkill, policy?: SkillPromotionPolicy): SkillPromotionRecord {
        return {
            skillName: skill.manifest.name,
            state: policy?.defaultState ?? 'quarantine',
            decision: createDecision(
                `${skill.manifest.name}@${skill.manifest.version}`,
                'hold',
                `Skill "${skill.manifest.name}" is awaiting promotion inputs.`,
                [],
                {
                    decisionSource: policy?.decisionSource ?? 'skill-promotion-gate',
                    benchmarkId: policy?.benchmarkId,
                },
            ),
            metadata: {
                source: skill.source,
                version: skill.manifest.version,
                integrityHash: skill.integrityHash,
            },
        };
    }
}
