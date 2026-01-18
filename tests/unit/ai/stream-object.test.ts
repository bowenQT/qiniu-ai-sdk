/**
 * Tests for streamObject.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { streamObject } from '../../../src/ai/stream-object';
import { QiniuAI } from '../../../src';

describe('streamObject', () => {
    let mockClient: QiniuAI;

    beforeEach(() => {
        // Create mock client with both createStream and create (for fallback)
        mockClient = {
            chat: {
                createStream: vi.fn(),
                create: vi.fn(), // For allowFallback to generateObject
            },
            getBaseUrl: () => 'https://api.qiniu.com',
        } as unknown as QiniuAI;
    });

    describe('basic streaming', () => {
        it('should stream partial objects and resolve final object', async () => {
            const schema = z.object({
                title: z.string(),
                count: z.number(),
            });

            // Mock streaming response
            const chunks = [
                { choices: [{ delta: { content: '{"tit' } }] },
                { choices: [{ delta: { content: 'le": "Hello"' } }] },
                { choices: [{ delta: { content: ', "count": 42}' } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } },
            ];

            const mockAsyncIterator = async function* () {
                for (const chunk of chunks) {
                    yield chunk;
                }
            };

            (mockClient.chat.createStream as any).mockResolvedValue(mockAsyncIterator());

            const result = await streamObject({
                client: mockClient,
                model: 'gemini-2.5-flash',
                schema,
                prompt: 'Generate a test object',
            });

            expect(result.streamed).toBe(true);

            // Collect partial objects
            const partials: any[] = [];
            for await (const partial of result.partialObjectStream) {
                partials.push(partial);
            }

            expect(partials.length).toBeGreaterThan(0);

            // Final object should be validated
            const final = await result.object;
            expect(final.title).toBe('Hello');
            expect(final.count).toBe(42);

            // Usage should be captured
            const usage = await result.usage;
            expect(usage?.total_tokens).toBe(30);
        });

        it('should resolve object even without iterating partialObjectStream', async () => {
            const schema = z.object({
                name: z.string(),
            });

            const chunks = [
                { choices: [{ delta: { content: '{"name": "test"}' } }], usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 } },
            ];

            const mockAsyncIterator = async function* () {
                for (const chunk of chunks) {
                    yield chunk;
                }
            };

            (mockClient.chat.createStream as any).mockResolvedValue(mockAsyncIterator());

            const result = await streamObject({
                client: mockClient,
                model: 'gemini-2.5-flash',
                schema,
                prompt: 'Generate name',
            });

            // Don't iterate partialObjectStream, just await object directly
            const final = await result.object;
            expect(final.name).toBe('test');

            const rawText = await result.rawText;
            expect(rawText).toBe('{"name": "test"}');
        });
    });

    describe('validation errors', () => {
        it('should reject with StructuredOutputError on validation failure', async () => {
            const schema = z.object({
                name: z.string(),
                age: z.number(),
            });

            const chunks = [
                { choices: [{ delta: { content: '{"name": "test"}' } }] }, // Missing 'age'
            ];

            const mockAsyncIterator = async function* () {
                for (const chunk of chunks) {
                    yield chunk;
                }
            };

            (mockClient.chat.createStream as any).mockResolvedValue(mockAsyncIterator());

            const result = await streamObject({
                client: mockClient,
                model: 'gemini-2.5-flash',
                schema,
                prompt: 'Generate object',
            });

            // partialObjectStream should also throw on validation failure
            await expect(async () => {
                for await (const _ of result.partialObjectStream) {
                    // consume
                }
            }).rejects.toThrow('Validation failed');

            // object promise should also reject
            await expect(result.object).rejects.toThrow('Validation failed');
        });
    });

    describe('allowFallback', () => {
        it('should throw when stream fails and allowFallback is false', async () => {
            const schema = z.object({ test: z.string() });

            (mockClient.chat.createStream as any).mockRejectedValue(
                Object.assign(new Error('Unsupported response_format'), { status: 400 })
            );

            // With allowFallback: false (default), it should throw
            await expect(
                streamObject({
                    client: mockClient,
                    model: 'test-model-no-fallback',
                    schema,
                    prompt: 'test',
                    allowFallback: false,
                })
            ).rejects.toThrow();
        });

        it('should fall back to generateObject when stream fails with allowFallback', async () => {
            const schema = z.object({ name: z.string() });

            // Mock createStream to fail
            (mockClient.chat.createStream as any).mockRejectedValue(
                Object.assign(new Error('Unsupported response_format'), { status: 400 })
            );

            // Mock chat.create for generateObject fallback
            (mockClient.chat.create as any).mockResolvedValue({
                choices: [{ message: { content: '{"name": "fallback"}' }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
            });

            const result = await streamObject({
                client: mockClient,
                model: 'test-model-with-fallback',
                schema,
                prompt: 'test',
                allowFallback: true,
            });

            expect(result.streamed).toBe(false);
            const final = await result.object;
            expect(final.name).toBe('fallback');
        });
    });
});
