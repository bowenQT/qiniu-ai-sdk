import { describe, expect, it } from 'vitest';
import {
    aggregateTraceCost,
    aggregateTraceUsage,
    buildRunTraceSkeleton,
    createTraceStepId,
    createTraceUsage,
    estimateTraceCost,
} from '../../../src/ai/control-plane';

describe('control-plane runtime helpers', () => {
    it('creates trace usage from model usage payloads', () => {
        expect(createTraceUsage({
            prompt_tokens: 10,
            completion_tokens: 5,
        })).toEqual({
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
        });
    });

    it('builds stable run trace skeletons with metadata', () => {
        const trace = buildRunTraceSkeleton({
            modelId: 'qwen-max',
            threadId: 'thread-1',
            agentId: 'agent-1',
            runMetadata: {
                taskId: 'task-1',
                provider: 'qiniu',
                route: 'primary',
            },
        });

        expect(trace.traceId.startsWith('trace_')).toBe(true);
        expect(trace.runId.startsWith('run_')).toBe(true);
        expect(trace.taskId).toBe('task-1');
        expect(trace.threadId).toBe('thread-1');
        expect(trace.agentId).toBe('agent-1');
        expect(trace.modelId).toBe('qwen-max');
        expect(trace.provider).toBe('qiniu');
        expect(trace.route).toBe('primary');
        expect(trace.steps).toEqual([]);
    });

    it('aggregates usage and cost from step traces', () => {
        const steps = [
            {
                stepId: createTraceStepId('predict', 1),
                type: 'predict' as const,
                startedAt: '2026-03-18T00:00:00.000Z',
                usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
                cost: { estimated: 0.1, actual: 0.2, currency: 'USD', priceSource: 'test' },
            },
            {
                stepId: createTraceStepId('predict', 2),
                type: 'predict' as const,
                startedAt: '2026-03-18T00:00:01.000Z',
                usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
                cost: { estimated: 0.01, actual: 0.02, currency: 'USD', priceSource: 'test' },
            },
        ];

        expect(aggregateTraceUsage(steps)).toEqual({
            promptTokens: 11,
            completionTokens: 22,
            totalTokens: 33,
        });
        expect(aggregateTraceCost(steps)).toEqual({
            estimated: 0.11,
            actual: 0.22,
            currency: 'USD',
            priceSource: 'test',
            billingSource: undefined,
            promptCostPer1kTokens: undefined,
            completionCostPer1kTokens: undefined,
        });
    });

    it('estimates cost through the configured price policy', async () => {
        const cost = await estimateTraceCost(
            {
                policyId: 'default',
                lookup: () => ({
                    modelId: 'qwen-max',
                    currency: 'USD',
                    estimatedCost: 1.23,
                    actualCost: 1.24,
                    priceSource: 'fixtures',
                    billingSource: 'fixtures',
                }),
            },
            {
                modelId: 'qwen-max',
                provider: 'qiniu',
                route: 'primary',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                metadata: { suite: 'smoke' },
            },
        );

        expect(cost).toEqual({
            estimated: 1.23,
            actual: 1.24,
            currency: 'USD',
            priceSource: 'fixtures',
            billingSource: 'fixtures',
            promptCostPer1kTokens: undefined,
            completionCostPer1kTokens: undefined,
        });
    });
});
