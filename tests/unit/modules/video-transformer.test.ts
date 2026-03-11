/**
 * TDD RED: Video transformer tests
 * Verify KlingV3 new parameters pass through transformToKlingPayload,
 * and Veo new parameters pass through transformToVeoPayload.
 *
 * NOTE: transformToKlingPayload and transformToVeoPayload are private functions.
 * We test them indirectly via the Video.create() method using a mock client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to test the Video class which internally calls transformers
// Use a mock IQiniuClient to capture the payload sent to post()
function createMockClient() {
    const postPayloads: Array<{ path: string; payload: unknown }> = [];
    return {
        client: {
            getLogger: () => ({
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            }),
            getBaseUrl: () => 'https://api.qnaigc.com/v1',
            post: vi.fn(async (path: string, payload: unknown) => {
                postPayloads.push({ path, payload });
                return { id: 'test-task-id' };
            }),
            postAbsolute: vi.fn(async (url: string, payload: unknown) => {
                postPayloads.push({ path: url, payload });
                return { request_id: 'test-request-id', status_url: 'https://status.url' };
            }),
            get: vi.fn(async () => ({ id: 'test', status: 'completed' })),
            getAbsolute: vi.fn(async () => ({ request_id: 'test', status: 'COMPLETED' })),
        },
        postPayloads,
    };
}

// Dynamic import to get Video class
async function getVideoClass() {
    const mod = await import('../../../src/modules/video/index');
    return mod.Video;
}

describe('Video Transformer: KlingV3 Parameters', () => {
    let Video: Awaited<ReturnType<typeof getVideoClass>>;
    let mockClient: ReturnType<typeof createMockClient>;

    beforeEach(async () => {
        Video = await getVideoClass();
        mockClient = createMockClient();
    });

    it('should pass multi_shot to Kling payload', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'kling-v3',
            prompt: 'test',
            multi_shot: true,
            shot_type: 'customize',
            multi_prompt: [
                { index: 1, prompt: '镜头1', duration: '5' },
                { index: 2, prompt: '镜头2', duration: '5' },
            ],
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        expect(payload.multi_shot).toBe(true);
        expect(payload.shot_type).toBe('customize');
        expect(payload.multi_prompt).toHaveLength(2);
    });

    it('should pass seconds to Kling payload', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'kling-v3',
            prompt: 'test',
            seconds: '10',
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        expect(payload.seconds).toBe('10');
    });

    it('should auto-map duration to seconds for kling-v3 when seconds not provided', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'kling-v3',
            prompt: 'test',
            duration: '5',
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        // duration should be mapped to seconds for V3
        expect(payload.seconds).toBe('5');
        // duration should NOT be sent for V3
        expect(payload.duration).toBeUndefined();
    });

    it('should auto-map duration to seconds for kling-v3-omni when seconds not provided', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'kling-v3-omni',
            prompt: 'test',
            duration: '10',
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        expect(payload.seconds).toBe('10');
        expect(payload.duration).toBeUndefined();
    });

    it('should prefer seconds over duration for kling-v3 when both provided', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'kling-v3',
            prompt: 'test',
            duration: '5',
            seconds: '10',
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        // Explicit seconds takes precedence
        expect(payload.seconds).toBe('10');
        expect(payload.duration).toBeUndefined();
    });

    it('should still send duration (not seconds) for non-V3 Kling models', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'kling-v2-6',
            prompt: 'test',
            duration: '5',
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        // Old models should keep using duration, not seconds
        expect(payload.duration).toBe('5');
        expect(payload.seconds).toBeUndefined();
    });

    it('should pass sound to Kling payload', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'kling-v3',
            prompt: 'test',
            sound: 'on',
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        expect(payload.sound).toBe('on');
    });

    it('should pass watermark_info to Kling payload', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'kling-v3-omni',
            prompt: 'test',
            watermark_info: { enabled: false },
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        expect(payload.watermark_info).toEqual({ enabled: false });
    });

    it('should pass camera_control to Kling payload', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'kling-v3',
            prompt: 'test',
            camera_control: {
                type: 'simple',
                config: { zoom: 5 },
            },
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        expect(payload.camera_control).toEqual({
            type: 'simple',
            config: { zoom: 5 },
        });
    });

    it('should pass static_mask and dynamic_masks to Kling payload', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'kling-v3',
            prompt: 'test',
            static_mask: 'https://example.com/mask.png',
            dynamic_masks: [
                {
                    mask: 'https://example.com/dmask.png',
                    trajectories: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
                },
            ],
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        expect(payload.static_mask).toBe('https://example.com/mask.png');
        expect(payload.dynamic_masks).toHaveLength(1);
    });
});

describe('Video Transformer: Veo Parameters', () => {
    let Video: Awaited<ReturnType<typeof getVideoClass>>;
    let mockClient: ReturnType<typeof createMockClient>;

    beforeEach(async () => {
        Video = await getVideoClass();
        mockClient = createMockClient();
    });

    it('should pass enhance_prompt to Veo payload', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'veo-3.0-generate-001',
            prompt: 'test',
            enhance_prompt: true,
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        const parameters = (payload as any).parameters;
        expect(parameters.enhancePrompt).toBe(true);
    });

    it('should pass fps to Veo payload', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'veo-3.0-generate-001',
            prompt: 'test',
            fps: 30,
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        const parameters = (payload as any).parameters;
        expect(parameters.fps).toBe(30);
    });

    it('should pass resize_mode to Veo payload', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'veo-3.1-generate-preview',
            prompt: 'test',
            resize_mode: 'crop',
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        const parameters = (payload as any).parameters;
        expect(parameters.resizeMode).toBe('crop');
    });

    it('should pass callback_url to Veo payload', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'veo-3.0-generate-001',
            prompt: 'test',
            callback_url: 'https://example.com/callback',
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        expect((payload as any).callback_url).toBe('https://example.com/callback');
    });

    it('should pass compression_quality to Veo instance', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'veo-3.0-generate-001',
            prompt: 'test',
            compression_quality: 'high',
        });

        const payload = mockClient.postPayloads[0].payload as Record<string, unknown>;
        const instance = (payload as any).instances[0];
        expect(instance.compressionQuality).toBe('high');
    });

    it('should route veo-2.0-generate-exp through Veo adapter', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'veo-2.0-generate-exp',
            prompt: 'test',
        });

        expect(mockClient.postPayloads[0].path).toBe('/videos/generations');
    });

    it('should route veo-2.0-generate-preview through Veo adapter', async () => {
        const video = new Video(mockClient.client as any);
        await video.create({
            model: 'veo-2.0-generate-preview',
            prompt: 'test',
        });

        expect(mockClient.postPayloads[0].path).toBe('/videos/generations');
    });
});
