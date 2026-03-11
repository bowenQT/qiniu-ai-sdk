/**
 * TDD RED: Types alignment tests for Phase 1
 * These tests verify that our types match the latest Qiniu API documentation.
 */
import { describe, it, expect } from 'vitest';
import type {
    ChatCompletionRequest,
    ChatMessage,
    ContentPart,
} from '../../../src/lib/types';

describe('Phase 1: ChatCompletionRequest Alignment', () => {
    it('should accept enable_thinking parameter', () => {
        const req: ChatCompletionRequest = {
            model: 'gemini-3.0-pro-preview',
            messages: [{ role: 'user', content: 'Hi' }],
            enable_thinking: true,
        };
        expect(req.enable_thinking).toBe(true);
    });

    it('should accept thinking configuration', () => {
        const req: ChatCompletionRequest = {
            model: 'gemini-2.5-pro',
            messages: [{ role: 'user', content: 'Hi' }],
            thinking: {
                type: 'enabled',
                budget_tokens: 8192,
            },
        };
        expect(req.thinking?.type).toBe('enabled');
        expect(req.thinking?.budget_tokens).toBe(8192);
    });

    it('should accept reasoning configuration', () => {
        const req: ChatCompletionRequest = {
            model: 'openai/gpt-5',
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning: {
                effort: 'high',
                max_tokens: 4096,
                exclude: false,
                enabled: true,
            },
        };
        expect(req.reasoning?.effort).toBe('high');
        expect(req.reasoning?.max_tokens).toBe(4096);
    });

    it('should accept reasoning_effort as top-level field', () => {
        const req: ChatCompletionRequest = {
            model: 'gemini-2.5-flash',
            messages: [{ role: 'user', content: 'Hi' }],
            reasoning_effort: 'medium',
        };
        expect(req.reasoning_effort).toBe('medium');
    });

    it('should accept modalities array', () => {
        const req: ChatCompletionRequest = {
            model: 'gemini-3.0-pro-image-preview',
            messages: [{ role: 'user', content: 'Hi' }],
            modalities: ['text', 'image'],
        };
        expect(req.modalities).toEqual(['text', 'image']);
    });

    it('should accept image_config', () => {
        const req: ChatCompletionRequest = {
            model: 'gemini-3.0-pro-image-preview',
            messages: [{ role: 'user', content: 'Hi' }],
            image_config: {
                aspect_ratio: '16:9',
                image_size: '4K',
            },
        };
        expect(req.image_config?.aspect_ratio).toBe('16:9');
    });

    it('should accept safety_settings array', () => {
        const req: ChatCompletionRequest = {
            model: 'gemini-2.5-flash',
            messages: [{ role: 'user', content: 'Hi' }],
            safety_settings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            ],
        };
        expect(req.safety_settings?.[0].category).toBe('HARM_CATEGORY_HARASSMENT');
    });

    it('should accept repetition_penalty and top_k', () => {
        const req: ChatCompletionRequest = {
            model: 'qwen3-max',
            messages: [{ role: 'user', content: 'Hi' }],
            repetition_penalty: 1.1,
            top_k: 50,
        };
        expect(req.repetition_penalty).toBe(1.1);
        expect(req.top_k).toBe(50);
    });

    it('should accept chat_template_kwargs', () => {
        const req: ChatCompletionRequest = {
            model: 'deepseek-v3',
            messages: [{ role: 'user', content: 'Hi' }],
            chat_template_kwargs: {
                thinking: true,
                enable_thinking: true,
                thinking_budget: 4096,
            },
        };
        expect(req.chat_template_kwargs?.thinking).toBe(true);
    });
});

describe('Phase 1: ContentPart Multi-modal Extension', () => {
    it('should support video_url content part', () => {
        const part: ContentPart = {
            type: 'video_url',
            video_url: { url: 'https://example.com/video.mp4' },
        };
        expect(part.type).toBe('video_url');
    });

    it('should support file content part', () => {
        const part: ContentPart = {
            type: 'file',
            file: {
                file_id: 'file-abc123',
                format: 'video/mp4',
            },
        };
        expect(part.type).toBe('file');
    });

    it('should support input_audio content part', () => {
        const part: ContentPart = {
            type: 'input_audio',
            input_audio: {
                data: 'base64encodedaudio',
                format: 'mp3',
            },
        };
        expect(part.type).toBe('input_audio');
    });

    it('should support file_url content part', () => {
        const part: ContentPart = {
            type: 'file_url',
            file_url: { url: 'https://example.com/doc.pdf' },
        };
        expect(part.type).toBe('file_url');
    });

    it('should support thinking content part (Claude)', () => {
        const part: ContentPart = {
            type: 'thinking',
            thinking: 'I need to analyze this...',
            signature: 'sig-abc',
        };
        expect(part.type).toBe('thinking');
    });
});

describe('Phase 1: ChatMessage Extension', () => {
    it('should support function role', () => {
        const msg: ChatMessage = {
            role: 'function',
            content: '{"result": 42}',
            name: 'get_answer',
        };
        expect(msg.role).toBe('function');
    });

    it('should support reasoning_content field', () => {
        const msg: ChatMessage = {
            role: 'assistant',
            content: 'The answer is 42.',
            reasoning_content: 'Let me think about this step by step...',
        };
        expect(msg.reasoning_content).toBe('Let me think about this step by step...');
    });

    it('should support thinking_blocks field', () => {
        const msg: ChatMessage = {
            role: 'assistant',
            content: 'Hello',
            thinking_blocks: [
                { type: 'thinking', thinking: 'Analyzing...', signature: 'sig-1' },
            ],
        };
        expect(msg.thinking_blocks?.[0].type).toBe('thinking');
    });
});
