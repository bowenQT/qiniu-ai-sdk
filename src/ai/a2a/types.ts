/**
 * A2A (Agent-to-Agent) Protocol Types.
 * 
 * Enables agents to expose tools and delegate tasks to each other.
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * A2A message for inter-agent communication.
 */
export interface A2AMessage {
    /** Unique request ID for correlating request/response */
    requestId: string;
    /** Message type */
    type: 'request' | 'response' | 'error' | 'cancel';
    /** Source agent ID */
    from: string;
    /** Target agent ID */
    to: string;
    /** Timestamp (ms since epoch) */
    timestamp: number;
    /** Deadline timestamp (optional) */
    deadline?: number;

    // Request fields
    /** Tool name to call */
    tool?: string;
    /** Tool arguments */
    args?: Record<string, unknown>;

    // Response fields
    /** Tool execution result */
    result?: unknown;

    // Error fields
    /** Error details */
    error?: A2AError;
}

/**
 * A2A error structure.
 */
export interface A2AError {
    /** Error code */
    code: A2AErrorCode;
    /** Human-readable message */
    message: string;
    /** Stack trace (DEBUG mode only) */
    stack?: string;
}

/**
 * A2A error codes.
 */
export type A2AErrorCode =
    | 'TOOL_NOT_FOUND'
    | 'TOOL_NOT_EXPOSED'
    | 'VALIDATION_ERROR'
    | 'RATE_LIMITED'
    | 'TIMEOUT'
    | 'CANCELLED'
    | 'EXECUTION_ERROR';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
    /** Maximum calls within window */
    maxCalls: number;
    /** Window duration in milliseconds */
    windowMs: number;
    /** Limit scope: per-agent or per-tool */
    scope: 'agent' | 'tool';
    /** Behavior when limit exceeded */
    onLimit: 'queue' | 'reject';
}

/**
 * AgentExpert configuration.
 */
export interface AgentExpertConfig {
    /** Tool names to expose (whitelist, required) */
    expose: string[];
    /** Prefix for exposed tool names (default: `{agentId}_`) */
    prefix?: string;
    /** Rate limiting configuration */
    rateLimit?: RateLimitConfig;
    /** Validate arguments against schema (default: true) */
    validateArgs?: boolean;
}

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Request to call a specific tool.
 */
export interface CallToolRequest {
    /** Caller agent ID (for response routing) */
    from?: string;
    /** Tool name (without prefix) */
    tool: string;
    /** Tool arguments */
    args: Record<string, unknown>;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
    /** Request ID (auto-generated if not provided) */
    requestId?: string;
}

/**
 * Request to run a task via agent reasoning.
 */
export interface RunTaskRequest {
    /** Task prompt */
    prompt: string;
    /** Abort signal for cancellation */
    signal?: AbortSignal;
    /** Request ID (auto-generated if not provided) */
    requestId?: string;
}

/**
 * Result of a task run.
 */
export interface RunTaskResult {
    /** Agent output */
    output: string;
    /** Request ID */
    requestId: string;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate a unique request ID.
 */
export function generateRequestId(): string {
    return `a2a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create an A2A request message.
 */
export function createA2ARequest(
    from: string,
    to: string,
    tool: string,
    args: Record<string, unknown>,
    deadline?: number
): A2AMessage {
    return {
        requestId: generateRequestId(),
        type: 'request',
        from,
        to,
        timestamp: Date.now(),
        deadline,
        tool,
        args,
    };
}

/**
 * Create an A2A response message.
 */
export function createA2AResponse(
    request: A2AMessage,
    result: unknown
): A2AMessage {
    return {
        requestId: request.requestId,
        type: 'response',
        from: request.to,
        to: request.from,
        timestamp: Date.now(),
        result,
    };
}

/**
 * Create an A2A error message.
 */
export function createA2AError(
    request: A2AMessage,
    code: A2AErrorCode,
    message: string,
    stack?: string
): A2AMessage {
    return {
        requestId: request.requestId,
        type: 'error',
        from: request.to,
        to: request.from,
        timestamp: Date.now(),
        error: { code, message, stack },
    };
}
