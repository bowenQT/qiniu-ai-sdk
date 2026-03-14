/**
 * TDD RED: Anthropic protocol module tests for Phase 3
 */
import { describe, it, expect, vi } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createStaticMockFetch, createSSEResponse } from '../../mocks/fetch';

describe('Phase 3: Anthropic Module', () => {
    it('should have an anthropic property on client', () => {
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
        });
        expect(client.anthropic).toBeDefined();
    });

    it('should create an Anthropic message via /v1/messages', async () => {
        const mockResponse = {
            id: 'msg-abc123',
            type: 'message',
            role: 'assistant',
            content: [
                { type: 'text', text: 'Hello!' },
            ],
            model: 'claude-4.5-sonnet',
            stop_reason: 'end_turn',
            usage: {
                input_tokens: 10,
                output_tokens: 5,
            },
        };

        const mockFetch = createStaticMockFetch({ status: 200, body: mockResponse });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.anthropic.create({
            model: 'claude-4.5-sonnet',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 1024,
        });

        expect(result.id).toBe('msg-abc123');
        expect(result.type).toBe('message');
        expect(result.content[0].text).toBe('Hello!');
    });

    it('should post to /messages endpoint, not /chat/completions', async () => {
        const mockFetch = createStaticMockFetch({ status: 200, body: { id: 'msg-1' } });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await client.anthropic.create({
            model: 'claude-4.5-sonnet',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 1024,
        });

        // Verify the fetch was called with /messages path
        expect(mockFetch.calls).toHaveLength(1);
        expect(mockFetch.calls[0].url).toContain('/messages');
        expect(mockFetch.calls[0].url).not.toContain('/chat/completions');
    });

    it('should forward multimodal content blocks and cache directives', async () => {
        const mockFetch = createStaticMockFetch({ status: 200, body: { id: 'msg-1' } });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await client.anthropic.create({
            model: 'claude-4.5-sonnet',
            system: [
                {
                    type: 'text',
                    text: 'System prompt',
                    cache_control: { type: 'ephemeral' },
                },
            ],
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Review these assets' },
                        { type: 'file_url', file_url: { url: 'https://example.com/spec.pdf' } },
                        { type: 'video_url', video_url: { url: 'https://example.com/demo.mp4' } },
                        {
                            type: 'thinking',
                            thinking: 'Need to compare both artifacts.',
                            signature: 'sig-1',
                        },
                    ],
                },
            ],
            max_tokens: 1024,
        });

        const body = JSON.parse(String(mockFetch.calls[0].init?.body));
        expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
        expect(body.messages[0].content[1]).toEqual({
            type: 'file_url',
            file_url: { url: 'https://example.com/spec.pdf' },
        });
        expect(body.messages[0].content[2]).toEqual({
            type: 'video_url',
            video_url: { url: 'https://example.com/demo.mp4' },
        });
        expect(body.messages[0].content[3]).toEqual({
            type: 'thinking',
            thinking: 'Need to compare both artifacts.',
            signature: 'sig-1',
        });
    });
});
