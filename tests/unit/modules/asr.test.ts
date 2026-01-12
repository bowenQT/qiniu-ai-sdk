import { describe, it, expect } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createStaticMockFetch } from '../../mocks/fetch';

describe('ASR Module', () => {
    describe('transcribe()', () => {
        it('should throw error if audio is not provided', async () => {
            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
            });

            await expect(client.asr.transcribe({} as any)).rejects.toThrow(
                'Audio data is required'
            );
        });

        it('should throw error if neither url nor data is provided', async () => {
            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
            });

            await expect(
                client.asr.transcribe({ audio: { format: 'mp3' } })
            ).rejects.toThrow('Either audio.url or audio.data must be provided');
        });

        it('should throw error if both url and data are provided', async () => {
            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
            });

            await expect(
                client.asr.transcribe({
                    audio: { format: 'mp3', url: 'https://example.com/audio.mp3', data: 'base64' },
                })
            ).rejects.toThrow('Only one of audio.url or audio.data should be provided');
        });

        it('should throw error if format is missing', async () => {
            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
            });

            await expect(
                client.asr.transcribe({ audio: { url: 'https://example.com/audio.mp3' } } as any)
            ).rejects.toThrow('Audio format is required');
        });

        it('should throw error if raw format without sample_rate', async () => {
            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
            });

            await expect(
                client.asr.transcribe({
                    audio: { format: 'raw', url: 'https://example.com/audio.raw' },
                })
            ).rejects.toThrow('sample_rate is required for raw/pcm audio format');
        });

        it('should transcribe audio from URL', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    text: 'Hello, this is a test.',
                    duration: 3500,
                    language: 'en',
                    confidence: 0.92,
                },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.asr.transcribe({
                audio: {
                    format: 'mp3',
                    url: 'https://example.com/audio.mp3',
                },
            });

            expect(result.text).toBe('Hello, this is a test.');
            expect(result.duration).toBe(3500);
            expect(result.language).toBe('en');
            expect(mockFetch.calls[0].url).toContain('/voice/asr');
        });

        it('should transcribe audio from base64 data', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    text: 'Test transcription',
                    duration_ms: 2000,
                },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.asr.transcribe({
                audio: {
                    format: 'wav',
                    data: 'base64audiodata',
                },
            });

            expect(result.text).toBe('Test transcription');
            expect(result.duration).toBe(2000);

            const body = JSON.parse(mockFetch.calls[0].init?.body as string);
            expect(body.audio.data).toBe('base64audiodata');
            expect(body.audio.format).toBe('wav');
        });

        it('should include word timings when available', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    text: 'Hello world',
                    duration: 1500,
                    words: [
                        { word: 'Hello', start: 0, end: 700, confidence: 0.95 },
                        { word: 'world', start: 800, end: 1500, confidence: 0.93 },
                    ],
                },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.asr.transcribe({
                audio: { format: 'mp3', url: 'https://example.com/audio.mp3' },
            });

            expect(result.words).toHaveLength(2);
            expect(result.words?.[0].word).toBe('Hello');
            expect(result.words?.[0].start).toBe(0);
            expect(result.words?.[0].end).toBe(700);
        });

        it('should handle nested response format', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: {
                    data: {
                        audio_info: { duration: 9336 },
                        result: {
                            additions: { duration: '9336' },
                            text: 'Nested result text',
                        },
                    },
                },
            });

            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
            });

            const result = await client.asr.transcribe({
                audio: { format: 'mp3', url: 'https://example.com/audio.mp3' },
            });

            expect(result.text).toBe('Nested result text');
            expect(result.duration).toBe(9336);
        });
    });
});
