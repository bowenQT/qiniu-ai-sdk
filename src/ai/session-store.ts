import type { AgentState } from './internal-types';
import type {
    Checkpoint,
    CheckpointMetadata,
    CheckpointStatus,
    Checkpointer,
    SerializedAgentState,
} from './graph/checkpointer';
import type { ChatMessage } from '../lib/types';
import { deserializeCheckpoint, serializeState } from './graph/checkpointer';

const SESSION_SUMMARY_KEY = 'session_summary';

export type SessionRecordSource = 'session-store' | 'checkpointer';
export type SessionRestoreMode = 'message-only' | 'checkpoint' | 'resumable';

export interface SessionRecord {
    threadId: string;
    source: SessionRecordSource;
    restoreMode: SessionRestoreMode;
    checkpointStatus?: CheckpointStatus;
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

/**
 * Session store contract that can also surface its underlying checkpointer.
 * Resumable thread helpers can use this instead of a separate top-level checkpointer.
 */
export interface CheckpointerBackedSessionStore extends SessionStore {
    readonly checkpointer: Checkpointer;
}

function isSessionRecord(value: SessionRecord | Checkpoint): value is SessionRecord {
    return 'threadId' in value && !('metadata' in value);
}

function isSerializedState(value: AgentState | SerializedAgentState): value is SerializedAgentState {
    return 'internalMessages' in value || 'messages' in value;
}

/**
 * Detect whether a session store can provide resumable checkpointer semantics.
 */
export function isCheckpointerBackedSessionStore(
    value: SessionStore | null | undefined,
): value is CheckpointerBackedSessionStore {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = (value as { checkpointer?: unknown }).checkpointer;
    return !!candidate &&
        typeof candidate === 'object' &&
        typeof (candidate as Checkpointer).load === 'function' &&
        typeof (candidate as Checkpointer).save === 'function' &&
        typeof (candidate as Checkpointer).clear === 'function';
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

function classifySessionRecord(
    checkpoint: Checkpoint | null | undefined,
    source: SessionRecordSource,
): Pick<SessionRecord, 'source' | 'restoreMode' | 'checkpointStatus'> {
    const checkpointStatus = checkpoint?.metadata.status;
    return {
        source,
        restoreMode: checkpointStatus === 'pending_approval' ? 'resumable' : (checkpoint ? 'checkpoint' : 'message-only'),
        checkpointStatus,
    };
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

export function buildSessionRecord(params: {
    threadId: string;
    source: SessionRecordSource;
    checkpoint?: Checkpoint | null;
    messages?: ChatMessage[];
    summary?: string;
    updatedAt?: number;
}): SessionRecord {
    return {
        threadId: params.threadId,
        ...classifySessionRecord(params.checkpoint, params.source),
        checkpoint: params.checkpoint ?? undefined,
        messages: params.messages ?? extractSessionMessages(params.checkpoint),
        summary: params.summary,
        updatedAt: params.updatedAt ?? params.checkpoint?.metadata.createdAt ?? Date.now(),
    };
}

export function forkSessionSaveInput(
    record: SessionRecord,
    threadId: string,
): SessionSaveInput {
    const messages = record.messages ?? extractSessionMessages(record);

    if (record.checkpoint) {
        const checkpoint = record.checkpoint;
        return {
            threadId,
            state: checkpoint.state,
            messages,
            summary: record.summary,
            checkpointMetadata: {
                stepCount: checkpoint.metadata.stepCount,
                status: checkpoint.metadata.status,
                pendingApproval: checkpoint.metadata.pendingApproval,
                custom: checkpoint.metadata.custom,
            },
        };
    }

    const syntheticState = buildSyntheticAgentState(messages, null, undefined);
    return {
        threadId,
        state: syntheticState,
        messages,
        summary: record.summary,
    };
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
        const record = buildSessionRecord({
            threadId: input.threadId,
            source: 'session-store',
            checkpoint,
            messages,
            summary: input.summary ?? previous?.summary,
            updatedAt: Date.now(),
        });
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
export class CheckpointerSessionStore implements CheckpointerBackedSessionStore {
    private summaries = new Map<string, string>();

    constructor(public readonly checkpointer: Checkpointer) {}

    async load(threadId: string): Promise<SessionRecord | null> {
        const checkpoint = await this.checkpointer.load(threadId);
        const summary = this.summaries.get(threadId) ?? extractPersistedSummary(checkpoint);
        if (summary !== undefined) {
            this.summaries.set(threadId, summary);
        }
        if (!checkpoint && !summary) {
            return null;
        }
        return buildSessionRecord({
            threadId,
            source: 'checkpointer',
            checkpoint,
            summary,
        });
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

        return buildSessionRecord({
            threadId: input.threadId,
            source: 'checkpointer',
            checkpoint,
            messages: input.messages,
            summary: this.summaries.get(input.threadId) ?? extractPersistedSummary(checkpoint),
        });
    }

    async clear(threadId: string): Promise<void> {
        this.summaries.delete(threadId);
        await this.checkpointer.clear(threadId);
    }
}
