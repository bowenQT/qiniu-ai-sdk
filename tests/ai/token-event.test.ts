/**
 * Phase 6B RED Tests: AgentGraph + generateTextWithGraph onTokenEvent
 */
import { describe, it, expect } from 'vitest';
import { generateTextWithGraph } from '../../src/ai/generate-text';
import type { TokenEvent } from '../../src/ai/agent-graph';

// Mock client that yields intermediate chunks (for onChunk to capture)
function createChunkingMockClient(responses: Array<{
    chunks: Array<{ content?: string; reasoning_content?: string; tool_calls?: any[] }>;
    finishReason?: string;
}>) {
    let callIndex = 0;

    return {
        chat: {
            async *createStream(request: any) {
                const response = responses[callIndex++] || responses[responses.length - 1];

                // Yield intermediate chunks (these are what onChunk captures)
                for (const chunk of response.chunks) {
                    yield {
                        choices: [{
                            index: 0,
                            delta: chunk,
                        }],
                    };
                }

                // Compute final aggregated result
                const content = response.chunks
                    .map(c => c.content || '')
                    .join('');
                const reasoningContent = response.chunks
                    .map(c => c.reasoning_content || '')
                    .join('');
                const toolCalls = response.chunks
                    .flatMap(c => c.tool_calls || [])
                    .filter((tc, i, arr) => arr.findIndex(t => t.id === tc.id) === i);

                return {
                    content,
                    reasoningContent,
                    toolCalls,
                    finishReason: response.finishReason || 'stop',
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
                };
            },
        },
    } as any;
}

describe('generateTextWithGraph onTokenEvent', () => {
    it('should emit text-delta events from predict-node', async () => {
        const client = createChunkingMockClient([
            { chunks: [{ content: 'Hello' }, { content: ' world' }], finishReason: 'stop' },
        ]);

        const events: TokenEvent[] = [];
        const result = await generateTextWithGraph({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'Hi' }],
            onTokenEvent: (event) => events.push(event),
        });

        expect(result.text).toBe('Hello world');

        const textDeltas = events.filter(e => e.type === 'text-delta');
        expect(textDeltas).toHaveLength(2);
        expect(textDeltas[0]).toEqual({ type: 'text-delta', textDelta: 'Hello' });
        expect(textDeltas[1]).toEqual({ type: 'text-delta', textDelta: ' world' });
    });

    it('should emit reasoning-delta events', async () => {
        const client = createChunkingMockClient([
            { chunks: [{ reasoning_content: 'Think...' }, { content: 'Answer' }], finishReason: 'stop' },
        ]);

        const events: TokenEvent[] = [];
        await generateTextWithGraph({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'Think' }],
            onTokenEvent: (event) => events.push(event),
        });

        const reasoningDeltas = events.filter(e => e.type === 'reasoning-delta');
        expect(reasoningDeltas).toHaveLength(1);
        expect(reasoningDeltas[0]).toEqual({ type: 'reasoning-delta', reasoningDelta: 'Think...' });
    });

    it('should emit tool-call and tool-result events for tool execution', async () => {
        const client = createChunkingMockClient([
            {
                chunks: [{
                    tool_calls: [{
                        id: 'call-1',
                        type: 'function',
                        function: { name: 'greet', arguments: '{"name":"World"}' },
                    }],
                }],
                finishReason: 'tool_calls',
            },
            { chunks: [{ content: 'Hello World!' }], finishReason: 'stop' },
        ]);

        const events: TokenEvent[] = [];
        await generateTextWithGraph({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'Greet' }],
            tools: {
                greet: {
                    description: 'Greet someone',
                    parameters: { type: 'object', properties: { name: { type: 'string' } } },
                    execute: async (args: any) => `Hello ${args.name}`,
                },
            },
            onTokenEvent: (event) => events.push(event),
        });

        // Should have tool-call (after approval, before execution)
        const toolCalls = events.filter(e => e.type === 'tool-call');
        expect(toolCalls).toHaveLength(1);
        expect(toolCalls[0]).toMatchObject({
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'greet',
        });

        // Should have tool-result
        const toolResults = events.filter(e => e.type === 'tool-result');
        expect(toolResults).toHaveLength(1);
        expect(toolResults[0]).toMatchObject({
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'greet',
            isError: false,
        });
    });

    it('should emit step-finish events', async () => {
        const client = createChunkingMockClient([
            { chunks: [{ content: 'Done' }], finishReason: 'stop' },
        ]);

        const events: TokenEvent[] = [];
        await generateTextWithGraph({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'Hi' }],
            onTokenEvent: (event) => events.push(event),
        });

        const stepFinishes = events.filter(e => e.type === 'step-finish');
        expect(stepFinishes.length).toBeGreaterThan(0);
    });

    it('should emit finish event with final text', async () => {
        const client = createChunkingMockClient([
            { chunks: [{ content: 'Final answer' }], finishReason: 'stop' },
        ]);

        const events: TokenEvent[] = [];
        await generateTextWithGraph({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'Hi' }],
            onTokenEvent: (event) => events.push(event),
        });

        const finishEvents = events.filter(e => e.type === 'finish');
        expect(finishEvents).toHaveLength(1);
        expect(finishEvents[0]).toMatchObject({
            type: 'finish',
            text: 'Final answer',
            finishReason: 'stop',
        });
    });

    it('should emit error event when guardrails block', async () => {
        const client = createChunkingMockClient([
            { chunks: [{ content: 'Bad content' }], finishReason: 'stop' },
        ]);

        const events: TokenEvent[] = [];

        await expect(generateTextWithGraph({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'Hi' }],
            guardrails: [{
                name: 'block-all',
                phase: 'post-response' as const,
                process: async () => ({ action: 'block' as const, reason: 'blocked' }),
            }],
            onTokenEvent: (event) => events.push(event),
        })).rejects.toThrow();

        const errorEvents = events.filter(e => e.type === 'error');
        expect(errorEvents).toHaveLength(1);
        expect((errorEvents[0] as any).error).toBeDefined();
    });

    it('should emit tool-result(isError) for rejected tool calls', async () => {
        const client = createChunkingMockClient([
            {
                chunks: [{
                    tool_calls: [{
                        id: 'call-rej',
                        type: 'function',
                        function: { name: 'dangerousTool', arguments: '{}' },
                    }],
                }],
                finishReason: 'tool_calls',
            },
            { chunks: [{ content: 'Rejected' }], finishReason: 'stop' },
        ]);

        const events: TokenEvent[] = [];
        await generateTextWithGraph({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'Use tool' }],
            tools: {
                dangerousTool: {
                    description: 'Dangerous',
                    parameters: {},
                    execute: async () => 'should not run',
                    requiresApproval: true,
                },
            },
            // No approvalConfig → fail-closed → rejection
            onTokenEvent: (event) => events.push(event),
        });

        // Should NOT have tool-call for rejected call
        const toolCalls = events.filter(e => e.type === 'tool-call');
        expect(toolCalls).toHaveLength(0);

        // Should have tool-result with isError
        const toolResults = events.filter(e => e.type === 'tool-result');
        expect(toolResults).toHaveLength(1);
        expect(toolResults[0]).toMatchObject({
            type: 'tool-result',
            toolCallId: 'call-rej',
            toolName: 'dangerousTool',
            isError: true,
        });
    });

    it('should not emit onTokenEvent when not provided', async () => {
        const client = createChunkingMockClient([
            { chunks: [{ content: 'Normal' }], finishReason: 'stop' },
        ]);

        // Should not crash without onTokenEvent
        const result = await generateTextWithGraph({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'Hi' }],
        });

        expect(result.text).toBe('Normal');
    });
});
