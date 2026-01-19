export class AIError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AIError';
    }
}

export class ToolExecutionError extends AIError {
    toolName: string;

    constructor(toolName: string, message: string) {
        super(message);
        this.name = 'ToolExecutionError';
        this.toolName = toolName;
    }
}

export class MaxStepsExceededError extends AIError {
    maxSteps: number;

    constructor(maxSteps: number) {
        super(`Max steps (${maxSteps}) exceeded while handling tool calls.`);
        this.name = 'MaxStepsExceededError';
        this.maxSteps = maxSteps;
    }
}

/** Validation error details */
export interface ValidationErrorItem {
    path: (string | number)[];
    message: string;
}

/**
 * Error thrown when structured output validation fails.
 */
export class StructuredOutputError extends AIError {
    /** Raw LLM output before validation */
    raw: string;
    /** Validation errors */
    validationErrors: ValidationErrorItem[];

    constructor(message: string, raw: string, validationErrors: ValidationErrorItem[]) {
        super(message);
        this.name = 'StructuredOutputError';
        this.raw = raw;
        this.validationErrors = validationErrors;
    }
}

/**
 * Fatal tool error that triggers fail-fast in parallel execution.
 * 
 * Unlike regular errors (converted to tool_result), FatalToolError
 * propagates up and cancels sibling branches in parallel groups.
 * 
 * @example
 * ```typescript
 * if (criticalFailure) {
 *     throw new FatalToolError('database', 'Connection pool exhausted');
 * }
 * ```
 */
export class FatalToolError extends AIError {
    constructor(
        public readonly toolName: string,
        message: string,
    ) {
        super(message);
        this.name = 'FatalToolError';
    }
}
// ============================================================================
// Recoverable Errors (Error-as-Prompt)
// ============================================================================

/** 
 * Sensitive key patterns for redaction.
 * Matches keys that CONTAIN these patterns (case insensitive).
 */
const SENSITIVE_KEY_PATTERNS = [
    'password', 'secret', 'token', 'key', 'auth', 'credential',
    'bearer', 'cookie', 'session', 'jwt', 'private',
];

/**
 * Check if a key looks sensitive.
 */
function isSensitiveKey(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return SENSITIVE_KEY_PATTERNS.some(pattern => lowerKey.includes(pattern));
}

/**
 * Redact potentially sensitive values from an object.
 * - Matches keys that CONTAIN sensitive patterns (not just exact match)
 * - Recursively processes nested objects AND arrays
 * - Handles camelCase keys like accessKey, secretKey
 */
export function redactSecrets(value: unknown): unknown {
    if (value === null || value === undefined) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(item => redactSecrets(item));
    }

    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(obj)) {
            if (isSensitiveKey(key)) {
                result[key] = '[REDACTED]';
            } else {
                result[key] = redactSecrets(val);
            }
        }
        return result;
    }

    return value;
}

/**
 * Truncate string to max length with ellipsis.
 */
function truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
}

/**
 * Error that includes recovery suggestions for Agent self-healing.
 * 
 * When thrown from a tool, the error message and recovery suggestion
 * are formatted into a tool_result that guides the Agent to retry
 * with corrected parameters.
 * 
 * @example
 * ```typescript
 * throw new RecoverableError(
 *     'Bucket not found',
 *     'upload_file',
 *     'Check bucket name spelling or list available buckets first',
 *     { bucket: 'default-bucket' },
 * );
 * ```
 */
export class RecoverableError extends AIError {
    constructor(
        message: string,
        /** The tool that threw this error */
        public readonly toolName: string,
        /** Human-readable suggestion for recovery */
        public readonly recoverySuggestion: string,
        /** Optional modified parameters to suggest for retry */
        public readonly modifiedParams?: Record<string, unknown>,
        /** Whether this error is safe to auto-retry (default true) */
        public readonly retryable: boolean = true,
    ) {
        super(message);
        this.name = 'RecoverableError';
    }

    /**
     * Convert error to Agent-readable prompt format.
     * Automatically redacts sensitive values and enforces size limits.
     * 
     * @param options.maxLength - Maximum output length (default 1024)
     */
    toPrompt(options?: { maxLength?: number }): string {
        const maxLength = options?.maxLength ?? 1024;

        // Redact any potential secrets in strings too
        const safeMessage = redactStringSecrets(this.message);
        const safeSuggestion = redactStringSecrets(this.recoverySuggestion);

        let prompt = `[Tool Error: ${this.toolName}] ${safeMessage}\n` +
            `Recovery: ${safeSuggestion}`;

        if (this.modifiedParams) {
            const safeParams = redactSecrets(this.modifiedParams);
            try {
                const paramsStr = JSON.stringify(safeParams);
                prompt += `\nSuggested params: ${paramsStr}`;
            } catch {
                // Ignore serialization errors (circular refs, etc.)
            }
        }

        return truncateString(prompt, maxLength);
    }
}

/**
 * Redact common secret patterns from strings.
 * Looks for patterns like key=value, Bearer tokens, etc.
 */
function redactStringSecrets(str: string): string {
    // Redact Bearer tokens
    let result = str.replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED]');

    // Redact key=value patterns for sensitive keys
    result = result.replace(
        /(password|secret|token|key|auth|credential|bearer|api_key|apikey|access_token)\s*[=:]\s*["']?[^"'\s,}]+["']?/gi,
        '$1=[REDACTED]'
    );

    return result;
}
