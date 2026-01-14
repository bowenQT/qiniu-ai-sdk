/**
 * ExecuteNode - Tool execution abstraction.
 * Extracted from generateText for modular use in Graph Runtime.
 */

import type { ChatMessage, ToolCall } from '../../lib/types';
import type { RegisteredTool } from '../../lib/tool-registry';
import { ToolExecutionError } from '../../lib/errors';

/** Tool execution context */
export interface ExecutionContext {
    toolCallId: string;
    messages: ChatMessage[];
    abortSignal?: AbortSignal;
}

/** Tool result */
export interface ToolExecutionResult {
    toolCallId: string;
    result: string;
    isError: boolean;
}

/**
 * Execute tools based on tool calls from LLM.
 */
export async function executeTools(
    toolCalls: ToolCall[],
    tools: Map<string, RegisteredTool>,
    context: Omit<ExecutionContext, 'toolCallId'>,
): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (const call of toolCalls) {
        // Check abort signal
        if (context.abortSignal?.aborted) {
            results.push({
                toolCallId: call.id,
                result: 'Execution cancelled',
                isError: true,
            });
            continue;
        }

        const tool = tools.get(call.function.name);

        if (!tool) {
            results.push({
                toolCallId: call.id,
                result: `Tool not found: ${call.function.name}`,
                isError: true,
            });
            continue;
        }

        if (!tool.execute) {
            results.push({
                toolCallId: call.id,
                result: `Tool ${call.function.name} has no execute function`,
                isError: true,
            });
            continue;
        }

        try {
            // Parse arguments
            const args = parseToolArguments(call.function.arguments);

            // Execute tool
            const execContext: ExecutionContext = {
                toolCallId: call.id,
                messages: context.messages,
                abortSignal: context.abortSignal,
            };

            const result = await tool.execute(args);

            results.push({
                toolCallId: call.id,
                result: serializeResult(result),
                isError: false,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            results.push({
                toolCallId: call.id,
                result: `Error: ${errorMessage}`,
                isError: true,
            });
        }
    }

    return results;
}

/**
 * Convert tool execution results to chat messages.
 */
export function toolResultsToMessages(results: ToolExecutionResult[]): ChatMessage[] {
    return results.map(r => ({
        role: 'tool' as const,
        content: r.result,
        tool_call_id: r.toolCallId,
    }));
}

/**
 * Parse tool arguments from JSON string.
 */
function parseToolArguments(payload: string): Record<string, unknown> {
    if (!payload || payload.trim() === '') {
        return {};
    }

    try {
        return JSON.parse(payload);
    } catch {
        // Try to fix common JSON issues
        try {
            const fixed = payload
                .replace(/'/g, '"')
                .replace(/(\w+):/g, '"$1":');
            return JSON.parse(fixed);
        } catch {
            return { _raw: payload };
        }
    }
}

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
