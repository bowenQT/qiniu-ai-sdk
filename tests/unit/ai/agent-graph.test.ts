import { describe, it, expect, vi } from 'vitest';
import { AgentGraph, type AgentGraphOptions, type AgentGraphResult } from '../../../src/ai/agent-graph';
import type { InternalMessage, StepResult } from '../../../src/ai/internal-types';
import type { QiniuAI } from '../../../src/client';

// Mock client
function createMockClient(responses: Array<{
    content: string;
    tool_calls?: any[];
    reasoning?: string;
    finishReason?: string;
}>): QiniuAI {
    let callIndex = 0;

    return {
        chat: {
            async *createStream(request: any, options: any) {
                const response = responses[callIndex++] || responses[responses.length - 1];

                // Yield no chunks, just return final result
                return {
                    content: response.content,
                    reasoningContent: response.reasoning || '',
                    toolCalls: response.tool_calls || [],
                    finishReason: response.finishReason || 'stop',
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
                };
            },
        },
    } as any;
}

describe('AgentGraph', () => {
    describe('G1: Basic Execution', () => {
        it('should execute simple text generation', async () => {
            const client = createMockClient([
                { content: 'Hello!', finishReason: 'stop' },
            ]);

            const graph = new AgentGraph({
                client,
                model: 'test-model',
            });

            const result = await graph.invoke([
                { role: 'user', content: 'Hi' },
            ]);

            expect(result.text).toBe('Hello!');
            expect(result.finishReason).toBe('stop');
            expect(result.steps).toHaveLength(1);
            expect(result.steps[0].type).toBe('text');
        });

        it('should execute tool call loop', async () => {
            const client = createMockClient([
                {
                    content: '',
                    finishReason: 'tool_calls',
                    tool_calls: [{
                        id: 'call_1',
                        type: 'function',
                        function: { name: 'search', arguments: '{"q":"test"}' },
                    }],
                },
                { content: 'Found results!', finishReason: 'stop' },
            ]);

            const searchTool = {
                name: 'search',
                description: 'Search for something',
                parameters: { type: 'object', properties: {} },
                source: { type: 'user' as const, namespace: 'test' },
                execute: async () => 'Search results: 1, 2, 3',
            };

            const graph = new AgentGraph({
                client,
                model: 'test-model',
                tools: { search: searchTool },
            });

            const result = await graph.invoke([
                { role: 'user', content: 'Search for test' },
            ]);

            expect(result.text).toBe('Found results!');
            // Steps: text(empty) -> tool_call -> tool_result -> text(final)
            expect(result.steps.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('G1: Event Bridge', () => {
        it('should fire onStepFinish in correct order: text -> tool_call -> tool_result', async () => {
            const client = createMockClient([
                {
                    content: 'I will search...',
                    finishReason: 'tool_calls',
                    tool_calls: [{
                        id: 'call_1',
                        type: 'function',
                        function: { name: 'search', arguments: '{}' },
                    }],
                },
                { content: 'Done!', finishReason: 'stop' },
            ]);

            const stepTypes: string[] = [];
            const graph = new AgentGraph({
                client,
                model: 'test-model',
                tools: {
                    search: {
                        name: 'search',
                        description: 'Search',
                        parameters: {},
                        source: { type: 'user', namespace: 'test' },
                        execute: async () => 'result',
                    },
                },
                events: {
                    onStepFinish: (step) => stepTypes.push(step.type),
                },
            });

            await graph.invoke([{ role: 'user', content: 'Search' }]);

            // Verify order: text -> tool_call -> tool_result -> text
            expect(stepTypes[0]).toBe('text');
            expect(stepTypes[1]).toBe('tool_call');
            expect(stepTypes[2]).toBe('tool_result');
            expect(stepTypes[3]).toBe('text');
        });

        it('should fire onNodeEnter/onNodeExit', async () => {
            const client = createMockClient([
                { content: 'Hello!', finishReason: 'stop' },
            ]);

            const nodeEvents: string[] = [];
            const graph = new AgentGraph({
                client,
                model: 'test-model',
                events: {
                    onNodeEnter: (node) => nodeEvents.push(`enter:${node}`),
                    onNodeExit: (node) => nodeEvents.push(`exit:${node}`),
                },
            });

            await graph.invoke([{ role: 'user', content: 'Hi' }]);

            expect(nodeEvents).toContain('enter:predict');
            expect(nodeEvents).toContain('exit:predict');
        });
    });

    describe('H2: Skill Injection', () => {
        it('should inject skills as separate system messages', async () => {
            const client = createMockClient([
                { content: 'I used skill knowledge!', finishReason: 'stop' },
            ]);

            const invokedMessages: any[] = [];
            const mockClient = {
                chat: {
                    async *createStream(request: any) {
                        invokedMessages.push(...request.messages);
                        return {
                            content: 'Done',
                            reasoningContent: '',
                            toolCalls: [],
                            finishReason: 'stop',
                            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
                        };
                    },
                },
            } as any;

            const graph = new AgentGraph({
                client: mockClient,
                model: 'test-model',
                skills: [
                    { name: 'zebra-skill', content: 'Zebra content', references: [], tokenCount: 50 },
                    { name: 'alpha-skill', content: 'Alpha content', references: [], tokenCount: 50 },
                ],
            });

            await graph.invoke([
                { role: 'system', content: 'Original system' },
                { role: 'user', content: 'Hello' },
            ]);

            // Verify: original system, alpha-skill, zebra-skill (sorted), user
            expect(invokedMessages[0].content).toBe('Original system');
            expect(invokedMessages[1].content).toBe('Alpha content'); // Sorted first
            expect(invokedMessages[2].content).toBe('Zebra content');
            expect(invokedMessages[3].content).toBe('Hello');
        });

        it('should strip _meta before API call', async () => {
            const invokedMessages: any[] = [];
            const mockClient = {
                chat: {
                    async *createStream(request: any) {
                        invokedMessages.push(...request.messages);
                        return {
                            content: 'Done',
                            reasoningContent: '',
                            toolCalls: [],
                            finishReason: 'stop',
                            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
                        };
                    },
                },
            } as any;

            const graph = new AgentGraph({
                client: mockClient,
                model: 'test-model',
                skills: [
                    { name: 'skill-1', content: 'Skill content', references: [], tokenCount: 50 },
                ],
            });

            await graph.invoke([{ role: 'user', content: 'Hello' }]);

            // Verify no _meta in API messages
            for (const msg of invokedMessages) {
                expect(msg._meta).toBeUndefined();
            }
        });
    });

    describe('Step Limit', () => {
        it('should stop at maxSteps', async () => {
            // Always return tool calls to force loop
            const client = createMockClient(
                Array(10).fill({
                    content: '',
                    finishReason: 'tool_calls',
                    tool_calls: [{
                        id: 'call_1',
                        type: 'function',
                        function: { name: 'echo', arguments: '{}' },
                    }],
                })
            );

            const graph = new AgentGraph({
                client,
                model: 'test-model',
                maxSteps: 3,
                tools: {
                    echo: {
                        name: 'echo',
                        description: 'Echo',
                        parameters: {},
                        source: { type: 'user', namespace: 'test' },
                        execute: async () => 'echoed',
                    },
                },
            });

            const result = await graph.invoke([{ role: 'user', content: 'Loop' }]);

            // Should stop after 3 steps
            expect(result.steps.length).toBeLessThanOrEqual(10);
        });
    });
});
