import { describe, it, expect } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createStaticMockFetch, createMockFetch } from '../../mocks/fetch';

describe('viduq TaskHandle (Delivery A)', () => {
    describe('model identification', () => {
        it('should route viduq2 model to fal-ai endpoint', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    request_id: 'qvideo-root-123',
                    status: 'IN_QUEUE',
                    status_url: 'https://api.qnaigc.com/queue/fal-ai/vidu/requests/qvideo-root-123/status',
                    response_url: 'https://api.qnaigc.com/queue/fal-ai/vidu/requests/qvideo-root-123',
                },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const result = await client.video.create({
                model: 'viduq2',
                prompt: 'A cat playing with yarn',
            });

            // Should call fal-ai endpoint, not /videos
            expect(mockFetch.calls[0].url).toContain('/queue/fal-ai/vidu');
            expect(mockFetch.calls[0].url).not.toContain('/v1/videos');
        });
    });

    describe('endpoint inference', () => {
        it('should route text-only viduq2 to text-to-video', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { request_id: 'qvideo-1', status: 'IN_QUEUE', status_url: '', response_url: '' },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await client.video.create({ model: 'viduq2', prompt: 'test' });
            expect(mockFetch.calls[0].url).toContain('text-to-video');
        });

        it('should route viduq2 with image_url to image-to-video', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { request_id: 'qvideo-2', status: 'IN_QUEUE', status_url: '', response_url: '' },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await client.video.create({ model: 'viduq2', prompt: 'test', image_url: 'https://img.example.com/1.jpg' });
            expect(mockFetch.calls[0].url).toContain('image-to-video');
        });

        it('should route viduq2-pro with image to image-to-video/pro', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { request_id: 'qvideo-3', status: 'IN_QUEUE', status_url: '', response_url: '' },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await client.video.create({ model: 'viduq2-pro', prompt: 'test', image_url: 'https://img.example.com/1.jpg' });
            expect(mockFetch.calls[0].url).toContain('image-to-video/pro');
        });

        it('should throw if viduq2-pro has no image input', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: {} });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await expect(
                client.video.create({ model: 'viduq2-pro', prompt: 'text only' })
            ).rejects.toThrow(/requires image input/);
        });
    });

    describe('TaskHandle return', () => {
        it('should return VideoTaskHandle with statusUrl and responseUrl', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    request_id: 'qvideo-root-456',
                    status: 'IN_QUEUE',
                    status_url: 'https://api.qnaigc.com/queue/fal-ai/vidu/requests/qvideo-root-456/status',
                    response_url: 'https://api.qnaigc.com/queue/fal-ai/vidu/requests/qvideo-root-456',
                },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const handle = await client.video.create({ model: 'viduq2', prompt: 'test' });
            expect(handle.id).toBe('qvideo-root-456');
            expect(handle.statusUrl).toBe('https://api.qnaigc.com/queue/fal-ai/vidu/requests/qvideo-root-456/status');
            expect(handle.responseUrl).toBe('https://api.qnaigc.com/queue/fal-ai/vidu/requests/qvideo-root-456');
            expect(handle.get).toBeTypeOf('function');
            expect(handle.wait).toBeTypeOf('function');
        });

        it('should still return { id } for Kling models (backward compat)', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { id: 'kling-task-789' },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const handle = await client.video.create({ model: 'kling-v3', prompt: 'test' });
            expect(handle.id).toBe('kling-task-789');
            expect(handle.statusUrl).toBeUndefined();
        });
    });

    describe('viduq payload', () => {
        it('should include viduq-specific fields in request body', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { request_id: 'qvideo-7', status: 'IN_QUEUE', status_url: '', response_url: '' },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await client.video.create({
                model: 'viduq2',
                prompt: 'test',
                movement_amplitude: 'large',
                audio: true,
                voice_id: 'voice-123',
            });

            const body = JSON.parse(mockFetch.calls[0].init!.body as string);
            expect(body.prompt).toBe('test');
            expect(body.movement_amplitude).toBe('large');
            expect(body.audio).toBe(true);
            expect(body.voice_id).toBe('voice-123');
        });
    });

    describe('viduq get() with handle', () => {
        it('should use statusUrl for viduq task queries', async () => {
            const responses = [
                { status: 200, body: { request_id: 'qvideo-root-100', status: 'IN_QUEUE', status_url: 'https://api.qnaigc.com/queue/fal-ai/vidu/requests/qvideo-root-100/status', response_url: '' } },
                { status: 200, body: { status: 'COMPLETED', request_id: 'qvideo-root-100', result: { video: { url: 'https://video.example.com/1.mp4', content_type: 'video/mp4' } } } },
            ];
            const mockFetch = createMockFetch(responses);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            // Create returns handle with statusUrl
            const handle = await client.video.create({ model: 'viduq1', prompt: 'test' });

            // get() with handle should use absolute statusUrl
            const status = await client.video.get(handle);
            expect(mockFetch.calls[1].url).toContain('queue/fal-ai/vidu/requests');
            expect(status.status).toBe('completed');
        });

        it('should allow handle.get() and handle.wait()', async () => {
            const responses = [
                { status: 200, body: { request_id: 'qvideo-root-101', status: 'IN_QUEUE', status_url: 'https://api.qnaigc.com/queue/fal-ai/vidu/requests/qvideo-root-101/status', response_url: '' } },
                { status: 200, body: { status: 'IN_PROGRESS', request_id: 'qvideo-root-101' } },
                {
                    status: 200,
                    body: {
                        status: 'COMPLETED',
                        request_id: 'qvideo-root-101',
                        result: { video: { url: 'https://video.example.com/handle.mp4', content_type: 'video/mp4' } },
                    },
                },
            ];
            const mockFetch = createMockFetch(responses);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const handle = await client.video.create({ model: 'viduq2', prompt: 'test' });
            const status = await handle.get();
            expect(status.status).toBe('in_progress');

            const result = await handle.wait({ intervalMs: 10, timeoutMs: 1000 });
            expect(result.status).toBe('completed');
            expect(result.task_result?.videos?.[0]?.url).toBe('https://video.example.com/handle.mp4');
        });

        it('should surface unsupported cancel() explicitly', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    request_id: 'qvideo-root-102',
                    status: 'IN_QUEUE',
                    status_url: 'https://api.qnaigc.com/queue/fal-ai/vidu/requests/qvideo-root-102/status',
                    response_url: '',
                },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const handle = await client.video.create({ model: 'viduq2', prompt: 'test' });
            await expect(handle.cancel()).rejects.toThrow('video task cancellation is not supported');
        });

        it('should use cached statusUrl when get() is called with string ID', async () => {
            const responses = [
                { status: 200, body: { request_id: 'qvideo-root-200', status: 'IN_QUEUE', status_url: 'https://api.qnaigc.com/queue/fal-ai/vidu/requests/qvideo-root-200/status', response_url: '' } },
                { status: 200, body: { status: 'COMPLETED', request_id: 'qvideo-root-200', result: { video: { url: 'https://video.example.com/2.mp4', content_type: 'video/mp4' } } } },
            ];
            const mockFetch = createMockFetch(responses);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            // Create viduq task — caches statusUrl internally
            const handle = await client.video.create({ model: 'viduq2', prompt: 'test' });

            // get() with just the string ID — should still use fal-ai via cache
            const status = await client.video.get(handle.id);
            expect(mockFetch.calls[1].url).toContain('queue/fal-ai/vidu/requests');
            expect(mockFetch.calls[1].url).not.toContain('/v1/videos/');
            expect(status.status).toBe('completed');
        });
    });
});
