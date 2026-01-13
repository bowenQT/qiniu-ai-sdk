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
