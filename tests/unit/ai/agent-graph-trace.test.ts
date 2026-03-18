import { describe, expect, it, vi } from 'vitest';
import { AgentGraph } from '../../../src/ai/agent-graph';
import { createAgent } from '../../../src/ai/create-agent';
import type { PricePolicy, RunTrace, TraceStore } from '../../../src/ai/control-plane';
import type { LanguageModelClient } from '../../../src/core/client';

function createMockClient(text = 'Hello from trace'): LanguageModelClient {
    return {
        chat: {
            async *createStream() {
                return {
                    content: text,
                    reasoningContent: 'reasoning',
                    toolCalls: [],
                    finishReason: 'stop',
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
                };
            },
        },
        getBaseUrl: () => 'https://api.example.com/v1',
    } as LanguageModelClient;
}

function createTraceHarness(): {
    traces: RunTrace[];
    traceStore: TraceStore;
    pricePolicy: PricePolicy;
} {
    const traces: RunTrace[] = [];

    return {
        traces,
        traceStore: {
            putRunTrace: (trace) => {
                traces.push(trace);
            },
        },
        pricePolicy: {
            policyId: 'test-pricing',
            lookup: ({ modelId, promptTokens = 0, completionTokens = 0 }) => ({
                modelId,
                currency: 'USD',
                promptCostPer1kTokens: 0.001,
                completionCostPer1kTokens: 0.002,
                estimatedCost: promptTokens * 0.001 / 1000 + completionTokens * 0.002 / 1000,
                priceSource: 'unit-test',
            }),
        },
    };
}

describe('AgentGraph control-plane trace hooks', () => {
    it('emits structured run traces with per-step usage and cost attribution', async () => {
        const { traces, traceStore, pricePolicy } = createTraceHarness();
        const graph = new AgentGraph({
            client: createMockClient(),
            model: 'test-model',
            traceStore,
            pricePolicy,
            runMetadata: {
                taskId: 'task-123',
                provider: 'qiniu',
                route: 'primary',
            },
        });

        await graph.invoke([{ role: 'user', content: 'hello' }]);

        expect(traces).toHaveLength(1);
        expect(traces[0].taskId).toBe('task-123');
        expect(traces[0].modelId).toBe('test-model');
        expect(traces[0].provider).toBe('qiniu');
        expect(traces[0].usage).toEqual({
            promptTokens: 10,
            completionTokens: 20,
            totalTokens: 30,
        });
        expect(traces[0].steps[0]).toMatchObject({
            type: 'predict',
            finishReason: 'stop',
            usage: {
                promptTokens: 10,
                completionTokens: 20,
                totalTokens: 30,
            },
            cost: {
                currency: 'USD',
                priceSource: 'unit-test',
            },
        });
    });

    it('passes traceStore, pricePolicy, and runMetadata through createAgent', async () => {
        const { traces, traceStore, pricePolicy } = createTraceHarness();
        const agent = createAgent({
            client: createMockClient('agent reply'),
            model: 'agent-model',
            traceStore,
            pricePolicy,
            runMetadata: {
                taskId: 'agent-task',
                promptRevision: {
                    kind: 'prompt',
                    revisionId: 'rev_prompt_1',
                    labels: ['candidate'],
                },
            },
        });

        const result = await agent.run({ prompt: 'hello from agent' });

        expect(result.text).toBe('agent reply');
        expect(traces).toHaveLength(1);
        expect(traces[0].taskId).toBe('agent-task');
        expect(traces[0].promptRevision?.revisionId).toBe('rev_prompt_1');
        expect(traces[0].steps[0]?.type).toBe('predict');
    });
});
