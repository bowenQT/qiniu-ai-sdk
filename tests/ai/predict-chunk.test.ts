/**
 * Phase 6A RED Tests: predict-node onChunk callback
 */
import { describe, it, expect, vi } from 'vitest';
import { predict, type PredictChunk } from '../../src/ai/nodes/predict-node';
import { QiniuAI } from '../../src/client';
import { createSSEResponse } from '../mocks/fetch';

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

describe('predict onChunk callback', () => {
    it('should emit text-delta events for content chunks', async () => {
        const chunks = [
            buildChunk({ content: 'Hello' }, null),
            buildChunk({ content: ' world' }, null),
            buildChunk({}, 'stop', { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }),
        ];

        const adapter = { fetch: vi.fn().mockResolvedValue(createSSEResponse(chunks)) };
        const client = new QiniuAI({ apiKey: 'sk-test', adapter });

        const received: PredictChunk[] = [];
        const result = await predict({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'Hi' }],
            onChunk: (chunk) => received.push(chunk),
        });

        // Result should still work correctly
        expect(result.message.content).toBe('Hello world');
        expect(result.finishReason).toBe('stop');

        // onChunk should have received text-delta events
        const textDeltas = received.filter(c => c.type === 'text-delta');
        expect(textDeltas).toHaveLength(2);
        expect(textDeltas[0]).toEqual({ type: 'text-delta', textDelta: 'Hello' });
        expect(textDeltas[1]).toEqual({ type: 'text-delta', textDelta: ' world' });
    });

    it('should emit reasoning-delta events for reasoning_content chunks', async () => {
        const chunks = [
            buildChunk({ reasoning_content: 'Let me think' }, null),
            buildChunk({ reasoning_content: '...' }, null),
            buildChunk({ content: 'Answer' }, null),
            buildChunk({}, 'stop'),
        ];

        const adapter = { fetch: vi.fn().mockResolvedValue(createSSEResponse(chunks)) };
        const client = new QiniuAI({ apiKey: 'sk-test', adapter });

        const received: PredictChunk[] = [];
        await predict({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'Think' }],
            onChunk: (chunk) => received.push(chunk),
        });

        const reasoningDeltas = received.filter(c => c.type === 'reasoning-delta');
        expect(reasoningDeltas).toHaveLength(2);
        expect(reasoningDeltas[0]).toEqual({ type: 'reasoning-delta', reasoningDelta: 'Let me think' });
        expect(reasoningDeltas[1]).toEqual({ type: 'reasoning-delta', reasoningDelta: '...' });

        const textDeltas = received.filter(c => c.type === 'text-delta');
        expect(textDeltas).toHaveLength(1);
        expect(textDeltas[0]).toEqual({ type: 'text-delta', textDelta: 'Answer' });
    });

    it('should emit tool-call-delta events for incremental tool_calls', async () => {
        const chunks = [
            buildChunk({
                tool_calls: [{
                    index: 0,
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'getWeather', arguments: '{"ci' },
                }],
            }, null),
            buildChunk({
                tool_calls: [{
                    index: 0,
                    function: { arguments: 'ty":"NYC"}' },
                }],
            }, null),
            buildChunk({}, 'tool_calls'),
        ];

        const adapter = { fetch: vi.fn().mockResolvedValue(createSSEResponse(chunks)) };
        const client = new QiniuAI({ apiKey: 'sk-test', adapter });

        const received: PredictChunk[] = [];
        await predict({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'Weather?' }],
            onChunk: (chunk) => received.push(chunk),
        });

        const toolDeltas = received.filter(c => c.type === 'tool-call-delta');
        expect(toolDeltas).toHaveLength(2);
        expect(toolDeltas[0]).toEqual({
            type: 'tool-call-delta',
            index: 0,
            id: 'call-1',
            name: 'getWeather',
            argumentsDelta: '{"ci',
        });
        expect(toolDeltas[1]).toEqual({
            type: 'tool-call-delta',
            index: 0,
            id: undefined,
            name: undefined,
            argumentsDelta: 'ty":"NYC"}',
        });
    });

    it('should not crash when onChunk callback throws', async () => {
        const chunks = [
            buildChunk({ content: 'Hello' }, null),
            buildChunk({ content: ' world' }, null),
            buildChunk({}, 'stop'),
        ];

        const adapter = { fetch: vi.fn().mockResolvedValue(createSSEResponse(chunks)) };
        const client = new QiniuAI({ apiKey: 'sk-test', adapter });

        const result = await predict({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'Hi' }],
            onChunk: () => { throw new Error('callback boom'); },
        });

        // Result should still be correct despite callback error
        expect(result.message.content).toBe('Hello world');
        expect(result.finishReason).toBe('stop');
    });

    it('should not emit chunks in non-streaming (JSON) mode', async () => {
        const adapter = {
            fetch: vi.fn().mockResolvedValue(
                new Response(JSON.stringify({
                    id: 'chat-1',
                    object: 'chat.completion',
                    model: 'test-model',
                    choices: [{
                        index: 0,
                        message: { role: 'assistant', content: '{"key": "value"}' },
                        finish_reason: 'stop',
                    }],
                }), { status: 200, headers: { 'content-type': 'application/json' } }),
            ),
        };

        const client = new QiniuAI({ apiKey: 'sk-test', adapter });

        const received: PredictChunk[] = [];
        const result = await predict({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'JSON please' }],
            responseFormat: { type: 'json_object' },
            onChunk: (chunk) => received.push(chunk),
        });

        expect(result.message.content).toBe('{"key": "value"}');
        // No chunks should be emitted in non-streaming mode
        expect(received).toHaveLength(0);
    });

    it('should work correctly when onChunk is not provided', async () => {
        const chunks = [
            buildChunk({ content: 'Hello' }, null),
            buildChunk({}, 'stop'),
        ];

        const adapter = { fetch: vi.fn().mockResolvedValue(createSSEResponse(chunks)) };
        const client = new QiniuAI({ apiKey: 'sk-test', adapter });

        // No onChunk — should not crash
        const result = await predict({
            client,
            model: 'test-model',
            messages: [{ role: 'user', content: 'Hi' }],
        });

        expect(result.message.content).toBe('Hello');
    });
});
