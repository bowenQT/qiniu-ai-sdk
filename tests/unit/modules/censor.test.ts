import { afterEach, describe, expect, it, vi } from 'vitest';
import { Censor } from '../../../src/modules/censor';

function createMockClient() {
    return {
        post: vi.fn(),
        get: vi.fn(),
        postAbsolute: vi.fn(),
        getAbsolute: vi.fn(),
        getLogger: () => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        }),
    } as any;
}

describe('Censor', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('moderates images with default scenes and normalizes scene details', async () => {
        const client = createMockClient();
        client.post.mockResolvedValue({
            result: {
                suggestion: 'review',
                scenes: {
                    pulp: {
                        suggestion: 'review',
                        details: [{ label: 'sexy', score: 0.92 }],
                    },
                    terror: {
                        suggestion: 'pass',
                    },
                },
            },
        });

        const censor = new Censor(client);
        const result = await censor.image({ uri: 'https://example.com/image.jpg' });

        expect(client.post).toHaveBeenCalledWith('/v3/image/censor', {
            data: {
                uri: 'https://example.com/image.jpg',
                id: undefined,
            },
            params: {
                scenes: ['pulp', 'terror', 'politician', 'ads', 'behavior'],
            },
        });
        expect(result).toEqual({
            suggestion: 'review',
            scenes: [
                {
                    scene: 'pulp',
                    suggestion: 'review',
                    details: [{ label: 'sexy', score: 0.92 }],
                    label: 'sexy',
                    score: 0.92,
                },
                {
                    scene: 'terror',
                    suggestion: 'pass',
                    details: undefined,
                    label: undefined,
                    score: undefined,
                },
            ],
        });
    });

    it('fails closed when the image moderation response has no explicit result', async () => {
        const client = createMockClient();
        client.post.mockResolvedValue({});

        const censor = new Censor(client);

        await expect(censor.image({ uri: 'https://example.com/image.jpg' })).rejects.toThrow(
            'Censor API returned no result - cannot determine content safety',
        );
    });

    it('uses signed absolute requests for image moderation when AK/SK auth is provided', async () => {
        const client = createMockClient();
        client.postAbsolute.mockResolvedValue({
            result: {
                suggestion: 'pass',
                scenes: {
                    pulp: { suggestion: 'pass' },
                },
            },
        });

        vi.stubGlobal('crypto', {
            subtle: {
                importKey: vi.fn(async () => 'imported-key'),
                sign: vi.fn(async () => Uint8Array.from([1, 2, 3]).buffer),
            },
        } as Crypto);

        const censor = new Censor(client);
        const result = await censor.image({
            uri: 'qiniu://bucket/key.jpg',
            auth: {
                accessKey: 'test-ak',
                secretKey: 'test-sk',
            },
        });

        expect(client.postAbsolute).toHaveBeenCalledWith(
            'https://ai.qiniuapi.com/v3/image/censor',
            {
                data: {
                    uri: 'qiniu://bucket/key.jpg',
                    id: undefined,
                },
                params: {
                    scenes: ['pulp', 'terror', 'politician', 'ads', 'behavior'],
                },
            },
            undefined,
            {
                headers: {
                    Authorization: 'Qiniu test-ak:AQID',
                },
            },
        );
        expect(result.suggestion).toBe('pass');
    });

    it('starts a video moderation job with default interval and scenes', async () => {
        const client = createMockClient();
        client.post.mockResolvedValue({ job: 'job-123' });
        client.get
            .mockResolvedValueOnce({ status: 'WAITING' })
            .mockResolvedValueOnce({ status: 'DONE', result: { suggestion: 'pass' } });

        const censor = new Censor(client);
        const result = await censor.video({ uri: 'https://example.com/video.mp4' });

        expect(client.post).toHaveBeenCalledWith('/v3/video/censor', {
            data: {
                uri: 'https://example.com/video.mp4',
                id: undefined,
            },
            params: {
                scenes: ['pulp', 'terror', 'politician', 'ads', 'behavior'],
                cut_param: {
                    interval_msecs: 5000,
                },
            },
        });
        expect(result.jobId).toBe('job-123');
        expect(result.id).toBe('job-123');
        await expect(result.get()).resolves.toEqual({
            jobId: 'job-123',
            status: 'WAITING',
            suggestion: undefined,
            scenes: undefined,
            error: undefined,
        });
        await expect(result.wait({ intervalMs: 1, timeoutMs: 500 })).resolves.toEqual({
            jobId: 'job-123',
            status: 'DONE',
            suggestion: 'pass',
            scenes: undefined,
            error: undefined,
        });
        await expect(result.cancel()).rejects.toThrow(
            'Video censor task cancellation is not supported for task job-123',
        );
    });

    it('throws when the video moderation job creation returns no job id', async () => {
        const client = createMockClient();
        client.post.mockResolvedValue({});

        const censor = new Censor(client);

        await expect(censor.video({ uri: 'https://example.com/video.mp4' })).rejects.toThrow(
            'Video censor failed: no job ID returned',
        );
    });

    it('normalizes video moderation status results', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue({
            status: 'DONE',
            result: {
                suggestion: 'block',
                scenes: {
                    politician: {
                        suggestion: 'block',
                        details: [{ label: 'leader', score: 0.88 }],
                    },
                },
            },
        });

        const censor = new Censor(client);
        const result = await censor.getVideoStatus('job-456');

        expect(client.get).toHaveBeenCalledWith('/v3/jobs/video/job-456');
        expect(result).toEqual({
            jobId: 'job-456',
            status: 'DONE',
            suggestion: 'block',
            scenes: [
                {
                    scene: 'politician',
                    suggestion: 'block',
                    details: [{ label: 'leader', score: 0.88 }],
                    label: 'leader',
                    score: 0.88,
                },
            ],
            error: undefined,
        });
    });

    it('treats FINISHED as a terminal success state for video moderation', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue({
            status: 'FINISHED',
            result: {
                suggestion: 'pass',
            },
        });

        const censor = new Censor(client);
        await expect(censor.getVideoStatus('job-finished')).resolves.toEqual({
            jobId: 'job-finished',
            status: 'DONE',
            suggestion: 'pass',
            scenes: undefined,
            error: undefined,
        });
    });

    it('waits until a video moderation job reaches a terminal status', async () => {
        const client = createMockClient();
        client.get
            .mockResolvedValueOnce({ status: 'WAITING' })
            .mockResolvedValueOnce({ status: 'DOING' })
            .mockResolvedValueOnce({
                status: 'FAILED',
                error: 'moderation failed',
            });

        const censor = new Censor(client);
        const result = await censor.waitForVideoCompletion('job-wait', {
            intervalMs: 1,
            timeoutMs: 500,
        });

        expect(result).toEqual({
            jobId: 'job-wait',
            status: 'FAILED',
            suggestion: undefined,
            scenes: undefined,
            error: 'moderation failed',
        });
    });

    it('accepts a video job handle when fetching or waiting for status', async () => {
        const client = createMockClient();
        client.post.mockResolvedValue({ job: 'job-handle' });
        client.get
            .mockResolvedValueOnce({
                status: 'DONE',
                result: {
                    suggestion: 'review',
                },
            })
            .mockResolvedValueOnce({
                status: 'DONE',
                result: {
                    suggestion: 'review',
                },
            });

        const censor = new Censor(client);
        const handle = await censor.video({ uri: 'https://example.com/video.mp4' });

        await expect(censor.getVideoStatus(handle)).resolves.toMatchObject({
            jobId: 'job-handle',
            status: 'DONE',
            suggestion: 'review',
        });
        await expect(censor.waitForVideoCompletion(handle, { intervalMs: 1, timeoutMs: 500 })).resolves.toMatchObject({
            jobId: 'job-handle',
            status: 'DONE',
            suggestion: 'review',
        });
    });
});
