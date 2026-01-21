/**
 * Audit Logger - Log guardrail events.
 */

import type {
    Guardrail,
    GuardrailContext,
    GuardrailResult,
    AuditLoggerConfig,
    AuditLogEntry,
} from './types';

// ============================================================================
// Audit Logger
// ============================================================================

/**
 * Create an audit logger guardrail.
 * Note: This is a pass-through guardrail that logs but doesn't block.
 */
export function auditLogger(config: AuditLoggerConfig): Guardrail {
    const {
        sink,
        content = 'redacted',
        onError = 'warn',
        async: isAsync = true,
    } = config;

    // Parse sink URL
    const sinkInfo = parseSink(sink);

    // Collect entries for batch logging
    const pendingLogs: AuditLogEntry[] = [];

    return {
        name: 'auditLogger',
        phase: ['pre-request', 'post-response'],

        async process(context: GuardrailContext): Promise<GuardrailResult> {
            const entry: AuditLogEntry = {
                timestamp: Date.now(),
                agentId: context.agentId,
                threadId: context.threadId,
                phase: context.phase,
                content: content === 'original' ? context.content : '[LOGGED]',
                actions: [],
            };

            pendingLogs.push(entry);

            // Flush logs
            if (isAsync) {
                // Fire and forget
                flushLogs(sinkInfo, pendingLogs.splice(0)).catch(err => {
                    if (onError === 'warn') {
                        console.warn('[AuditLogger] Failed to write logs:', err);
                    }
                });
            } else {
                try {
                    await flushLogs(sinkInfo, pendingLogs.splice(0));
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
            // TODO: Implement Kodo upload
            // For now, just log
            console.log(`[AuditLogger] Would upload ${entries.length} entries to kodo://${sink.bucket}/${sink.prefix}`);
            break;

        case 'file':
            // TODO: Implement file writing
            console.log(`[AuditLogger] Would write ${entries.length} entries to ${sink.path}`);
            break;
    }
}
