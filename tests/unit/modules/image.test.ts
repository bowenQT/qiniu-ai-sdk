import { describe, it, expect, vi } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createMockFetch, createStaticMockFetch } from '../../mocks/fetch';

describe('Image Module', () => {
    describe('create()', () => {
        it('should create image generation task', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { task_id: 'task-123' },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.image.create({
                model: 'kling-v1',
                prompt: 'A beautiful sunset',
            });

            expect(result.task_id).toBe('task-123');
            expect(mockFetch.calls[0].url).toContain('/images/generations');
        });

        it('should throw when model returns sync response', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { data: [{ index: 0, b64_json: 'abc' }] },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            await expect(
                client.image.create({
                    model: 'gemini-2.5-flash-image',
                    prompt: 'A cat',
                })
            ).rejects.toThrow('Please use image.generate()');
        });
    });

    describe('generate()', () => {
        it('should return sync response for gemini-like payload', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    created: 123456,
                    data: [{ index: 0, b64_json: 'abc' }],
                    output_format: 'png',
                    usage: { total_tokens: 10, input_tokens: 2, output_tokens: 8 },
                },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.image.generate({
                model: 'gemini-2.5-flash-image',
                prompt: 'A cat',
            });

            expect(result.isSync).toBe(true);
            if (result.isSync) {
                expect(result.data[0].b64_json).toBe('abc');
                expect(result.output_format).toBe('png');
                expect(result.usage?.total_tokens).toBe(10);
            }
        });

        it('should return async response for task-based payload', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { task_id: 'task-123' },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.image.generate({
                model: 'kling-v2',
                prompt: 'A cat',
            });

            expect(result.isSync).toBe(false);
            if (!result.isSync) {
                expect(result.task_id).toBe('task-123');
            }
        });

        it('should throw on unknown response format', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { foo: 'bar' },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            await expect(
                client.image.generate({
                    model: 'kling-v2',
                    prompt: 'A cat',
                })
            ).rejects.toThrow('Unexpected image generation response format');
        });
    });

    describe('get()', () => {
        it('should get task status', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    task_id: 'task-123',
                    status: 'processing',
                },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.image.get('task-123');

            expect(result.task_id).toBe('task-123');
            expect(result.status).toBe('processing');
            expect(mockFetch.calls[0].url).toContain('/images/tasks/task-123');
        });
    });

    describe('waitForResult()', () => {
        it('should return sync results directly', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: {} });
            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.image.waitForResult({
                isSync: true,
                created: 123456,
                data: [{ index: 0, b64_json: 'abc' }],
                output_format: 'png',
                usage: { total_tokens: 10, input_tokens: 2, output_tokens: 8 },
            });

            expect(result.isSync).toBe(true);
            expect(result.status).toBe('succeed');
            expect(result.data[0].b64_json).toBe('abc');
        });

        it('should poll for async results', async () => {
            const mockFetch = createMockFetch([
                {
                    status: 200,
                    body: {
                        task_id: 'task-123',
                        status: 'succeed',
                        data: [{ index: 0, url: 'https://example.com/image.png' }],
                    },
                },
            ]);

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.image.waitForResult(
                { isSync: false, task_id: 'task-123' },
                { intervalMs: 10, timeoutMs: 1000 }
            );

            expect(result.isSync).toBe(false);
            expect(result.status).toBe('succeed');
            expect(result.data[0].url).toBe('https://example.com/image.png');
        });
    });

    describe('waitForCompletion()', () => {
        it('should poll until task succeeds', async () => {
            const mockFetch = createMockFetch([
                { status: 200, body: { task_id: 'task-123', status: 'processing' } },
                { status: 200, body: { task_id: 'task-123', status: 'processing' } },
                {
                    status: 200,
                    body: {
                        task_id: 'task-123',
                        status: 'succeed',
                        data: [{ index: 0, url: 'https://example.com/image.png' }],
                    },
                },
            ]);

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.image.waitForCompletion('task-123', {
                intervalMs: 10,
                timeoutMs: 5000,
            });

            expect(result.status).toBe('succeed');
            expect(result.data?.[0]?.url).toBe('https://example.com/image.png');
            expect(mockFetch.calls).toHaveLength(3);
        });

        it('should throw on timeout', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { task_id: 'task-123', status: 'processing' },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            await expect(
                client.image.waitForCompletion('task-123', {
                    intervalMs: 10,
                    timeoutMs: 50,
                })
            ).rejects.toThrow('Timeout');
        });

        it('should support cancellation via AbortSignal', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { task_id: 'task-123', status: 'processing' },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const controller = new AbortController();

            const waitPromise = client.image.waitForCompletion('task-123', {
                intervalMs: 50,
                timeoutMs: 10000,
                signal: controller.signal,
            });

            // Cancel after a short delay
            setTimeout(() => controller.abort(), 20);

            await expect(waitPromise).rejects.toThrow('cancelled');
        });
    });
});
