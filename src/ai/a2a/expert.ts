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
    createA2ARequest,
    createA2AResponse,
    createA2AError,
} from './types';
import { validateSchema, type JsonSchema } from './validation';
import { A2ARateLimiter, RateLimitError } from './rate-limiter';

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
        originalTools: Record<string, Tool>
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

        if (config.rateLimit) {
            this.rateLimiter = new A2ARateLimiter(config.rateLimit);
        }
    }

    /**
     * Create an AgentExpert from an Agent.
     */
    static from(agent: Agent, config: AgentExpertConfig): AgentExpert {
        // Get original tools
        const originalTools = agent._tools;

        // Build exposed tools with prefix
        const exposedTools: Record<string, Tool> = {};
        const prefix = config.prefix ?? `${agent.id}_`;

        for (const toolName of config.expose) {
            const tool = originalTools[toolName];
            if (!tool) {
                console.warn(`[AgentExpert] Tool "${toolName}" not found, skipping`);
                continue;
            }

            const prefixedName = `${prefix}${toolName}`;
            exposedTools[prefixedName] = createWrappedTool(
                tool,
                config.validateArgs ?? true
            );
        }

        return new AgentExpert(agent, config, exposedTools, originalTools);
    }

    /**
     * Direct tool call with full request.
     */
    async callTool(request: CallToolRequest): Promise<A2AMessage> {
        const requestId = request.requestId ?? generateRequestId();
        const { tool, args, signal } = request;

        // Check if tool is exposed
        if (!this.config.expose.includes(tool)) {
            return createA2AError(
                { requestId, type: 'request', from: '', to: this.id, timestamp: Date.now() } as A2AMessage,
                'TOOL_NOT_EXPOSED',
                `Tool "${tool}" is not exposed by this expert`
            );
        }

        // Get original tool
        const originalTool = this.originalTools[tool];
        if (!originalTool) {
            return createA2AError(
                { requestId, type: 'request', from: '', to: this.id, timestamp: Date.now() } as A2AMessage,
                'TOOL_NOT_FOUND',
                `Tool "${tool}" not found`
            );
        }

        // Check abort signal
        if (signal?.aborted) {
            return createA2AError(
                { requestId, type: 'request', from: '', to: this.id, timestamp: Date.now() } as A2AMessage,
                'CANCELLED',
                'Request was cancelled'
            );
        }

        // Rate limiting
        if (this.rateLimiter) {
            try {
                const allowed = this.rateLimiter.isAllowed(this.id, tool);
                if (!allowed) {
                    if (this.config.rateLimit?.onLimit === 'reject') {
                        throw new RateLimitError(
                            this.id,
                            tool,
                            this.rateLimiter.getTimeUntilSlot(this.id, tool)
                        );
                    }
                    // Queue mode - wait for slot
                    await this.waitForRateLimitSlot(tool);
                }
                this.rateLimiter.track(this.id, tool);
            } catch (error) {
                if (error instanceof RateLimitError) {
                    return createA2AError(
                        { requestId, type: 'request', from: '', to: this.id, timestamp: Date.now() } as A2AMessage,
                        'RATE_LIMITED',
                        error.message
                    );
                }
                throw error;
            }
        }

        // Validate args
        if (this.config.validateArgs && originalTool.parameters) {
            const validationResult = validateSchema(args, originalTool.parameters as JsonSchema);
            if (!validationResult.valid) {
                return createA2AError(
                    { requestId, type: 'request', from: '', to: this.id, timestamp: Date.now() } as A2AMessage,
                    'VALIDATION_ERROR',
                    validationResult.error?.message ?? 'Validation failed'
                );
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

            const requestMsg = createA2ARequest('', this.id, tool, args);
            requestMsg.requestId = requestId;
            return createA2AResponse(requestMsg, result);
        } catch (error) {
            return createA2AError(
                { requestId, type: 'request', from: '', to: this.id, timestamp: Date.now() } as A2AMessage,
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

        // Check abort
        if (signal?.aborted) {
            throw new Error('Request was cancelled');
        }

        // Run the agent
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

    // ========================================================================
    // Private Methods
    // ========================================================================

    private async waitForRateLimitSlot(tool: string): Promise<void> {
        const maxWait = this.config.rateLimit?.windowMs ?? 60000;
        const checkInterval = 100;
        let waited = 0;

        while (waited < maxWait) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;

            if (this.rateLimiter?.isAllowed(this.id, tool)) {
                return;
            }
        }

        throw new RateLimitError(this.id, tool, 0);
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a wrapped tool with validation.
 */
function createWrappedTool(
    original: Tool,
    validateArgs: boolean
): Tool {
    return {
        description: original.description,
        parameters: original.parameters,
        execute: async (args, context) => {
            // Validate if enabled
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
