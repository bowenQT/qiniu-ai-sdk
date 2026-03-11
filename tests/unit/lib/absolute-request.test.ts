import { describe, it, expect } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createStaticMockFetch, createMockFetch } from '../../mocks/fetch';

describe('Absolute URL requests (Delivery D)', () => {
    describe('client.getAbsolute()', () => {
        it('should exist as a method on QiniuAI', () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: {} });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });
            expect(typeof client.getAbsolute).toBe('function');
        });

        it('should call the absolute URL directly without prepending baseUrl', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: { ok: true } });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await client.getAbsolute('https://api.qnaigc.com/v2/stat/usage', { granularity: 'day' });

            expect(mockFetch.calls).toHaveLength(1);
            const url = mockFetch.calls[0].url;
            // Must NOT contain /v1/v2 (which would happen if baseUrl was prepended)
            expect(url).toContain('https://api.qnaigc.com/v2/stat/usage');
            expect(url).not.toContain('/v1/v2');
        });

        it('should append query params to absolute URL', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: [] });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await client.getAbsolute('https://api.qnaigc.com/v2/stat/export_log_file', {
                start: '2025-12-29T00:00:00Z',
                end: '2025-12-30T00:00:00Z',
                size: '100',
            });

            const url = mockFetch.calls[0].url;
            expect(url).toContain('start=');
            expect(url).toContain('end=');
            expect(url).toContain('size=100');
        });

        it('should inherit Authorization header', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: {} });
            const client = new QiniuAI({ apiKey: 'sk-test-key', adapter: mockFetch.adapter });

            await client.getAbsolute('https://api.qnaigc.com/v2/stat/usage');

            const init = mockFetch.calls[0].init!;
            const headers = init.headers as Record<string, string>;
            expect(headers['Authorization']).toContain('sk-test-key');
        });
    });

    describe('client.postAbsolute()', () => {
        it('should exist as a method on QiniuAI', () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: {} });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });
            expect(typeof client.postAbsolute).toBe('function');
        });

        it('should POST to absolute URL without prepending baseUrl', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { request_id: 'qvideo-123', status: 'IN_QUEUE' },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await client.postAbsolute('https://api.qnaigc.com/queue/fal-ai/vidu/q2/text-to-video', {
                prompt: 'test',
            });

            expect(mockFetch.calls).toHaveLength(1);
            expect(mockFetch.calls[0].url).toBe('https://api.qnaigc.com/queue/fal-ai/vidu/q2/text-to-video');
            expect(mockFetch.calls[0].init!.method).toBe('POST');
        });
    });
});
