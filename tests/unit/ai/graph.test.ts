import { describe, it, expect } from 'vitest';
import { StateGraph, MaxGraphStepsError, END } from '../../../src/ai/graph';

interface TestState {
    count: number;
    messages: string[];
    done?: boolean;
}

describe('StateGraph', () => {
    describe('Basic Graph Execution', () => {
        it('should execute a simple linear graph', async () => {
            const graph = new StateGraph<TestState>()
                .addNode('start', (state) => ({
                    count: state.count + 1,
                    messages: [...state.messages, 'start'],
                }))
                .addNode('middle', (state) => ({
                    count: state.count + 1,
                    messages: [...state.messages, 'middle'],
                }))
                .addNode('end', (state) => ({
                    count: state.count + 1,
                    messages: [...state.messages, 'end'],
                }))
                .addEdge('start', 'middle')
                .addEdge('middle', 'end');

            const app = graph.compile();
            const result = await app.invoke({ count: 0, messages: [] });

            expect(result.count).toBe(3);
            expect(result.messages).toEqual(['start', 'middle', 'end']);
        });

        it('should support conditional edges', async () => {
            const graph = new StateGraph<TestState>()
                .addNode('check', (state) => ({
                    done: state.count >= 3,
                }))
                .addNode('increment', (state) => ({
                    count: state.count + 1,
                    messages: [...state.messages, `step-${state.count}`],
                }))
                .addConditionalEdge('check', (state) => state.done ? END : 'increment')
                .addEdge('increment', 'check');

            const app = graph.compile();
            const result = await app.invoke({ count: 0, messages: [] });

            expect(result.count).toBe(3);
            expect(result.messages).toHaveLength(3);
        });

        it('should throw MaxGraphStepsError when exceeding max steps', async () => {
            const graph = new StateGraph<TestState>()
                .addNode('loop', (state) => ({
                    count: state.count + 1,
                }))
                .addEdge('loop', 'loop');

            const app = graph.compile();

            await expect(app.invoke({ count: 0, messages: [] }, { maxSteps: 5 }))
                .rejects.toThrow(MaxGraphStepsError);
        });
    });

    describe('Streaming', () => {
        it('should yield state after each node', async () => {
            const graph = new StateGraph<TestState>()
                .addNode('a', () => ({ messages: ['a'] }))
                .addNode('b', (s) => ({ messages: [...s.messages, 'b'] }))
                .addEdge('a', 'b');

            const app = graph.compile();
            const results: string[] = [];

            for await (const { node } of app.stream({ count: 0, messages: [] })) {
                results.push(node);
            }

            expect(results).toEqual(['a', 'b']);
        });
    });

    describe('Entry Point', () => {
        it('should use first added node as default entry', async () => {
            const graph = new StateGraph<TestState>()
                .addNode('first', () => ({ messages: ['first'] }))
                .addNode('second', (s) => ({ messages: [...s.messages, 'second'] }));

            const app = graph.compile();
            const result = await app.invoke({ count: 0, messages: [] });

            expect(result.messages).toContain('first');
        });

        it('should allow explicit entry point', async () => {
            const graph = new StateGraph<TestState>()
                .addNode('first', () => ({ messages: ['first'] }))
                .addNode('second', () => ({ messages: ['second'] }))
                .setEntryPoint('second');

            const app = graph.compile();
            const result = await app.invoke({ count: 0, messages: [] });

            expect(result.messages).toEqual(['second']);
        });
    });
});
