import { describe, it, expect, beforeEach } from 'vitest';
import { QiniuAI } from '../../src/client';
import { createMockFetch, createStaticMockFetch } from '../mocks/fetch';

describe('QiniuAI Client', () => {
    describe('constructor', () => {
        it('should throw error if apiKey is missing', () => {
            expect(() => new QiniuAI({ apiKey: '' })).toThrow('API Key is required');
        });

        it('should throw error if apiKey is only whitespace', () => {
            expect(() => new QiniuAI({ apiKey: '   ' })).toThrow('API Key is required');
        });

        it('should throw error if timeout is not positive', () => {
            expect(() => new QiniuAI({ apiKey: 'sk-test', timeout: 0 })).toThrow(
                'Timeout must be a positive number'
            );
            expect(() => new QiniuAI({ apiKey: 'sk-test', timeout: -100 })).toThrow(
                'Timeout must be a positive number'
            );
        });

        it('should initialize with default options', () => {
            const client = new QiniuAI({ apiKey: 'sk-test' });
            expect(client.getBaseUrl()).toBe('https://api.qnaigc.com/v1');
        });

        it('should normalize baseUrl by removing trailing slashes', () => {
            const client = new QiniuAI({
                apiKey: 'sk-test',
                baseUrl: 'https://custom.api.com/v1///',
            });
            expect(client.getBaseUrl()).toBe('https://custom.api.com/v1');
        });

        it('should initialize all modules', () => {
            const client = new QiniuAI({ apiKey: 'sk-test' });
            expect(client.chat).toBeDefined();
            expect(client.image).toBeDefined();
            expect(client.video).toBeDefined();
            expect(client.sys).toBeDefined();
            expect(client.ocr).toBeDefined();
            expect(client.asr).toBeDefined();
            expect(client.tts).toBeDefined();
            expect(client.account).toBeDefined();
            expect(client.admin).toBeDefined();
        });
    });

    describe('request methods', () => {
        it('should make POST request with correct headers', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { id: 'test-id' },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test-key',
                adapter: mockFetch.adapter,
            });

            await client.post('/test', { foo: 'bar' });

            expect(mockFetch.calls).toHaveLength(1);
            expect(mockFetch.calls[0].url).toBe('https://api.qnaigc.com/v1/test');

            const init = mockFetch.calls[0].init;
            expect(init?.method).toBe('POST');
            expect(init?.headers).toMatchObject({
                'Content-Type': 'application/json',
                Authorization: 'Bearer sk-test-key',
            });
        });

        it('should make GET request with query parameters', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { data: [] },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test-key',
                adapter: mockFetch.adapter,
            });

            await client.get('/test', { foo: 'bar', baz: '123' });

            expect(mockFetch.calls).toHaveLength(1);
            expect(mockFetch.calls[0].url).toBe(
                'https://api.qnaigc.com/v1/test?foo=bar&baz=123'
            );
            expect(mockFetch.calls[0].init?.method).toBe('GET');
        });
    });
});
