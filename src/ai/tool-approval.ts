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

/** Approval handler function */
export type ApprovalHandler = (context: ApprovalContext) => Promise<boolean>;

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
    /** Rejection message if not approved */
    rejectionMessage?: string;
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
        const approved = await handler(context);
        return {
            approved,
            rejectionMessage: approved ? undefined : REJECTION_MESSAGE,
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
