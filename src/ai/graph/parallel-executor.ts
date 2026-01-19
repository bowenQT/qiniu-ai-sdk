/**
 * Parallel Execution Support for AgentGraph.
 * 
 * Provides utilities for executing multiple branches in parallel
 * with fail-fast behavior, state isolation, and deterministic merging.
 */

import type { AgentState, InternalMessage } from '../internal-types';
import { FatalToolError } from '../../lib/errors';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for a parallel branch.
 */
export interface ParallelBranch {
    /** Branch name for debugging and logging */
    name: string;
    /** Executor function for this branch */
    execute: (state: AgentState) => Promise<AgentState>;
}

/**
 * Configuration for parallel execution.
 */
export interface ParallelConfig {
    /** Branches to execute in parallel */
    branches: ParallelBranch[];
    /** Maximum concurrent executions (default: unlimited) */
    maxConcurrency?: number;
    /** Reducer to merge branch results */
    reducer?: (results: AgentState[]) => AgentState;
}

/**
 * Result of parallel execution.
 */
export interface ParallelResult {
    /** Merged state after all branches complete */
    state: AgentState;
    /** Whether execution was interrupted by approval */
    interrupted: boolean;
    /** Branch that caused interruption (if any) */
    interruptedBranch?: string;
}

// ============================================================================
// State Cloning
// ============================================================================

/**
 * Clone AgentState for parallel branch execution.
 * 
 * - Deep copies: messages (using structuredClone for ArrayBuffer/TypedArray support)
 * - Shallow copies: skills array
 * - Shared references: tools Map, approvalConfig
 * - Overrides: abortSignal with groupAbort for fail-fast coordination
 * - Adds: branchIndex to message _meta for ordering
 * 
 * @param groupAbort - Shared abort controller for fail-fast (optional)
 */
export function cloneStateForBranch(
    state: AgentState,
    branchIndex: number,
    groupAbort?: AbortController
): AgentState {
    // Clone messages with structuredClone (handles ArrayBuffer, Blob references)
    const clonedMessages = state.messages.map((msg, localIndex) => {
        // For content: use structuredClone if possible, fallback for non-cloneable
        let clonedContent: unknown;
        try {
            clonedContent = typeof msg.content === 'string'
                ? msg.content
                : structuredClone(msg.content);
        } catch {
            // Fallback for non-cloneable (functions, etc) - shallow copy
            clonedContent = msg.content;
        }

        return {
            ...msg,
            content: clonedContent as typeof msg.content,
            tool_calls: msg.tool_calls ? structuredClone(msg.tool_calls) : undefined,
            _meta: {
                ...msg._meta,
                branchIndex,
                localIndex, // Auto-assign localIndex for ordering
            },
        };
    });

    return {
        messages: clonedMessages,

        // Scalar fields
        stepCount: state.stepCount,
        maxSteps: state.maxSteps,
        done: state.done,
        output: state.output,
        reasoning: state.reasoning,
        finishReason: state.finishReason,
        skipApprovalCheck: state.skipApprovalCheck,

        // Shallow copy arrays
        skills: state.skills ? [...state.skills] : [],

        // Copy usage
        usage: state.usage ? { ...state.usage } : undefined,

        // Shared references (read-only during parallel execution)
        tools: state.tools,
        approvalConfig: state.approvalConfig,

        // Use group abort signal for fail-fast coordination
        abortSignal: groupAbort?.signal ?? state.abortSignal,
    };
}

// ============================================================================
// Message Ordering
// ============================================================================

/**
 * Stamp message with local index for deterministic ordering.
 */
export function stampMessage(
    msg: InternalMessage,
    branchIndex: number,
    localIndex: number
): InternalMessage {
    return {
        ...msg,
        _meta: {
            ...msg._meta,
            branchIndex,
            localIndex,
        },
    };
}

/**
 * Sort messages by (branchIndex, localIndex) for deterministic merge.
 */
export function sortMessagesByBranch(messages: InternalMessage[]): InternalMessage[] {
    return [...messages].sort((a, b) => {
        const aBranch = a._meta?.branchIndex ?? 0;
        const bBranch = b._meta?.branchIndex ?? 0;
        if (aBranch !== bBranch) return aBranch - bBranch;
        return (a._meta?.localIndex ?? 0) - (b._meta?.localIndex ?? 0);
    });
}

/**
 * Strip branch metadata from messages after merge.
 */
export function stripBranchMeta(messages: InternalMessage[]): InternalMessage[] {
    return messages.map(msg => {
        if (!msg._meta) return msg;
        const { branchIndex, localIndex, ...restMeta } = msg._meta;
        return {
            ...msg,
            _meta: Object.keys(restMeta).length > 0 ? restMeta : undefined,
        };
    });
}

// ============================================================================
// Default Reducer
// ============================================================================

/**
 * Default reducer for merging parallel branch results.
 * 
 * - Messages: sorted by (branchIndex, localIndex), branch meta stripped
 * - StepCount: max of all branches + 1
 * - Usage: summed across all branches
 * - Other fields: taken from first branch
 */
export function defaultParallelReducer(results: AgentState[]): AgentState {
    if (results.length === 0) {
        throw new Error('Cannot reduce empty parallel results');
    }

    if (results.length === 1) {
        return results[0];
    }

    // Collect all messages from all branches
    const allMessages = results.flatMap(r => r.messages);
    const sortedMessages = sortMessagesByBranch(allMessages);
    const cleanMessages = stripBranchMeta(sortedMessages);

    // Max stepCount + 1
    const maxStepCount = Math.max(...results.map(r => r.stepCount));

    // Sum usage
    const usage = results.reduce((acc, r) => {
        if (!r.usage) return acc;
        return {
            prompt_tokens: (acc?.prompt_tokens ?? 0) + r.usage.prompt_tokens,
            completion_tokens: (acc?.completion_tokens ?? 0) + r.usage.completion_tokens,
            total_tokens: (acc?.total_tokens ?? 0) + r.usage.total_tokens,
        };
    }, undefined as AgentState['usage']);

    // Take first branch for other fields
    const first = results[0];

    return {
        messages: cleanMessages,
        stepCount: maxStepCount + 1,
        maxSteps: first.maxSteps,
        done: results.some(r => r.done),
        output: results.map(r => r.output).filter(Boolean).join('\n'),
        reasoning: results.map(r => r.reasoning).filter(Boolean).join('\n'),
        finishReason: first.finishReason,
        skills: first.skills,
        tools: first.tools,
        usage,
        abortSignal: first.abortSignal,
        approvalConfig: first.approvalConfig,
        skipApprovalCheck: first.skipApprovalCheck,
    };
}

// ============================================================================
// Parallel Executor
// ============================================================================

/**
 * Execute branches in parallel with fail-fast behavior.
 * 
 * @param state - Initial state to clone for each branch
 * @param config - Parallel execution configuration
 * @returns Merged result or throws on failure
 * 
 * @throws FatalToolError - Propagated from any branch (fail-fast)
 * @throws Error - Any branch error triggers fail-fast
 */
export async function executeParallel(
    state: AgentState,
    config: ParallelConfig
): Promise<ParallelResult> {
    const { branches, maxConcurrency, reducer = defaultParallelReducer } = config;

    if (branches.length === 0) {
        return { state, interrupted: false };
    }

    // Create shared abort controller for fail-fast
    const groupAbort = new AbortController();

    // Check if parent abort signal is already aborted
    if (state.abortSignal?.aborted) {
        throw new Error('Execution aborted before parallel start');
    }

    // Link parent abort to group
    state.abortSignal?.addEventListener('abort', () => groupAbort.abort());

    // Semaphore for maxConcurrency
    const semaphore = maxConcurrency ? createSemaphore(maxConcurrency) : null;

    const results: AgentState[] = [];
    const errors: Array<{ branch: string; error: unknown }> = [];

    const promises = branches.map(async (branch, index) => {
        // Acquire semaphore if limited
        if (semaphore) await semaphore.acquire();

        try {
            // Check for group abort before starting
            if (groupAbort.signal.aborted) {
                throw new Error(`Branch "${branch.name}" cancelled`);
            }

            // Clone state for this branch (with shared abort signal for fail-fast)
            const branchState = cloneStateForBranch(state, index, groupAbort);

            // Execute branch
            const result = await branch.execute(branchState);
            results[index] = result;
        } catch (error) {
            errors.push({ branch: branch.name, error });
            groupAbort.abort(); // Trigger fail-fast
            throw error;
        } finally {
            if (semaphore) semaphore.release();
        }
    });

    // Wait for all branches (allSettled for proper cleanup)
    const settled = await Promise.allSettled(promises);

    // Check for failures
    const firstFailure = settled.find(r => r.status === 'rejected');
    if (firstFailure && firstFailure.status === 'rejected') {
        const reason = firstFailure.reason;
        if (reason instanceof FatalToolError) {
            throw reason;
        }
        throw reason;
    }

    // Merge results
    const mergedState = reducer(results);

    return {
        state: mergedState,
        interrupted: false,
    };
}

// ============================================================================
// Semaphore (for maxConcurrency)
// ============================================================================

interface Semaphore {
    acquire(): Promise<void>;
    release(): void;
}

function createSemaphore(max: number): Semaphore {
    let current = 0;
    const queue: Array<() => void> = [];

    return {
        async acquire() {
            if (current < max) {
                current++;
                return;
            }
            await new Promise<void>(resolve => queue.push(resolve));
            current++;
        },
        release() {
            current--;
            const next = queue.shift();
            if (next) next();
        },
    };
}
