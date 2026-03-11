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
});
