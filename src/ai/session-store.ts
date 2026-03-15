import type { AgentState } from './internal-types';
import type {
    Checkpoint,
    CheckpointMetadata,
    Checkpointer,
    SerializedAgentState,
} from './graph/checkpointer';
import type { ChatMessage } from '../lib/types';
import { deserializeCheckpoint, serializeState } from './graph/checkpointer';

const SESSION_SUMMARY_KEY = 'session_summary';

export interface SessionRecord {
    threadId: string;
    checkpoint?: Checkpoint;
    messages?: ChatMessage[];
    summary?: string;
    updatedAt: number;
}

export interface SessionSaveInput {
    threadId: string;
    state?: AgentState | SerializedAgentState;
    checkpoint?: Checkpoint;
    messages?: ChatMessage[];
    checkpointMetadata?: Partial<CheckpointMetadata>;
    summary?: string;
}

export interface SessionStore {
    load(threadId: string): Promise<SessionRecord | null>;
    save(input: SessionSaveInput): Promise<SessionRecord>;
    clear(threadId: string): Promise<void>;
}

function isSessionRecord(value: SessionRecord | Checkpoint): value is SessionRecord {
    return 'threadId' in value && !('metadata' in value);
}

function isSerializedState(value: AgentState | SerializedAgentState): value is SerializedAgentState {
    return 'internalMessages' in value || 'messages' in value;
}

function buildCheckpoint(threadId: string, input: SessionSaveInput): Checkpoint | undefined {
    if (input.checkpoint) return input.checkpoint;
    if (!input.state) return undefined;

    const state = isSerializedState(input.state) ? input.state : serializeState(input.state);
    const metadata: CheckpointMetadata = {
        id: input.checkpointMetadata?.id ?? `session_${threadId}_${Date.now()}`,
        threadId,
        createdAt: input.checkpointMetadata?.createdAt ?? Date.now(),
        stepCount: input.checkpointMetadata?.stepCount ?? state.stepCount,
        status: input.checkpointMetadata?.status,
        pendingApproval: input.checkpointMetadata?.pendingApproval,
        custom: input.checkpointMetadata?.custom,
    };

    return { metadata, state };
}

function extractPersistedSummary(checkpoint?: Checkpoint | null): string | undefined {
    const value = checkpoint?.metadata.custom?.[SESSION_SUMMARY_KEY];
    return typeof value === 'string' ? value : undefined;
}

export function extractSessionMessages(
    source?: SessionRecord | Checkpoint | null,
): ChatMessage[] {
    let checkpoint: Checkpoint | null | undefined = null;
    if (source) {
        if (isSessionRecord(source)) {
            if (source.messages) {
                return [...source.messages];
            }
            checkpoint = source.checkpoint;
        } else {
            checkpoint = source;
        }
    }
    const messages = (checkpoint?.state.internalMessages ?? checkpoint?.state.messages ?? []) as ChatMessage[];
    return [...messages];
}

export async function replaySession(
    store: SessionStore,
    threadId: string,
): Promise<ChatMessage[]> {
    return extractSessionMessages(await store.load(threadId));
}

function mergeCheckpointCustom(
    existing: Record<string, unknown> | undefined,
    next: Record<string, unknown> | undefined,
    summary: string | undefined,
): Record<string, unknown> | undefined {
    const merged: Record<string, unknown> = {
        ...(existing ?? {}),
        ...(next ?? {}),
    };

    if (summary !== undefined) {
        merged[SESSION_SUMMARY_KEY] = summary;
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildSyntheticAgentState(
    messages: ChatMessage[],
    existingCheckpoint: Checkpoint | null,
    checkpointMetadata?: Partial<CheckpointMetadata>,
): AgentState {
    const existingState = existingCheckpoint ? deserializeCheckpoint(existingCheckpoint) : null;
    const stepCount = checkpointMetadata?.stepCount
        ?? existingCheckpoint?.metadata.stepCount
        ?? existingState?.stepCount
        ?? 0;
    const maxSteps = existingState?.maxSteps ?? Math.max(stepCount, 1);

    return {
        internalMessages: messages,
        stepCount,
        maxSteps,
        done: existingState?.done ?? false,
        output: existingState?.output ?? '',
        reasoning: existingState?.reasoning ?? '',
        finishReason: existingState?.finishReason ?? null,
        usage: existingState?.usage,
        get messages() { return this.internalMessages; },
    } as AgentState;
}

export class MemorySessionStore implements SessionStore {
    private sessions = new Map<string, SessionRecord>();

    async load(threadId: string): Promise<SessionRecord | null> {
        return this.sessions.get(threadId) ?? null;
    }

    async save(input: SessionSaveInput): Promise<SessionRecord> {
        const previous = this.sessions.get(input.threadId);
        const checkpoint = buildCheckpoint(input.threadId, input) ?? previous?.checkpoint;
        const messages = input.messages
            ?? (checkpoint ? extractSessionMessages(checkpoint) : previous?.messages ?? []);
        const record: SessionRecord = {
            threadId: input.threadId,
            checkpoint,
            messages,
            summary: input.summary ?? previous?.summary,
            updatedAt: Date.now(),
        };
        this.sessions.set(input.threadId, record);
        return record;
    }

    async clear(threadId: string): Promise<void> {
        this.sessions.delete(threadId);
    }
}

/**
 * Adapter that lets existing checkpointers participate in the higher-level SessionStore contract.
 * Checkpoint persistence is delegated to the underlying checkpointer, and summaries are mirrored
 * into checkpoint metadata so they survive process restarts.
 */
export class CheckpointerSessionStore implements SessionStore {
    private summaries = new Map<string, string>();

    constructor(private readonly checkpointer: Checkpointer) {}

    async load(threadId: string): Promise<SessionRecord | null> {
        const checkpoint = await this.checkpointer.load(threadId);
        const summary = this.summaries.get(threadId) ?? extractPersistedSummary(checkpoint);
        if (summary !== undefined) {
            this.summaries.set(threadId, summary);
        }
        if (!checkpoint && !summary) {
            return null;
        }
        return {
            threadId,
            checkpoint: checkpoint ?? undefined,
            messages: extractSessionMessages(checkpoint),
            summary,
            updatedAt: checkpoint?.metadata.createdAt ?? Date.now(),
        };
    }

    async save(input: SessionSaveInput): Promise<SessionRecord> {
        const existingCheckpoint = input.checkpoint
            ? null
            : await this.checkpointer.load(input.threadId);
        const resolvedSummary = input.summary ?? this.summaries.get(input.threadId) ?? extractPersistedSummary(existingCheckpoint);
        let checkpoint = input.checkpoint;
        const mergedCustom = mergeCheckpointCustom(
            existingCheckpoint?.metadata.custom,
            input.checkpointMetadata?.custom,
            resolvedSummary,
        );

        if (!checkpoint && input.state) {
            const metadata = await this.checkpointer.save(input.threadId, isSerializedState(input.state)
                ? ({
                    internalMessages: (input.state.internalMessages ?? input.state.messages ?? []) as any,
                    stepCount: input.state.stepCount,
                    maxSteps: input.state.maxSteps,
                    done: input.state.done,
                    output: input.state.output,
                    reasoning: input.state.reasoning,
                    finishReason: input.state.finishReason,
                    usage: input.state.usage,
                    get messages() { return this.internalMessages; },
                } as AgentState)
                : input.state, {
                status: input.checkpointMetadata?.status,
                pendingApproval: input.checkpointMetadata?.pendingApproval,
                custom: mergedCustom,
            });
            const loaded = await this.checkpointer.load(input.threadId);
            checkpoint = loaded ?? {
                metadata,
                state: isSerializedState(input.state) ? input.state : serializeState(input.state),
            };
        } else if (!checkpoint && resolvedSummary !== undefined && existingCheckpoint) {
            const existingState = deserializeCheckpoint(existingCheckpoint);
            const metadata = await this.checkpointer.save(input.threadId, existingState, {
                status: input.checkpointMetadata?.status ?? existingCheckpoint.metadata.status,
                pendingApproval: input.checkpointMetadata?.pendingApproval ?? existingCheckpoint.metadata.pendingApproval,
                custom: mergedCustom,
            });
            const loaded = await this.checkpointer.load(input.threadId);
            checkpoint = loaded ?? {
                metadata,
                state: existingCheckpoint.state,
            };
        } else if (!checkpoint && input.messages) {
            const syntheticState = buildSyntheticAgentState(
                input.messages,
                existingCheckpoint,
                input.checkpointMetadata,
            );
            const metadata = await this.checkpointer.save(input.threadId, syntheticState, {
                status: input.checkpointMetadata?.status ?? existingCheckpoint?.metadata.status,
                pendingApproval: input.checkpointMetadata?.pendingApproval ?? existingCheckpoint?.metadata.pendingApproval,
                custom: mergedCustom,
            });
            const loaded = await this.checkpointer.load(input.threadId);
            checkpoint = loaded ?? {
                metadata,
                state: serializeState(syntheticState),
            };
        }

        if (resolvedSummary !== undefined) {
            this.summaries.set(input.threadId, resolvedSummary);
        }

        return {
            threadId: input.threadId,
            checkpoint,
            messages: input.messages ?? extractSessionMessages(checkpoint),
            summary: this.summaries.get(input.threadId) ?? extractPersistedSummary(checkpoint),
            updatedAt: checkpoint?.metadata.createdAt ?? Date.now(),
        };
    }

    async clear(threadId: string): Promise<void> {
        this.summaries.delete(threadId);
        await this.checkpointer.clear(threadId);
    }
}
