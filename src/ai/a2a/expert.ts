/**
 * AgentExpert - Expose agent tools for A2A collaboration.
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
    /** Exposed tools (with prefix) */
    readonly tools: Record<string, Tool>;

    private agent: Agent;
    private config: Required<Omit<AgentExpertConfig, 'rateLimit'>> & { rateLimit?: AgentExpertConfig['rateLimit'] };
    private rateLimiter?: A2ARateLimiter;
    private originalTools: Record<string, Tool>;

    private constructor(
        agent: Agent,
        config: AgentExpertConfig,
        tools: Record<string, Tool>,
        originalTools: Record<string, Tool>,
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
        this.tools = tools;
        this.originalTools = originalTools;
        this.rateLimiter = rateLimiter;
    }

    /**
     * Create an AgentExpert from an Agent.
     */
    static from(agent: Agent, config: AgentExpertConfig): AgentExpert {
        const originalTools = agent._tools;
        const prefix = config.prefix ?? `${agent.id}_`;
        const expertId = agent.id;

        // Single shared rate limiter instance
        const rateLimiter = config.rateLimit
            ? new A2ARateLimiter(config.rateLimit)
            : undefined;

        // Build exposed tools - all go through execute() for FIFO fairness
        const exposedTools: Record<string, Tool> = {};

        for (const toolName of config.expose) {
            const tool = originalTools[toolName];
            if (!tool) {
                console.warn(`[AgentExpert] Tool "${toolName}" not found, skipping`);
                continue;
            }

            const prefixedName = `${prefix}${toolName}`;
            exposedTools[prefixedName] = createWrappedTool(
                tool,
                toolName,
                expertId,
                rateLimiter,
                config.validateArgs ?? true
            );
        }

        return new AgentExpert(agent, config, exposedTools, originalTools, rateLimiter);
    }

    /**
     * Direct tool call with full request.
     */
    async callTool(request: CallToolRequest): Promise<A2AMessage> {
        const requestId = request.requestId ?? generateRequestId();
        const { from = '', tool, args, signal } = request;

        // Create base request for responses
        const baseRequest: A2AMessage = {
            requestId,
            type: 'request',
            from,
            to: this.id,
            timestamp: Date.now(),
            tool,
            args,
        };

        // Check if tool is exposed
        if (!this.config.expose.includes(tool)) {
            return createA2AError(baseRequest, 'TOOL_NOT_EXPOSED', `Tool "${tool}" is not exposed by this expert`);
        }

        // Get original tool
        const originalTool = this.originalTools[tool];
        if (!originalTool) {
            return createA2AError(baseRequest, 'TOOL_NOT_FOUND', `Tool "${tool}" not found`);
        }

        // Check abort signal
        if (signal?.aborted) {
            return createA2AError(baseRequest, 'CANCELLED', 'Request was cancelled');
        }

        // Rate limiting via execute() for FIFO fairness with exposed tools
        if (this.rateLimiter) {
            try {
                // Use execute() which handles queue fairness and abort
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
        if (this.config.validateArgs && originalTool.parameters) {
            const validationResult = validateSchema(args, originalTool.parameters as JsonSchema);
            if (!validationResult.valid) {
                return createA2AError(baseRequest, 'VALIDATION_ERROR', validationResult.error?.message ?? 'Validation failed');
            }
        }

        // Execute tool
        try {
            if (!originalTool.execute) {
                throw new Error(`Tool "${tool}" has no execute function`);
            }

            const result = await originalTool.execute(args, {
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
        return [...this.config.expose];
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a wrapped tool - all tools go through execute() for FIFO fairness.
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
