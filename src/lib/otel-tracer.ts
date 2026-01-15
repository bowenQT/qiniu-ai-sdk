/**
 * OpenTelemetry Tracer adapter.
 * Wraps @opentelemetry/api for seamless integration.
 *
 * @optional - This file only works if @opentelemetry/api is installed.
 */

import type { Span, Tracer, TracerConfig } from './tracer';
import { DEFAULT_TRACER_CONFIG, redactAttributes } from './tracer';

/** OTel API types (to avoid hard dependency) */
interface IOTelSpan {
    setAttribute(key: string, value: string | number | boolean | string[] | number[] | boolean[]): this;
    setAttributes(attributes: Record<string, string | number | boolean>): this;
    recordException(exception: Error): void;
    addEvent(name: string, attributes?: Record<string, string | number | boolean>): this;
    end(): void;
}

interface IOTelTracer {
    startSpan(name: string, options?: { attributes?: Record<string, string | number | boolean> }): IOTelSpan;
}

interface IOTelTracerProvider {
    getTracer(name: string, version?: string): IOTelTracer;
}

/**
 * Span wrapper around OTel span.
 */
class OTelSpanWrapper implements Span {
    constructor(
        private readonly otelSpan: IOTelSpan,
        private readonly config: TracerConfig
    ) { }

    setAttribute(key: string, value: string | number | boolean): void {
        this.otelSpan.setAttribute(key, value);
    }

    setAttributes(attributes: Record<string, string | number | boolean>): void {
        this.otelSpan.setAttributes(redactAttributes(attributes, this.config));
    }

    recordException(error: Error): void {
        this.otelSpan.recordException(error);
    }

    addEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
        this.otelSpan.addEvent(name, attributes ? redactAttributes(attributes, this.config) : undefined);
    }

    end(): void {
        this.otelSpan.end();
    }
}

/**
 * OpenTelemetry Tracer implementation.
 * Requires @opentelemetry/api as a peer dependency.
 *
 * @example
 * ```typescript
 * import { trace } from '@opentelemetry/api';
 * import { OTelTracer, setGlobalTracer } from '@bowenqt/qiniu-ai-sdk';
 *
 * const provider = trace.getTracerProvider();
 * const tracer = new OTelTracer(provider, { recordPrompts: false });
 * setGlobalTracer(tracer);
 * ```
 */
export class OTelTracer implements Tracer {
    private readonly otelTracer: IOTelTracer;
    private readonly config: Required<TracerConfig>;

    constructor(provider: IOTelTracerProvider, config: TracerConfig = {}) {
        this.otelTracer = provider.getTracer('qiniu-ai-sdk', '0.13.0');
        this.config = { ...DEFAULT_TRACER_CONFIG, ...config };
    }

    startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
        const otelSpan = this.otelTracer.startSpan(name, {
            attributes: attributes ? redactAttributes(attributes, this.config) : undefined,
        });
        return new OTelSpanWrapper(otelSpan, this.config);
    }

    async withSpan<T>(name: string, fn: (span: Span) => Promise<T> | T): Promise<T> {
        const span = this.startSpan(name);
        try {
            const result = await fn(span);
            return result;
        } catch (error) {
            span.recordException(error as Error);
            throw error;
        } finally {
            span.end();
        }
    }

    getConfig(): TracerConfig {
        return this.config;
    }
}
