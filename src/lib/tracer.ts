/**
 * Tracer abstraction for observability.
 * Provides pluggable tracing with PII redaction and configurable recording levels.
 *
 * Default: recordPrompts=true (development friendly)
 * Production: Use PRODUCTION_TRACER_CONFIG for safety
 */

/** Span interface */
export interface Span {
    /** Set a string attribute */
    setAttribute(key: string, value: string | number | boolean): void;
    /** Set multiple attributes */
    setAttributes(attributes: Record<string, string | number | boolean>): void;
    /** Record an error */
    recordException(error: Error): void;
    /** Add an event */
    addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
    /** End the span */
    end(): void;
}

/** Tracer configuration */
export interface TracerConfig {
    /** Record prompt content (default: true) */
    recordPrompts?: boolean;
    /** Record response content (default: true) */
    recordResponses?: boolean;
    /** Record tool arguments (default: true) */
    recordToolArgs?: boolean;
    /** Maximum content length before truncation (default: 1000) */
    maxContentLength?: number;
    /** Sensitive keys to mask (default: ['password', 'apiKey', 'token', 'secret']) */
    sensitiveKeys?: string[];
}

/** Tracer interface */
export interface Tracer {
    /** Start a new span */
    startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span;
    /** Execute a function within a span */
    withSpan<T>(name: string, fn: (span: Span) => Promise<T> | T): Promise<T>;
    /** Get the tracer config */
    getConfig(): TracerConfig;
}

/** Default configuration (development friendly) */
export const DEFAULT_TRACER_CONFIG: Required<TracerConfig> = {
    recordPrompts: true,
    recordResponses: true,
    recordToolArgs: true,
    maxContentLength: 1000,
    sensitiveKeys: ['password', 'apiKey', 'token', 'secret', 'authorization'],
};

/** Production configuration (safety first) */
export const PRODUCTION_TRACER_CONFIG: TracerConfig = {
    recordPrompts: false,
    recordResponses: false,
    recordToolArgs: false,
    maxContentLength: 200,
};

/**
 * Redact sensitive information from content.
 * Strategy: truncate first, then regex mask.
 */
export function redactContent(
    content: string,
    config: TracerConfig = DEFAULT_TRACER_CONFIG
): string {
    const maxLen = config.maxContentLength ?? DEFAULT_TRACER_CONFIG.maxContentLength;
    const sensitiveKeys = config.sensitiveKeys ?? DEFAULT_TRACER_CONFIG.sensitiveKeys;

    // Step 1: Truncate
    let result = content;
    if (result.length > maxLen) {
        result = result.substring(0, maxLen) + `... [truncated ${content.length - maxLen} chars]`;
    }

    // Step 2: Mask sensitive keys
    for (const key of sensitiveKeys) {
        const regex = new RegExp(`("${key}"\\s*:\\s*)"[^"]*"`, 'gi');
        result = result.replace(regex, '$1"[REDACTED]"');
    }

    return result;
}

/**
 * Redact attributes based on config.
 */
export function redactAttributes(
    attributes: Record<string, unknown>,
    config: TracerConfig = DEFAULT_TRACER_CONFIG
): Record<string, string | number | boolean> {
    const sensitiveKeys = config.sensitiveKeys ?? DEFAULT_TRACER_CONFIG.sensitiveKeys;
    const result: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(attributes)) {
        const lowerKey = key.toLowerCase();
        const isSensitive = sensitiveKeys.some(sk => lowerKey.includes(sk.toLowerCase()));

        if (isSensitive) {
            result[key] = '[REDACTED]';
        } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            result[key] = value;
        } else if (typeof value === 'object') {
            result[key] = JSON.stringify(value).substring(0, 100);
        } else {
            result[key] = String(value);
        }
    }

    return result;
}

/**
 * No-op span (for NoopTracer).
 */
class NoopSpan implements Span {
    setAttribute(_key: string, _value: string | number | boolean): void { }
    setAttributes(_attributes: Record<string, string | number | boolean>): void { }
    recordException(_error: Error): void { }
    addEvent(_name: string, _attributes?: Record<string, string | number | boolean>): void { }
    end(): void { }
}

/**
 * No-op tracer (default when no tracing configured).
 */
export class NoopTracer implements Tracer {
    private readonly config: TracerConfig;

    constructor(config: TracerConfig = {}) {
        this.config = { ...DEFAULT_TRACER_CONFIG, ...config };
    }

    startSpan(_name: string, _attributes?: Record<string, string | number | boolean>): Span {
        return new NoopSpan();
    }

    async withSpan<T>(name: string, fn: (span: Span) => Promise<T> | T): Promise<T> {
        const span = this.startSpan(name);
        try {
            return await fn(span);
        } finally {
            span.end();
        }
    }

    getConfig(): TracerConfig {
        return this.config;
    }
}

/**
 * Console tracer for development/debugging.
 * Logs span events to console.
 */
export class ConsoleTracer implements Tracer {
    private readonly config: Required<TracerConfig>;

    constructor(config: TracerConfig = {}) {
        this.config = { ...DEFAULT_TRACER_CONFIG, ...config };
    }

    startSpan(name: string, attributes?: Record<string, string | number | boolean>): Span {
        const startTime = Date.now();
        console.log(`[TRACE] START: ${name}`, attributes ? redactAttributes(attributes, this.config) : '');

        return {
            setAttribute: (key: string, value: string | number | boolean) => {
                console.log(`[TRACE] ATTR: ${name}.${key} =`, value);
            },
            setAttributes: (attrs: Record<string, string | number | boolean>) => {
                console.log(`[TRACE] ATTRS: ${name}`, redactAttributes(attrs, this.config));
            },
            recordException: (error: Error) => {
                console.error(`[TRACE] ERROR: ${name}`, error.message);
            },
            addEvent: (eventName: string, eventAttrs?: Record<string, string | number | boolean>) => {
                console.log(`[TRACE] EVENT: ${name}.${eventName}`, eventAttrs || '');
            },
            end: () => {
                const duration = Date.now() - startTime;
                console.log(`[TRACE] END: ${name} (${duration}ms)`);
            },
        };
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

/** Global tracer instance */
let globalTracer: Tracer = new NoopTracer();

/**
 * Set the global tracer.
 */
export function setGlobalTracer(tracer: Tracer): void {
    globalTracer = tracer;
}

/**
 * Get the global tracer.
 */
export function getGlobalTracer(): Tracer {
    return globalTracer;
}
