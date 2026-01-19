import { describe, it, expect, vi } from 'vitest';
import {
    cloneStateForBranch,
    stampMessage,
    sortMessagesByBranch,
    stripBranchMeta,
    defaultParallelReducer,
    executeParallel,
} from '../../../src/ai/graph/parallel-executor';
import type { AgentState, InternalMessage } from '../../../src/ai/internal-types';
import { FatalToolError } from '../../../src/lib/errors';

// Mock minimal AgentState
function createMockState(overrides?: Partial<AgentState>): AgentState {
    return {
        messages: [],
        skills: [],
        tools: new Map(),
        stepCount: 0,
        maxSteps: 10,
        done: false,
        output: '',
        reasoning: '',
        finishReason: null,
        ...overrides,
    };
}

describe('parallel-executor', () => {
    describe('cloneStateForBranch', () => {
        it('should deep copy messages', () => {
            const original = createMockState({
                messages: [{ role: 'user', content: 'hello' }],
            });

            const cloned = cloneStateForBranch(original, 0);

            // Modify cloned
            (cloned.messages[0] as any).content = 'modified';

            // Original unchanged
            expect(original.messages[0].content).toBe('hello');
        });

        it('should add branchIndex to message _meta', () => {
            const original = createMockState({
                messages: [{ role: 'user', content: 'test' }],
            });

            const cloned = cloneStateForBranch(original, 2);

            expect(cloned.messages[0]._meta?.branchIndex).toBe(2);
        });

        it('should share tools Map reference', () => {
            const tools = new Map();
            tools.set('test', { name: 'test' });

            const original = createMockState({ tools });
            const cloned = cloneStateForBranch(original, 0);

            expect(cloned.tools).toBe(original.tools);
        });
    });

    describe('stampMessage', () => {
        it('should add branchIndex and localIndex', () => {
            const msg: InternalMessage = { role: 'assistant', content: 'hello' };
            const stamped = stampMessage(msg, 1, 5);

            expect(stamped._meta?.branchIndex).toBe(1);
            expect(stamped._meta?.localIndex).toBe(5);
        });
    });

    describe('sortMessagesByBranch', () => {
        it('should sort by branchIndex then localIndex', () => {
            const messages: InternalMessage[] = [
                { role: 'user', content: 'b1-m1', _meta: { branchIndex: 1, localIndex: 0 } },
                { role: 'user', content: 'b0-m0', _meta: { branchIndex: 0, localIndex: 0 } },
                { role: 'user', content: 'b0-m1', _meta: { branchIndex: 0, localIndex: 1 } },
            ];

            const sorted = sortMessagesByBranch(messages);

            expect(sorted[0].content).toBe('b0-m0');
            expect(sorted[1].content).toBe('b0-m1');
            expect(sorted[2].content).toBe('b1-m1');
        });
    });

    describe('stripBranchMeta', () => {
        it('should remove branchIndex and localIndex', () => {
            const messages: InternalMessage[] = [
                { role: 'user', content: 'test', _meta: { branchIndex: 0, localIndex: 1, skillId: 'keep' } },
            ];

            const stripped = stripBranchMeta(messages);

            expect(stripped[0]._meta?.branchIndex).toBeUndefined();
            expect(stripped[0]._meta?.localIndex).toBeUndefined();
            expect(stripped[0]._meta?.skillId).toBe('keep');
        });
    });

    describe('defaultParallelReducer', () => {
        it('should merge messages from all branches', () => {
            const state1 = createMockState({
                messages: [{ role: 'user', content: 'from branch 0', _meta: { branchIndex: 0, localIndex: 0 } }],
                stepCount: 1,
            });
            const state2 = createMockState({
                messages: [{ role: 'user', content: 'from branch 1', _meta: { branchIndex: 1, localIndex: 0 } }],
                stepCount: 2,
            });

            const merged = defaultParallelReducer([state1, state2]);

            expect(merged.messages).toHaveLength(2);
            expect(merged.stepCount).toBe(3); // max(1,2) + 1
        });

        it('should sum usage across branches', () => {
            const state1 = createMockState({
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            });
            const state2 = createMockState({
                usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
            });

            const merged = defaultParallelReducer([state1, state2]);

            expect(merged.usage?.prompt_tokens).toBe(30);
            expect(merged.usage?.completion_tokens).toBe(15);
            expect(merged.usage?.total_tokens).toBe(45);
        });
    });

    describe('executeParallel', () => {
        it('should execute branches and merge results', async () => {
            const state = createMockState();

            const result = await executeParallel(state, {
                branches: [
                    {
                        name: 'branch1',
                        execute: async (s) => ({ ...s, output: 'result1' }),
                    },
                    {
                        name: 'branch2',
                        execute: async (s) => ({ ...s, output: 'result2' }),
                    },
                ],
            });

            expect(result.interrupted).toBe(false);
            expect(result.state.output).toContain('result1');
            expect(result.state.output).toContain('result2');
        });

        it('should fail-fast on FatalToolError', async () => {
            const state = createMockState();

            await expect(executeParallel(state, {
                branches: [
                    {
                        name: 'failing',
                        execute: async () => {
                            throw new FatalToolError('test', 'Fatal error');
                        },
                    },
                    {
                        name: 'slow',
                        execute: async (s) => {
                            await new Promise(r => setTimeout(r, 1000));
                            return s;
                        },
                    },
                ],
            })).rejects.toThrow(FatalToolError);
        });

        it('should respect maxConcurrency', async () => {
            const state = createMockState();
            const executionOrder: number[] = [];

            await executeParallel(state, {
                branches: [0, 1, 2].map(i => ({
                    name: `branch${i}`,
                    execute: async (s) => {
                        executionOrder.push(i);
                        await new Promise(r => setTimeout(r, 10));
                        return s;
                    },
                })),
                maxConcurrency: 1,
            });

            // With maxConcurrency=1, should execute sequentially
            expect(executionOrder).toEqual([0, 1, 2]);
        });
    });
});
