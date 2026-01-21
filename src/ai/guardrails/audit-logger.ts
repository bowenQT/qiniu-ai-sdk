/**
 * Audit Logger - Log guardrail events with full decision trail.
 *
 * Two ways to use:
 * 1. auditLogger guardrail - logs entry point (limited info)
 * 2. AuditLoggerCollector.log() - complete decision trail after chain execution
 */

import type {
    Guardrail,
    GuardrailContext,
    GuardrailResult,
    AuditLoggerConfig,
    AuditLogEntry,
    GuardrailAction,
} from './types';

/** Placeholder for redacted content */
const REDACTED_PLACEHOLDER = '[CONTENT_REDACTED]';

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
     * 
     * @param context - The guardrail context
     * @param results - Array of guardrail results
     * @param finalContent - The final content after processing (required if content: 'redacted')
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
        // Determine content to log based on config
        let contentToLog: string;
        if (this.config.content === 'redacted') {
            // When redacted mode: use finalContent if provided, otherwise placeholder
            contentToLog = finalContent ?? REDACTED_PLACEHOLDER;
        } else {
            // When original mode: use original content
            contentToLog = context.content;
        }

        const entry: AuditLogEntry = {
            timestamp: Date.now(),
            agentId: context.agentId,
            threadId: context.threadId,
            phase: context.phase,
            content: contentToLog,
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
            // Determine content to log based on config
            const contentToLog = content === 'redacted'
                ? REDACTED_PLACEHOLDER
                : context.content;

            const entry: AuditLogEntry = {
                timestamp: Date.now(),
                agentId: context.agentId,
                threadId: context.threadId,
                phase: context.phase,
                content: contentToLog,
                actions: [],
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
            console.log('[AuditLogger:TODO] Kodo upload not implemented');
            for (const entry of entries) {
                console.log('[Audit:kodo]', JSON.stringify(entry));
            }
            break;

        case 'file':
            // TODO: Implement file writing
            console.log('[AuditLogger:TODO] File write not implemented');
            for (const entry of entries) {
                console.log('[Audit:file]', JSON.stringify(entry));
            }
            break;
    }
}
