import { describe, it, expect, vi } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { generateText } from '../../../src/ai/generate-text';
import { createSSEResponse } from '../../mocks/fetch';
import { MaxStepsExceededError } from '../../../src/lib/errors';

function buildChunk(delta: Record<string, unknown>, finishReason: string | null, usage?: unknown) {
    return {
        id: 'chat-1',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'test-model',
        choices: [{ index: 0, delta, finish_reason: finishReason }],
        usage,
    };
}

describe('generateText', () => {
    it('should return text and reasoning from a single step', async () => {
        const chunks = [
            buildChunk({ reasoning_content: 'Think ' }, null),
            buildChunk({ content: 'Hello' }, null),
            buildChunk({}, 'stop', { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }),
        ];

        const adapter = {
            fetch: vi.fn().mockResolvedValue(createSSEResponse(chunks)),
        };

        const client = new QiniuAI({ apiKey: 'sk-test', adapter });
        const result = await generateText({
            client,
            model: 'test-model',
            prompt: 'Hello?',
        });

        expect(result.text).toBe('Hello');
        expect(result.reasoning).toBe('Think ');
        expect(result.finishReason).toBe('stop');
        expect(result.steps[0].reasoning).toBe('Think ');
    });

    it('should execute tool calls and continue', async () => {
        const firstStepChunks = [
            buildChunk({
                tool_calls: [
                    {
                        index: 0,
                        id: 'call-1',
                        type: 'function',
                        function: { name: 'getTime', arguments: '{"tz":"UTC"}' },
                    },
                ],
            }, null),
            buildChunk({}, 'tool_calls'),
        ];

        const secondStepChunks = [
            buildChunk({ content: 'Done' }, null),
            buildChunk({}, 'stop'),
        ];

        const adapter = {
            fetch: vi
                .fn()
                .mockResolvedValueOnce(createSSEResponse(firstStepChunks))
                .mockResolvedValueOnce(createSSEResponse(secondStepChunks)),
        };

        const client = new QiniuAI({ apiKey: 'sk-test', adapter });
        const result = await generateText({
            client,
            model: 'test-model',
            prompt: 'What time is it?',
            maxSteps: 2,
            tools: {
                getTime: {
                    execute: async () => ({ now: '2025-01-01T00:00:00Z' }),
                },
            },
        });

        expect(result.text).toBe('Done');
        expect(result.steps.some((step) => step.type === 'tool_call')).toBe(true);
        expect(result.steps.some((step) => step.type === 'tool_result')).toBe(true);
    });

    it('should throw when maxSteps is exceeded', async () => {
        const firstStepChunks = [
            buildChunk({
                tool_calls: [
                    {
                        index: 0,
                        id: 'call-1',
                        type: 'function',
                        function: { name: 'getTime', arguments: '{"tz":"UTC"}' },
                    },
                ],
            }, null),
            buildChunk({}, 'tool_calls'),
        ];

        const adapter = {
            fetch: vi.fn().mockResolvedValue(createSSEResponse(firstStepChunks)),
        };

        const client = new QiniuAI({ apiKey: 'sk-test', adapter });

        await expect(
            generateText({
                client,
                model: 'test-model',
                prompt: 'What time is it?',
                maxSteps: 1,
                tools: {
                    getTime: {
                        execute: async () => ({ now: '2025-01-01T00:00:00Z' }),
                    },
                },
            })
        ).rejects.toBeInstanceOf(MaxStepsExceededError);
    });
});
