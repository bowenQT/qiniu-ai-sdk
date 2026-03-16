/**
 * ExecuteNode - Tool execution abstraction.
 * Extracted from generateText for modular use in Graph Runtime.
 */

import type { ChatMessage, ToolCall } from '../../lib/types';
import type { RegisteredTool } from '../../lib/tool-registry';
import { ToolExecutionError, RecoverableError, FatalToolError } from '../../lib/errors';
import { executeToolWithApproval, serializeResult, type ApprovalConfig } from '../tool-approval';
import { validateToolArgs, type JsonSchema } from '../../lib/tool-schema';
import type { Guardrail } from '../guardrails';
import { GuardrailChain } from '../guardrails';

/** Tool execution context */
export interface ExecutionContext {
    toolCallId: string;
    messages: ChatMessage[];
    abortSignal?: AbortSignal;
}

export interface ToolExecutionResult {
    toolCallId: string;
    toolName: string;
    result: string;
    isError: boolean;
    /** Tool was rejected by approval system (not an error, but not approved to execute) */
    isRejected?: boolean;
    /** Parsed/repaired arguments actually passed to the tool (post-parseToolArguments) */
    parsedArgs?: Record<string, unknown>;
    /** Execution time in milliseconds */
    latencyMs: number;
}

export interface ToolGuardrailOptions {
    guardrails: Guardrail[];
    agentId: string;
    threadId?: string;
}

interface BlockedToolGuardrailResult {
    blocked: true;
    blockedResult: string;
}

/**
 * Execute tools based on tool calls from LLM.
 * @param toolCalls - Tool calls from LLM response
 * @param tools - Available tools map
 * @param context - Execution context
 * @param approvalConfig - Approval configuration (ignored if skipApprovalCheck is true)
 * @param skipApprovalCheck - If true, bypass approval checks (used by invokeResumable after pre-check)
 */
export async function executeTools(
    toolCalls: ToolCall[],
    tools: Map<string, RegisteredTool>,
    context: Omit<ExecutionContext, 'toolCallId'>,
    approvalConfig?: ApprovalConfig,
    skipApprovalCheck?: boolean,
    toolGuardrailOptions?: ToolGuardrailOptions,
): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    const guardrailChain = toolGuardrailOptions?.guardrails.length
        ? new GuardrailChain(toolGuardrailOptions.guardrails)
        : null;

    for (const call of toolCalls) {
        // Check abort signal
        if (context.abortSignal?.aborted) {
            results.push({
                toolCallId: call.id,
                toolName: call.function.name,
                result: 'Execution cancelled',
                isError: true,
                latencyMs: 0,
            });
            continue;
        }

        const tool = tools.get(call.function.name);

        if (!tool) {
            results.push({
                toolCallId: call.id,
                toolName: call.function.name,
                result: `Tool not found: ${call.function.name}`,
                isError: true,
                latencyMs: 0,
            });
            continue;
        }

        // Parse arguments
        let args = parseToolArguments(call.function.arguments);

        // Validate args against schema (strict for user/skill/builtin, lenient for mcp)
        if (tool.parameters && typeof tool.parameters === 'object') {
            const mode = tool.source?.type === 'mcp' ? 'lenient' : 'strict';
            const validation = validateToolArgs(args, tool.parameters as JsonSchema, mode);
            if (!validation.valid) {
                results.push({
                    toolCallId: call.id,
                    toolName: call.function.name,
                    result: `[Validation Error] ${validation.errors.join('; ')}`,
                    isError: true,
                    latencyMs: 0,
                });
                continue;
            }
        }

        if (guardrailChain) {
            const guardedArgs = await applyToolGuardrailsToArgs(
                guardrailChain,
                args,
                call,
                tool,
                toolGuardrailOptions!,
            );

            if (isBlockedGuardrailResult(guardedArgs)) {
                results.push({
                    toolCallId: call.id,
                    toolName: call.function.name,
                    result: guardedArgs.blockedResult,
                    isError: true,
                    latencyMs: 0,
                });
                continue;
            }

            args = guardedArgs;
        }

        if (skipApprovalCheck) {
            // Direct execution without approval check (pre-checked by invokeResumable)
            const startTime = Date.now();
            try {
                const result = tool.execute
                    ? await tool.execute(args, { toolCallId: call.id, messages: context.messages, abortSignal: context.abortSignal })
                    : undefined;
                // Use shared serializeResult for consistent formatting
                let serialized = serializeResult(result);

                if (guardrailChain) {
                    const guardedResult = await applyToolGuardrailsToResult(
                        guardrailChain,
                        serialized,
                        call,
                        tool,
                        args,
                        toolGuardrailOptions!,
                    );

                    if (isBlockedGuardrailResult(guardedResult)) {
                        results.push({
                            toolCallId: call.id,
                            toolName: call.function.name,
                            result: guardedResult.blockedResult,
                            isError: true,
                            parsedArgs: args,
                            latencyMs: Date.now() - startTime,
                        });
                        continue;
                    }

                    serialized = guardedResult;
                }

                results.push({
                    toolCallId: call.id,
                    toolName: call.function.name,
                    result: serialized,
                    isError: false,
                    parsedArgs: args,
                    latencyMs: Date.now() - startTime,
                });
            } catch (error) {
                const latencyMs = Date.now() - startTime;
                // FatalToolError: propagate for parallel fail-fast
                if (error instanceof FatalToolError) {
                    throw error;
                }
                // Check for RecoverableError - convert to structured prompt
                if (error instanceof RecoverableError) {
                    results.push({
                        toolCallId: call.id,
                        toolName: call.function.name,
                        result: error.toPrompt(),
                        isError: true,
                        latencyMs,
                        // Attach metadata for auto-retry logic
                        _recoverable: {
                            retryable: error.retryable,
                            modifiedParams: error.modifiedParams,
                        },
                    } as ToolExecutionResult & { _recoverable?: unknown });
                } else {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    results.push({
                        toolCallId: call.id,
                        toolName: call.function.name,
                        result: `[Error] ${errorMsg}`,
                        isError: true,
                        latencyMs,
                    });
                }
            }
        } else {
            // Execute with approval check using unified function
            const startTime = Date.now();
            const execResult = await executeToolWithApproval(
                tool,
                call,
                args,
                context.messages,
                approvalConfig,
                context.abortSignal,
            );

            let guardedResult = execResult.result;
            let guardedIsError = execResult.isError;

            if (guardrailChain) {
                const filtered = await applyToolGuardrailsToResult(
                    guardrailChain,
                    execResult.result,
                    call,
                    tool,
                    args,
                    toolGuardrailOptions!,
                    execResult.isRejected,
                );

                if (isBlockedGuardrailResult(filtered)) {
                    guardedResult = filtered.blockedResult;
                    guardedIsError = true;
                } else {
                    guardedResult = filtered;
                }
            }

            results.push({
                toolCallId: call.id,
                toolName: call.function.name,
                result: guardedResult,
                isError: guardedIsError,
                isRejected: execResult.isRejected,
                parsedArgs: args,
                latencyMs: Date.now() - startTime,
            });
        }
    }

    return results;
}

async function applyToolGuardrailsToArgs(
    chain: GuardrailChain,
    args: Record<string, unknown>,
    call: ToolCall,
    tool: RegisteredTool,
    options: ToolGuardrailOptions,
): Promise<Record<string, unknown> | BlockedToolGuardrailResult> {
    const serializedArgs = JSON.stringify(args);
    const result = await chain.execute('tool', {
        content: serializedArgs,
        agentId: options.agentId,
        threadId: options.threadId,
        metadata: {
            toolCallId: call.id,
            toolName: call.function.name,
            toolArgs: args,
            toolSource: `${tool.source.type}:${tool.source.namespace}`,
            toolStage: 'request',
        },
    });

    if (!result.shouldProceed) {
        const blockingResult = result.results.find((entry) => entry.action === 'block');
        return {
            blocked: true,
            blockedResult: `[Guardrail Blocked] ${blockingResult?.reason ?? `Tool call blocked for ${call.function.name}`}`,
        };
    }

    if (result.content === serializedArgs) {
        return args;
    }

    try {
        const parsed = JSON.parse(result.content);
        return parsed && typeof parsed === 'object'
            ? parsed as Record<string, unknown>
            : args;
    } catch {
        return {
            blocked: true,
            blockedResult: `[Guardrail Blocked] Sanitized arguments for ${call.function.name} are no longer valid JSON`,
        };
    }
}

async function applyToolGuardrailsToResult(
    chain: GuardrailChain,
    content: string,
    call: ToolCall,
    tool: RegisteredTool,
    args: Record<string, unknown>,
    options: ToolGuardrailOptions,
    isRejected = false,
): Promise<string | BlockedToolGuardrailResult> {
    const result = await chain.execute('tool', {
        content,
        agentId: options.agentId,
        threadId: options.threadId,
        metadata: {
            toolCallId: call.id,
            toolName: call.function.name,
            toolArgs: args,
            toolSource: `${tool.source.type}:${tool.source.namespace}`,
            toolStage: 'result',
            isRejected,
        },
    });

    if (!result.shouldProceed) {
        const blockingResult = result.results.find((entry) => entry.action === 'block');
        return {
            blocked: true,
            blockedResult: `[Guardrail Blocked] ${blockingResult?.reason ?? `Tool result blocked for ${call.function.name}`}`,
        };
    }

    return result.content;
}

function isBlockedGuardrailResult(
    value: unknown,
): value is BlockedToolGuardrailResult {
    return typeof value === 'object'
        && value !== null
        && 'blocked' in value
        && (value as { blocked?: unknown }).blocked === true
        && 'blockedResult' in value;
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
