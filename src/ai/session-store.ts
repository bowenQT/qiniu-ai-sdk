import type { AgentState } from './internal-types';
import type {
    Checkpoint,
    CheckpointMetadata,
    Checkpointer,
    SerializedAgentState,
} from './graph/checkpointer';
import { serializeState } from './graph/checkpointer';

export interface SessionRecord {
    threadId: string;
    checkpoint?: Checkpoint;
    summary?: string;
    updatedAt: number;
}

export interface SessionSaveInput {
    threadId: string;
    state?: AgentState | SerializedAgentState;
    checkpoint?: Checkpoint;
    checkpointMetadata?: Partial<CheckpointMetadata>;
    summary?: string;
}

export interface SessionStore {
    load(threadId: string): Promise<SessionRecord | null>;
    save(input: SessionSaveInput): Promise<SessionRecord>;
    clear(threadId: string): Promise<void>;
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

export class MemorySessionStore implements SessionStore {
    private sessions = new Map<string, SessionRecord>();

    async load(threadId: string): Promise<SessionRecord | null> {
        return this.sessions.get(threadId) ?? null;
    }

    async save(input: SessionSaveInput): Promise<SessionRecord> {
        const checkpoint = buildCheckpoint(input.threadId, input);
        const record: SessionRecord = {
            threadId: input.threadId,
            checkpoint,
            summary: input.summary,
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
 * Checkpoint persistence is delegated to the underlying checkpointer; summaries stay in-process.
 */
export class CheckpointerSessionStore implements SessionStore {
    private summaries = new Map<string, string>();

    constructor(private readonly checkpointer: Checkpointer) {}

    async load(threadId: string): Promise<SessionRecord | null> {
        const checkpoint = await this.checkpointer.load(threadId);
        const summary = this.summaries.get(threadId);
        if (!checkpoint && !summary) {
            return null;
        }
        return {
            threadId,
            checkpoint: checkpoint ?? undefined,
            summary,
            updatedAt: checkpoint?.metadata.createdAt ?? Date.now(),
        };
    }

    async save(input: SessionSaveInput): Promise<SessionRecord> {
        let checkpoint = input.checkpoint;
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
                custom: input.checkpointMetadata?.custom,
            });
            const loaded = await this.checkpointer.load(input.threadId);
            checkpoint = loaded ?? {
                metadata,
                state: isSerializedState(input.state) ? input.state : serializeState(input.state),
            };
        }

        if (input.summary !== undefined) {
            this.summaries.set(input.threadId, input.summary);
        }

        return {
            threadId: input.threadId,
            checkpoint,
            summary: this.summaries.get(input.threadId),
            updatedAt: checkpoint?.metadata.createdAt ?? Date.now(),
        };
    }

    async clear(threadId: string): Promise<void> {
        this.summaries.delete(threadId);
        await this.checkpointer.clear(threadId);
    }
}
