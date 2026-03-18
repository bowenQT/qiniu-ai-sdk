import type { TraceStep } from './contracts';
import { createTraceStepId } from './runtime';

export type ReflectionVerifierStatus = 'pass' | 'warn' | 'fail';
export type ReflectionStopReason =
    | 'verifier-passed'
    | 'max-iterations'
    | 'cost-cap'
    | 'timeout'
    | 'converged'
    | 'no-change';

export interface ReflectionLimits {
    maxIterations?: number;
    maxEstimatedCost?: number;
    timeoutMs?: number;
    diffThreshold?: number;
}

export const DEFAULT_REFLECTION_LIMITS: Required<ReflectionLimits> = {
    maxIterations: 3,
    maxEstimatedCost: Number.POSITIVE_INFINITY,
    timeoutMs: Number.POSITIVE_INFINITY,
    diffThreshold: 0.05,
};

export interface CriticInput {
    iteration: number;
    originalText: string;
    currentText: string;
    previousText?: string;
    metadata?: Record<string, unknown>;
}

export interface CriticResult {
    revisedText?: string;
    rationale?: string;
    diffRatio?: number;
    estimatedCost?: number;
    metadata?: Record<string, unknown>;
}

export interface VerifierInput {
    iteration: number;
    originalText: string;
    currentText: string;
    metadata?: Record<string, unknown>;
}

export interface VerifierResult {
    status: ReflectionVerifierStatus;
    rationale?: string;
    estimatedCost?: number;
    metadata?: Record<string, unknown>;
}

export interface CriticPolicy {
    critique(input: CriticInput): Promise<CriticResult> | CriticResult;
}

export interface VerifierPolicy {
    verify(input: VerifierInput): Promise<VerifierResult> | VerifierResult;
}

export interface ReflectionIteration {
    iteration: number;
    inputText: string;
    outputText: string;
    critic: CriticResult;
    verifier: VerifierResult;
    estimatedCost: number;
    diffRatio: number;
    traceSteps: [TraceStep, TraceStep];
}

export interface ReflectionRunResult {
    finalText: string;
    iterations: ReflectionIteration[];
    stopReason: ReflectionStopReason;
    totalEstimatedCost: number;
    traceSteps: TraceStep[];
    verifierStatus: ReflectionVerifierStatus;
}

export interface ReflectionRunOptions {
    text: string;
    criticPolicy: CriticPolicy;
    verifierPolicy: VerifierPolicy;
    limits?: ReflectionLimits;
    metadata?: Record<string, unknown>;
}

export function estimateTextDiffRatio(previousText: string, nextText: string): number {
    if (previousText === nextText) {
        return 0;
    }

    const previousLength = previousText.length;
    const nextLength = nextText.length;
    const longest = Math.max(previousLength, nextLength, 1);

    let prefix = 0;
    while (
        prefix < previousLength
        && prefix < nextLength
        && previousText[prefix] === nextText[prefix]
    ) {
        prefix += 1;
    }

    let suffix = 0;
    while (
        suffix < previousLength - prefix
        && suffix < nextLength - prefix
        && previousText[previousLength - 1 - suffix] === nextText[nextLength - 1 - suffix]
    ) {
        suffix += 1;
    }

    const shared = prefix + suffix;
    return Math.max(0, 1 - (shared / longest));
}

function createReflectionTraceStep(
    iteration: number,
    inputText: string,
    outputText: string,
    critic: CriticResult,
    diffRatio: number,
): TraceStep {
    const timestamp = new Date().toISOString();
    return {
        stepId: createTraceStepId('reflection', iteration),
        type: 'reflection',
        startedAt: timestamp,
        finishedAt: timestamp,
        content: outputText,
        reasoning: critic.rationale,
        cost: critic.estimatedCost !== undefined ? { estimated: critic.estimatedCost } : undefined,
        metadata: {
            inputText,
            diffRatio,
            ...critic.metadata,
        },
    };
}

function createVerificationTraceStep(
    iteration: number,
    outputText: string,
    verifier: VerifierResult,
): TraceStep {
    const timestamp = new Date().toISOString();
    return {
        stepId: createTraceStepId('verification', iteration),
        type: 'verification',
        startedAt: timestamp,
        finishedAt: timestamp,
        content: outputText,
        reasoning: verifier.rationale,
        finishReason: verifier.status,
        cost: verifier.estimatedCost !== undefined ? { estimated: verifier.estimatedCost } : undefined,
        metadata: verifier.metadata,
    };
}

export async function runBoundedReflectionLoop(
    options: ReflectionRunOptions,
): Promise<ReflectionRunResult> {
    const limits = {
        ...DEFAULT_REFLECTION_LIMITS,
        ...options.limits,
    };
    const startedAt = Date.now();
    const iterations: ReflectionIteration[] = [];
    const traceSteps: TraceStep[] = [];
    let currentText = options.text;
    let totalEstimatedCost = 0;
    let verifierStatus: ReflectionVerifierStatus = 'fail';
    let stopReason: ReflectionStopReason = 'max-iterations';
    let consecutiveLowDiffs = 0;

    for (let iteration = 1; iteration <= limits.maxIterations; iteration += 1) {
        if (Date.now() - startedAt > limits.timeoutMs) {
            stopReason = 'timeout';
            break;
        }
        if (totalEstimatedCost > limits.maxEstimatedCost) {
            stopReason = 'cost-cap';
            break;
        }

        const critic = await options.criticPolicy.critique({
            iteration,
            originalText: options.text,
            currentText,
            previousText: iterations.at(-1)?.inputText,
            metadata: options.metadata,
        });

        const outputText = critic.revisedText ?? currentText;
        const diffRatio = critic.diffRatio ?? estimateTextDiffRatio(currentText, outputText);
        totalEstimatedCost += critic.estimatedCost ?? 0;

        const verifier = await options.verifierPolicy.verify({
            iteration,
            originalText: options.text,
            currentText: outputText,
            metadata: options.metadata,
        });
        totalEstimatedCost += verifier.estimatedCost ?? 0;

        const reflectionStep = createReflectionTraceStep(iteration, currentText, outputText, critic, diffRatio);
        const verificationStep = createVerificationTraceStep(iteration, outputText, verifier);
        const iterationRecord: ReflectionIteration = {
            iteration,
            inputText: currentText,
            outputText,
            critic,
            verifier,
            estimatedCost: (critic.estimatedCost ?? 0) + (verifier.estimatedCost ?? 0),
            diffRatio,
            traceSteps: [reflectionStep, verificationStep],
        };

        iterations.push(iterationRecord);
        traceSteps.push(reflectionStep, verificationStep);
        currentText = outputText;
        verifierStatus = verifier.status;

        if (verifier.status === 'pass') {
            stopReason = 'verifier-passed';
            break;
        }

        if (diffRatio === 0) {
            stopReason = 'no-change';
            break;
        }

        if (diffRatio <= limits.diffThreshold) {
            consecutiveLowDiffs += 1;
        } else {
            consecutiveLowDiffs = 0;
        }

        if (consecutiveLowDiffs >= 2) {
            stopReason = 'converged';
            break;
        }

        if (Date.now() - startedAt > limits.timeoutMs) {
            stopReason = 'timeout';
            break;
        }
        if (totalEstimatedCost > limits.maxEstimatedCost) {
            stopReason = 'cost-cap';
            break;
        }
    }

    return {
        finalText: currentText,
        iterations,
        stopReason,
        totalEstimatedCost,
        traceSteps,
        verifierStatus,
    };
}
