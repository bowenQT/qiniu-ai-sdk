export const CONTROL_PLANE_ARTIFACT_KINDS = [
    'prompt',
    'tool-contract',
    'routing-policy',
    'memory-policy',
    'guardrail-policy',
    'skill',
] as const;

export type ControlPlaneArtifactKind = typeof CONTROL_PLANE_ARTIFACT_KINDS[number];

export const CONTROL_PLANE_ARTIFACT_LABELS = [
    'candidate',
    'staging',
    'production',
    'archived',
] as const;

export type ArtifactLabel = typeof CONTROL_PLANE_ARTIFACT_LABELS[number];

export type TraceStepType =
    | 'predict'
    | 'tool-call'
    | 'tool-result'
    | 'memory'
    | 'reflection'
    | 'verification'
    | 'system';

export type PromotionDecisionStatus = 'promote' | 'hold' | 'reject';
export type GraderStatus = 'pass' | 'warn' | 'fail';
export type ToolTraceSource = 'local' | 'mcp' | 'skill';

export interface TraceUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface TraceCost {
    estimated?: number;
    actual?: number;
    currency?: string;
    priceSource?: string;
    billingSource?: string;
    promptCostPer1kTokens?: number;
    completionCostPer1kTokens?: number;
}

export interface RevisionRef {
    kind: ControlPlaneArtifactKind;
    revisionId: string;
    labels: ArtifactLabel[];
    createdAt?: string;
    metadata?: Record<string, unknown>;
}

export interface ArtifactRevision<TPayload = unknown> {
    ref: RevisionRef;
    payload?: TPayload;
}

export interface TraceToolCall {
    toolCallId: string;
    toolName: string;
    source: ToolTraceSource;
    argsText?: string;
    approved?: boolean;
    latencyMs?: number;
    resultPreview?: string;
    isError?: boolean;
    isRejected?: boolean;
}

export interface TraceStep {
    stepId: string;
    type: TraceStepType;
    startedAt: string;
    finishedAt?: string;
    content?: string;
    reasoning?: string;
    finishReason?: string | null;
    usage?: TraceUsage;
    cost?: TraceCost;
    toolCall?: TraceToolCall;
    metadata?: Record<string, unknown>;
}

export interface GraderResult {
    graderId: string;
    status: GraderStatus;
    score?: number;
    rationale?: string;
    metadata?: Record<string, unknown>;
}

export interface BenchmarkCase {
    caseId: string;
    taskId: string;
    input: Record<string, unknown>;
    expected?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface BenchmarkDataset {
    datasetId: string;
    generatedAt: string;
    cases: BenchmarkCase[];
    metadata?: Record<string, unknown>;
}

export interface CandidateBudgetProfile {
    maxStepCost?: number;
    maxRunCost?: number;
    maxLatencyMs?: number;
    notes?: string[];
}

export interface CandidateVersion {
    candidateId: string;
    kind: ControlPlaneArtifactKind;
    revision: RevisionRef;
    createdAt: string;
    parentRevisionId?: string;
    sourceTraceIds: string[];
    benchmarkIds: string[];
    budgetProfile?: CandidateBudgetProfile;
    riskSummary?: string;
    metadata?: Record<string, unknown>;
}

export interface PromotionDecision {
    targetKind: ControlPlaneArtifactKind;
    candidateId: string;
    decisionStatus: PromotionDecisionStatus;
    decidedAt: string;
    summary: string;
    evidenceRefs: string[];
    metadata?: Record<string, unknown>;
}

export interface GateMetricSummary {
    metric: string;
    baseline?: number;
    candidate?: number;
    delta?: number;
    unit?: string;
}

export interface GateResult {
    generatedAt: string;
    packageId?: string;
    baselineId?: string;
    candidateId?: string;
    decision: 'pass' | 'warn' | 'fail';
    metrics: GateMetricSummary[];
    blockers: string[];
    warnings: string[];
    artifactRefs: string[];
}

export interface RunTrace {
    traceId: string;
    taskId: string;
    runId: string;
    threadId?: string;
    agentId?: string;
    modelId: string;
    provider?: string;
    route?: string;
    startedAt: string;
    finishedAt?: string;
    promptRevision?: RevisionRef;
    routingPolicyRevision?: RevisionRef;
    memoryPolicyRevision?: RevisionRef;
    guardrailRevision?: RevisionRef;
    skillRevisions?: RevisionRef[];
    candidateRevision?: RevisionRef;
    metadata?: Record<string, unknown>;
    steps: TraceStep[];
    usage?: TraceUsage;
    cost?: TraceCost;
    finishReason?: string | null;
    interrupted?: boolean;
    graderResults?: GraderResult[];
    artifactRefs?: string[];
}

export interface PriceLookupInput {
    modelId: string;
    provider?: string;
    route?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    metadata?: Record<string, unknown>;
}

export interface PriceQuote {
    modelId: string;
    provider?: string;
    route?: string;
    currency: string;
    promptCostPer1kTokens?: number;
    completionCostPer1kTokens?: number;
    estimatedCost?: number;
    actualCost?: number;
    priceSource: string;
    billingSource?: string;
}

export interface PricePolicy {
    policyId: string;
    version?: string;
    lookup: (input: PriceLookupInput) => PriceQuote | Promise<PriceQuote | null> | null;
}

export interface TraceStore {
    putRunTrace: (trace: RunTrace) => Promise<void> | void;
}

export interface RevisionStore<TPayload = unknown> {
    getRevision: (revisionId: string) => Promise<ArtifactRevision<TPayload> | null> | ArtifactRevision<TPayload> | null;
    putRevision: (revision: ArtifactRevision<TPayload>) => Promise<void> | void;
    assignLabels?: (revisionId: string, labels: ArtifactLabel[]) => Promise<void> | void;
}

export interface CandidateStore {
    getCandidate: (candidateId: string) => Promise<CandidateVersion | null> | CandidateVersion | null;
    putCandidate: (candidate: CandidateVersion) => Promise<void> | void;
}

export function isControlPlaneArtifactKind(value: string): value is ControlPlaneArtifactKind {
    return (CONTROL_PLANE_ARTIFACT_KINDS as readonly string[]).includes(value);
}

export function isArtifactLabel(value: string): value is ArtifactLabel {
    return (CONTROL_PLANE_ARTIFACT_LABELS as readonly string[]).includes(value);
}

export function normalizeArtifactLabels(labels: readonly string[]): ArtifactLabel[] {
    const normalized = labels
        .filter((label): label is ArtifactLabel => isArtifactLabel(label))
        .filter((label, index, values) => values.indexOf(label) === index);

    return [...normalized].sort((left, right) =>
        CONTROL_PLANE_ARTIFACT_LABELS.indexOf(left) - CONTROL_PLANE_ARTIFACT_LABELS.indexOf(right),
    );
}

export function createRevisionRef(input: {
    kind: ControlPlaneArtifactKind;
    revisionId: string;
    labels?: readonly string[];
    createdAt?: string;
    metadata?: Record<string, unknown>;
}): RevisionRef {
    return {
        kind: input.kind,
        revisionId: input.revisionId,
        labels: normalizeArtifactLabels(input.labels ?? []),
        createdAt: input.createdAt,
        metadata: input.metadata,
    };
}
