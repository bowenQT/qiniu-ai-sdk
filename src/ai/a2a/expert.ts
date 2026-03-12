/**
 * AgentExpert - Expose agent tools for A2A collaboration.
 * 
 * v5 changes:
 * - tools getter: lazy lookup from agent._tools (dynamic, reflects MCP hot updates)
 * - expose: '*' | string[] (wildcard or whitelist)
 * - callTool: reads from agent._tools at call time, not from cached snapshot
 */

import type { Agent } from '../create-agent';
import type { Tool, GenerateTextWithGraphResult } from '../generate-text';
import type {
    AgentExpertConfig,
    A2AMessage,
    CallToolRequest,
    RunTaskRequest,
    RunTaskResult,
} from './types';
import {
    generateRequestId,
    createA2AResponse,
    createA2AError,
} from './types';
import { validateSchema, type JsonSchema } from './validation';
import { A2ARateLimiter, RateLimitError, AbortError } from './rate-limiter';

// ============================================================================
// AgentExpert
// ============================================================================

/**
 * Wraps an Agent to expose selected tools for A2A collaboration.
 */
export class AgentExpert {
    /** Unique expert ID */
    readonly id: string;

    private agent: Agent;
    private config: {
        expose: '*' | string[];
        prefix: string;
        validateArgs: boolean;
        rateLimit?: AgentExpertConfig['rateLimit'];
    };
    private rateLimiter?: A2ARateLimiter;

    private constructor(
        agent: Agent,
        config: AgentExpertConfig,
        rateLimiter?: A2ARateLimiter
    ) {
        this.agent = agent;
        this.id = agent.id;
        this.config = {
            expose: config.expose,
            prefix: config.prefix ?? `${this.id}_`,
            validateArgs: config.validateArgs ?? true,
            rateLimit: config.rateLimit,
        };
        this.rateLimiter = rateLimiter;
    }

    /**
     * Create an AgentExpert from an Agent.
     */
    static from(agent: Agent, config: AgentExpertConfig): AgentExpert {
        const rateLimiter = config.rateLimit
            ? new A2ARateLimiter(config.rateLimit)
            : undefined;

        return new AgentExpert(agent, config, rateLimiter);
    }

    /**
     * Dynamic tools getter — reads from agent._tools every time.
     * MCP hot updates are automatically reflected.
     */
    get tools(): Record<string, Tool> {
        return this.buildExposedTools();
    }

    /**
     * Direct tool call with full request.
     * Uses lazy lookup from agent._tools at call time.
     */
    async callTool(request: CallToolRequest): Promise<A2AMessage> {
        const requestId = request.requestId ?? generateRequestId();
        const { from = '', tool, args, signal } = request;

        const baseRequest: A2AMessage = {
            requestId,
            type: 'request',
            from,
            to: this.id,
            timestamp: Date.now(),
            tool,
            args,
        };

        // Expose strategy check
        if (this.config.expose !== '*' && !this.config.expose.includes(tool)) {
            return createA2AError(baseRequest, 'TOOL_NOT_EXPOSED', `Tool "${tool}" is not exposed by this expert`);
        }

        // Lazy lookup: get tool from current agent._tools (dynamic)
        const currentTool = this.agent._tools[tool];
        if (!currentTool) {
            return createA2AError(baseRequest, 'TOOL_NOT_FOUND', `Tool "${tool}" not found`);
        }

        // Check abort signal
        if (signal?.aborted) {
            return createA2AError(baseRequest, 'CANCELLED', 'Request was cancelled');
        }

        // Rate limiting
        if (this.rateLimiter) {
            try {
                await this.rateLimiter.execute(this.id, tool, async () => { }, signal);
            } catch (error) {
                if (error instanceof RateLimitError) {
                    return createA2AError(baseRequest, 'RATE_LIMITED', error.message);
                }
                if (error instanceof AbortError) {
                    return createA2AError(baseRequest, 'CANCELLED', error.message);
                }
                throw error;
            }
        }

        // Validate args
        if (this.config.validateArgs && currentTool.parameters) {
            const validationResult = validateSchema(args, currentTool.parameters as JsonSchema);
            if (!validationResult.valid) {
                return createA2AError(baseRequest, 'VALIDATION_ERROR', validationResult.error?.message ?? 'Validation failed');
            }
        }

        // Execute tool
        try {
            if (!currentTool.execute) {
                throw new Error(`Tool "${tool}" has no execute function`);
            }

            const result = await currentTool.execute(args, {
                toolCallId: requestId,
                messages: [],
                abortSignal: signal,
            });

            return createA2AResponse(baseRequest, result);
        } catch (error) {
            return createA2AError(
                baseRequest,
                'EXECUTION_ERROR',
                error instanceof Error ? error.message : String(error),
                error instanceof Error ? error.stack : undefined
            );
        }
    }

    /**
     * Run a task via agent reasoning.
     */
    async runTask(request: RunTaskRequest): Promise<RunTaskResult> {
        const requestId = request.requestId ?? generateRequestId();
        const { prompt, signal } = request;

        if (signal?.aborted) {
            throw new Error('Request was cancelled');
        }

        const result: GenerateTextWithGraphResult = await this.agent.run({ prompt });

        return {
            output: result.text ?? '',
            requestId,
        };
    }

    /**
     * Get list of exposed tool names (without prefix).
     */
    getExposedToolNames(): string[] {
        if (this.config.expose === '*') {
            return Object.keys(this.agent._tools);
        }
        return [...this.config.expose];
    }

    // ========================================================================
    // Private
    // ========================================================================

    /**
     * Build exposed tools from current agent._tools.
     */
    private buildExposedTools(): Record<string, Tool> {
        const currentTools = this.agent._tools;
        const result: Record<string, Tool> = {};

        for (const [name, tool] of Object.entries(currentTools)) {
            if (this.config.expose === '*' || this.config.expose.includes(name)) {
                const prefixedName = `${this.config.prefix}${name}`;
                result[prefixedName] = createWrappedTool(
                    tool,
                    name,
                    this.id,
                    this.rateLimiter,
                    this.config.validateArgs
                );
            }
        }

        return result;
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a wrapped tool — all tools go through execute() for FIFO fairness.
 */
function createWrappedTool(
    original: Tool,
    toolName: string,
    expertId: string,
    rateLimiter: A2ARateLimiter | undefined,
    validateArgs: boolean
): Tool {
    return {
        description: original.description,
        parameters: original.parameters,
        requiresApproval: original.requiresApproval,
        approvalHandler: original.approvalHandler,
        source: original.source,

        execute: async (args, context) => {
            // Rate limiting via execute() for FIFO fairness
            if (rateLimiter) {
                await rateLimiter.execute(expertId, toolName, async () => { }, context.abortSignal);
            }

            // Validate
            if (validateArgs && original.parameters) {
                const result = validateSchema(args as Record<string, unknown>, original.parameters as JsonSchema);
                if (!result.valid) {
                    throw new Error(result.error?.message ?? 'Validation failed');
                }
            }

            if (!original.execute) {
                throw new Error('Tool has no execute function');
            }
            return original.execute(args, context);
        },
    };
}
