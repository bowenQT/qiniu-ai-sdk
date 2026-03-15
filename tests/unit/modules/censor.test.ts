import { describe, expect, it, vi } from 'vitest';
import { Censor } from '../../../src/modules/censor';

function createMockClient() {
    return {
        post: vi.fn(),
        get: vi.fn(),
        getLogger: () => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        }),
    } as any;
}

describe('Censor', () => {
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
                scenes: ['pulp', 'terror', 'politician'],
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

    it('starts a video moderation job with default interval and scenes', async () => {
        const client = createMockClient();
        client.post.mockResolvedValue({ job: 'job-123' });

        const censor = new Censor(client);
        const result = await censor.video({ uri: 'https://example.com/video.mp4' });

        expect(client.post).toHaveBeenCalledWith('/v3/video/censor', {
            data: {
                uri: 'https://example.com/video.mp4',
                id: undefined,
            },
            params: {
                scenes: ['pulp', 'terror', 'politician'],
                cut_param: {
                    interval_msecs: 5000,
                },
            },
        });
        expect(result).toEqual({ jobId: 'job-123' });
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
});
