import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { generateText } from '../../../src/ai/generate-text';
import { createSSEResponse } from '../../mocks/fetch';

function buildChunk(delta: Record<string, unknown>, finishReason: string | null, usage?: unknown) {
    return {
        id: 'chat-1',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'test-model',
        choices: [{ index: 0, delta, finish_reason: finishReason }],
        usage,
    };
}

describe('generateText - Phase 5 Tests', () => {
    describe('Tool Loop Message History', () => {
        it('should include assistant message with tool_calls in history before tool results', async () => {
            const firstStepChunks = [
                buildChunk({
                    tool_calls: [{
                        index: 0,
                        id: 'call-123',
                        type: 'function',
                        function: { name: 'getWeather', arguments: '{"city":"Beijing"}' },
                    }],
                }, null),
                buildChunk({}, 'tool_calls'),
            ];

            const secondStepChunks = [
                buildChunk({ content: 'The weather is sunny.' }, null),
                buildChunk({}, 'stop'),
            ];

            const capturedBodies: unknown[] = [];
            const adapter = {
                fetch: vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
                    capturedBodies.push(JSON.parse(init.body as string));
                    if (capturedBodies.length === 1) {
                        return createSSEResponse(firstStepChunks);
                    }
                    return createSSEResponse(secondStepChunks);
                }),
            };

            const client = new QiniuAI({ apiKey: 'sk-test', adapter });
            await generateText({
                client,
                model: 'test-model',
                prompt: 'What is the weather in Beijing?',
                maxSteps: 2,
                tools: {
                    getWeather: {
                        execute: async () => ({ temperature: 25, condition: 'sunny' }),
                    },
                },
            });

            // Verify second request contains assistant message with tool_calls
            const secondBody = capturedBodies[1] as { messages: Array<{ role: string; tool_calls?: unknown; tool_call_id?: string }> };
            const messages = secondBody.messages;

            // Find assistant message with tool_calls
            const assistantWithTools = messages.find(
                (m) => m.role === 'assistant' && m.tool_calls
            );
            expect(assistantWithTools).toBeDefined();
            expect(assistantWithTools?.tool_calls).toHaveLength(1);

            // Find tool result message with tool_call_id
            const toolResult = messages.find(
                (m) => m.role === 'tool' && m.tool_call_id === 'call-123'
            );
            expect(toolResult).toBeDefined();
        });

        it('should use tool_call_id from tool call in tool result message', async () => {
            const firstStepChunks = [
                buildChunk({
                    tool_calls: [{
                        index: 0,
                        id: 'unique-call-id-456',
                        type: 'function',
                        function: { name: 'calculate', arguments: '{"a":1,"b":2}' },
                    }],
                }, null),
                buildChunk({}, 'tool_calls'),
            ];

            const secondStepChunks = [
                buildChunk({ content: 'Result is 3' }, null),
                buildChunk({}, 'stop'),
            ];

            const capturedBodies: unknown[] = [];
            const adapter = {
                fetch: vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
                    capturedBodies.push(JSON.parse(init.body as string));
                    if (capturedBodies.length === 1) {
                        return createSSEResponse(firstStepChunks);
                    }
                    return createSSEResponse(secondStepChunks);
                }),
            };

            const client = new QiniuAI({ apiKey: 'sk-test', adapter });
            await generateText({
                client,
                model: 'test-model',
                prompt: 'Calculate 1 + 2',
                maxSteps: 2,
                tools: {
                    calculate: {
                        execute: async ({ a, b }: { a: number; b: number }) => a + b,
                    },
                },
            });

            const secondBody = capturedBodies[1] as { messages: Array<{ role: string; tool_call_id?: string }> };
            const toolResultMsg = secondBody.messages.find((m) => m.role === 'tool');
            expect(toolResultMsg?.tool_call_id).toBe('unique-call-id-456');
        });
    });

    describe('lastNonToolText Strategy', () => {
        it('should return final text without intermediate tool-call phase content', async () => {
            const firstStepChunks = [
                buildChunk({ content: 'Let me check the weather...' }, null),
                buildChunk({
                    tool_calls: [{
                        index: 0,
                        id: 'call-1',
                        type: 'function',
                        function: { name: 'getWeather', arguments: '{}' },
                    }],
                }, null),
                buildChunk({}, 'tool_calls'),
            ];

            const secondStepChunks = [
                buildChunk({ content: 'The weather is sunny and 25°C.' }, null),
                buildChunk({}, 'stop'),
            ];

            const adapter = {
                fetch: vi.fn()
                    .mockResolvedValueOnce(createSSEResponse(firstStepChunks))
                    .mockResolvedValueOnce(createSSEResponse(secondStepChunks)),
            };

            const client = new QiniuAI({ apiKey: 'sk-test', adapter });
            const result = await generateText({
                client,
                model: 'test-model',
                prompt: 'Weather?',
                maxSteps: 2,
                tools: {
                    getWeather: {
                        execute: async () => ({ temp: 25 }),
                    },
                },
            });

            // Should NOT include "Let me check the weather..." (intermediate)
            expect(result.text).toBe('The weather is sunny and 25°C.');
            expect(result.text).not.toContain('Let me check');
        });
    });

    describe('Parameter Passthrough', () => {
        it('should pass temperature and responseFormat to request body', async () => {
            const chunks = [
                buildChunk({ content: '{"result": 42}' }, null),
                buildChunk({}, 'stop'),
            ];

            let capturedBody: Record<string, unknown> | null = null;
            const adapter = {
                fetch: vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
                    capturedBody = JSON.parse(init.body as string);
                    // Return non-streaming response for JSON mode
                    return new Response(JSON.stringify({
                        id: 'chat-1',
                        object: 'chat.completion',
                        created: 1234567890,
                        model: 'test-model',
                        choices: [{
                            index: 0,
                            message: { role: 'assistant', content: '{"result": 42}' },
                            finish_reason: 'stop',
                        }],
                    }), { status: 200 });
                }),
            };

            const client = new QiniuAI({ apiKey: 'sk-test', adapter });
            await generateText({
                client,
                model: 'test-model',
                prompt: 'Return JSON',
                temperature: 0.7,
                maxTokens: 1000,
                responseFormat: { type: 'json_object' },
            });

            expect(capturedBody).toBeDefined();
            expect(capturedBody!.temperature).toBe(0.7);
            expect(capturedBody!.max_tokens).toBe(1000);
            expect(capturedBody!.response_format).toEqual({ type: 'json_object' });
        });

        it('should pass toolChoice to request body', async () => {
            const chunks = [
                buildChunk({ content: 'Done' }, null),
                buildChunk({}, 'stop'),
            ];

            let capturedBody: Record<string, unknown> | null = null;
            const adapter = {
                fetch: vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
                    capturedBody = JSON.parse(init.body as string);
                    return createSSEResponse(chunks);
                }),
            };

            const client = new QiniuAI({ apiKey: 'sk-test', adapter });
            await generateText({
                client,
                model: 'test-model',
                prompt: 'Do something',
                toolChoice: 'auto',
                tools: {
                    doSomething: {
                        execute: async () => 'done',
                    },
                },
            });

            expect(capturedBody!.tool_choice).toBe('auto');
        });
    });

    describe('ID Fallback', () => {
        it('should generate fallback ID when backend does not provide tool_call_id', async () => {
            // First chunk: tool_call without id
            const firstStepChunks = [
                buildChunk({
                    tool_calls: [{
                        index: 0,
                        // id is missing!
                        type: 'function',
                        function: { name: 'test', arguments: '{}' },
                    }],
                }, null),
                buildChunk({}, 'tool_calls'),
            ];

            const secondStepChunks = [
                buildChunk({ content: 'Done' }, null),
                buildChunk({}, 'stop'),
            ];

            const capturedBodies: unknown[] = [];
            const adapter = {
                fetch: vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
                    capturedBodies.push(JSON.parse(init.body as string));
                    if (capturedBodies.length === 1) {
                        return createSSEResponse(firstStepChunks);
                    }
                    return createSSEResponse(secondStepChunks);
                }),
            };

            const client = new QiniuAI({ apiKey: 'sk-test', adapter });
            await generateText({
                client,
                model: 'test-model',
                prompt: 'Test',
                maxSteps: 2,
                tools: {
                    test: {
                        execute: async () => 'result',
                    },
                },
            });

            const secondBody = capturedBodies[1] as { messages: Array<{ role: string; tool_call_id?: string }> };
            const toolResultMsg = secondBody.messages.find((m) => m.role === 'tool');

            // Should have fallback ID
            expect(toolResultMsg?.tool_call_id).toBe('toolcall-0');
        });
    });

    describe('Zod Schema Auto-Conversion', () => {
        it('should auto-convert Zod schema to JSON Schema in tool parameters', async () => {
            const chunks = [
                buildChunk({ content: 'Done' }, null),
                buildChunk({}, 'stop'),
            ];

            let capturedBody: Record<string, unknown> | null = null;
            const adapter = {
                fetch: vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
                    capturedBody = JSON.parse(init.body as string);
                    return createSSEResponse(chunks);
                }),
            };

            // Create a mock Zod-like schema (duck-typed)
            const mockZodSchema = {
                _def: {
                    typeName: 'ZodObject',
                    shape: () => ({
                        city: { _def: { typeName: 'ZodString' } },
                        unit: {
                            _def: {
                                typeName: 'ZodOptional',
                                innerType: {
                                    _def: { typeName: 'ZodString', values: ['c', 'f'] },
                                },
                            },
                        },
                    }),
                },
            };

            const client = new QiniuAI({ apiKey: 'sk-test', adapter });
            await generateText({
                client,
                model: 'test-model',
                prompt: 'Get weather',
                tools: {
                    getWeather: {
                        description: 'Get weather for a city',
                        parameters: mockZodSchema as unknown as Record<string, unknown>,
                        execute: async () => ({ temp: 25 }),
                    },
                },
            });

            const tools = capturedBody!.tools as Array<{ function: { parameters: unknown } }>;
            expect(tools).toHaveLength(1);

            const params = tools[0].function.parameters as Record<string, unknown>;
            expect(params.type).toBe('object');
            expect(params.properties).toBeDefined();
            expect((params.properties as Record<string, unknown>).city).toEqual({ type: 'string' });
            // city should be required (not optional)
            expect((params.required as string[])).toContain('city');
            // unit should NOT be required (it's optional)
            expect((params.required as string[])).not.toContain('unit');
        });

        it('should pass through plain JSON Schema without conversion', async () => {
            const chunks = [
                buildChunk({ content: 'Done' }, null),
                buildChunk({}, 'stop'),
            ];

            let capturedBody: Record<string, unknown> | null = null;
            const adapter = {
                fetch: vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
                    capturedBody = JSON.parse(init.body as string);
                    return createSSEResponse(chunks);
                }),
            };

            const plainJsonSchema = {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                },
                required: ['query'],
            };

            const client = new QiniuAI({ apiKey: 'sk-test', adapter });
            await generateText({
                client,
                model: 'test-model',
                prompt: 'Search',
                tools: {
                    search: {
                        parameters: plainJsonSchema,
                        execute: async () => [],
                    },
                },
            });

            const tools = capturedBody!.tools as Array<{ function: { parameters: unknown } }>;
            expect(tools[0].function.parameters).toEqual(plainJsonSchema);
        });
    });
});
