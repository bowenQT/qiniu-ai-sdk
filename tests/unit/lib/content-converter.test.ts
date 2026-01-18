/**
 * Tests for content converter (multimodal support).
 */

import { describe, it, expect } from 'vitest';
import { normalizeContent, hasImageParts } from '../../../src/lib/content-converter';
import type { ContentPart, TextContentPart, ImageUrlContentPart, ImageContentPart } from '../../../src/lib/types';

describe('Content Converter', () => {
    describe('normalizeContent', () => {
        it('should return string content unchanged', () => {
            const content = 'Hello, world!';
            expect(normalizeContent(content)).toBe(content);
        });

        it('should return text parts unchanged', () => {
            const content: ContentPart[] = [
                { type: 'text', text: 'Hello' },
            ];

            const result = normalizeContent(content);
            expect(result).toEqual(content);
        });

        it('should return image_url parts unchanged', () => {
            const content: ContentPart[] = [
                { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } },
            ];

            const result = normalizeContent(content);
            expect(result).toEqual(content);
        });

        it('should convert image with URL string to image_url', () => {
            const content: ContentPart[] = [
                { type: 'image', image: 'https://example.com/image.jpg' } as ImageContentPart,
            ];

            const result = normalizeContent(content) as ContentPart[];
            expect(result[0].type).toBe('image_url');
            expect((result[0] as ImageUrlContentPart).image_url.url).toBe('https://example.com/image.jpg');
        });

        it('should convert image with data URL string unchanged', () => {
            const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
            const content: ContentPart[] = [
                { type: 'image', image: dataUrl } as ImageContentPart,
            ];

            const result = normalizeContent(content) as ContentPart[];
            expect(result[0].type).toBe('image_url');
            expect((result[0] as ImageUrlContentPart).image_url.url).toBe(dataUrl);
        });

        it('should convert image with base64 string to data URL', () => {
            const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            const content: ContentPart[] = [
                { type: 'image', image: base64 } as ImageContentPart,
            ];

            const result = normalizeContent(content) as ContentPart[];
            expect(result[0].type).toBe('image_url');
            expect((result[0] as ImageUrlContentPart).image_url.url).toContain('data:image/png;base64,');
        });

        it('should convert image with URL object to string', () => {
            const url = new URL('https://example.com/image.jpg');
            const content: ContentPart[] = [
                { type: 'image', image: url } as ImageContentPart,
            ];

            const result = normalizeContent(content) as ContentPart[];
            expect(result[0].type).toBe('image_url');
            expect((result[0] as ImageUrlContentPart).image_url.url).toBe('https://example.com/image.jpg');
        });

        it('should convert Uint8Array to data URL with MIME detection', () => {
            // PNG magic bytes
            const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
            const content: ContentPart[] = [
                { type: 'image', image: pngBytes } as ImageContentPart,
            ];

            const result = normalizeContent(content) as ContentPart[];
            expect(result[0].type).toBe('image_url');
            expect((result[0] as ImageUrlContentPart).image_url.url).toContain('data:image/png;base64,');
        });

        it('should convert ArrayBuffer to data URL', () => {
            // JPEG magic bytes
            const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
            const content: ContentPart[] = [
                { type: 'image', image: jpegBytes.buffer } as ImageContentPart,
            ];

            const result = normalizeContent(content) as ContentPart[];
            expect(result[0].type).toBe('image_url');
            expect((result[0] as ImageUrlContentPart).image_url.url).toContain('data:image/jpeg;base64,');
        });

        it('should preserve detail level when converting', () => {
            const content: ContentPart[] = [
                { type: 'image', image: 'https://example.com/image.jpg', detail: 'high' } as ImageContentPart,
            ];

            const result = normalizeContent(content) as ContentPart[];
            expect((result[0] as ImageUrlContentPart).image_url.detail).toBe('high');
        });

        it('should handle mixed content parts', () => {
            const content: ContentPart[] = [
                { type: 'text', text: 'Describe this:' },
                { type: 'image', image: 'https://example.com/image.jpg' } as ImageContentPart,
                { type: 'text', text: 'What do you see?' },
            ];

            const result = normalizeContent(content) as ContentPart[];
            expect(result).toHaveLength(3);
            expect(result[0].type).toBe('text');
            expect(result[1].type).toBe('image_url');
            expect(result[2].type).toBe('text');
        });
    });

    describe('hasImageParts', () => {
        it('should return false for string content', () => {
            expect(hasImageParts('Hello')).toBe(false);
        });

        it('should return false for text-only parts', () => {
            const content: ContentPart[] = [
                { type: 'text', text: 'Hello' },
            ];
            expect(hasImageParts(content)).toBe(false);
        });

        it('should return false for image_url parts (already normalized)', () => {
            const content: ContentPart[] = [
                { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } },
            ];
            expect(hasImageParts(content)).toBe(false);
        });

        it('should return true for image parts', () => {
            const content: ContentPart[] = [
                { type: 'image', image: 'https://example.com/image.jpg' } as ImageContentPart,
            ];
            expect(hasImageParts(content)).toBe(true);
        });
    });
});
