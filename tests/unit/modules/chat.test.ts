import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createStaticMockFetch, createSSEResponse } from '../../mocks/fetch';

describe('Chat Module', () => {
    describe('create()', () => {
        it('should throw error if stream is set to true', async () => {
            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
            });

            await expect(
                client.chat.create({
                    model: 'test-model',
                    messages: [{ role: 'user', content: 'Hi' }],
                    stream: true,
                })
            ).rejects.toThrow('For streaming, use chat.createStream()');
        });

        it('should make non-streaming chat completion request', async () => {
            const mockResponse = {
                id: 'chat-123',
                object: 'chat.completion',
                created: 1234567890,
                model: 'test-model',
                choices: [
                    {
                        index: 0,
                        message: { role: 'assistant', content: 'Hello!' },
                        finish_reason: 'stop',
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                    total_tokens: 15,
                },
            };

            const mockFetch = createStaticMockFetch({
                status: 200,
                body: mockResponse,
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.chat.create({
                model: 'test-model',
                messages: [{ role: 'user', content: 'Hi' }],
            });

            expect(result.id).toBe('chat-123');
            expect(result.choices[0].message.content).toBe('Hello!');
            expect(result.usage?.total_tokens).toBe(15);
        });

        it('should preserve cache_control when normalizing image sugar content', async () => {
            const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
                id: 'chat-124',
                object: 'chat.completion',
                created: 1234567890,
                model: 'test-model',
                choices: [
                    {
                        index: 0,
                        message: { role: 'assistant', content: 'ok' },
                        finish_reason: 'stop',
                    },
                ],
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: { fetch },
            });

            await client.chat.create({
                model: 'test-model',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                image: 'https://example.com/image.jpg',
                                cache_control: { type: 'ephemeral' },
                            } as any,
                        ],
                    },
                ],
            });

            const init = fetch.mock.calls[0]?.[1] as RequestInit;
            const body = JSON.parse(String(init.body));
            expect(body.messages[0].content[0]).toEqual({
                type: 'image_url',
                image_url: { url: 'https://example.com/image.jpg' },
                cache_control: { type: 'ephemeral' },
            });
        });

        it('should normalize Blob image sugar content for non-streaming chat requests', async () => {
            const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
                id: 'chat-125',
                object: 'chat.completion',
                created: 1234567890,
                model: 'test-model',
                choices: [
                    {
                        index: 0,
                        message: { role: 'assistant', content: 'ok' },
                        finish_reason: 'stop',
                    },
                ],
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: { fetch },
            });

            await client.chat.create({
                model: 'test-model',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                image: new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
                            } as any,
                        ],
                    },
                ],
            });

            const init = fetch.mock.calls[0]?.[1] as RequestInit;
            const body = JSON.parse(String(init.body));
            expect(body.messages[0].content[0]).toEqual({
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,iVBORw==' },
            });
        });
    });

    describe('createStream()', () => {
        it('should yield chunks from SSE stream', async () => {
            const chunks = [
                {
                    id: 'chat-123',
                    object: 'chat.completion.chunk',
                    created: 1234567890,
                    model: 'test-model',
                    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
                },
                {
                    id: 'chat-123',
                    object: 'chat.completion.chunk',
                    created: 1234567890,
                    model: 'test-model',
                    choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
                },
                {
                    id: 'chat-123',
                    object: 'chat.completion.chunk',
                    created: 1234567890,
                    model: 'test-model',
                    choices: [{ index: 0, delta: { content: ' world!' }, finish_reason: null }],
                },
                {
                    id: 'chat-123',
                    object: 'chat.completion.chunk',
                    created: 1234567890,
                    model: 'test-model',
                    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                },
            ];

            // Create a mock adapter that returns SSE response
            const sseResponse = createSSEResponse(chunks);
            const mockAdapter = {
                fetch: vi.fn().mockResolvedValue(sseResponse),
            };

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockAdapter,
            });

            const receivedChunks: unknown[] = [];
            const stream = client.chat.createStream({
                model: 'test-model',
                messages: [{ role: 'user', content: 'Hi' }],
            });

            for await (const chunk of stream) {
                receivedChunks.push(chunk);
            }

            expect(receivedChunks).toHaveLength(4);
            expect(receivedChunks[1]).toMatchObject({
                choices: [{ delta: { content: 'Hello' } }],
            });
            expect(receivedChunks[2]).toMatchObject({
                choices: [{ delta: { content: ' world!' } }],
            });
        });

        it('should accumulate content from delta chunks', async () => {
            const chunks = [
                {
                    id: 'chat-123',
                    object: 'chat.completion.chunk',
                    created: 1234567890,
                    model: 'test-model',
                    choices: [{ index: 0, delta: { content: 'A' }, finish_reason: null }],
                },
                {
                    id: 'chat-123',
                    object: 'chat.completion.chunk',
                    created: 1234567890,
                    model: 'test-model',
                    choices: [{ index: 0, delta: { content: 'B' }, finish_reason: null }],
                },
                {
                    id: 'chat-123',
                    object: 'chat.completion.chunk',
                    created: 1234567890,
                    model: 'test-model',
                    choices: [{ index: 0, delta: { content: 'C' }, finish_reason: 'stop' }],
                },
            ];

            const sseResponse = createSSEResponse(chunks);
            const mockAdapter = {
                fetch: vi.fn().mockResolvedValue(sseResponse),
            };

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockAdapter,
            });

            let fullContent = '';
            for await (const chunk of client.chat.createStream({
                model: 'test-model',
                messages: [{ role: 'user', content: 'Hi' }],
            })) {
                if (chunk.choices[0]?.delta?.content) {
                    fullContent += chunk.choices[0].delta.content;
                }
            }

            expect(fullContent).toBe('ABC');
        });

        it('should normalize Blob image sugar content for streaming chat requests', async () => {
            const sseResponse = createSSEResponse([
                {
                    id: 'chat-126',
                    object: 'chat.completion.chunk',
                    created: 1234567890,
                    model: 'test-model',
                    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
                },
            ]);
            const fetch = vi.fn().mockResolvedValue(sseResponse);

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: { fetch },
            });

            for await (const _chunk of client.chat.createStream({
                model: 'test-model',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                image: new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
                            } as any,
                        ],
                    },
                ],
            })) {
                // consume
            }

            const init = fetch.mock.calls[0]?.[1] as RequestInit;
            const body = JSON.parse(String(init.body));
            expect(body.messages[0].content[0]).toEqual({
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,iVBORw==' },
            });
        });
    });
});
