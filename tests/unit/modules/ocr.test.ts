import { describe, it, expect } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createStaticMockFetch } from '../../mocks/fetch';

describe('OCR Module', () => {
    describe('detect()', () => {
        it('should throw error if neither url nor image is provided', async () => {
            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
            });

            await expect(client.ocr.detect({})).rejects.toThrow(
                'Either url or image must be provided'
            );
        });

        it('should throw error if both url and image are provided', async () => {
            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
            });

            await expect(
                client.ocr.detect({ url: 'https://example.com/img.png', image: 'base64data' })
            ).rejects.toThrow('Only one of url or image should be provided');
        });

        it('should detect text from image URL', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    text: 'Hello World',
                    confidence: 0.95,
                    blocks: [
                        { text: 'Hello', confidence: 0.98, bbox: [10, 10, 50, 20] },
                        { text: 'World', confidence: 0.92, bbox: [60, 10, 50, 20] },
                    ],
                },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.ocr.detect({
                url: 'https://example.com/image.png',
            });

            expect(result.text).toBe('Hello World');
            expect(result.confidence).toBe(0.95);
            expect(result.blocks).toHaveLength(2);
            expect(mockFetch.calls[0].url).toContain('/ocr');
        });

        it('should detect text from base64 image', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { text: 'Test text' },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.ocr.detect({
                image: 'base64encodeddata',
            });

            expect(result.text).toBe('Test text');

            // Verify the request body
            const body = JSON.parse(mockFetch.calls[0].init?.body as string);
            expect(body.image).toBe('base64encodeddata');
            expect(body.model).toBe('ocr');
        });

        it('should handle nested response format', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    data: {
                        text: 'Nested text',
                        confidence: 0.88,
                    },
                },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.ocr.detect({
                url: 'https://example.com/image.png',
            });

            expect(result.text).toBe('Nested text');
            expect(result.confidence).toBe(0.88);
        });
    });
});
