import { describe, it, expect, beforeEach } from 'vitest';
import {
    MemoryCheckpointer,
    deserializeCheckpoint,
    type Checkpointer,
} from '../../../src/ai/graph/checkpointer';
import type { AgentState, InternalMessage } from '../../../src/ai/internal-types';

describe('Checkpointer', () => {
    let checkpointer: Checkpointer;

    beforeEach(() => {
        checkpointer = new MemoryCheckpointer({ maxItems: 10 });
    });

    const createTestState = (stepCount = 1): AgentState => ({
        messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
        ],
        skills: [],
        tools: new Map(),
        stepCount,
        maxSteps: 10,
        done: false,
        output: 'Hi there!',
        reasoning: '',
        finishReason: 'stop',
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });

    describe('J1: Interface', () => {
        it('should save checkpoint and return metadata', async () => {
            const state = createTestState();
            const metadata = await checkpointer.save('thread-1', state, { foo: 'bar' });

            expect(metadata.id).toBeDefined();
            expect(metadata.threadId).toBe('thread-1');
            expect(metadata.stepCount).toBe(1);
            expect(metadata.custom).toEqual({ foo: 'bar' });
        });

        it('should load latest checkpoint', async () => {
            const state1 = createTestState(1);
            const state2 = createTestState(2);

            await checkpointer.save('thread-1', state1);
            await new Promise(r => setTimeout(r, 10)); // Ensure different timestamps
            await checkpointer.save('thread-1', state2);

            const loaded = await checkpointer.load('thread-1');
            expect(loaded).not.toBeNull();
            expect(loaded!.state.stepCount).toBe(2);
        });

        it('should return null for non-existent thread', async () => {
            const loaded = await checkpointer.load('non-existent');
            expect(loaded).toBeNull();
        });

        it('should list checkpoints in descending order', async () => {
            await checkpointer.save('thread-1', createTestState(1));
            await new Promise(r => setTimeout(r, 10));
            await checkpointer.save('thread-1', createTestState(2));
            await new Promise(r => setTimeout(r, 10));
            await checkpointer.save('thread-1', createTestState(3));

            const list = await checkpointer.list('thread-1');
            expect(list.length).toBe(3);
            expect(list[0].stepCount).toBe(3); // Most recent first
            expect(list[2].stepCount).toBe(1); // Oldest last
        });

        it('should delete specific checkpoint', async () => {
            const metadata = await checkpointer.save('thread-1', createTestState());

            const deleted = await checkpointer.delete(metadata.id);
            expect(deleted).toBe(true);

            const loaded = await checkpointer.load('thread-1');
            expect(loaded).toBeNull();
        });

        it('should clear all checkpoints for thread', async () => {
            await checkpointer.save('thread-1', createTestState(1));
            await checkpointer.save('thread-1', createTestState(2));
            await checkpointer.save('thread-2', createTestState(1));

            const cleared = await checkpointer.clear('thread-1');
            expect(cleared).toBe(2);

            const list1 = await checkpointer.list('thread-1');
            const list2 = await checkpointer.list('thread-2');

            expect(list1.length).toBe(0);
            expect(list2.length).toBe(1);
        });
    });

    describe('J2: MemoryCheckpointer', () => {
        it('should respect maxItems limit', async () => {
            const smallCheckpointer = new MemoryCheckpointer({ maxItems: 3 });

            for (let i = 0; i < 5; i++) {
                await smallCheckpointer.save(`thread-${i}`, createTestState(i));
            }

            // Count all checkpoints
            let total = 0;
            for (let i = 0; i < 5; i++) {
                const list = await smallCheckpointer.list(`thread-${i}`);
                total += list.length;
            }

            expect(total).toBeLessThanOrEqual(3);
        });

        it('should serialize state correctly', async () => {
            const state: AgentState = {
                messages: [
                    { role: 'system', content: 'System prompt', _meta: { skillId: 'test', droppable: true } },
                    { role: 'user', content: 'Hello' },
                ],
                skills: [{ name: 'test', priority: 0, messageIndex: 0, tokenCount: 50 }],
                tools: new Map([['tool1', { name: 'tool1' } as any]]),
                stepCount: 5,
                maxSteps: 10,
                done: true,
                output: 'Final output',
                reasoning: 'Some reasoning',
                finishReason: 'stop',
            };

            await checkpointer.save('thread-1', state);
            const loaded = await checkpointer.load('thread-1');

            expect(loaded).not.toBeNull();
            expect(loaded!.state.messages[0]._meta).toEqual({ skillId: 'test', droppable: true });
            expect(loaded!.state.stepCount).toBe(5);
            expect(loaded!.state.output).toBe('Final output');
        });
    });

    describe('J3: Deserialize', () => {
        it('should deserialize checkpoint back to AgentState', async () => {
            const original = createTestState(3);
            await checkpointer.save('thread-1', original);

            const loaded = await checkpointer.load('thread-1');
            expect(loaded).not.toBeNull();

            const toolsMap = new Map([['myTool', { name: 'myTool' } as any]]);
            const restored = deserializeCheckpoint(loaded!, toolsMap);

            expect(restored.stepCount).toBe(3);
            expect(restored.messages.length).toBe(2);
            expect(restored.tools.has('myTool')).toBe(true);
            expect(restored.abortSignal).toBeUndefined();
        });
    });
});
