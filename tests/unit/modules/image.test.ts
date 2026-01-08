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
