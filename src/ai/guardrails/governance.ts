import type {
    GuardrailChainResult,
    GuardrailResult,
} from './types';
import { createRevisionRef } from '../control-plane';
import type {
    ArtifactLabel,
    PromotionDecision,
    RevisionRef,
} from '../control-plane';

export type GuardrailPolicyEvaluationStatus = 'pass' | 'warn' | 'fail';

export interface GuardrailPolicyRecord {
    policyId: string;
    revision: RevisionRef;
    createdAt: string;
    updatedAt: string;
    evaluation?: GuardrailPolicyEvaluationResult;
    promotionDecision?: PromotionDecision;
    metadata?: Record<string, unknown>;
}

export interface GuardrailPolicyEvaluationInput {
    chainResult: GuardrailChainResult;
    artifactRefs?: string[];
    evaluatedAt?: string;
    metadata?: Record<string, unknown>;
}

export interface GuardrailPolicyEvaluationResult {
    policyId: string;
    revision: RevisionRef;
    evaluatedAt: string;
    status: GuardrailPolicyEvaluationStatus;
    score: number;
    summary: string;
    blockers: string[];
    warnings: string[];
    artifactRefs: string[];
    chainResult: GuardrailChainResult;
    metadata?: Record<string, unknown>;
}

export interface GuardrailPolicyStore {
    get(policyId: string): Promise<GuardrailPolicyRecord | null> | GuardrailPolicyRecord | null;
    put(record: GuardrailPolicyRecord): Promise<void> | void;
    delete?(policyId: string): Promise<void> | void;
}

export interface GuardrailPolicyHistoryStore extends GuardrailPolicyStore {
    list(policyId: string): Promise<GuardrailPolicyRecord[]> | GuardrailPolicyRecord[];
    getRevision(
        policyId: string,
        revisionId: string,
    ): Promise<GuardrailPolicyRecord | null> | GuardrailPolicyRecord | null;
}

export interface GuardrailPolicyPromotionDecisionInput {
    artifactRefs?: string[];
    decidedAt?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
}

export class InMemoryGuardrailPolicyStore implements GuardrailPolicyHistoryStore {
    private readonly records = new Map<string, GuardrailPolicyRecord>();
    private readonly revisions = new Map<string, Map<string, GuardrailPolicyRecord>>();

    get(policyId: string): GuardrailPolicyRecord | null {
        return this.records.get(policyId) ?? null;
    }

    list(policyId: string): GuardrailPolicyRecord[] {
        return [...(this.revisions.get(policyId)?.values() ?? [])];
    }

    getRevision(policyId: string, revisionId: string): GuardrailPolicyRecord | null {
        return this.revisions.get(policyId)?.get(revisionId) ?? null;
    }

    put(record: GuardrailPolicyRecord): void {
        this.records.set(record.policyId, record);
        const revisions = this.revisions.get(record.policyId) ?? new Map<string, GuardrailPolicyRecord>();
        revisions.set(record.revision.revisionId, record);
        this.revisions.set(record.policyId, revisions);
    }

    delete(policyId: string): void {
        this.records.delete(policyId);
        this.revisions.delete(policyId);
    }
}

function normalizePolicyRevision(revision: RevisionRef): RevisionRef {
    if (revision.kind !== 'guardrail-policy') {
        throw new Error(`Guardrail policy revision must use kind "guardrail-policy", got "${revision.kind}"`);
    }

    return createRevisionRef({
        kind: revision.kind,
        revisionId: revision.revisionId,
        labels: revision.labels,
        createdAt: revision.createdAt,
        metadata: revision.metadata,
    });
}

function describeResult(result: GuardrailResult): string {
    const name = result.guardrailName ? `"${result.guardrailName}"` : 'Guardrail';
    if (result.reason) {
        return `${name}: ${result.reason}`;
    }
    return `${name}: ${result.action}`;
}

function summarizeEvaluation(status: GuardrailPolicyEvaluationStatus, blockers: string[], warnings: string[]): string {
    if (status === 'pass') {
        return 'Guardrail policy passed evaluation.';
    }

    if (status === 'warn') {
        return warnings.length > 0
            ? `Guardrail policy requires review: ${warnings.join('; ')}`
            : 'Guardrail policy requires review.';
    }

    return blockers.length > 0
        ? `Guardrail policy failed: ${blockers.join('; ')}`
        : 'Guardrail policy failed.';
}

export function createGuardrailPolicyRecord(input: {
    policyId: string;
    revision: RevisionRef;
    createdAt?: string;
    metadata?: Record<string, unknown>;
}): GuardrailPolicyRecord {
    const createdAt = input.createdAt ?? new Date().toISOString();
    return {
        policyId: input.policyId,
        revision: normalizePolicyRevision(input.revision),
        createdAt,
        updatedAt: createdAt,
        metadata: input.metadata,
    };
}

export function evaluateGuardrailPolicy(
    record: GuardrailPolicyRecord,
    input: GuardrailPolicyEvaluationInput,
): GuardrailPolicyEvaluationResult {
    const blockerResults = input.chainResult.results.filter((result) => result.action === 'block');
    const warningResults = input.chainResult.results.filter((result) => result.action === 'warn' || result.action === 'redact');
    const blockers = blockerResults.map(describeResult);
    const warnings = warningResults.map(describeResult);
    const status: GuardrailPolicyEvaluationStatus = blockers.length > 0 || input.chainResult.action === 'block' || !input.chainResult.shouldProceed
        ? 'fail'
        : warnings.length > 0
            ? 'warn'
            : 'pass';
    const score = status === 'pass' ? 1 : status === 'warn' ? 0.5 : 0;
    const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
    const artifactRefs = input.artifactRefs ? [...input.artifactRefs] : [];

    return {
        policyId: record.policyId,
        revision: normalizePolicyRevision(record.revision),
        evaluatedAt,
        status,
        score,
        summary: summarizeEvaluation(status, blockers, warnings),
        blockers,
        warnings,
        artifactRefs,
        chainResult: input.chainResult,
        metadata: input.metadata,
    };
}

export function buildGuardrailPromotionDecision(
    record: GuardrailPolicyRecord,
    evaluation: GuardrailPolicyEvaluationResult,
    input: GuardrailPolicyPromotionDecisionInput = {},
): PromotionDecision {
    const normalizedRecordRevision = normalizePolicyRevision(record.revision);
    const normalizedEvaluationRevision = normalizePolicyRevision(evaluation.revision);
    if (
        evaluation.policyId !== record.policyId
        || normalizedEvaluationRevision.revisionId !== normalizedRecordRevision.revisionId
    ) {
        throw new Error(
            `Guardrail promotion decision requires matching policy evaluation for "${record.policyId}@${normalizedRecordRevision.revisionId}"`,
        );
    }

    const decidedAt = input.decidedAt ?? new Date().toISOString();
    const candidateId = `${record.policyId}@${normalizedRecordRevision.revisionId}`;
    const evidenceRefs = [...evaluation.artifactRefs, ...(input.artifactRefs ?? [])];

    return {
        targetKind: 'guardrail-policy',
        candidateId,
        decisionStatus: evaluation.status === 'pass'
            ? 'promote'
            : evaluation.status === 'warn'
                ? 'hold'
                : 'reject',
        decidedAt,
        summary: input.summary ?? evaluation.summary,
        evidenceRefs,
        metadata: {
            policyId: record.policyId,
            revisionId: normalizedRecordRevision.revisionId,
            revisionLabels: normalizedRecordRevision.labels,
            evaluationStatus: evaluation.status,
            score: evaluation.score,
            ...record.metadata,
            ...evaluation.metadata,
            ...input.metadata,
        },
    };
}

export function createGuardrailPolicyRecordFromLabels(input: {
    policyId: string;
    revisionId: string;
    labels: ArtifactLabel[];
    createdAt?: string;
    metadata?: Record<string, unknown>;
}): GuardrailPolicyRecord {
    return createGuardrailPolicyRecord({
        policyId: input.policyId,
        revision: createRevisionRef({
            kind: 'guardrail-policy',
            revisionId: input.revisionId,
            labels: input.labels,
            createdAt: input.createdAt,
            metadata: input.metadata,
        }),
        createdAt: input.createdAt,
        metadata: input.metadata,
    });
}
