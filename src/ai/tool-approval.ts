/**
 * Tool Approval - Unified approval mechanism for tool execution.
 * Implements Human-in-the-Loop pattern with configurable policies.
 */

import type { ToolCall } from '../lib/types';
import type { RegisteredTool, ToolSource } from '../lib/tool-registry';

// ============================================================================
// Types
// ============================================================================

/** Context passed to approval handler */
export interface ApprovalContext {
    /** Tool call details */
    toolCall: {
        id: string;
        function: {
            name: string;
            arguments: string;
        };
    };
    /** Tool name */
    toolName: string;
    /** Tool description */
    toolDescription: string;
    /** Parsed arguments */
    args: Record<string, unknown>;
    /** Current message history */
    messages: Array<{ role: string; content: unknown }>;
}

/**
 * Approval decision returned by handler.
 * - `boolean`: Simple approve (true) or reject (false)
 * - `ApprovalResult`: Detailed result with optional deferred flag
 */
export type ApprovalDecision = boolean | ApprovalResult;

/** Approval handler function */
export type ApprovalHandler = (context: ApprovalContext) => Promise<ApprovalDecision>;

/** Approval configuration */
export interface ApprovalConfig {
    /** Global approval handler */
    onApprovalRequired?: ApprovalHandler;
    /** 
     * Sources to auto-approve (skip approval).
     * Supports 'type' (e.g., 'builtin') or 'type:namespace' (e.g., 'mcp:github')
     */
    autoApproveSources?: string[];
}

/** Tool with optional approval settings */
export interface ToolWithApproval {
    /** Whether this tool requires approval before execution */
    requiresApproval?: boolean;
    /** Per-tool approval handler (overrides global) */
    approvalHandler?: ApprovalHandler;
}

/** Approval result */
export interface ApprovalResult {
    approved: boolean;
    /** 
     * Defer approval for external/async decision.
     * When true, the tool execution is suspended until resumed.
     * Cannot be true when approved is true.
     */
    deferred?: boolean;
    /** Rejection message if not approved */
    rejectionMessage?: string;
}

/**
 * Normalize approval decision to ApprovalResult.
 * Validates mutual exclusivity of approved and deferred.
 */
export function normalizeApprovalDecision(decision: ApprovalDecision): ApprovalResult {
    if (typeof decision === 'boolean') {
        return { approved: decision };
    }
    if (decision.approved && decision.deferred) {
        throw new Error('Invalid ApprovalDecision: approved and deferred are mutually exclusive');
    }
    return decision;
}

/**
 * Error thrown when approval is deferred for async/external decision.
 * Used to interrupt tool execution and save checkpoint.
 */
export class DeferredApprovalError extends Error {
    constructor(
        public readonly deferredTools: string[],
        public readonly toolCalls: unknown[],
    ) {
        super(`Approval deferred for tools: ${deferredTools.join(', ')}`);
        this.name = 'DeferredApprovalError';
    }
}

// ============================================================================
// Rejection Message
// ============================================================================

const REJECTION_MESSAGE = '[Approval Rejected] Tool execution was denied by user.';

// ============================================================================
// Approval Logic
// ============================================================================

/**
 * Check if a tool source matches an auto-approve pattern.
 */
function isSourceAutoApproved(source: ToolSource, patterns: string[]): boolean {
    for (const pattern of patterns) {
        // Match full source (e.g., 'mcp:github')
        if (pattern === `${source.type}:${source.namespace}`) {
            return true;
        }
        // Match type only (e.g., 'builtin')
        if (pattern === source.type) {
            return true;
        }
    }
    return false;
}

/** Tool-like object for approval checking */
interface ToolForApproval {
    name: string;
    description?: string;
    source?: ToolSource;
    requiresApproval?: boolean;
    approvalHandler?: ApprovalHandler;
}

/** Tool call-like object for approval checking */
interface ToolCallForApproval {
    id: string;
    function: {
        name: string;
        arguments: string;
    };
}

/**
 * Determine if approval is needed and execute handler if so.
 */
export async function checkApproval(
    tool: ToolForApproval,
    toolCall: ToolCallForApproval,
    args: Record<string, unknown>,
    messages: Array<{ role: string; content: unknown }>,
    config?: ApprovalConfig,
): Promise<ApprovalResult> {
    // Tool doesn't require approval
    if (!tool.requiresApproval) {
        return { approved: true };
    }

    // Check auto-approve sources
    if (config?.autoApproveSources && tool.source) {
        if (isSourceAutoApproved(tool.source, config.autoApproveSources)) {
            return { approved: true };
        }
    }

    // Get handler (per-tool overrides global)
    const handler = tool.approvalHandler ?? config?.onApprovalRequired;

    // No handler configured but approval required - FAIL CLOSED
    if (!handler) {
        return {
            approved: false,
            rejectionMessage: '[Approval Required] No handler configured. Tool execution denied.',
        };
    }

    // Execute handler
    const context: ApprovalContext = {
        toolCall,
        toolName: tool.name,
        toolDescription: tool.description ?? '',
        args,
        messages,
    };

    try {
        const decision = await handler(context);
        const result = normalizeApprovalDecision(decision);
        return {
            approved: result.approved,
            deferred: result.deferred,
            rejectionMessage: result.approved ? undefined : (result.rejectionMessage ?? REJECTION_MESSAGE),
        };
    } catch (error) {
        // Handler error = rejection
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            approved: false,
            rejectionMessage: `[Approval Error] ${errorMessage}`,
        };
    }
}

/**
 * Execute a single tool with approval check.
 * Returns result or rejection message.
 */
export async function executeToolWithApproval(
    tool: RegisteredTool & ToolWithApproval,
    toolCall: ToolCall,
    args: Record<string, unknown>,
    messages: Array<{ role: string; content: unknown }>,
    config?: ApprovalConfig,
    abortSignal?: AbortSignal,
): Promise<{ result: string; isError: boolean; isRejected: boolean }> {
    // Check approval
    const approvalResult = await checkApproval(tool, toolCall, args, messages, config);

    if (!approvalResult.approved) {
        return {
            result: approvalResult.rejectionMessage ?? REJECTION_MESSAGE,
            isError: false,  // Not an error, just rejected
            isRejected: true,
        };
    }

    // Check abort
    if (abortSignal?.aborted) {
        return {
            result: 'Execution cancelled',
            isError: true,
            isRejected: false,
        };
    }

    // Execute tool
    if (!tool.execute) {
        return {
            result: `Tool ${tool.name} has no execute function`,
            isError: true,
            isRejected: false,
        };
    }

    try {
        const execContext = {
            toolCallId: toolCall.id,
            messages: messages as Array<{ role: string; content: unknown }>,
            abortSignal,
        };

        const result = await tool.execute(args, execContext);

        return {
            result: serializeResult(result),
            isError: false,
            isRejected: false,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            result: `Error: ${errorMessage}`,
            isError: true,
            isRejected: false,
        };
    }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Serialize tool result to string.
 */
function serializeResult(result: unknown): string {
    if (result === undefined || result === null) {
        return '';
    }

    if (typeof result === 'string') {
        return result;
    }

    try {
        return JSON.stringify(result, null, 2);
    } catch {
        return String(result);
    }
}

// ============================================================================
// Batch Approval Check
// ============================================================================

/**
 * Pre-check approval for a batch of tool calls.
 * This is used to detect deferred approvals BEFORE executing any tools,
 * ensuring no side effects occur when interruption is needed.
 * 
 * @returns Object with approved (all passed) and deferredTools (tools needing defer)
 */
export async function checkApprovalBatch(
    toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>,
    tools: Map<string, RegisteredTool>,
    messages: Array<{ role: string; content: unknown }>,
    approvalConfig?: ApprovalConfig,
): Promise<{ approved: boolean; deferredTools: string[]; rejectedTools: string[] }> {
    const deferredTools: string[] = [];
    const rejectedTools: string[] = [];

    for (const toolCall of toolCalls) {
        const tool = tools.get(toolCall.function.name);
        if (!tool) continue;

        // Skip tools that don't require approval
        if (!tool.requiresApproval) continue;

        // Parse args for approval context
        let args: Record<string, unknown> = {};
        try {
            args = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
            args = {};
        }

        const result = await checkApproval(
            tool,
            toolCall,
            args,
            messages,
            approvalConfig,
        );

        if (result.deferred) {
            deferredTools.push(toolCall.function.name);
        } else if (!result.approved) {
            rejectedTools.push(toolCall.function.name);
        }
    }

    return {
        approved: deferredTools.length === 0 && rejectedTools.length === 0,
        deferredTools,
        rejectedTools,
    };
}

