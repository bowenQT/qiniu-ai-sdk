import { describe, expect, it, vi } from 'vitest';
import { CheckpointerSessionStore, MemorySessionStore } from '../../../src/ai/session-store';
import type { Checkpointer } from '../../../src/ai/graph/checkpointer';

describe('session store', () => {
    it('persists checkpoint and summary in MemorySessionStore', async () => {
        const store = new MemorySessionStore();

        await store.save({
            threadId: 'thread-1',
            state: {
                internalMessages: [{ role: 'user', content: 'hello' }],
                stepCount: 1,
                maxSteps: 4,
                done: false,
                output: '',
                reasoning: '',
                finishReason: null,
            },
            summary: 'hello summary',
        });

        const record = await store.load('thread-1');
        expect(record?.checkpoint?.state.internalMessages).toHaveLength(1);
        expect(record?.summary).toBe('hello summary');
    });

    it('adapts an existing checkpointer into SessionStore', async () => {
        const save = vi.fn().mockResolvedValue({
            id: 'ckpt-1',
            threadId: 'thread-1',
            createdAt: 1,
            stepCount: 1,
        });
        const load = vi.fn().mockResolvedValue({
            metadata: {
                id: 'ckpt-1',
                threadId: 'thread-1',
                createdAt: 1,
                stepCount: 1,
            },
            state: {
                internalMessages: [{ role: 'user', content: 'hello' }],
                stepCount: 1,
                maxSteps: 4,
                done: false,
                output: '',
                reasoning: '',
                finishReason: null,
            },
        });
        const checkpointer: Checkpointer = {
            save,
            load,
            list: vi.fn().mockResolvedValue([]),
            delete: vi.fn().mockResolvedValue(true),
            clear: vi.fn().mockResolvedValue(0),
        };

        const store = new CheckpointerSessionStore(checkpointer);
        await store.save({
            threadId: 'thread-1',
            state: {
                internalMessages: [{ role: 'user', content: 'hello' }],
                stepCount: 1,
                maxSteps: 4,
                done: false,
                output: '',
                reasoning: '',
                finishReason: null,
            } as any,
            summary: 'hello summary',
        });

        const record = await store.load('thread-1');
        expect(save).toHaveBeenCalled();
        expect(record?.summary).toBe('hello summary');
        expect(record?.checkpoint?.metadata.id).toBe('ckpt-1');
    });

    it('persists summary through checkpoint metadata for restart scenarios', async () => {
        let persistedCheckpoint: any = null;
        const save = vi.fn().mockImplementation(async (_threadId, state, options) => {
            persistedCheckpoint = {
                metadata: {
                    id: 'ckpt-2',
                    threadId: 'thread-2',
                    createdAt: 2,
                    stepCount: state.stepCount,
                    status: options?.status,
                    pendingApproval: options?.pendingApproval,
                    custom: options?.custom,
                },
                state: {
                    internalMessages: state.internalMessages,
                    stepCount: state.stepCount,
                    maxSteps: state.maxSteps,
                    done: state.done,
                    output: state.output,
                    reasoning: state.reasoning,
                    finishReason: state.finishReason,
                },
            };
            return persistedCheckpoint.metadata;
        });
        const load = vi.fn().mockImplementation(async () => persistedCheckpoint);
        const checkpointer: Checkpointer = {
            save,
            load,
            list: vi.fn().mockResolvedValue([]),
            delete: vi.fn().mockResolvedValue(true),
            clear: vi.fn().mockResolvedValue(0),
        };

        const store = new CheckpointerSessionStore(checkpointer);
        await store.save({
            threadId: 'thread-2',
            state: {
                internalMessages: [{ role: 'user', content: 'hello' }],
                stepCount: 1,
                maxSteps: 4,
                done: false,
                output: '',
                reasoning: '',
                finishReason: null,
            } as any,
            summary: 'persisted summary',
        });

        const restartedStore = new CheckpointerSessionStore(checkpointer);
        const record = await restartedStore.load('thread-2');

        expect(record?.summary).toBe('persisted summary');
        expect(record?.checkpoint?.metadata.custom).toMatchObject({
            session_summary: 'persisted summary',
        });
    });

    it('can update only the summary while keeping the existing checkpoint', async () => {
        let persistedCheckpoint: any = {
            metadata: {
                id: 'ckpt-3',
                threadId: 'thread-3',
                createdAt: 3,
                stepCount: 1,
                custom: { existing: true },
            },
            state: {
                internalMessages: [{ role: 'user', content: 'hello' }],
                stepCount: 1,
                maxSteps: 4,
                done: false,
                output: '',
                reasoning: '',
                finishReason: null,
            },
        };
        const save = vi.fn().mockImplementation(async (_threadId, state, options) => {
            persistedCheckpoint = {
                metadata: {
                    ...persistedCheckpoint.metadata,
                    id: 'ckpt-4',
                    custom: options?.custom,
                },
                state: {
                    internalMessages: state.internalMessages,
                    stepCount: state.stepCount,
                    maxSteps: state.maxSteps,
                    done: state.done,
                    output: state.output,
                    reasoning: state.reasoning,
                    finishReason: state.finishReason,
                },
            };
            return persistedCheckpoint.metadata;
        });
        const load = vi.fn().mockImplementation(async () => persistedCheckpoint);
        const checkpointer: Checkpointer = {
            save,
            load,
            list: vi.fn().mockResolvedValue([]),
            delete: vi.fn().mockResolvedValue(true),
            clear: vi.fn().mockResolvedValue(0),
        };

        const store = new CheckpointerSessionStore(checkpointer);
        const record = await store.save({
            threadId: 'thread-3',
            summary: 'updated summary',
        });

        expect(save).toHaveBeenCalledTimes(1);
        expect(record.summary).toBe('updated summary');
        expect(record.checkpoint?.metadata.custom).toMatchObject({
            existing: true,
            session_summary: 'updated summary',
        });
    });
});
