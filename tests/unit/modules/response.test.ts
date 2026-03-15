/**
 * TDD RED: Response API module tests for Phase 3
 */
import { describe, it, expect } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { extractResponseOutputText } from '../../../src/modules/response';
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
        expect(result.output_text).toBe('Hello!');
        expect(result.reasoning?.encrypted_content).toBe('enc_abc_123');
        expect(mockFetch.calls[0].url).toContain('/llm/v1/responses?api-version=2025-04-01-preview');
    });

    it('should preserve backend-provided output_text when present', async () => {
        const mockResponse = {
            id: 'resp-server-text',
            status: 'completed',
            output_text: 'Server projection',
            output: [
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: 'Derived projection' }],
                },
            ],
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

        expect(result.output_text).toBe('Server projection');
    });

    it('should create a follow-up response using previousResponseId convenience input', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'resp-follow-up',
                status: 'completed',
                output: [
                    {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'output_text', text: 'Follow-up answer' }],
                    },
                ],
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.response.followUp({
            previousResponseId: 'resp-prev',
            model: 'gpt-5.2',
            input: 'Continue the earlier answer.',
            store: true,
        });

        expect(result.id).toBe('resp-follow-up');
        expect(result.output_text).toBe('Follow-up answer');
        expect(JSON.parse(String(mockFetch.calls[0].init?.body))).toMatchObject({
            model: 'gpt-5.2',
            input: 'Continue the earlier answer.',
            previous_response_id: 'resp-prev',
            store: true,
        });
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

    it('should forward documented preview request fields', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: { id: 'resp-preview', status: 'completed' },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await client.response.create({
            model: 'gpt-5.2',
            input: 'Hello',
            stream: false,
            include: ['reasoning.encrypted_content'],
            previous_response_id: 'resp-prev',
            store: true,
            background: false,
            parallel_tool_calls: true,
            truncation: 'disabled',
            user: 'user-123',
            metadata: { trace: 'abc' },
            top_p: 0.98,
            text: {
                format: { type: 'text' },
                verbosity: 'medium',
            },
        });

        const body = JSON.parse(String(mockFetch.calls[0].init?.body));
        expect(body).toMatchObject({
            model: 'gpt-5.2',
            input: 'Hello',
            stream: false,
            include: ['reasoning.encrypted_content'],
            previous_response_id: 'resp-prev',
            store: true,
            background: false,
            parallel_tool_calls: true,
            truncation: 'disabled',
            user: 'user-123',
            metadata: { trace: 'abc' },
            top_p: 0.98,
            text: {
                format: { type: 'text' },
                verbosity: 'medium',
            },
        });
    });

    it('should normalize image sugar content in response inputs', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: { id: 'resp-2', status: 'completed' },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await client.response.create({
            model: 'openai/gpt-5',
            input: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            image: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
                            cache_control: { type: 'ephemeral' },
                        },
                    ],
                },
            ],
        });

        const body = JSON.parse(String(mockFetch.calls[0].init?.body));
        expect(body.input[0].content[0]).toEqual({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,iVBORw==' },
            cache_control: { type: 'ephemeral' },
        });
    });

    it('should normalize Blob image sugar content in response inputs', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: { id: 'resp-3', status: 'completed' },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await client.response.create({
            model: 'openai/gpt-5',
            input: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            image: new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }),
                        },
                    ],
                },
            ],
        });

        const body = JSON.parse(String(mockFetch.calls[0].init?.body));
        expect(body.input[0].content[0]).toEqual({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,iVBORw==' },
        });
    });

    it('should extract concatenated text from response outputs', () => {
        expect(extractResponseOutputText({
            output: [
                {
                    type: 'message',
                    content: [
                        { type: 'output_text', text: 'Hello' },
                        { type: 'output_text', text: ', world' },
                    ],
                },
                {
                    type: 'message',
                    content: [
                        { type: 'output_text', text: '!' },
                    ],
                },
            ],
        } as any)).toBe('Hello, world!');

        expect(extractResponseOutputText({
            output: [
                {
                    type: 'message',
                    content: [
                        { type: 'image', image_url: { url: 'https://example.com/image.png' } },
                    ],
                },
            ],
        } as any)).toBeUndefined();
    });

    it('should preserve documented response metadata fields', async () => {
        const mockResponse = {
            id: 'resp-rich',
            object: 'response',
            created_at: 1770773311,
            model: 'gpt-5.2',
            status: 'completed',
            parallel_tool_calls: true,
            previous_response_id: 'resp-prev',
            store: true,
            background: false,
            text: {
                format: { type: 'text' },
                verbosity: 'medium',
            },
            usage: {
                input_tokens: 20,
                output_tokens: 98,
                total_tokens: 118,
                input_tokens_details: { cached_tokens: 0 },
                output_tokens_details: { reasoning_tokens: 76 },
            },
            output: [
                {
                    id: 'msg_1',
                    type: 'message',
                    role: 'assistant',
                    status: 'completed',
                    content: [{ type: 'output_text', text: 'Hello!' }],
                },
                {
                    id: 'rs_1',
                    type: 'reasoning',
                    status: null,
                    summary: [{ type: 'summary_text', text: 'Reasoned summary' }],
                    encrypted_content: 'enc_123',
                    content: null,
                },
            ],
        };

        const mockFetch = createStaticMockFetch({ status: 200, body: mockResponse });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.response.create({
            model: 'gpt-5.2',
            input: 'Hi',
        });

        expect(result.model).toBe('gpt-5.2');
        expect(result.parallel_tool_calls).toBe(true);
        expect(result.previous_response_id).toBe('resp-prev');
        expect(result.store).toBe(true);
        expect(result.text?.format?.type).toBe('text');
        expect(result.output?.[1].summary?.[0].text).toBe('Reasoned summary');
        expect(result.output?.[1].encrypted_content).toBe('enc_123');
    });
});
