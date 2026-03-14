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
});
