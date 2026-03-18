import type { PricePolicy, RevisionRef, RunTrace, TraceCost, TraceStep, TraceStore, TraceUsage } from './contracts';
import type { ArtifactRegistry, ControlPlaneResolutionContext, LabelResolver } from './revisions';
import type { CriticPolicy, ReflectionLimits, VerifierPolicy } from './reflection';

export interface ControlPlaneRunMetadata {
    taskId?: string;
    runId?: string;
    provider?: string;
    route?: string;
    promptRevision?: RevisionRef;
    routingPolicyRevision?: RevisionRef;
    memoryPolicyRevision?: RevisionRef;
    guardrailRevision?: RevisionRef;
    skillRevisions?: RevisionRef[];
    candidateRevision?: RevisionRef;
    metadata?: Record<string, unknown>;
}

export interface RuntimeControlPlaneOptions {
    traceStore?: TraceStore;
    pricePolicy?: PricePolicy;
    runMetadata?: ControlPlaneRunMetadata;
    revisionStore?: ControlPlaneResolutionContext['revisionStore'];
    labelResolver?: LabelResolver;
    artifactRegistry?: ArtifactRegistry;
    criticPolicy?: CriticPolicy;
    verifierPolicy?: VerifierPolicy;
    reflectionLimits?: ReflectionLimits;
}

export function createOpaqueTraceId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createTraceUsage(
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    },
): TraceUsage | undefined {
    if (!usage) {
        return undefined;
    }

    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;

    return {
        promptTokens,
        completionTokens,
        totalTokens,
    };
}

export async function estimateTraceCost(
    pricePolicy: PricePolicy | undefined,
    input: {
        modelId: string;
        provider?: string;
        route?: string;
        usage?: TraceUsage;
        metadata?: Record<string, unknown>;
    },
): Promise<TraceCost | undefined> {
    if (!pricePolicy || !input.usage) {
        return undefined;
    }

    const quote = await pricePolicy.lookup({
        modelId: input.modelId,
        provider: input.provider,
        route: input.route,
        promptTokens: input.usage.promptTokens,
        completionTokens: input.usage.completionTokens,
        totalTokens: input.usage.totalTokens,
        metadata: input.metadata,
    });

    if (!quote) {
        return undefined;
    }

    return {
        estimated: quote.estimatedCost,
        actual: quote.actualCost,
        currency: quote.currency,
        priceSource: quote.priceSource,
        billingSource: quote.billingSource,
        promptCostPer1kTokens: quote.promptCostPer1kTokens,
        completionCostPer1kTokens: quote.completionCostPer1kTokens,
    };
}

export function aggregateTraceUsage(steps: readonly TraceStep[]): TraceUsage | undefined {
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let hasUsage = false;

    for (const step of steps) {
        if (!step.usage) {
            continue;
        }
        hasUsage = true;
        promptTokens += step.usage.promptTokens;
        completionTokens += step.usage.completionTokens;
        totalTokens += step.usage.totalTokens;
    }

    if (!hasUsage) {
        return undefined;
    }

    return {
        promptTokens,
        completionTokens,
        totalTokens,
    };
}

export function aggregateTraceCost(steps: readonly TraceStep[]): TraceCost | undefined {
    const costSteps = steps.filter((step) => step.cost);
    if (costSteps.length === 0) {
        return undefined;
    }

    const firstCost = costSteps[0].cost!;
    return {
        estimated: costSteps.reduce((sum, step) => sum + (step.cost?.estimated ?? 0), 0),
        actual: costSteps.reduce((sum, step) => sum + (step.cost?.actual ?? 0), 0),
        currency: firstCost.currency,
        priceSource: firstCost.priceSource,
        billingSource: firstCost.billingSource,
        promptCostPer1kTokens: firstCost.promptCostPer1kTokens,
        completionCostPer1kTokens: firstCost.completionCostPer1kTokens,
    };
}

export function createTraceStepId(type: TraceStep['type'], index: number): string {
    return `${type}_${index}`;
}

export function buildRunTraceSkeleton(input: {
    modelId: string;
    threadId?: string;
    agentId?: string;
    runMetadata?: ControlPlaneRunMetadata;
}): RunTrace {
    const runId = input.runMetadata?.runId ?? createOpaqueTraceId('run');
    const taskId = input.runMetadata?.taskId ?? runId;

    return {
        traceId: createOpaqueTraceId('trace'),
        taskId,
        runId,
        threadId: input.threadId,
        agentId: input.agentId,
        modelId: input.modelId,
        provider: input.runMetadata?.provider,
        route: input.runMetadata?.route,
        startedAt: new Date().toISOString(),
        promptRevision: input.runMetadata?.promptRevision,
        routingPolicyRevision: input.runMetadata?.routingPolicyRevision,
        memoryPolicyRevision: input.runMetadata?.memoryPolicyRevision,
        guardrailRevision: input.runMetadata?.guardrailRevision,
        skillRevisions: input.runMetadata?.skillRevisions,
        candidateRevision: input.runMetadata?.candidateRevision,
        metadata: input.runMetadata?.metadata,
        steps: [],
    };
}
