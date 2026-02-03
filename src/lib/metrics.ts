/**
 * Structured Telemetry Export for AgentGraph.
 * 
 * Provides metrics collection for observability with Prometheus/Grafana support.
 * 
 * Design decisions (v0.32.0):
 * - Instance-level collector (no global singleton, prevents cross-request pollution)
 * - SDK does NOT auto-start HTTP server (host app manages lifecycle)
 * - Rejected/truncated requests count to guardrailBlocks, NOT totalTokens
 * 
 * @module
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Tool call metrics with latency tracking */
export interface ToolCallMetric {
    /** Tool name */
    name: string;
    /** Total invocation count */
    count: number;
    /** Total latency in milliseconds (for avg calculation) */
    totalLatencyMs: number;
    /** Tool source type */
    source: 'local' | 'mcp' | 'skill';
}

/** Token limiter usage details */
export interface TokenLimiterUsage {
    /** Input tokens used */
    inputUsed: number;
    /** Input token limit */
    inputLimit: number;
    /** Output tokens used */
    outputUsed: number;
    /** Output token limit */
    outputLimit: number;
}

/** Aggregated agent metrics (per invoke() lifecycle) */
export interface AgentMetrics {
    // Counters
    /** Total reasoning/prediction steps */
    totalSteps: number;
    /** Total tokens consumed from LLM responses */
    totalTokens: { prompt: number; completion: number };
    /** Guardrail block count (including rejected requests) */
    guardrailBlocks: number;
    /** Checkpoint save operations */
    checkpointSaves: number;
    /** Error counts by type */
    errors: { recoverable: number; fatal: number };

    // Tool metrics (histogram-like)
    /** Per-tool call metrics */
    toolCalls: ToolCallMetric[];

    // Guardrail details
    /** Token limiter usage (last known state) */
    tokenLimiterUsage: TokenLimiterUsage;
}

/** Prometheus export labels */
export interface MetricsLabels {
    /** Application name */
    app?: string;
    /** Environment (dev/staging/prod) */
    env?: string;
    /** Agent identifier */
    agentId?: string;
    /** Index signature for compatibility with formatLabels */
    [key: string]: string | undefined;
}

/** Metrics export configuration */
export interface MetricsExportConfig {
    /** Push Gateway callback */
    onMetricsCollect?: (metrics: AgentMetrics, reset: () => void) => void;
    /** Prometheus labels */
    labels?: MetricsLabels;
}

// ============================================================================
// MetricsCollector Class
// ============================================================================

/**
 * Instance-level metrics collector for AgentGraph.
 * 
 * Each AgentGraph instance should have its own MetricsCollector to prevent
 * cross-request pollution in concurrent environments.
 * 
 * @example
 * ```typescript
 * const collector = new MetricsCollector();
 * collector.recordStep();
 * collector.recordTokens(100, 50);
 * collector.recordToolLatency('qiniu_ocr', 150, 'mcp');
 * console.log(collector.getMetrics());
 * ```
 */
export class MetricsCollector {
    private metrics: AgentMetrics;
    private toolMetricsMap: Map<string, ToolCallMetric> = new Map();

    constructor() {
        this.metrics = this.createEmptyMetrics();
    }

    // ========================================================================
    // Recording Methods
    // ========================================================================

    /** Record a prediction/reasoning step */
    recordStep(): void {
        this.metrics.totalSteps++;
    }

    /** Record token usage from LLM response */
    recordTokens(prompt: number, completion: number): void {
        this.metrics.totalTokens.prompt += prompt;
        this.metrics.totalTokens.completion += completion;
    }

    /** Record a guardrail block (including rejected requests) */
    recordGuardrailBlock(): void {
        this.metrics.guardrailBlocks++;
    }

    /** Record a checkpoint save operation */
    recordCheckpointSave(): void {
        this.metrics.checkpointSaves++;
    }

    /** Record a recoverable error */
    recordRecoverableError(): void {
        this.metrics.errors.recoverable++;
    }

    /** Record a fatal error */
    recordFatalError(): void {
        this.metrics.errors.fatal++;
    }

    /** 
     * Record tool execution latency.
     * Aggregates metrics per tool name.
     */
    recordToolLatency(
        name: string,
        latencyMs: number,
        source: 'local' | 'mcp' | 'skill' = 'local'
    ): void {
        let toolMetric = this.toolMetricsMap.get(name);
        if (!toolMetric) {
            toolMetric = { name, count: 0, totalLatencyMs: 0, source };
            this.toolMetricsMap.set(name, toolMetric);
        }
        toolMetric.count++;
        toolMetric.totalLatencyMs += latencyMs;
    }

    /** Update token limiter usage snapshot */
    updateTokenLimiterUsage(usage: Partial<TokenLimiterUsage>): void {
        Object.assign(this.metrics.tokenLimiterUsage, usage);
    }

    // ========================================================================
    // Query Methods
    // ========================================================================

    /** Get current metrics snapshot */
    getMetrics(): AgentMetrics {
        return {
            ...this.metrics,
            toolCalls: Array.from(this.toolMetricsMap.values()),
        };
    }

    /** Reset all metrics to initial state */
    reset(): void {
        this.metrics = this.createEmptyMetrics();
        this.toolMetricsMap.clear();
    }

    // ========================================================================
    // Export Methods
    // ========================================================================

    /**
     * Format metrics as Prometheus text exposition format.
     * 
     * @param labels - Optional labels to attach to all metrics
     * @returns Prometheus-compatible text
     * 
     * @example
     * ```
     * # HELP qiniu_agent_steps_total Total agent reasoning steps
     * # TYPE qiniu_agent_steps_total counter
     * qiniu_agent_steps_total{app="my-app"} 5
     * ```
     */
    formatPrometheus(labels?: MetricsLabels): string {
        const labelStr = this.formatLabels(labels);
        const lines: string[] = [];
        const metrics = this.getMetrics();

        // Steps counter
        lines.push('# HELP qiniu_agent_steps_total Total agent reasoning steps');
        lines.push('# TYPE qiniu_agent_steps_total counter');
        lines.push(`qiniu_agent_steps_total${labelStr} ${metrics.totalSteps}`);

        // Token counters
        lines.push('# HELP qiniu_agent_tokens_total Total tokens consumed');
        lines.push('# TYPE qiniu_agent_tokens_total counter');
        lines.push(`qiniu_agent_tokens_total${this.formatLabels({ ...labels, type: 'prompt' })} ${metrics.totalTokens.prompt}`);
        lines.push(`qiniu_agent_tokens_total${this.formatLabels({ ...labels, type: 'completion' })} ${metrics.totalTokens.completion}`);

        // Guardrail blocks
        lines.push('# HELP qiniu_agent_guardrail_blocks_total Total guardrail block events');
        lines.push('# TYPE qiniu_agent_guardrail_blocks_total counter');
        lines.push(`qiniu_agent_guardrail_blocks_total${labelStr} ${metrics.guardrailBlocks}`);

        // Checkpoint saves
        lines.push('# HELP qiniu_agent_checkpoint_saves_total Total checkpoint save operations');
        lines.push('# TYPE qiniu_agent_checkpoint_saves_total counter');
        lines.push(`qiniu_agent_checkpoint_saves_total${labelStr} ${metrics.checkpointSaves}`);

        // Errors
        lines.push('# HELP qiniu_agent_errors_total Total errors by type');
        lines.push('# TYPE qiniu_agent_errors_total counter');
        lines.push(`qiniu_agent_errors_total${this.formatLabels({ ...labels, type: 'recoverable' })} ${metrics.errors.recoverable}`);
        lines.push(`qiniu_agent_errors_total${this.formatLabels({ ...labels, type: 'fatal' })} ${metrics.errors.fatal}`);

        // Tool latency (histogram approximation)
        if (metrics.toolCalls.length > 0) {
            lines.push('# HELP qiniu_agent_tool_calls_total Total tool invocations');
            lines.push('# TYPE qiniu_agent_tool_calls_total counter');
            lines.push('# HELP qiniu_agent_tool_latency_seconds_sum Total tool execution time');
            lines.push('# TYPE qiniu_agent_tool_latency_seconds_sum counter');

            for (const tool of metrics.toolCalls) {
                const toolLabels = this.formatLabels({ ...labels, name: tool.name, source: tool.source });
                lines.push(`qiniu_agent_tool_calls_total${toolLabels} ${tool.count}`);
                lines.push(`qiniu_agent_tool_latency_seconds_sum${toolLabels} ${(tool.totalLatencyMs / 1000).toFixed(3)}`);
            }
        }

        return lines.join('\n');
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private createEmptyMetrics(): AgentMetrics {
        return {
            totalSteps: 0,
            totalTokens: { prompt: 0, completion: 0 },
            guardrailBlocks: 0,
            checkpointSaves: 0,
            errors: { recoverable: 0, fatal: 0 },
            toolCalls: [],
            tokenLimiterUsage: {
                inputUsed: 0,
                inputLimit: 0,
                outputUsed: 0,
                outputLimit: 0,
            },
        };
    }

    private formatLabels(labels?: Record<string, string | undefined>): string {
        if (!labels) return '';
        const pairs = Object.entries(labels)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}="${v}"`);
        return pairs.length > 0 ? `{${pairs.join(',')}}` : '';
    }
}

// ============================================================================
// HTTP Handler Factory
// ============================================================================

/**
 * Create an HTTP request handler for Prometheus scraping.
 * 
 * SDK does NOT auto-start HTTP server. Host application integrates this handler
 * into their existing HTTP framework (Express, Koa, Hono, etc.).
 * 
 * @param collector - MetricsCollector instance
 * @param config - Export configuration
 * @returns Request handler function compatible with common frameworks
 * 
 * @example Express integration:
 * ```typescript
 * import express from 'express';
 * import { MetricsCollector, createMetricsHandler } from '@bowenqt/qiniu-ai-sdk';
 * 
 * const app = express();
 * const collector = new MetricsCollector();
 * 
 * app.get('/metrics', createMetricsHandler(collector, { labels: { app: 'my-agent' } }));
 * 
 * // Host app manages lifecycle
 * const server = app.listen(3000);
 * process.on('SIGTERM', () => server.close());
 * ```
 */
export function createMetricsHandler(
    collector: MetricsCollector,
    config?: MetricsExportConfig
): (req: unknown, res: { setHeader: (k: string, v: string) => void; end: (body: string) => void }) => void {
    return (_req, res) => {
        const metrics = collector.getMetrics();

        // Call optional push callback
        if (config?.onMetricsCollect) {
            config.onMetricsCollect(metrics, () => collector.reset());
        }

        // Return Prometheus format
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.end(collector.formatPrometheus(config?.labels));
    };
}
