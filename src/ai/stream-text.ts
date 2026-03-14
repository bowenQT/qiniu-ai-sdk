/**
 * streamText - Token-level streaming for AgentGraph.
 * 
 * Synchronously returns StreamTextResult. Background task runs generateTextWithGraph
 * with onTokenEvent, pushing events into a shared events[] buffer. Multiple consumers
 * (textStream, reasoningStream, fullStream) maintain independent cursors.
 */

import { generateTextWithGraph, type GenerateTextWithGraphOptions, type GenerateTextWithGraphResult, type StepResult } from './generate-text';
import type { TokenEvent } from './agent-graph';
import type { Guardrail } from './guardrails';
import type { Checkpointer } from './graph/checkpointer';
import type { LanguageModelClient } from '../core/client';
import type { ChatMessage, ResponseFormat } from '../lib/types';
import type { Tool } from './generate-text';
import type { Skill } from '../modules/skills/types';
import type { ApprovalConfig } from './tool-approval';
import type { MemoryManager } from './memory';

// ============================================================================
// Types
// ============================================================================

export interface StreamTextOptions {
    /** Language-model client */
    client: LanguageModelClient;
    /** Model to use */
    model: string;
    /** User prompt */
    prompt?: string;
    /** Messages (alternative to prompt) */
    messages?: ChatMessage[];
    /** System prompt */
    system?: string;
    /** Tools */
    tools?: Record<string, Tool>;
    /** Skills */
    skills?: Skill[];
    /** Maximum steps */
    maxSteps?: number;
    /** Context token budget */
    maxContextTokens?: number;
    /** Temperature */
    temperature?: number;
    /** Top-p */
    topP?: number;
    /** Max tokens */
    maxTokens?: number;
    /** Abort signal */
    abortSignal?: AbortSignal;
    /** Approval config */
    approvalConfig?: ApprovalConfig;
    /** Guardrails */
    guardrails?: Guardrail[];
    /** Response format */
    responseFormat?: ResponseFormat;
    /** Tool choice strategy */
    toolChoice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
    /** Memory manager */
    memory?: MemoryManager;
    /** Skill reference injection mode */
    skillReferenceMode?: 'none' | 'summary' | 'full';
    /** Thread ID for persistent conversation */
    threadId?: string;
    /** Checkpointer for state persistence */
    checkpointer?: Checkpointer;
    /** Resume from checkpoint if available */
    resumeFromCheckpoint?: boolean;
    /** Step finish callback */
    onStepFinish?: (step: StepResult) => void;
    /** Node enter callback */
    onNodeEnter?: (nodeName: string) => void;
    /** Node exit callback */
    onNodeExit?: (nodeName: string) => void;
    /** Agent ID */
    agentId?: string;
}

export interface StreamTextResult {
    /** Stream of text deltas */
    textStream: AsyncIterable<string>;
    /** Stream of all token events */
    fullStream: AsyncIterable<TokenEvent>;
    /** Stream of reasoning deltas */
    reasoningStream: AsyncIterable<string>;
    /** Promise resolving to final text */
    text: Promise<string>;
    /** Promise resolving to full reasoning */
    reasoning: Promise<string>;
    /** Promise resolving to token usage */
    usage: Promise<{ prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined>;
    /** Promise resolving to step results */
    steps: Promise<StepResult[]>;
    /** Convert to SSE Response for HTTP endpoints */
    toDataStreamResponse(opts?: { headers?: Record<string, string> }): Response;
}

// ============================================================================
// Internal State
// ============================================================================

interface StreamState {
    events: TokenEvent[];
    waiters: Array<{ resolve: () => void }>;
    done: boolean;
    error?: Error;
    activeConsumers: number;
    minCursor: number;
    onReturn: (cursor: number) => void;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Stream text from an LLM using the AgentGraph runtime.
 * 
 * Returns synchronously. Background task pushes events into shared buffer.
 * 
 * @example
 * ```typescript
 * const result = streamText({ client, model: 'deepseek-v3', prompt: 'Hello' });
 * 
 * for await (const chunk of result.textStream) {
 *     process.stdout.write(chunk);
 * }
 * ```
 */
export function streamText(options: StreamTextOptions): StreamTextResult {
    // Internal abort controller for consumer-driven cancellation
    const internalAbort = new AbortController();
    const mergedSignal = options.abortSignal
        ? combineAbortSignals(options.abortSignal, internalAbort.signal)
        : internalAbort.signal;

    // Shared state
    const state: StreamState = {
        events: [],
        waiters: [],
        done: false,
        activeConsumers: 0,
        minCursor: 0,
        onReturn: (cursor: number) => {
            state.activeConsumers--;
            // Update minCursor for GC
            state.minCursor = Math.max(state.minCursor, cursor);
            // If all consumers done, abort background task
            if (state.activeConsumers <= 0) {
                internalAbort.abort();
            }
        },
    };

    // Deferred promises for aggregate values
    let resolveText: (value: string) => void;
    let rejectText: (error: Error) => void;
    let resolveReasoning: (value: string) => void;
    let resolveUsage: (value: any) => void;
    let resolveSteps: (value: StepResult[]) => void;
    let rejectReasoning: (error: Error) => void;
    let rejectUsage: (error: Error) => void;
    let rejectSteps: (error: Error) => void;

    const textPromise = new Promise<string>((resolve, reject) => {
        resolveText = resolve;
        rejectText = reject;
    });

    const reasoningPromise = new Promise<string>((resolve, reject) => {
        resolveReasoning = resolve;
        rejectReasoning = reject;
    });

    const usagePromise = new Promise<any>((resolve, reject) => {
        resolveUsage = resolve;
        rejectUsage = reject;
    });

    const stepsPromise = new Promise<StepResult[]>((resolve, reject) => {
        resolveSteps = resolve;
        rejectSteps = reject;
    });

    // Suppress unhandled rejection warnings on deferred promises
    // (consumers may not always attach handlers)
    textPromise.catch(() => {});
    reasoningPromise.catch(() => {});
    usagePromise.catch(() => {});
    stepsPromise.catch(() => {});

    // Build generateTextWithGraph options
    const graphOptions: GenerateTextWithGraphOptions = {
        client: options.client,
        model: options.model,
        messages: options.messages,
        prompt: options.prompt,
        system: options.system,
        tools: options.tools,
        skills: options.skills,
        maxSteps: options.maxSteps,
        maxContextTokens: options.maxContextTokens,
        temperature: options.temperature,
        topP: options.topP,
        maxTokens: options.maxTokens,
        responseFormat: options.responseFormat,
        abortSignal: mergedSignal,
        approvalConfig: options.approvalConfig,
        guardrails: options.guardrails,
        toolChoice: options.toolChoice,
        memory: options.memory,
        skillReferenceMode: options.skillReferenceMode,
        threadId: options.threadId,
        checkpointer: options.checkpointer,
        resumeFromCheckpoint: options.resumeFromCheckpoint,
        agentId: options.agentId,
        onStepFinish: options.onStepFinish,
        onNodeEnter: options.onNodeEnter,
        onNodeExit: options.onNodeExit,
        onTokenEvent: (event: TokenEvent) => {
            state.events.push(event);
            // Wake up all waiting consumers
            const waiters = state.waiters.splice(0);
            for (const w of waiters) w.resolve();
        },
    };

    // Start background task
    const backgroundTask = generateTextWithGraph(graphOptions)
        .then((result: GenerateTextWithGraphResult) => {
            state.done = true;
            // Wake up any remaining waiters
            const waiters = state.waiters.splice(0);
            for (const w of waiters) w.resolve();

            // Resolve aggregate promises
            resolveText!(result.text);
            resolveReasoning!(result.reasoning ?? '');
            resolveUsage!(result.usage);
            resolveSteps!(result.steps);
        })
        .catch((error: Error) => {
            state.done = true;
            state.error = error;
            // Wake up any remaining waiters
            const waiters = state.waiters.splice(0);
            for (const w of waiters) w.resolve();

            // Reject aggregate promises
            rejectText!(error);
            rejectReasoning!(error);
            rejectUsage!(error);
            rejectSteps!(error);
        });

    // Suppress unhandled rejection from background task
    backgroundTask.catch(() => {});

    return {
        textStream: createFilteredStream(
            state,
            (e) => e.type === 'text-delta',
            (e) => (e as any).textDelta,
        ),
        fullStream: createFilteredStream(
            state,
            () => true,
            (e) => e,
        ),
        reasoningStream: createFilteredStream(
            state,
            (e) => e.type === 'reasoning-delta',
            (e) => (e as any).reasoningDelta,
        ),
        text: textPromise,
        reasoning: reasoningPromise,
        usage: usagePromise,
        steps: stepsPromise,
        toDataStreamResponse(opts?: { headers?: Record<string, string> }): Response {
            const fullStream = createFilteredStream(state, () => true, (e) => e);
            // Note: createFilteredStream already handles activeConsumers counting via lazy iteration

            const encoder = new TextEncoder();
            const readable = new ReadableStream({
                async start(controller) {
                    try {
                        for await (const event of fullStream) {
                            const data = JSON.stringify(event);
                            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                        }
                        controller.close();
                    } catch (err) {
                        controller.error(err);
                    }
                },
                // Note: no cancel() needed — breaking the for-await triggers
                // the generator's return(), which calls state.onReturn() exactly once.
            });

            return new Response(readable, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    ...opts?.headers,
                },
            });
        },
    };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a filtered async iterable over the shared events buffer.
 * Each consumer maintains its own cursor (fan-out).
 * Single-iteration semantics.
 */
function createFilteredStream<T>(
    state: StreamState,
    filter: (e: TokenEvent) => boolean,
    extract: (e: TokenEvent) => T,
): AsyncIterable<T> {
    // Note: activeConsumers is incremented lazily in [Symbol.asyncIterator]()
    // to avoid counting unused streams.
    let cursor = 0;
    let returned = false;
    let iteratorCreated = false;
    let pendingError: Error | null = null;

    const iterable: AsyncIterable<T> = {
        [Symbol.asyncIterator]() {
            // Single-iteration: return same generator on repeated calls
            if (iteratorCreated) {
                return generator;
            }
            iteratorCreated = true;
            // Increment only when iteration actually starts (F3 fix)
            state.activeConsumers++;
            return generator;
        },
    };

    const generator: AsyncIterator<T> = {
        async next(): Promise<IteratorResult<T>> {
            // Throw pending error from previous iteration
            if (pendingError) {
                const err = pendingError;
                pendingError = null;
                if (!returned) { returned = true; state.onReturn(cursor); }
                throw err;
            }

            while (true) {
                // Process buffered events
                while (cursor < state.events.length) {
                    const event = state.events[cursor++];

                    // Terminal: error event
                    if (event.type === 'error') {
                        if (filter(event)) {
                            // Yield the error event first, throw on next call
                            pendingError = (event as any).error;
                            return { value: extract(event), done: false };
                        }
                        // Filter doesn't match → throw immediately
                        if (!returned) { returned = true; state.onReturn(cursor); }
                        throw (event as any).error;
                    }

                    // Terminal: finish event
                    if (event.type === 'finish') {
                        if (filter(event)) {
                            const value = extract(event);
                            if (!returned) { returned = true; state.onReturn(cursor); }
                            return { value, done: false };
                        }
                        if (!returned) { returned = true; state.onReturn(cursor); }
                        return { value: undefined as any, done: true };
                    }

                    if (filter(event)) {
                        return { value: extract(event), done: false };
                    }
                }

                // No more events and background is done
                if (state.done) {
                    if (!returned) { returned = true; state.onReturn(cursor); }
                    if (state.error) throw state.error;
                    return { value: undefined as any, done: true };
                }

                // Wait for new events
                await new Promise<void>(resolve => {
                    state.waiters.push({ resolve });
                });
            }
        },
        async return() {
            if (!returned) {
                returned = true;
                state.onReturn(cursor);
            }
            return { value: undefined as any, done: true };
        },
    };

    return iterable;
}

/**
 * Combine two AbortSignals into one.
 * Polyfill for AbortSignal.any() which requires Node 20+.
 */
function combineAbortSignals(userSignal: AbortSignal, internalSignal: AbortSignal): AbortSignal {
    // Prefer native AbortSignal.any if available
    if (typeof AbortSignal.any === 'function') {
        return AbortSignal.any([userSignal, internalSignal]);
    }

    // Fallback: create a new controller that aborts when either source aborts
    const combined = new AbortController();

    const onAbort = () => combined.abort();

    if (userSignal.aborted || internalSignal.aborted) {
        combined.abort();
        return combined.signal;
    }

    userSignal.addEventListener('abort', onAbort, { once: true });
    internalSignal.addEventListener('abort', onAbort, { once: true });

    return combined.signal;
}
