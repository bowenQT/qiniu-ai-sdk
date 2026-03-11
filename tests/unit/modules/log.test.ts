import { describe, it, expect } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createStaticMockFetch } from '../../mocks/fetch';

describe('Log Export API (Delivery C)', () => {
    describe('client.log property', () => {
        it('should exist on QiniuAI client', () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: [] });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });
            expect(client.log).toBeDefined();
            expect(typeof client.log.export).toBe('function');
        });
    });

    describe('runtime validation', () => {
        it('should reject time range exceeding 35 days', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: [] });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await expect(
                client.log.export({
                    start: '2025-01-01T00:00:00Z',
                    end: '2025-03-01T00:00:00Z', // 59 days
                })
            ).rejects.toThrow(/35 days/);
        });

        it('should reject size > 500', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: [] });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await expect(
                client.log.export({
                    start: '2025-01-01T00:00:00Z',
                    end: '2025-01-02T00:00:00Z',
                    size: 501,
                })
            ).rejects.toThrow(/500/);
        });

        it('should reject size < 1', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: [] });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await expect(
                client.log.export({
                    start: '2025-01-01T00:00:00Z',
                    end: '2025-01-02T00:00:00Z',
                    size: 0,
                })
            ).rejects.toThrow(/between 1 and 500/);
        });

        it('should reject page < 1', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: [] });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await expect(
                client.log.export({
                    start: '2025-01-01T00:00:00Z',
                    end: '2025-01-02T00:00:00Z',
                    page: 0,
                })
            ).rejects.toThrow(/page/);
        });

        it('should reject invalid date', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: [] });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await expect(
                client.log.export({ start: 'not-a-date', end: '2025-01-02T00:00:00Z' })
            ).rejects.toThrow(/valid/);
        });

        it('should reject end before start', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: [] });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await expect(
                client.log.export({
                    start: '2025-01-10T00:00:00Z',
                    end: '2025-01-01T00:00:00Z',
                })
            ).rejects.toThrow(/after start/);
        });
    });

    describe('request', () => {
        it('should call /v2/stat/export_log_file with absolute URL', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: [] });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await client.log.export({
                start: '2025-12-29T00:00:00Z',
                end: '2025-12-30T00:00:00Z',
                size: 100,
                model: 'deepseek/deepseek-v3.1',
            });

            const url = mockFetch.calls[0].url;
            expect(url).toContain('/v2/stat/export_log_file');
            expect(url).not.toContain('/v1/v2');
            expect(url).toContain('start=');
            expect(url).toContain('size=100');
            expect(url).toContain('model=');
        });
    });
});
