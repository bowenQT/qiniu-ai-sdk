/**
 * TDD RED: Response API module tests for Phase 3
 */
import { describe, it, expect } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createStaticMockFetch } from '../../mocks/fetch';

describe('Phase 3: Response API Module (@experimental)', () => {
    it('should have a response property on client', () => {
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
        });
        expect(client.response).toBeDefined();
    });

    it('should create a response via /v1/llm/v1/responses', async () => {
        const mockResponse = {
            id: 'resp-abc123',
            object: 'response',
            created_at: 1234567890,
            status: 'completed',
            output: [
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'Hello!' }],
                },
            ],
            reasoning: {
                effort: 'high',
                encrypted_content: 'enc_abc_123',
            },
        };

        const mockFetch = createStaticMockFetch({ status: 200, body: mockResponse });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.response.create({
            model: 'openai/gpt-5',
            input: 'Hi',
        });

        expect(result.id).toBe('resp-abc123');
        expect(result.status).toBe('completed');
        expect(result.reasoning?.encrypted_content).toBe('enc_abc_123');
    });

    it('should accept multimodal response input messages', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: { id: 'resp-1', status: 'completed' },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await client.response.create({
            model: 'openai/gpt-5',
            input: [
                {
                    role: 'developer',
                    content: [
                        {
                            type: 'text',
                            text: 'Prefer concise answers.',
                            cache_control: { type: 'ephemeral' },
                        },
                    ],
                },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Analyze these inputs' },
                        { type: 'file_url', file_url: { url: 'https://example.com/doc.pdf' } },
                        {
                            type: 'input_audio',
                            input_audio: {
                                data: 'YmFzZTY0LWF1ZGlv',
                                format: 'mp3',
                            },
                        },
                    ],
                },
            ],
        });

        const body = JSON.parse(String(mockFetch.calls[0].init?.body));
        expect(body.input[0].role).toBe('developer');
        expect(body.input[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
        expect(body.input[1].content[1]).toEqual({
            type: 'file_url',
            file_url: { url: 'https://example.com/doc.pdf' },
        });
        expect(body.input[1].content[2].input_audio.format).toBe('mp3');
    });
});
