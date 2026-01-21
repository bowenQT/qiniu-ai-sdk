/**
 * Guardrail Framework - Type definitions
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Guardrail execution phase.
 */
export type GuardrailPhase = 'pre-request' | 'post-response';

/**
 * Guardrail action result.
 * Priority: block > redact > warn > pass
 */
export type GuardrailAction = 'pass' | 'warn' | 'redact' | 'block';

/**
 * Context passed to guardrails.
 */
export interface GuardrailContext {
    /** Current execution phase */
    phase: GuardrailPhase;
    /** Content to process (input or output text) */
    content: string;
    /** Agent ID */
    agentId: string;
    /** Thread ID for multi-turn conversations */
    threadId?: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
}

/**
 * Result from a guardrail.
 */
export interface GuardrailResult {
    /** Action to take */
    action: GuardrailAction;
    /** Modified content (for redact action) */
    modifiedContent?: string;
    /** Reason for the action */
    reason?: string;
    /** Guardrail name that produced this result */
    guardrailName?: string;
}

/**
 * Guardrail interface.
 */
export interface Guardrail {
    /** Guardrail name */
    name: string;
    /** Phase(s) this guardrail applies to */
    phase: GuardrailPhase | GuardrailPhase[];
    /** Process content and return result */
    process(context: GuardrailContext): Promise<GuardrailResult>;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Content filter configuration.
 */
export interface ContentFilterConfig {
    /** Categories to block/detect */
    block: ContentCategory[];
    /** Detection method */
    detect?: 'regex';
    /** Action to take (default: block) */
    action?: 'block' | 'redact';
}

/**
 * Content categories for filtering.
 */
export type ContentCategory = 'pii' | 'injection' | 'toxic';

/**
 * Token limiter configuration.
 */
export interface TokenLimiterConfig {
    /** Maximum tokens allowed */
    maxTokens: number;
    /** Window duration in milliseconds */
    windowMs: number;
    /** Storage backend */
    store?: 'memory' | GuardrailTokenStore;
}

/**
 * Token store interface for custom storage.
 */
export interface GuardrailTokenStore {
    get(key: string): Promise<number>;
    set(key: string, value: number, ttlMs: number): Promise<void>;
    increment(key: string, amount: number, ttlMs: number): Promise<number>;
}

/**
 * Audit logger configuration.
 */
export interface AuditLoggerConfig {
    /** Sink URL (e.g., kodo://bucket/prefix) */
    sink: string;
    /** Content to log */
    content?: 'original' | 'redacted';
    /** Error handling behavior */
    onError?: 'warn' | 'block';
    /** Async logging (default: true) */
    async?: boolean;
}

/**
 * Audit log entry.
 */
export interface AuditLogEntry {
    /** Timestamp */
    timestamp: number;
    /** Agent ID */
    agentId: string;
    /** Thread ID */
    threadId?: string;
    /** Phase */
    phase: GuardrailPhase;
    /** Content (original or redacted) */
    content: string;
    /** Actions taken */
    actions: Array<{
        guardrail: string;
        action: GuardrailAction;
        reason?: string;
    }>;
}

// ============================================================================
// Chain Types
// ============================================================================

/**
 * Aggregated result from guardrail chain.
 */
export interface GuardrailChainResult {
    /** Final action (highest priority) */
    action: GuardrailAction;
    /** Final content (after all modifications) */
    content: string;
    /** Individual results from each guardrail */
    results: GuardrailResult[];
    /** Whether request should proceed */
    shouldProceed: boolean;
}

/**
 * Action priority map.
 * Higher number = higher priority.
 */
export const ACTION_PRIORITY: Record<GuardrailAction, number> = {
    pass: 0,
    warn: 1,
    redact: 2,
    block: 3,
};
