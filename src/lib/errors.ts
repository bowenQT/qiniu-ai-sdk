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

// ============================================================================
// Recoverable Errors (Error-as-Prompt)
// ============================================================================

/** Sensitive key patterns for redaction */
const SENSITIVE_KEYS = /^(password|secret|token|key|auth|credential|apikey|api_key|access_token|bearer)$/i;

/**
 * Redact potentially sensitive values from an object.
 * Replaces values for keys matching SENSITIVE_KEYS with '[REDACTED]'.
 */
export function redactSecrets(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.test(key)) {
            result[key] = '[REDACTED]';
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            result[key] = redactSecrets(value as Record<string, unknown>);
        } else {
            result[key] = value;
        }
    }
    return result;
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

        let prompt = `[Tool Error: ${this.toolName}] ${this.message}\n` +
            `Recovery: ${this.recoverySuggestion}`;

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
