import type { RegisteredSkill } from './registry';

export type SkillPromotionState = 'quarantine' | 'trial' | 'production' | 'rejected';
export type SkillSandboxValidationStatus = 'passed' | 'failed' | 'skipped';

export interface SkillSandboxValidationResult {
    status: SkillSandboxValidationStatus;
    command?: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    durationMs?: number;
    sandboxId?: string;
    message?: string;
}

export interface SkillTrialRecord {
    skillName: string;
    state: SkillPromotionState;
    startedAt?: string;
    finishedAt?: string;
    benchmarkId?: string;
    validation?: SkillSandboxValidationResult;
    notes?: string[];
    metadata?: Record<string, unknown>;
}

export interface SkillTrialPolicy {
    defaultState?: SkillPromotionState;
    benchmarkId?: string;
    timeoutMs?: number;
    sandboxTemplateId?: string;
    validateCommand?: (skill: RegisteredSkill) => string | null;
    requiresSandbox?: (skill: RegisteredSkill) => boolean;
}

export interface SkillTrialStore {
    get(skillName: string): Promise<SkillTrialRecord | null> | SkillTrialRecord | null;
    put(record: SkillTrialRecord): Promise<void> | void;
    delete?(skillName: string): Promise<void> | void;
}

export interface SkillTrialValidator {
    validate(skill: RegisteredSkill, policy?: SkillTrialPolicy): Promise<SkillSandboxValidationResult>;
}

export interface SkillTrialRunner {
    ensureRecord(skill: RegisteredSkill, policy?: SkillTrialPolicy): Promise<SkillTrialRecord>;
    runSandboxValidation(skill: RegisteredSkill, policy?: SkillTrialPolicy): Promise<SkillTrialRecord>;
    updateState(skillName: string, state: SkillPromotionState, notes?: string[]): Promise<SkillTrialRecord>;
}

export class InMemorySkillTrialStore implements SkillTrialStore {
    private readonly records = new Map<string, SkillTrialRecord>();

    get(skillName: string): SkillTrialRecord | null {
        return this.records.get(skillName) ?? null;
    }

    put(record: SkillTrialRecord): void {
        this.records.set(record.skillName, record);
    }

    delete(skillName: string): void {
        this.records.delete(skillName);
    }
}

export function shouldSandboxTrial(skill: RegisteredSkill, policy?: SkillTrialPolicy): boolean {
    if (policy?.requiresSandbox) {
        return policy.requiresSandbox(skill);
    }

    if (skill.manifest.runtime?.engine === 'sandbox') {
        return true;
    }

    return (skill.manifest.permissions?.length ?? 0) > 0;
}

export function resolveSkillTrialCommand(skill: RegisteredSkill, policy?: SkillTrialPolicy): string | null {
    if (policy?.validateCommand) {
        return policy.validateCommand(skill);
    }

    return skill.manifest.runtime?.entryCommand ?? null;
}

export class DefaultSkillTrialRunner implements SkillTrialRunner {
    constructor(
        private readonly store: SkillTrialStore,
        private readonly validator?: SkillTrialValidator,
    ) {}

    async ensureRecord(skill: RegisteredSkill, policy?: SkillTrialPolicy): Promise<SkillTrialRecord> {
        const existing = await this.store.get(skill.manifest.name);
        if (existing) {
            return existing;
        }

        const record: SkillTrialRecord = {
            skillName: skill.manifest.name,
            state: policy?.defaultState ?? 'quarantine',
            metadata: {
                source: skill.source,
                version: skill.manifest.version,
            },
        };
        await this.store.put(record);
        return record;
    }

    async runSandboxValidation(skill: RegisteredSkill, policy?: SkillTrialPolicy): Promise<SkillTrialRecord> {
        const base = await this.ensureRecord(skill, policy);
        const startedAt = new Date().toISOString();

        let validation: SkillSandboxValidationResult;
        if (!shouldSandboxTrial(skill, policy) || !this.validator) {
            validation = {
                status: 'skipped',
                message: !this.validator
                    ? 'No sandbox validator configured.'
                    : 'Skill does not require sandbox validation.',
            };
        } else {
            validation = await this.validator.validate(skill, policy);
        }

        const record: SkillTrialRecord = {
            ...base,
            state: validation.status === 'failed' ? 'rejected' : 'trial',
            startedAt,
            finishedAt: new Date().toISOString(),
            benchmarkId: policy?.benchmarkId ?? base.benchmarkId,
            validation,
        };
        await this.store.put(record);
        return record;
    }

    async updateState(skillName: string, state: SkillPromotionState, notes: string[] = []): Promise<SkillTrialRecord> {
        const existing = await this.store.get(skillName);
        const record: SkillTrialRecord = {
            skillName,
            state,
            notes: [...(existing?.notes ?? []), ...notes],
            startedAt: existing?.startedAt,
            finishedAt: new Date().toISOString(),
            benchmarkId: existing?.benchmarkId,
            validation: existing?.validation,
            metadata: existing?.metadata,
        };
        await this.store.put(record);
        return record;
    }
}
