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
