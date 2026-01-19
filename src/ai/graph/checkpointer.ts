/**
 * Checkpointer - State persistence for Graph execution.
 * 
 * Provides save/load capabilities for resumable agent sessions.
 */

import type { AgentState } from '../internal-types';

/**
 * Checkpoint status.
 */
export type CheckpointStatus = 'active' | 'pending_approval' | 'completed';

/**
 * Pending approval information.
 */
export interface PendingApproval {
    /** Tool call awaiting approval (single tool) */
    toolCall?: {
        id: string;
        function: {
            name: string;
            arguments: string;
        };
    };
    /** All tool calls in the batch (for batch interruption) */
    toolCalls?: Array<{
        id: string;
        function: {
            name: string;
            arguments: string;
        };
    }>;
    /** Tool names that require deferred approval */
    deferredTools?: string[];
    /** Tool name (for single tool approval) */
    toolName?: string;
    /** Parsed arguments (for single tool approval) */
    args?: Record<string, unknown>;
    /** Timestamp when approval was requested */
    requestedAt: number;
}

/**
 * Checkpoint metadata.
 */
export interface CheckpointMetadata {
    /** Unique checkpoint ID */
    id: string;
    /** Thread ID for grouping checkpoints */
    threadId: string;
    /** Creation timestamp */
    createdAt: number;
    /** Step count at checkpoint */
    stepCount: number;
    /** Checkpoint status */
    status?: CheckpointStatus;
    /** Pending approval info (if status is 'pending_approval') */
    pendingApproval?: PendingApproval;
    /** Optional user-provided metadata */
    custom?: Record<string, unknown>;
}

/**
 * Stored checkpoint data.
 */
export interface Checkpoint {
    metadata: CheckpointMetadata;
    /** Serialized state (JSON) */
    state: SerializedAgentState;
}

/**
 * Serialized agent state (JSON-safe).
 * Note: Tools Map is converted to Record, non-serializable fields stripped.
 */
export interface SerializedAgentState {
    messages: Array<{
        role: string;
        content: unknown;
        tool_calls?: unknown[];
        tool_call_id?: string;
        _meta?: {
            skillId?: string;
            droppable?: boolean;
        };
    }>;
    stepCount: number;
    maxSteps: number;
    done: boolean;
    output: string;
    reasoning: string;
    finishReason: string | null;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * Serialize agent state to JSON-safe format.
 * Strips non-serializable fields (abortSignal, tools Map).
 * 
 * @public Shared by all Checkpointer implementations.
 */
export function serializeState(state: AgentState): SerializedAgentState {
    return {
        messages: state.messages.map(msg => ({
            role: msg.role,
            content: msg.content,
            tool_calls: msg.tool_calls,
            tool_call_id: msg.tool_call_id,
            _meta: msg._meta,
        })),
        stepCount: state.stepCount,
        maxSteps: state.maxSteps,
        done: state.done,
        output: state.output,
        reasoning: state.reasoning,
        finishReason: state.finishReason,
        usage: state.usage,
    };
}

/** Options for saving a checkpoint */
export interface CheckpointSaveOptions {
    /** Custom user metadata */
    custom?: Record<string, unknown>;
    /** Checkpoint status (default: 'active') */
    status?: CheckpointStatus;
    /** Pending approval info for async approval flow */
    pendingApproval?: PendingApproval;
}

/**
 * Checkpointer interface.
 */
export interface Checkpointer {
    /**
     * Save a checkpoint.
     */
    save(
        threadId: string,
        state: AgentState,
        options?: CheckpointSaveOptions | Record<string, unknown>
    ): Promise<CheckpointMetadata>;

    /**
     * Load the latest checkpoint for a thread.
     */
    load(threadId: string): Promise<Checkpoint | null>;

    /**
     * List all checkpoints for a thread.
     */
    list(threadId: string): Promise<CheckpointMetadata[]>;

    /**
     * Delete a checkpoint.
     */
    delete(checkpointId: string): Promise<boolean>;

    /**
     * Clear all checkpoints for a thread.
     */
    clear(threadId: string): Promise<number>;
}

/**
 * In-memory checkpointer implementation.
 * Suitable for testing and short-lived sessions.
 */
export class MemoryCheckpointer implements Checkpointer {
    private readonly checkpoints = new Map<string, Checkpoint>();
    private readonly maxItems: number;

    constructor(options?: { maxItems?: number }) {
        this.maxItems = options?.maxItems ?? 100;
    }

    async save(
        threadId: string,
        state: AgentState,
        options?: CheckpointSaveOptions | Record<string, unknown>
    ): Promise<CheckpointMetadata> {
        const id = `ckpt_${threadId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // Extract options - handle both new CheckpointSaveOptions and legacy custom object
        let status: CheckpointStatus = 'active';
        let pendingApproval: PendingApproval | undefined;
        let custom: Record<string, unknown> | undefined;

        if (options) {
            if ('status' in options || 'pendingApproval' in options || 'custom' in options) {
                // New CheckpointSaveOptions format
                const opts = options as CheckpointSaveOptions;
                status = opts.status ?? 'active';
                pendingApproval = opts.pendingApproval;
                custom = opts.custom;
            } else {
                // Legacy: treat entire object as custom metadata
                custom = options as Record<string, unknown>;
            }
        }

        const metadata: CheckpointMetadata = {
            id,
            threadId,
            createdAt: Date.now(),
            stepCount: state.stepCount,
            status,
            pendingApproval,
            custom,
        };

        const serialized = serializeState(state);

        this.checkpoints.set(id, {
            metadata,
            state: serialized,
        });

        // Cleanup old checkpoints if over limit
        await this.cleanup();

        return metadata;
    }

    async load(threadId: string): Promise<Checkpoint | null> {
        // Find latest checkpoint for thread
        let latest: Checkpoint | null = null;

        for (const checkpoint of this.checkpoints.values()) {
            if (checkpoint.metadata.threadId === threadId) {
                if (!latest || checkpoint.metadata.createdAt > latest.metadata.createdAt) {
                    latest = checkpoint;
                }
            }
        }

        return latest;
    }

    async list(threadId: string): Promise<CheckpointMetadata[]> {
        const result: CheckpointMetadata[] = [];

        for (const checkpoint of this.checkpoints.values()) {
            if (checkpoint.metadata.threadId === threadId) {
                result.push(checkpoint.metadata);
            }
        }

        return result.sort((a, b) => b.createdAt - a.createdAt);
    }

    async delete(checkpointId: string): Promise<boolean> {
        return this.checkpoints.delete(checkpointId);
    }

    async clear(threadId: string): Promise<number> {
        let count = 0;

        for (const [id, checkpoint] of this.checkpoints) {
            if (checkpoint.metadata.threadId === threadId) {
                this.checkpoints.delete(id);
                count++;
            }
        }

        return count;
    }

    /**
     * Cleanup old checkpoints to stay under maxItems.
     */
    private async cleanup(): Promise<void> {
        if (this.checkpoints.size <= this.maxItems) {
            return;
        }

        // Sort by creation time (oldest first)
        const sorted = Array.from(this.checkpoints.entries())
            .sort((a, b) => a[1].metadata.createdAt - b[1].metadata.createdAt);

        // Delete oldest until under limit
        const toDelete = sorted.slice(0, this.checkpoints.size - this.maxItems);
        for (const [id] of toDelete) {
            this.checkpoints.delete(id);
        }
    }
}

/**
 * Deserialize checkpoint state back to AgentState.
 * Note: Tools must be re-provided, abortSignal reset to undefined.
 */
export function deserializeCheckpoint(
    checkpoint: Checkpoint,
    tools?: Map<string, any>
): AgentState {
    const s = checkpoint.state;

    return {
        messages: s.messages as any,
        skills: [], // Skills reconstructed from messages with _meta
        tools: tools ?? new Map(),
        stepCount: s.stepCount,
        maxSteps: s.maxSteps,
        done: s.done,
        output: s.output,
        reasoning: s.reasoning,
        finishReason: s.finishReason,
        usage: s.usage,
        abortSignal: undefined,
    };
}

/**
 * Check if a checkpoint is pending approval.
 */
export function isPendingApproval(checkpoint: Checkpoint): boolean {
    return checkpoint.metadata.status === 'pending_approval' &&
        checkpoint.metadata.pendingApproval != null;
}

/**
 * Get pending approval info from checkpoint.
 */
export function getPendingApproval(checkpoint: Checkpoint): PendingApproval | null {
    if (!isPendingApproval(checkpoint)) {
        return null;
    }
    return checkpoint.metadata.pendingApproval ?? null;
}

/** Result of resuming with approval */
export interface ResumeWithApprovalResult {
    /** Whether approval was granted */
    approved: boolean;
    /** Updated state with tool result added */
    state: AgentState;
    /** Tool result (single tool, executed result or rejection message) */
    toolResult?: string;
    /** Tool results (batch mode) */
    toolResults?: Array<{ toolCallId: string; result: string }>;
    /** Whether the tool was actually executed */
    toolExecuted: boolean;
}

/** Tool executor function */
export type ToolExecutor = (
    toolName: string,
    args: Record<string, unknown>,
    abortSignal?: AbortSignal,
) => Promise<unknown>;

/**
 * Resume a pending approval checkpoint with user's decision.
 * 
 * If approved and toolExecutor is provided, the tool will be executed.
 * Otherwise, a synthetic approval result will be used.
 * 
 * @param checkpoint - The pending approval checkpoint
 * @param approved - Whether the user approved
 * @param toolExecutor - Optional function to execute the approved tool
 * @param tools - Tool map for state deserialization
 * @param abortSignal - Abort signal for tool execution
 */
export async function resumeWithApproval(
    checkpoint: Checkpoint,
    approved: boolean,
    toolExecutor?: ToolExecutor,
    tools?: Map<string, any>,
    abortSignal?: AbortSignal,
): Promise<ResumeWithApprovalResult> {
    const pending = checkpoint.metadata.pendingApproval;

    if (!pending) {
        throw new Error('Checkpoint does not have pending approval');
    }

    // Deserialize state
    const state = deserializeCheckpoint(checkpoint, tools);

    let toolResult: string | undefined;
    let toolResults: Array<{ toolCallId: string; result: string }> | undefined;
    let toolExecuted = false;

    // Handle batch mode (toolCalls) or single mode (toolCall/toolName)
    const hasBatch = pending.toolCalls && pending.toolCalls.length > 0;

    if (approved) {
        if (hasBatch) {
            // Batch mode: execute all tool calls
            toolResults = [];
            for (const tc of pending.toolCalls!) {
                if (toolExecutor) {
                    try {
                        const args = JSON.parse(tc.function.arguments || '{}');
                        const result = await toolExecutor(tc.function.name, args, abortSignal);
                        const resultStr = typeof result === 'string' ? result : JSON.stringify(result ?? { success: true });
                        toolResults.push({ toolCallId: tc.id, result: resultStr });
                        toolExecuted = true;
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        toolResults.push({ toolCallId: tc.id, result: `[Execution Error] ${errorMessage}` });
                        toolExecuted = true;
                    }
                } else {
                    // No executor - synthetic success
                    toolResults.push({ toolCallId: tc.id, result: JSON.stringify({ approved: true }) });
                }
            }
            // Add tool result messages to state
            for (const tr of toolResults) {
                state.messages = [...state.messages, {
                    role: 'tool' as const,
                    content: tr.result,
                    tool_call_id: tr.toolCallId,
                } as any];
            }
        } else if (pending.toolName && pending.toolCall) {
            // Single mode
            if (toolExecutor) {
                try {
                    const result = await toolExecutor(pending.toolName, pending.args ?? {}, abortSignal);
                    toolResult = typeof result === 'string' ? result : JSON.stringify(result ?? { success: true });
                    toolExecuted = true;
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    toolResult = `[Execution Error] ${errorMessage}`;
                    toolExecuted = true;
                }
            } else {
                toolResult = JSON.stringify({ approved: true, args: pending.args });
            }
            // Add tool result message to state
            state.messages = [...state.messages, {
                role: 'tool' as const,
                content: toolResult,
                tool_call_id: pending.toolCall.id,
            } as any];
        }
    } else {
        // Rejected
        toolResult = '[Approval Rejected] Tool execution was denied by user.';

        if (hasBatch) {
            toolResults = pending.toolCalls!.map(tc => ({
                toolCallId: tc.id,
                result: toolResult!,
            }));
            for (const tr of toolResults) {
                state.messages = [...state.messages, {
                    role: 'tool' as const,
                    content: tr.result,
                    tool_call_id: tr.toolCallId,
                } as any];
            }
        } else if (pending.toolCall) {
            state.messages = [...state.messages, {
                role: 'tool' as const,
                content: toolResult,
                tool_call_id: pending.toolCall.id,
            } as any];
        }
    }

    return {
        approved,
        state,
        toolResult,
        toolResults,
        toolExecuted,
    };
}
