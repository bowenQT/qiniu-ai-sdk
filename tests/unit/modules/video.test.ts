import { describe, expect, it } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createMockFetch, createStaticMockFetch } from '../../mocks/fetch';

describe('Video Module', () => {
    describe('create()', () => {
        it('should transform veo requests into /videos/generations payloads', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { id: 'videos-123' },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const handle = await client.video.create({
                model: 'veo-3.0-generate-001',
                prompt: 'A paper boat drifting through a rain-soaked alley',
                frames: {
                    first: { url: 'https://example.com/first.png' },
                    last: { base64: 'Zm9v', mimeType: 'image/png' },
                },
                generate_audio: true,
                duration: 5,
                aspect_ratio: '16:9',
                resolution: '720p',
                seed: 7,
                sample_count: 2,
                negative_prompt: 'blurry',
                person_generation: 'allow_adult',
                enhance_prompt: true,
                fps: 24,
                resize_mode: 'pad',
                callback_url: 'https://example.com/callback',
            });

            expect(handle.id).toBe('videos-123');
            expect(handle.get).toBeTypeOf('function');
            expect(handle.wait).toBeTypeOf('function');
            expect(mockFetch.calls[0].url).toContain('/videos/generations');

            const body = JSON.parse(mockFetch.calls[0].init?.body as string);
            expect(body.model).toBe('veo-3.0-generate-001');
            expect(body.instances).toEqual([
                {
                    prompt: 'A paper boat drifting through a rain-soaked alley',
                    image: {
                        uri: 'https://example.com/first.png',
                        mimeType: 'image/png',
                    },
                    lastFrame: {
                        bytesBase64Encoded: 'Zm9v',
                        mimeType: 'image/png',
                    },
                },
            ]);
            expect(body.parameters).toEqual({
                generateAudio: true,
                durationSeconds: 5,
                aspectRatio: '16:9',
                resolution: '720p',
                seed: 7,
                sampleCount: 2,
                negativePrompt: 'blurry',
                personGeneration: 'allow_adult',
                enhancePrompt: true,
                fps: 24,
                resizeMode: 'pad',
            });
            expect(body.callback_url).toBe('https://example.com/callback');
        });

        it('should map kling frames to image_list for kling-video-o1', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { id: 'qvideo-123' },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            await client.video.create({
                model: 'kling-video-o1',
                prompt: 'A fox walking through lantern light',
                frames: {
                    first: { url: 'https://example.com/first.jpg' },
                    last: { base64: 'YmFy' },
                },
            });

            expect(mockFetch.calls[0].url).toContain('/videos');
            const body = JSON.parse(mockFetch.calls[0].init?.body as string);
            expect(body.image_list).toEqual([
                { image: 'https://example.com/first.jpg', type: 'first_frame' },
                { image: 'YmFy', type: 'end_frame' },
            ]);
        });

        it('should map v2-5 tail frames to image_tail and input_reference', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { id: 'qvideo-456' },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            await client.video.create({
                model: 'kling-v2-5-turbo',
                prompt: 'Camera pushes into a neon city skyline',
                frames: {
                    first: { url: 'https://example.com/start.jpg' },
                    last: { url: 'https://example.com/end.jpg' },
                },
            });

            const body = JSON.parse(mockFetch.calls[0].init?.body as string);
            expect(body.input_reference).toBe('https://example.com/start.jpg');
            expect(body.image_tail).toBe('https://example.com/end.jpg');
            expect(body.image_list).toBeUndefined();
        });

        it('should surface unsupported cancel() explicitly for provider-backed video handles', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { id: 'qvideo-unsupported-cancel' },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const handle = await client.video.create({
                model: 'kling-v3',
                prompt: 'A lantern drifting across the water',
            });

            await expect(handle.cancel()).rejects.toThrow(
                'video task cancellation is not supported for task qvideo-unsupported-cancel',
            );
        });
    });

    describe('get()', () => {
        it('should normalize veo task responses', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    id: 'videos-789',
                    model: 'veo-3.0-generate-001',
                    status: 'Completed',
                    message: 'done',
                    data: {
                        videos: [
                            { url: 'https://example.com/video.mp4', mimeType: 'video/mp4' },
                        ],
                    },
                    created_at: '2026-03-15T00:00:00Z',
                    updated_at: '2026-03-15T00:05:00Z',
                },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.video.get('videos-789');

            expect(result.id).toBe('videos-789');
            expect(result.status).toBe('completed');
            expect(result.task_result?.videos).toEqual([
                { url: 'https://example.com/video.mp4', mimeType: 'video/mp4' },
            ]);
            expect(mockFetch.calls[0].url).toContain('/videos/generations/videos-789');
        });
    });

    describe('waitForCompletion()', () => {
        it('should allow generic handles to get and wait for completion', async () => {
            const mockFetch = createMockFetch([
                { status: 200, body: { id: 'task-001' } },
                { status: 200, body: { id: 'task-001', status: 'processing' } },
                {
                    status: 200,
                    body: {
                        id: 'task-001',
                        status: 'completed',
                        task_result: {
                            videos: [{ url: 'https://example.com/final.mp4' }],
                        },
                    },
                },
            ]);

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const handle = await client.video.create({
                model: 'kling-v3',
                prompt: 'A kite drifting above the sea',
            });

            const status = await handle.get();
            expect(status.status).toBe('processing');

            const result = await handle.wait({ intervalMs: 10, timeoutMs: 1000 });
            expect(result.status).toBe('completed');
            expect(result.task_result?.videos?.[0]?.url).toBe('https://example.com/final.mp4');
            expect(mockFetch.calls[1].url).toContain('/videos/task-001');
            expect(mockFetch.calls[2].url).toContain('/videos/task-001');
        });
    });
});
