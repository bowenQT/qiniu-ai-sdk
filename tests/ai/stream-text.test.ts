/**
 * Phase 6C RED Tests: streamText + agent.stream
 */
import { describe, it, expect, vi } from 'vitest';
import { streamText, type StreamTextResult } from '../../src/ai/stream-text';
import type { TokenEvent } from '../../src/ai/agent-graph';
import { QiniuAI } from '../../src/client';

// Mock client that yields intermediate chunks
function createChunkingMockClient(responses: Array<{
    chunks: Array<{ content?: string; reasoning_content?: string; tool_calls?: any[] }>;
    finishReason?: string;
}>) {
    let callIndex = 0;

    return {
        chat: {
            async *createStream(request: any) {
                const response = responses[callIndex++] || responses[responses.length - 1];
                for (const chunk of response.chunks) {
                    yield {
                        choices: [{ index: 0, delta: chunk }],
                    };
                }
                const content = response.chunks.map(c => c.content || '').join('');
                const reasoningContent = response.chunks.map(c => c.reasoning_content || '').join('');
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

function createCancelableMockClient() {
    let releaseSecondChunk: (() => void) | undefined;
    const waitForSecondChunk = new Promise<void>((resolve) => {
        releaseSecondChunk = resolve;
    });

    const client = {
        chat: {
            async *createStream() {
                yield {
                    choices: [{ index: 0, delta: { content: 'A' } }],
                };
                await waitForSecondChunk;
                yield {
                    choices: [{ index: 0, delta: { content: 'B' } }],
                };
                return {
                    content: 'AB',
                    reasoningContent: '',
                    toolCalls: [],
                    finishReason: 'stop',
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
                };
            },
        },
    } as any;

    return {
        client,
        releaseSecondChunk: () => releaseSecondChunk?.(),
    };
}

describe('streamText', () => {
    describe('Basic Streaming', () => {
        it('should return StreamTextResult synchronously', () => {
            const client = createChunkingMockClient([
                { chunks: [{ content: 'Hello' }], finishReason: 'stop' },
            ]);

            const result = streamText({
                client,
                model: 'test-model',
                prompt: 'Hi',
            });

            // streamText returns synchronously — not a Promise
            expect(result).toBeDefined();
            expect(result.textStream).toBeDefined();
            expect(result.fullStream).toBeDefined();
            expect(result.reasoningStream).toBeDefined();
            expect(result.text).toBeInstanceOf(Promise);
            expect(result.reasoning).toBeInstanceOf(Promise);
            expect(result.usage).toBeInstanceOf(Promise);
            expect(result.steps).toBeInstanceOf(Promise);
        });

        it('should stream text deltas via textStream', async () => {
            const client = createChunkingMockClient([
                { chunks: [{ content: 'Hello' }, { content: ' world' }], finishReason: 'stop' },
            ]);

            const result = streamText({
                client,
                model: 'test-model',
                prompt: 'Hi',
            });

            const chunks: string[] = [];
            for await (const chunk of result.textStream) {
                chunks.push(chunk);
            }

            expect(chunks).toEqual(['Hello', ' world']);
        });

        it('should stream reasoning deltas via reasoningStream', async () => {
            const client = createChunkingMockClient([
                { chunks: [{ reasoning_content: 'Think...' }, { content: 'Answer' }], finishReason: 'stop' },
            ]);

            const result = streamText({
                client,
                model: 'test-model',
                prompt: 'Think',
            });

            const chunks: string[] = [];
            for await (const chunk of result.reasoningStream) {
                chunks.push(chunk);
            }

            expect(chunks).toEqual(['Think...']);
        });

        it('should resolve text Promise with full text', async () => {
            const client = createChunkingMockClient([
                { chunks: [{ content: 'Hello' }, { content: ' world' }], finishReason: 'stop' },
            ]);

            const result = streamText({
                client,
                model: 'test-model',
                prompt: 'Hi',
            });

            expect(await result.text).toBe('Hello world');
        });

        it('should resolve reasoning Promise with full reasoning', async () => {
            const client = createChunkingMockClient([
                { chunks: [{ reasoning_content: 'Think...' }, { content: 'Answer' }], finishReason: 'stop' },
            ]);

            const result = streamText({
                client,
                model: 'test-model',
                prompt: 'Think',
            });

            expect(await result.reasoning).toBe('Think...');
        });

        it('should resolve usage Promise', async () => {
            const client = createChunkingMockClient([
                { chunks: [{ content: 'Done' }], finishReason: 'stop' },
            ]);

            const result = streamText({
                client,
                model: 'test-model',
                prompt: 'Hi',
            });

            const usage = await result.usage;
            expect(usage).toMatchObject({
                prompt_tokens: 10,
                completion_tokens: 20,
                total_tokens: 30,
            });
        });
    });

    describe('Fan-out: independent cursors', () => {
        it('should allow consuming textStream and fullStream independently', async () => {
            const client = createChunkingMockClient([
                { chunks: [{ content: 'A' }, { content: 'B' }], finishReason: 'stop' },
            ]);

            const result = streamText({
                client,
                model: 'test-model',
                prompt: 'Hi',
            });

            // Consume fullStream
            const fullEvents: TokenEvent[] = [];
            for await (const event of result.fullStream) {
                fullEvents.push(event);
            }

            // fullStream should have all events including finish
            expect(fullEvents.some(e => e.type === 'text-delta')).toBe(true);
            expect(fullEvents.some(e => e.type === 'finish')).toBe(true);

            // text Promise should also resolve
            expect(await result.text).toBe('AB');
        });
    });

    describe('Abort Handling', () => {
        it('should abort background task when all consumers complete via break', async () => {
            const client = createChunkingMockClient([
                { chunks: [{ content: 'A' }, { content: 'B' }, { content: 'C' }], finishReason: 'stop' },
            ]);

            const result = streamText({
                client,
                model: 'test-model',
                prompt: 'Hi',
            });

            // Break after first chunk
            for await (const chunk of result.textStream) {
                if (chunk === 'A') break;
            }

            // text Promise should still resolve (or reject gracefully)
            // The background task is aborted, but we shouldn't crash
            try {
                await result.text;
            } catch {
                // Expected: abort may cause rejection
            }
        });

        it('should support user-provided abortSignal', async () => {
            const controller = new AbortController();
            const client = createChunkingMockClient([
                { chunks: [{ content: 'A' }], finishReason: 'stop' },
            ]);

            const result = streamText({
                client,
                model: 'test-model',
                prompt: 'Hi',
                abortSignal: controller.signal,
            });

            // Don't abort, just let it complete
            expect(await result.text).toBe('A');
        });
    });

    describe('toDataStreamResponse', () => {
        it('should return a Response with SSE content type', async () => {
            const client = createChunkingMockClient([
                { chunks: [{ content: 'Hello' }], finishReason: 'stop' },
            ]);

            const result = streamText({
                client,
                model: 'test-model',
                prompt: 'Hi',
            });

            const response = result.toDataStreamResponse();
            expect(response).toBeInstanceOf(Response);
            expect(response.headers.get('content-type')).toBe('text/event-stream');

            // Should be able to read the response body
            const body = await response.text();
            expect(body.length).toBeGreaterThan(0);
        });

        it('should support custom headers', async () => {
            const client = createChunkingMockClient([
                { chunks: [{ content: 'Hello' }], finishReason: 'stop' },
            ]);

            const result = streamText({
                client,
                model: 'test-model',
                prompt: 'Hi',
            });

            const response = result.toDataStreamResponse({
                headers: { 'X-Custom': 'value' },
            });

            expect(response.headers.get('X-Custom')).toBe('value');
        });

        it('reader.cancel should not abort other active consumers', async () => {
            const { client, releaseSecondChunk } = createCancelableMockClient();

            const result = streamText({
                client,
                model: 'test-model',
                prompt: 'Hi',
            });

            const response = result.toDataStreamResponse();
            const reader = response.body?.getReader();
            expect(reader).toBeDefined();

            const textChunksPromise = (async () => {
                const chunks: string[] = [];
                for await (const chunk of result.textStream) {
                    chunks.push(chunk);
                }
                return chunks;
            })();

            const firstRead = await reader!.read();
            expect(firstRead.done).toBe(false);
            expect(new TextDecoder().decode(firstRead.value)).toContain('"textDelta":"A"');

            await reader!.cancel();
            releaseSecondChunk();

            await expect(textChunksPromise).resolves.toEqual(['A', 'B']);
        });
    });

    describe('Error Propagation', () => {
        it('should propagate guardrail errors to fullStream and text Promise', async () => {
            const client = createChunkingMockClient([
                { chunks: [{ content: 'Bad' }], finishReason: 'stop' },
            ]);

            const result = streamText({
                client,
                model: 'test-model',
                prompt: 'Hi',
                guardrails: [{
                    name: 'block-all',
                    phase: 'post-response' as const,
                    process: async () => ({ action: 'block' as const, reason: 'blocked' }),
                }],
            });

            // fullStream should yield error event then stop
            const events: TokenEvent[] = [];
            try {
                for await (const event of result.fullStream) {
                    events.push(event);
                }
            } catch {
                // Expected
            }

            expect(events.some(e => e.type === 'error')).toBe(true);

            // text Promise should reject
            await expect(result.text).rejects.toThrow();
        });
    });
});
