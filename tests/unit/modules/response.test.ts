/**
 * TDD RED: Response API module tests for Phase 3
 */
import { describe, it, expect } from 'vitest';
import { QiniuAI } from '../../../src/client';
import {
    extractResponseOutputMessages,
    extractResponseOutputText,
    extractResponseReasoningSummaryText,
    parseResponseOutputJson,
    toChatCompletionResponse,
} from '../../../src/modules/response';
import { createSSEResponse, createStaticMockFetch } from '../../mocks/fetch';

async function collectStream<T, R>(generator: AsyncGenerator<T, R, unknown>): Promise<{ events: T[]; result: R }> {
    const events: T[] = [];

    while (true) {
        const next = await generator.next();
        if (next.done) {
            return { events, result: next.value };
        }
        events.push(next.value);
    }
}

describe('Phase 3: Response API Module (@experimental)', () => {
    it('should have a response property on client', () => {
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
        });
        expect(client.response).toBeDefined();
    });

    it('should create a response via /v1/llm/v1/responses', async () => {
        const mockResponse = {
            id: 'resp-abc123',
            object: 'response',
            created_at: 1234567890,
            status: 'completed',
            output: [
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'Hello!' }],
                },
            ],
            reasoning: {
                effort: 'high',
                encrypted_content: 'enc_abc_123',
            },
        };

        const mockFetch = createStaticMockFetch({ status: 200, body: mockResponse });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.response.create({
            model: 'openai/gpt-5',
            input: 'Hi',
        });

        expect(result.id).toBe('resp-abc123');
        expect(result.status).toBe('completed');
        expect(result.output_text).toBe('Hello!');
        expect(result.reasoning?.encrypted_content).toBe('enc_abc_123');
        expect(mockFetch.calls[0].url).toContain('/llm/v1/responses?api-version=2025-04-01-preview');
    });

    it('should preserve backend-provided output_text when present', async () => {
        const mockResponse = {
            id: 'resp-server-text',
            status: 'completed',
            output_text: 'Server projection',
            output: [
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'Derived projection' }],
                },
            ],
        };

        const mockFetch = createStaticMockFetch({ status: 200, body: mockResponse });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.response.create({
            model: 'openai/gpt-5',
            input: 'Hi',
        });

        expect(result.output_text).toBe('Server projection');
    });

    it('should create a follow-up response using previousResponseId convenience input', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-follow-up',
                status: 'completed',
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Follow-up answer' }],
                    },
                ],
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.response.followUp({
            previousResponseId: 'resp-prev',
            model: 'gpt-5.2',
            input: 'Continue the earlier answer.',
            store: true,
        });

        expect(result.id).toBe('resp-follow-up');
        expect(result.output_text).toBe('Follow-up answer');
        expect(JSON.parse(String(mockFetch.calls[0].init?.body))).toMatchObject({
            model: 'gpt-5.2',
            input: 'Continue the earlier answer.',
            previous_response_id: 'resp-prev',
            store: true,
        });
    });

    it('should create a projected chat completion directly from Response API', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-chat-direct',
                created_at: 1770773311,
                model: 'gpt-5.2',
                status: 'completed',
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Projected direct answer' }],
                    },
                ],
                usage: {
                    input_tokens: 10,
                    output_tokens: 6,
                    total_tokens: 16,
                },
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.response.createChatCompletion({
            model: 'gpt-5.2',
            input: 'Hello',
        });

        expect(result).toEqual({
            id: 'resp-chat-direct',
            object: 'chat.completion',
            created: 1770773311,
            model: 'gpt-5.2',
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: 'Projected direct answer',
                    },
                    finish_reason: 'stop',
                },
            ],
            usage: {
                prompt_tokens: 10,
                completion_tokens: 6,
                total_tokens: 16,
            },
        });
    });

    it('should return both raw response and projected chat completion via createChatCompletionResult()', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-chat-result',
                created_at: 1770773313,
                model: 'gpt-5.2',
                status: 'completed',
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Projected result answer' }],
                    },
                ],
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.createChatCompletionResult({
            model: 'gpt-5.2',
            input: 'Hello',
        })).resolves.toEqual({
            response: expect.objectContaining({
                id: 'resp-chat-result',
                status: 'completed',
                output_text: 'Projected result answer',
            }),
            completion: {
                id: 'resp-chat-result',
                object: 'chat.completion',
                created: 1770773313,
                model: 'gpt-5.2',
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: 'Projected result answer',
                        },
                        finish_reason: 'stop',
                    },
                ],
            },
        });
    });

    it('should create a projected follow-up chat completion directly from Response API', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-chat-follow-up',
                created_at: 1770773312,
                model: 'gpt-5.2',
                status: 'completed',
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Follow-up projected answer' }],
                    },
                ],
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.response.followUpChatCompletion({
            previousResponseId: 'resp-prev',
            model: 'gpt-5.2',
            input: 'Continue',
        });

        expect(result.choices[0]?.message).toEqual({
            role: 'assistant',
            content: 'Follow-up projected answer',
        });
        expect(JSON.parse(String(mockFetch.calls[0].init?.body))).toMatchObject({
            previous_response_id: 'resp-prev',
        });
    });

    it('should return both raw response and projected follow-up chat completion', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-chat-follow-up-result',
                created_at: 1770773314,
                model: 'gpt-5.2',
                status: 'completed',
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Follow-up projected result' }],
                    },
                ],
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.followUpChatCompletionResult({
            previousResponseId: 'resp-prev',
            model: 'gpt-5.2',
            input: 'Continue',
        })).resolves.toEqual({
            response: expect.objectContaining({
                id: 'resp-chat-follow-up-result',
                status: 'completed',
                output_text: 'Follow-up projected result',
            }),
            completion: {
                id: 'resp-chat-follow-up-result',
                object: 'chat.completion',
                created: 1770773314,
                model: 'gpt-5.2',
                choices: [
                    {
                        index: 0,
                        message: {
                            role: 'assistant',
                            content: 'Follow-up projected result',
                        },
                        finish_reason: 'stop',
                    },
                ],
            },
        });
    });

    it('should create projected output text directly from Response API', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-text-direct',
                status: 'completed',
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Direct text helper' }],
                    },
                ],
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.createText({
            model: 'gpt-5.2',
            input: 'Hello',
        })).resolves.toBe('Direct text helper');
    });

    it('should return both raw response and projected output text via createTextResult()', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-text-result',
                status: 'completed',
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Text result helper' }],
                    },
                ],
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.createTextResult({
            model: 'gpt-5.2',
            input: 'Hello',
        })).resolves.toEqual({
            response: expect.objectContaining({
                id: 'resp-text-result',
                status: 'completed',
                output_text: 'Text result helper',
            }),
            outputText: 'Text result helper',
        });
    });

    it('should create structured JSON directly from Response API', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-json-direct',
                status: 'completed',
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: '{"answer":42,"ok":true}' }],
                    },
                ],
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.createJson<{ answer: number; ok: boolean }>({
            model: 'gpt-5.2',
            input: 'Return JSON',
        })).resolves.toEqual({ answer: 42, ok: true });

        expect(JSON.parse(String(mockFetch.calls[0].init?.body))).toMatchObject({
            text: {
                format: {
                    type: 'json_object',
                },
            },
        });
    });

    it('should return both raw response and parsed JSON via createJsonResult()', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-json-result',
                status: 'completed',
                output_text: '{"answer":"ok"}',
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.createJsonResult<{ answer: string }>({
            model: 'gpt-5.2',
            input: 'Return JSON result',
        })).resolves.toEqual({
            response: expect.objectContaining({
                id: 'resp-json-result',
                status: 'completed',
                output_text: '{"answer":"ok"}',
            }),
            json: { answer: 'ok' },
        });
    });

    it('should create projected output messages directly from Response API', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-messages-direct',
                status: 'completed',
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [
                            { type: 'output_text', text: 'Look at this file.' },
                            { type: 'file_url', file_url: { url: 'https://example.com/file.pdf' } },
                        ],
                    },
                ],
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.createMessages({
            model: 'gpt-5.2',
            input: 'Hello',
        })).resolves.toEqual([
            {
                role: 'assistant',
                content: [
                    { type: 'text', text: 'Look at this file.' },
                    { type: 'file_url', file_url: { url: 'https://example.com/file.pdf' } },
                ],
            },
        ]);
    });

    it('should return both raw response and projected output messages via followUpMessagesResult()', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-messages-result',
                status: 'completed',
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Follow-up message helper' }],
                    },
                ],
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.followUpMessagesResult({
            previousResponseId: 'resp-prev',
            model: 'gpt-5.2',
            input: 'Continue',
        })).resolves.toEqual({
            response: expect.objectContaining({
                id: 'resp-messages-result',
                status: 'completed',
                output_text: 'Follow-up message helper',
            }),
            messages: [
                {
                    role: 'assistant',
                    content: 'Follow-up message helper',
                },
            ],
        });
    });

    it('should create projected reasoning summary text directly from Response API', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-reasoning-direct',
                status: 'completed',
                output: [
                    {
                        type: 'reasoning',
                        summary: [{ type: 'summary_text', text: 'Reasoning summary' }],
                    },
                ],
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.createReasoningSummaryText({
            model: 'gpt-5.2',
            input: 'Hello',
        })).resolves.toBe('Reasoning summary');
    });

    it('should return both raw response and projected reasoning summary text via followUpReasoningSummaryTextResult()', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-reasoning-result',
                status: 'completed',
                output: [
                    {
                        type: 'reasoning',
                        summary: [{ type: 'summary_text', text: 'Follow-up reasoning summary' }],
                    },
                ],
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.followUpReasoningSummaryTextResult({
            previousResponseId: 'resp-prev',
            model: 'gpt-5.2',
            input: 'Continue',
        })).resolves.toEqual({
            response: expect.objectContaining({
                id: 'resp-reasoning-result',
                status: 'completed',
            }),
            reasoningSummaryText: 'Follow-up reasoning summary',
        });
    });

    it('should create projected follow-up helpers directly from Response API', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-follow-up-helper',
                status: 'completed',
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Follow-up helper answer' }],
                    },
                ],
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.followUpText({
            previousResponseId: 'resp-prev',
            model: 'gpt-5.2',
            input: 'Continue',
        })).resolves.toBe('Follow-up helper answer');

        expect(JSON.parse(String(mockFetch.calls[0].init?.body))).toMatchObject({
            previous_response_id: 'resp-prev',
        });
    });

    it('should preserve explicit JSON format when creating structured JSON follow-ups', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-json-follow-up',
                status: 'completed',
                output_text: '{"status":"ok"}',
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.followUpJson<{ status: string }>({
            previousResponseId: 'resp-prev',
            model: 'gpt-5.2',
            input: 'Continue with JSON',
            text: {
                format: {
                    type: 'json_schema',
                    name: 'follow_up_payload',
                    schema: {
                        type: 'object',
                        properties: {
                            status: { type: 'string' },
                        },
                        required: ['status'],
                    },
                },
            },
        })).resolves.toEqual({ status: 'ok' });

        expect(JSON.parse(String(mockFetch.calls[0].init?.body))).toMatchObject({
            previous_response_id: 'resp-prev',
            text: {
                format: {
                    type: 'json_schema',
                    name: 'follow_up_payload',
                },
            },
        });
    });

    it('should return both raw response and parsed JSON via followUpJsonResult()', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-json-follow-up-result',
                status: 'completed',
                output_text: '{"continued":true}',
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.followUpJsonResult<{ continued: boolean }>({
            previousResponseId: 'resp-prev',
            model: 'gpt-5.2',
            input: 'Continue with JSON result',
        })).resolves.toEqual({
            response: expect.objectContaining({
                id: 'resp-json-follow-up-result',
                status: 'completed',
                output_text: '{"continued":true}',
            }),
            json: { continued: true },
        });
    });

    it('should throw a helpful error when response JSON output is invalid', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-json-invalid',
                status: 'completed',
                output_text: '{not valid json',
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.response.createJson({
            model: 'gpt-5.2',
            input: 'Return malformed JSON',
        })).rejects.toThrow('did not contain valid JSON output text');
    });

    it('should stream raw response events and accumulate output text', async () => {
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: {
                fetch: async (url, init) => {
                    calls.push({ url, init });
                    return createSSEResponse([
                        { type: 'response.output_text.delta', delta: 'Hello' },
                        { type: 'response.output_text.delta', delta: ', stream' },
                        {
                            type: 'response.completed',
                            response: {
                                id: 'resp-stream',
                                status: 'completed',
                                output: [
                                    {
                                        type: 'message',
                                        role: 'assistant',
                                        content: [{ type: 'output_text', text: 'Hello, stream' }],
                                    },
                                ],
                            },
                        },
                    ]);
                },
            },
        });

        const { events, result } = await collectStream(client.response.createStream({
            model: 'gpt-5.2',
            input: 'Stream please',
        }));

        expect(events).toHaveLength(3);
        expect(events.map((event: any) => event.type)).toEqual([
            'response.output_text.delta',
            'response.output_text.delta',
            'response.completed',
        ]);
        expect(result.outputText).toBe('Hello, stream');
        expect(result.eventCount).toBe(3);
        expect(result.response?.id).toBe('resp-stream');
        expect(calls[0]?.url).toContain('/llm/v1/responses?api-version=2025-04-01-preview');
        expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
            model: 'gpt-5.2',
            input: 'Stream please',
            stream: true,
        });
    });

    it('should stream follow-up responses using previousResponseId convenience input', async () => {
        const calls: Array<{ url: string; init?: RequestInit }> = [];
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: {
                fetch: async (url, init) => {
                    calls.push({ url, init });
                    return createSSEResponse([
                        { type: 'response.output_text.delta', delta: 'Follow-up' },
                    ]);
                },
            },
        });

        const { result } = await collectStream(client.response.followUpStream({
            previousResponseId: 'resp-prev',
            model: 'gpt-5.2',
            input: 'Continue',
        }));

        expect(result.outputText).toBe('Follow-up');
        expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
            previous_response_id: 'resp-prev',
            stream: true,
        });
    });

    it('should stream output text deltas directly for text-first consumption', async () => {
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: {
                fetch: async () => createSSEResponse([
                    { type: 'response.created' },
                    { type: 'response.output_text.delta', delta: 'Hello' },
                    { type: 'response.output_text.delta', delta: ', world' },
                ]),
            },
        });

        const { events, result } = await collectStream(client.response.createTextStream({
            model: 'gpt-5.2',
            input: 'Hello',
        }));

        expect(events).toEqual(['Hello', ', world']);
        expect(result.outputText).toBe('Hello, world');
        expect(result.eventCount).toBe(3);
    });

    it('should stream partial JSON snapshots and return final parsed JSON', async () => {
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: {
                fetch: async () => createSSEResponse([
                    { type: 'response.output_text.delta', delta: '{"answer":42' },
                    { type: 'response.output_text.delta', delta: ',"nested":{"ok":true}}' },
                    {
                        type: 'response.completed',
                        response: {
                            id: 'resp-json-stream',
                            status: 'completed',
                            output_text: '{"answer":42,"nested":{"ok":true}}',
                        },
                    },
                ]),
            },
        });

        const { events, result } = await collectStream(client.response.createJsonStream<{
            answer: number;
            nested: { ok: boolean };
        }>({
            model: 'gpt-5.2',
            input: 'Return streaming JSON',
        }));

        expect(events).toEqual([
            { answer: 42 },
            { answer: 42, nested: { ok: true } },
        ]);
        expect(result.outputText).toBe('{"answer":42,"nested":{"ok":true}}');
        expect(result.json).toEqual({ answer: 42, nested: { ok: true } });
        expect(result.response?.id).toBe('resp-json-stream');
    });

    it('should stream follow-up output text deltas directly', async () => {
        const calls: Array<{ init?: RequestInit }> = [];
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: {
                fetch: async (_url, init) => {
                    calls.push({ init });
                    return createSSEResponse([
                        { type: 'response.output_text.delta', delta: 'Follow-up chunk' },
                    ]);
                },
            },
        });

        const { events } = await collectStream(client.response.followUpTextStream({
            previousResponseId: 'resp-prev',
            model: 'gpt-5.2',
            input: 'Continue',
        }));

        expect(events).toEqual(['Follow-up chunk']);
        expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
            previous_response_id: 'resp-prev',
            stream: true,
        });
    });

    it('should stream partial JSON snapshots for follow-up responses', async () => {
        const calls: Array<{ init?: RequestInit }> = [];
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: {
                fetch: async (_url, init) => {
                    calls.push({ init });
                    return createSSEResponse([
                        { type: 'response.output_text.delta', delta: '{"continued":' },
                        { type: 'response.output_text.delta', delta: 'true}' },
                        {
                            type: 'response.completed',
                            response: {
                                id: 'resp-json-follow-up-stream',
                                status: 'completed',
                                output_text: '{"continued":true}',
                            },
                        },
                    ]);
                },
            },
        });

        const { events, result } = await collectStream(client.response.followUpJsonStream<{
            continued: boolean;
        }>({
            previousResponseId: 'resp-prev',
            model: 'gpt-5.2',
            input: 'Continue with streaming JSON',
        }));

        expect(events).toEqual([{ continued: true }]);
        expect(result.json).toEqual({ continued: true });
        expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
            previous_response_id: 'resp-prev',
            text: {
                format: {
                    type: 'json_object',
                },
            },
            stream: true,
        });
    });

    it('should project response streams into chat-completion chunks', async () => {
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: {
                fetch: async () => createSSEResponse([
                    {
                        type: 'response.created',
                        response: {
                            id: 'resp-stream-chat',
                            created_at: 1770774000,
                            model: 'gpt-5.2',
                        },
                    },
                    { type: 'response.output_text.delta', delta: 'Hello' },
                    { type: 'response.output_text.delta', delta: ', world' },
                    {
                        type: 'response.completed',
                        response: {
                            id: 'resp-stream-chat',
                            created_at: 1770774000,
                            model: 'gpt-5.2',
                            status: 'completed',
                            usage: {
                                input_tokens: 10,
                                output_tokens: 4,
                                total_tokens: 14,
                            },
                            output: [
                                {
                                    type: 'message',
                                    role: 'assistant',
                                    content: [{ type: 'output_text', text: 'Hello, world' }],
                                },
                            ],
                        },
                    },
                ]),
            },
        });

        const { events, result } = await collectStream(client.response.createChatCompletionStream({
            model: 'gpt-5.2',
            input: 'Hello',
        }));

        expect(events).toEqual([
            {
                id: 'resp-stream-chat',
                object: 'chat.completion.chunk',
                created: 1770774000,
                model: 'gpt-5.2',
                choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
                usage: undefined,
            },
            {
                id: 'resp-stream-chat',
                object: 'chat.completion.chunk',
                created: 1770774000,
                model: 'gpt-5.2',
                choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
                usage: undefined,
            },
            {
                id: 'resp-stream-chat',
                object: 'chat.completion.chunk',
                created: 1770774000,
                model: 'gpt-5.2',
                choices: [{ index: 0, delta: { content: ', world' }, finish_reason: null }],
                usage: undefined,
            },
            {
                id: 'resp-stream-chat',
                object: 'chat.completion.chunk',
                created: 1770774000,
                model: 'gpt-5.2',
                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 4,
                    total_tokens: 14,
                },
            },
        ]);
        expect(result.outputText).toBe('Hello, world');
        expect(result.completion?.choices[0]?.message).toEqual({
            role: 'assistant',
            content: 'Hello, world',
        });
    });

    it('should project follow-up response streams into chat-completion chunks', async () => {
        const calls: Array<{ init?: RequestInit }> = [];
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: {
                fetch: async (_url, init) => {
                    calls.push({ init });
                    return createSSEResponse([
                        { type: 'response.output_text.delta', delta: 'Follow-up chunk' },
                    ]);
                },
            },
        });

        const { events, result } = await collectStream(client.response.followUpChatCompletionStream({
            previousResponseId: 'resp-prev',
            model: 'gpt-5.2',
            input: 'Continue',
        }));

        expect(events).toEqual([
            {
                id: 'response-stream',
                object: 'chat.completion.chunk',
                created: expect.any(Number),
                model: 'gpt-5.2',
                choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
                usage: undefined,
            },
            {
                id: 'response-stream',
                object: 'chat.completion.chunk',
                created: expect.any(Number),
                model: 'gpt-5.2',
                choices: [{ index: 0, delta: { content: 'Follow-up chunk' }, finish_reason: null }],
                usage: undefined,
            },
        ]);
        expect(result.outputText).toBe('Follow-up chunk');
        expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
            previous_response_id: 'resp-prev',
            stream: true,
        });
    });

    it('should fall back to completed response output_text when no delta events are emitted', async () => {
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: {
                fetch: async () => createSSEResponse([
                    {
                        type: 'response.completed',
                        response: {
                            id: 'resp-no-delta',
                            created_at: 1770774001,
                            model: 'gpt-5.2',
                            status: 'completed',
                            output_text: 'Completed only',
                        },
                    },
                ]),
            },
        });

        const { events, result } = await collectStream(client.response.createChatCompletionStream({
            model: 'gpt-5.2',
            input: 'Hello',
        }));

        expect(events).toEqual([
            {
                id: 'resp-no-delta',
                object: 'chat.completion.chunk',
                created: 1770774001,
                model: 'gpt-5.2',
                choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
                usage: undefined,
            },
            {
                id: 'resp-no-delta',
                object: 'chat.completion.chunk',
                created: 1770774001,
                model: 'gpt-5.2',
                choices: [{ index: 0, delta: { content: 'Completed only' }, finish_reason: null }],
                usage: undefined,
            },
            {
                id: 'resp-no-delta',
                object: 'chat.completion.chunk',
                created: 1770774001,
                model: 'gpt-5.2',
                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                usage: undefined,
            },
        ]);
        expect(result.completion?.choices[0]?.message).toEqual({
            role: 'assistant',
            content: 'Completed only',
        });
    });

    it('should accept multimodal response input messages', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: { id: 'resp-1', status: 'completed' },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await client.response.create({
            model: 'openai/gpt-5',
            input: [
                {
                    role: 'developer',
                    content: [
                        {
                            type: 'text',
                            text: 'Prefer concise answers.',
                            cache_control: { type: 'ephemeral' },
                        },
                    ],
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Analyze these inputs' },
                        { type: 'file_url', file_url: { url: 'https://example.com/doc.pdf' } },
                        {
                            type: 'input_audio',
                            input_audio: {
                                data: 'YmFzZTY0LWF1ZGlv',
                                format: 'mp3',
                            },
                        },
                    ],
                },
            ],
        });

        const body = JSON.parse(String(mockFetch.calls[0].init?.body));
        expect(body.input[0].role).toBe('developer');
        expect(body.input[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
        expect(body.input[1].content[1]).toEqual({
            type: 'file_url',
            file_url: { url: 'https://example.com/doc.pdf' },
        });
        expect(body.input[1].content[2].input_audio.format).toBe('mp3');
    });

    it('should forward documented preview request fields', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: { id: 'resp-preview', status: 'completed' },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await client.response.create({
            model: 'gpt-5.2',
            input: 'Hello',
            stream: false,
            include: ['reasoning.encrypted_content'],
            previous_response_id: 'resp-prev',
            store: true,
            background: false,
            parallel_tool_calls: true,
            truncation: 'disabled',
            user: 'user-123',
            metadata: { trace: 'abc' },
            top_p: 0.98,
            text: {
                format: { type: 'text' },
                verbosity: 'medium',
            },
        });

        const body = JSON.parse(String(mockFetch.calls[0].init?.body));
        expect(body).toMatchObject({
            model: 'gpt-5.2',
            input: 'Hello',
            stream: false,
            include: ['reasoning.encrypted_content'],
            previous_response_id: 'resp-prev',
            store: true,
            background: false,
            parallel_tool_calls: true,
            truncation: 'disabled',
            user: 'user-123',
            metadata: { trace: 'abc' },
            top_p: 0.98,
            text: {
                format: { type: 'text' },
                verbosity: 'medium',
            },
        });
    });

    it('should normalize image sugar content in response inputs', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: { id: 'resp-2', status: 'completed' },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await client.response.create({
            model: 'openai/gpt-5',
            input: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            image: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
                            cache_control: { type: 'ephemeral' },
                        },
                    ],
                },
            ],
        });

        const body = JSON.parse(String(mockFetch.calls[0].init?.body));
        expect(body.input[0].content[0]).toEqual({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,iVBORw==' },
            cache_control: { type: 'ephemeral' },
        });
    });

    it('should normalize Blob image sugar content in response inputs', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: { id: 'resp-3', status: 'completed' },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await client.response.create({
            model: 'openai/gpt-5',
            input: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            image: new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
                        },
                    ],
                },
            ],
        });

        const body = JSON.parse(String(mockFetch.calls[0].init?.body));
        expect(body.input[0].content[0]).toEqual({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,iVBORw==' },
        });
    });

    it('should extract concatenated text from response outputs', () => {
        expect(extractResponseOutputText({
            output: [
                {
                    type: 'message',
                    content: [
                        { type: 'output_text', text: 'Hello' },
                        { type: 'output_text', text: ', world' },
                    ],
                },
                {
                    type: 'message',
                    content: [
                        { type: 'output_text', text: '!' },
                    ],
                },
            ],
        } as any)).toBe('Hello, world!');

        expect(extractResponseOutputText({
            output: [
                {
                    type: 'message',
                    content: [
                        { type: 'image', image_url: { url: 'https://example.com/image.png' } },
                    ],
                },
            ],
        } as any)).toBeUndefined();
    });

    it('should extract reasoning summary text from response outputs', () => {
        expect(extractResponseReasoningSummaryText({
            output: [
                {
                    type: 'reasoning',
                    summary: [
                        { type: 'summary_text', text: 'First summary' },
                        { type: 'summary_text', text: 'Second summary' },
                    ],
                },
            ],
        } as any)).toBe('First summary\n\nSecond summary');
    });

    it('should extract chat-style messages from response outputs', () => {
        expect(extractResponseOutputMessages({
            output: [
                {
                    type: 'reasoning',
                    summary: [{ type: 'summary_text', text: 'Ignored for message extraction' }],
                },
                {
                    type: 'message',
                    role: 'assistant',
                    thinking_blocks: [{ type: 'thinking', thinking: 'plan' }],
                    images: [{ type: 'image', image_url: { url: 'https://example.com/image.png' } }],
                    content: [
                        { type: 'output_text', text: 'Look at this image.' },
                        { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
                    ],
                },
                {
                    type: 'message',
                    role: 'assistant',
                    content: [
                        { type: 'output_text', text: 'Hello' },
                        { type: 'output_text', text: ', world' },
                    ],
                },
            ],
        } as any)).toEqual([
            {
                role: 'assistant',
                content: [
                    { type: 'text', text: 'Look at this image.' },
                    { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
                ],
                thinking_blocks: [{ type: 'thinking', thinking: 'plan' }],
                images: [{ type: 'image', image_url: { url: 'https://example.com/image.png' } }],
            },
            {
                role: 'assistant',
                content: 'Hello, world',
            },
        ]);
    });

    it('should project Response API payloads into chat-completion shape', () => {
        expect(toChatCompletionResponse({
            id: 'resp-chat-projection',
            created_at: 1770773311,
            model: 'gpt-5.2',
            status: 'completed',
            output_text: 'Server projection',
            output: [
                {
                    type: 'message',
                    role: 'assistant',
                    content: [
                        { type: 'output_text', text: 'Projected assistant answer' },
                    ],
                },
            ],
            usage: {
                input_tokens: 20,
                output_tokens: 12,
                total_tokens: 32,
            },
        })).toEqual({
            id: 'resp-chat-projection',
            object: 'chat.completion',
            created: 1770773311,
            model: 'gpt-5.2',
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: 'Projected assistant answer',
                    },
                    finish_reason: 'stop',
                },
            ],
            usage: {
                prompt_tokens: 20,
                completion_tokens: 12,
                total_tokens: 32,
            },
        });
    });

    it('should fall back to output_text when projecting responses without message outputs', () => {
        expect(toChatCompletionResponse({
            id: 'resp-text-only',
            status: 'in_progress',
            output_text: 'Fallback text',
        } as any)).toEqual({
            id: 'resp-text-only',
            object: 'chat.completion',
            created: 0,
            model: '',
            choices: [
                {
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: 'Fallback text',
                    },
                    finish_reason: null,
                },
            ],
            usage: undefined,
        });
    });

    it('should parse projected response output text as JSON', () => {
        expect(parseResponseOutputJson<{ hello: string }>({
            id: 'resp-json-helper',
            output_text: '{"hello":"world"}',
        })).toEqual({ hello: 'world' });
    });

    it('should preserve documented response metadata fields', async () => {
        const mockResponse = {
            id: 'resp-rich',
            object: 'response',
            created_at: 1770773311,
            model: 'gpt-5.2',
            status: 'completed',
            parallel_tool_calls: true,
            previous_response_id: 'resp-prev',
            store: true,
            background: false,
            text: {
                format: { type: 'text' },
                verbosity: 'medium',
            },
            usage: {
                input_tokens: 20,
                output_tokens: 98,
                total_tokens: 118,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 76 },
            },
            output: [
                {
                    id: 'msg_1',
                    type: 'message',
                    role: 'assistant',
                    status: 'completed',
                    content: [{ type: 'output_text', text: 'Hello!' }],
                },
                {
                    id: 'rs_1',
                    type: 'reasoning',
                    status: null,
                    summary: [{ type: 'summary_text', text: 'Reasoned summary' }],
                    encrypted_content: 'enc_123',
                    content: null,
                },
            ],
        };

        const mockFetch = createStaticMockFetch({ status: 200, body: mockResponse });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.response.create({
            model: 'gpt-5.2',
            input: 'Hi',
        });

        expect(result.model).toBe('gpt-5.2');
        expect(result.parallel_tool_calls).toBe(true);
        expect(result.previous_response_id).toBe('resp-prev');
        expect(result.store).toBe(true);
        expect(result.text?.format?.type).toBe('text');
        expect(result.output?.[1].summary?.[0].text).toBe('Reasoned summary');
        expect(result.output?.[1].encrypted_content).toBe('enc_123');
    });
});
