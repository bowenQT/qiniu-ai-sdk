import { describe, it, expect, beforeEach } from 'vitest';
import {
    MetricsCollector,
    type AgentMetrics,
} from '../../../src/lib/metrics';

describe('MetricsCollector', () => {
    let collector: MetricsCollector;

    beforeEach(() => {
        collector = new MetricsCollector();
    });

    describe('Initial State', () => {
        it('should start with zero metrics', () => {
            const metrics = collector.getMetrics();
            expect(metrics.totalSteps).toBe(0);
            expect(metrics.totalTokens.prompt).toBe(0);
            expect(metrics.totalTokens.completion).toBe(0);
            expect(metrics.guardrailBlocks).toBe(0);
            expect(metrics.checkpointSaves).toBe(0);
            expect(metrics.errors.recoverable).toBe(0);
            expect(metrics.errors.fatal).toBe(0);
            expect(metrics.toolCalls).toEqual([]);
        });
    });

    describe('recordStep', () => {
        it('should increment step count', () => {
            collector.recordStep();
            collector.recordStep();
            collector.recordStep();
            expect(collector.getMetrics().totalSteps).toBe(3);
        });
    });

    describe('recordTokens', () => {
        it('should accumulate token counts', () => {
            collector.recordTokens(100, 50);
            collector.recordTokens(200, 80);

            const metrics = collector.getMetrics();
            expect(metrics.totalTokens.prompt).toBe(300);
            expect(metrics.totalTokens.completion).toBe(130);
        });
    });

    describe('recordGuardrailBlock', () => {
        it('should increment guardrail block count', () => {
            collector.recordGuardrailBlock();
            collector.recordGuardrailBlock();
            expect(collector.getMetrics().guardrailBlocks).toBe(2);
        });
    });

    describe('recordCheckpointSave', () => {
        it('should increment checkpoint save count', () => {
            collector.recordCheckpointSave();
            expect(collector.getMetrics().checkpointSaves).toBe(1);
        });
    });

    describe('recordRecoverableError / recordFatalError', () => {
        it('should track error counts separately', () => {
            collector.recordRecoverableError();
            collector.recordRecoverableError();
            collector.recordFatalError();

            const metrics = collector.getMetrics();
            expect(metrics.errors.recoverable).toBe(2);
            expect(metrics.errors.fatal).toBe(1);
        });
    });

    describe('recordToolLatency', () => {
        it('should add tool call metrics', () => {
            collector.recordToolLatency('search', 150, 'local');
            collector.recordToolLatency('fetch', 200, 'mcp');

            const metrics = collector.getMetrics();
            expect(metrics.toolCalls).toHaveLength(2);

            const searchTool = metrics.toolCalls.find(t => t.name === 'search');
            expect(searchTool).toEqual({
                name: 'search',
                count: 1,
                totalLatencyMs: 150,
                source: 'local',
            });
        });

        it('should aggregate multiple calls to same tool', () => {
            collector.recordToolLatency('fetch', 100, 'mcp');
            collector.recordToolLatency('fetch', 150, 'mcp');
            collector.recordToolLatency('fetch', 200, 'mcp');

            const metrics = collector.getMetrics();
            const fetchTool = metrics.toolCalls.find(t => t.name === 'fetch');
            expect(fetchTool?.count).toBe(3);
            expect(fetchTool?.totalLatencyMs).toBe(450);
        });
    });

    describe('updateTokenLimiterUsage', () => {
        it('should update token limiter metrics', () => {
            collector.updateTokenLimiterUsage({
                inputUsed: 5000,
                inputLimit: 20000,
            });

            const metrics = collector.getMetrics();
            expect(metrics.tokenLimiterUsage.inputUsed).toBe(5000);
            expect(metrics.tokenLimiterUsage.inputLimit).toBe(20000);
        });
    });

    describe('reset', () => {
        it('should clear all metrics', () => {
            collector.recordStep();
            collector.recordTokens(100, 50);
            collector.recordRecoverableError();
            collector.recordToolLatency('test', 100, 'local');

            collector.reset();

            const metrics = collector.getMetrics();
            expect(metrics.totalSteps).toBe(0);
            expect(metrics.totalTokens.prompt).toBe(0);
            expect(metrics.errors.recoverable).toBe(0);
            expect(metrics.toolCalls).toEqual([]);
        });
    });

    describe('formatPrometheus', () => {
        it('should format metrics in Prometheus exposition format', () => {
            collector.recordStep();
            collector.recordStep();
            collector.recordTokens(100, 50);
            collector.recordRecoverableError();
            collector.recordToolLatency('search', 150, 'local');

            const output = collector.formatPrometheus({
                app: 'test-agent',
            });

            expect(output).toContain('# HELP qiniu_agent_steps_total');
            expect(output).toContain('# TYPE qiniu_agent_steps_total counter');
            expect(output).toContain('qiniu_agent_steps_total{app="test-agent"} 2');

            expect(output).toContain('qiniu_agent_tokens_total');
            expect(output).toContain('qiniu_agent_errors_total');
            expect(output).toContain('qiniu_agent_tool_calls_total');
            expect(output).toContain('qiniu_agent_tool_latency_seconds_sum');
        });

        it('should handle empty labels', () => {
            collector.recordStep();
            const output = collector.formatPrometheus();
            expect(output).toContain('qiniu_agent_steps_total 1');
        });
    });
});

describe('createMetricsHandler', () => {
    it('should create a Node.js-style handler function', async () => {
        const { createMetricsHandler } = await import('../../../src/lib/metrics');
        const collector = new MetricsCollector();
        const handler = createMetricsHandler(collector, { labels: { app: 'test' } });
        expect(typeof handler).toBe('function');
    });

    it('should call setHeader and end on response object', async () => {
        const { createMetricsHandler } = await import('../../../src/lib/metrics');
        const collector = new MetricsCollector();
        collector.recordStep();

        const handler = createMetricsHandler(collector, { labels: { app: 'test' } });

        let contentType = '';
        let body = '';
        const mockRes = {
            setHeader: (k: string, v: string) => { if (k === 'Content-Type') contentType = v; },
            end: (b: string) => { body = b; },
        };

        handler({}, mockRes);

        expect(contentType).toBe('text/plain; version=0.0.4; charset=utf-8');
        expect(body).toContain('qiniu_agent_steps_total');
    });
});
