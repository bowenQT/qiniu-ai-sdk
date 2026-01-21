/**
 * Audit Logger - Log guardrail events with full decision trail.
 *
 * This logger can be used in two ways:
 * 1. As a guardrail (logs entry point, limited info)
 * 2. Via AuditLoggerCollector.flush() after chain execution (full trail)
 */

import type {
    Guardrail,
    GuardrailContext,
    GuardrailResult,
    AuditLoggerConfig,
    AuditLogEntry,
    GuardrailAction,
} from './types';

// ============================================================================
// Audit Logger Collector
// ============================================================================

/**
 * Collector for audit log entries with full decision trail.
 * Use this for complete audit logging after guardrail chain execution.
 */
export class AuditLoggerCollector {
    private config: AuditLoggerConfig;
    private sinkInfo: SinkInfo;

    constructor(config: AuditLoggerConfig) {
        this.config = config;
        this.sinkInfo = parseSink(config.sink);
    }

    /**
     * Log a complete audit entry with full decision trail.
     */
    async log(
        context: GuardrailContext,
        results: Array<{
            guardrail: string;
            action: GuardrailAction;
            reason?: string;
        }>,
        finalContent?: string
    ): Promise<void> {
        const entry: AuditLogEntry = {
            timestamp: Date.now(),
            agentId: context.agentId,
            threadId: context.threadId,
            phase: context.phase,
            content: this.config.content === 'original'
                ? context.content
                : (finalContent ?? context.content),
            actions: results,
        };

        try {
            await flushLogs(this.sinkInfo, [entry]);
        } catch (err) {
            if (this.config.onError === 'block') {
                throw err;
            }
            console.warn('[AuditLogger] Failed to write logs:', err);
        }
    }
}

// ============================================================================
// Audit Logger Guardrail
// ============================================================================

/**
 * Create an audit logger guardrail.
 * Note: This guardrail logs entry but cannot capture full decision trail.
 * For complete auditing, use AuditLoggerCollector after chain execution.
 */
export function auditLogger(config: AuditLoggerConfig): Guardrail {
    const {
        sink,
        content = 'redacted',
        onError = 'warn',
        async: isAsync = true,
    } = config;

    const sinkInfo = parseSink(sink);

    return {
        name: 'auditLogger',
        phase: ['pre-request', 'post-response'],

        async process(context: GuardrailContext): Promise<GuardrailResult> {
            const entry: AuditLogEntry = {
                timestamp: Date.now(),
                agentId: context.agentId,
                threadId: context.threadId,
                phase: context.phase,
                content: content === 'original' ? context.content : context.content,
                actions: [], // Cannot know actions at this point
            };

            if (isAsync) {
                flushLogs(sinkInfo, [entry]).catch(err => {
                    if (onError === 'warn') {
                        console.warn('[AuditLogger] Failed to write logs:', err);
                    }
                });
            } else {
                try {
                    await flushLogs(sinkInfo, [entry]);
                } catch (err) {
                    if (onError === 'block') {
                        return {
                            action: 'block',
                            reason: `Audit logging failed: ${err instanceof Error ? err.message : String(err)}`,
                        };
                    }
                    console.warn('[AuditLogger] Failed to write logs:', err);
                }
            }

            return { action: 'pass' };
        },
    };
}

// ============================================================================
// Helpers
// ============================================================================

interface SinkInfo {
    type: 'kodo' | 'console' | 'file';
    bucket?: string;
    prefix?: string;
    path?: string;
}

function parseSink(sink: string): SinkInfo {
    if (sink.startsWith('kodo://')) {
        const path = sink.slice(7);
        const [bucket, ...rest] = path.split('/');
        return {
            type: 'kodo',
            bucket,
            prefix: rest.join('/'),
        };
    }

    if (sink.startsWith('file://')) {
        return {
            type: 'file',
            path: sink.slice(7),
        };
    }

    if (sink === 'console') {
        return { type: 'console' };
    }

    return { type: 'console' };
}

async function flushLogs(sink: SinkInfo, entries: AuditLogEntry[]): Promise<void> {
    if (entries.length === 0) return;

    switch (sink.type) {
        case 'console':
            for (const entry of entries) {
                console.log('[Audit]', JSON.stringify(entry));
            }
            break;

        case 'kodo':
            // TODO: Implement Kodo upload via QiniuAI client
            // For now, log with clear TODO marker
            console.log('[AuditLogger:TODO] Kodo upload not implemented, entries:', entries.length);
            for (const entry of entries) {
                console.log('[Audit:kodo]', JSON.stringify(entry));
            }
            break;

        case 'file':
            // TODO: Implement file writing
            console.log('[AuditLogger:TODO] File write not implemented, entries:', entries.length);
            for (const entry of entries) {
                console.log('[Audit:file]', JSON.stringify(entry));
            }
            break;
    }
}
