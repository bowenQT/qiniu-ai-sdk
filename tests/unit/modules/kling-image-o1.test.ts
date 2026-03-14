import { describe, it, expect } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createStaticMockFetch, createMockFetch } from '../../mocks/fetch';

describe('kling-image-o1 fal-ai (Delivery B)', () => {
    describe('routing', () => {
        it('should route kling-image-o1 to fal-ai endpoint', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    request_id: 'qimage-root-100',
                    status: 'IN_QUEUE',
                    status_url: 'https://api.qnaigc.com/queue/fal-ai/kling-image/requests/qimage-root-100/status',
                    response_url: 'https://api.qnaigc.com/queue/fal-ai/kling-image/requests/qimage-root-100',
                },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await client.image.generate({ model: 'kling-image-o1', prompt: 'A cute cat' });

            expect(mockFetch.calls[0].url).toContain('/queue/fal-ai/kling-image/o1');
            expect(mockFetch.calls[0].url).not.toContain('/images/generations');
        });

        it('should still route other models to /images/generations', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { task_id: 'img-task-1' },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await client.image.generate({ model: 'kling-v2-1', prompt: 'A dog' });
            expect(mockFetch.calls[0].url).toContain('/images/generations');
        });
    });

    describe('payload', () => {
        it('should pass image_urls in request body', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { request_id: 'qimage-root-200', status: 'IN_QUEUE', status_url: '', response_url: '' },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await client.image.generate({
                model: 'kling-image-o1',
                prompt: 'Reference <<<image_1>>> style',
                image_urls: ['https://example.com/ref.jpg'],
                num_images: 2,
                resolution: '2K',
            });

            const body = JSON.parse(mockFetch.calls[0].init!.body as string);
            expect(body.prompt).toBe('Reference <<<image_1>>> style');
            expect(body.image_urls).toEqual(['https://example.com/ref.jpg']);
            expect(body.num_images).toBe(2);
            expect(body.resolution).toBe('2K');
        });
    });

    describe('response normalization', () => {
        it('should normalize fal-ai create response to ImageCreateResult', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    request_id: 'qimage-root-300',
                    status: 'IN_QUEUE',
                    status_url: 'https://api.qnaigc.com/queue/fal-ai/kling-image/requests/qimage-root-300/status',
                    response_url: '',
                },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const result = await client.image.generate({ model: 'kling-image-o1', prompt: 'test' });
            expect(result.isSync).toBe(false);
            if (!result.isSync) {
                expect(result.id).toBe('qimage-root-300');
                expect(result.task_id).toBe('qimage-root-300');
                expect(result.get).toBeTypeOf('function');
                expect(result.wait).toBeTypeOf('function');
            }
        });
    });

    describe('status polling', () => {
        it('should use fal-ai status endpoint for kling-image-o1 tasks', async () => {
            const responses = [
                // create
                {
                    status: 200,
                    body: {
                        request_id: 'qimage-root-400',
                        status: 'IN_QUEUE',
                        status_url: 'https://api.qnaigc.com/queue/fal-ai/kling-image/requests/qimage-root-400/status',
                        response_url: '',
                    },
                },
                // poll → COMPLETED
                {
                    status: 200,
                    body: {
                        status: 'COMPLETED',
                        request_id: 'qimage-root-400',
                        result: {
                            images: [
                                { url: 'https://aitoken-video.qnaigc.com/images/root/0.png', content_type: 'image/png' },
                            ],
                        },
                    },
                },
            ];
            const mockFetch = createMockFetch(responses);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const createResult = await client.image.generate({ model: 'kling-image-o1', prompt: 'test' });
            expect(createResult.isSync).toBe(false);

            if (!createResult.isSync) {
                const taskResult = await client.image.get(createResult.task_id);
                // Should have called fal-ai status endpoint
                expect(mockFetch.calls[1].url).toContain('queue/fal-ai/kling-image');
                // Status should be normalized to 'succeed'
                expect(taskResult.status).toBe('succeed');
                // Data should be normalized
                expect(taskResult.data).toHaveLength(1);
                expect(taskResult.data![0].url).toContain('aitoken-video.qnaigc.com');
            }
        });
    });
});
