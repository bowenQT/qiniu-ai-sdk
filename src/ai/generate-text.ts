import type { QiniuAI } from '../client';
import type { ChatCompletionRequest, ChatMessage, ToolCall, ResponseFormat } from '../lib/types';
import type { StreamResult } from '../modules/chat';
import { MaxStepsExceededError, ToolExecutionError } from '../lib/errors';
import type { Checkpointer } from './graph/checkpointer';
import type { ApprovalConfig, ApprovalHandler, ApprovalResult } from './tool-approval';
import { checkApproval } from './tool-approval';
import { normalizeContent } from '../lib/content-converter';
import type { MemoryManager } from './memory';
import type { Guardrail } from './guardrails';
import { GuardrailChain, GuardrailBlockedError } from './guardrails';

export interface ToolExecutionContext {
    toolCallId: string;
    messages: ChatMessage[];
    abortSignal?: AbortSignal;
}

/** Tool source for approval matching (imported from tool-registry) */
export type { ToolSource, ToolSourceType } from '../lib/tool-registry';
import type { ToolSource } from '../lib/tool-registry';

export interface Tool {
    description?: string;
    parameters?: Record<string, unknown>;
    execute?: (args: unknown, context: ToolExecutionContext) => Promise<unknown> | unknown;
    /** Whether this tool requires approval before execution */
    requiresApproval?: boolean;
    /** Per-tool approval handler (overrides global) */
    approvalHandler?: ApprovalHandler;
    /** Tool source for approval matching (default: user:generateText) */
    source?: ToolSource;
}

export interface ToolResult {
    toolCallId: string;
    result: string;
}

export interface StepResult {
    type: 'text' | 'tool_call' | 'tool_result';
    content: string;
    reasoning?: string;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
}

export interface GenerateTextOptions {
    client: QiniuAI;
    model: string;
    prompt?: string;
    messages?: ChatMessage[];
    system?: string;
    tools?: Record<string, Tool>;
    maxSteps?: number;
    onStepFinish?: (step: StepResult) => void;
    abortSignal?: AbortSignal;
    /** Temperature for sampling (0-2) */
    temperature?: number;
    /** Top-p sampling */
    topP?: number;
    /** Maximum output tokens */
    maxTokens?: number;
    /** Response format for structured output (JSON mode) */
    responseFormat?: ResponseFormat;
    /** Tool choice strategy */
    toolChoice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
    /** Approval configuration for tool execution */
    approvalConfig?: ApprovalConfig;
}

export interface GenerateTextResult {
    text: string;
    reasoning?: string;
    steps: StepResult[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    finishReason: string | null;
}

export async function generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
    const {
        client,
        model,
        tools,
        maxSteps = 1,
        onStepFinish,
        abortSignal,
        temperature,
        topP,
        maxTokens,
        responseFormat,
        toolChoice,
        approvalConfig,
    } = options;

    const messages = normalizeMessages(options);
    const steps: StepResult[] = [];
    let lastNonToolText = '';  // Only capture text from non-tool-call steps
    let accumulatedReasoning = '';
    let usage: GenerateTextResult['usage'];
    let finishReason: GenerateTextResult['finishReason'] = null;

    for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
        const request = buildChatRequest({
            model,
            messages,
            tools,
            temperature,
            topP,
            maxTokens,
            responseFormat,
            toolChoice,
        });
        const streamResult = await consumeStream(client, request, abortSignal);

        if (streamResult.usage) {
            usage = streamResult.usage;
        }
        if (streamResult.finishReason !== undefined) {
            finishReason = streamResult.finishReason;
        }

        // Only accumulate text if not ending with tool_calls (avoid intermediate speech)
        if (streamResult.finishReason !== 'tool_calls' && streamResult.content) {
            lastNonToolText = streamResult.content;
        }
        if (streamResult.reasoningContent) {
            accumulatedReasoning += streamResult.reasoningContent;
        }

        const textStep: StepResult = {
            type: 'text',
            content: streamResult.content,
            reasoning: streamResult.reasoningContent || undefined,
            toolCalls: streamResult.toolCalls.length ? streamResult.toolCalls : undefined,
        };

        steps.push(textStep);
        if (onStepFinish) {
            onStepFinish(textStep);
        }

        if (!streamResult.toolCalls.length || !tools) {
            return {
                text: lastNonToolText || streamResult.content,
                reasoning: accumulatedReasoning || undefined,
                steps,
                usage,
                finishReason,
            };
        }

        const toolCallSteps = streamResult.toolCalls.map((toolCall) => ({
            type: 'tool_call' as const,
            content: toolCall.function.arguments,
            toolCalls: [toolCall],
        }));
        steps.push(...toolCallSteps);

        const toolResults = await executeTools(streamResult.toolCalls, tools, messages, abortSignal, approvalConfig);
        const toolResultSteps = toolResults.map((toolResult) => ({
            type: 'tool_result' as const,
            content: toolResult.result,
            toolResults: [toolResult],
        }));
        steps.push(...toolResultSteps);

        // Write back assistant message with tool_calls before tool results
        messages.push({
            role: 'assistant',
            content: streamResult.content || '',
            tool_calls: streamResult.toolCalls,
        });
        messages.push(...toolResultsToMessages(streamResult.toolCalls, toolResults));
    }

    throw new MaxStepsExceededError(maxSteps);
}

export function serializeToolResult(result: unknown): string {
    if (result === undefined) {
        return '';
    }

    if (typeof result === 'string') {
        return result;
    }

    try {
        return JSON.stringify(result);
    } catch {
        return String(result);
    }
}

function normalizeMessages(options: GenerateTextOptions): ChatMessage[] {
    if (options.messages && options.messages.length > 0) {
        return [...options.messages];
    }

    if (!options.prompt && !options.system) {
        throw new Error('Either prompt or messages must be provided.');
    }

    const messages: ChatMessage[] = [];
    if (options.system) {
        messages.push({ role: 'system', content: options.system });
    }
    if (options.prompt) {
        messages.push({ role: 'user', content: options.prompt });
    }

    return messages;
}

function buildChatRequest(params: {
    model: string;
    messages: ChatMessage[];
    tools?: Record<string, Tool>;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    responseFormat?: ResponseFormat;
    toolChoice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
}): ChatCompletionRequest {
    const { model, messages, tools, temperature, topP, maxTokens, responseFormat, toolChoice } = params;

    // Normalize multimodal content (image -> image_url) for API compatibility
    const normalizedMessages = messages.map(msg => ({
        ...msg,
        content: normalizeContent(msg.content),
    }));

    return {
        model,
        messages: normalizedMessages,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        response_format: responseFormat,
        tool_choice: toolChoice,
        tools: tools ? Object.entries(tools).map(([name, tool]) => ({
            type: 'function',
            function: {
                name,
                description: tool.description,
                parameters: convertToolParameters(tool.parameters),
            },
        })) : undefined,
    };
}

/**
 * Convert tool parameters, auto-detecting and converting Zod schemas
 */
function convertToolParameters(parameters: unknown): Record<string, unknown> {
    if (!parameters) {
        return {};
    }

    // Enhanced duck-typing for Zod schema detection
    if (isZodSchema(parameters)) {
        return zodToJsonSchemaSimple(parameters);
    }

    return parameters as Record<string, unknown>;
}

/**
 * Check if an object is a Zod schema using robust duck-typing
 */
function isZodSchema(obj: unknown): boolean {
    if (obj == null || typeof obj !== 'object') {
        return false;
    }
    const def = (obj as { _def?: { typeName?: string } })._def;
    return def != null && typeof def.typeName === 'string' && def.typeName.startsWith('Zod');
}

/**
 * Simple Zod to JSON Schema conversion (subset for tool parameters)
 * Supports: ZodString, ZodNumber, ZodBoolean, ZodArray, ZodEnum, ZodLiteral, ZodUnion, ZodObject, ZodOptional, ZodNullable, ZodDefault
 * Unsupported types (tuple, effects, map, set, etc.) will emit a warning and return {}
 */
function zodToJsonSchemaSimple(schema: unknown, path = 'root'): Record<string, unknown> {
    const def = (schema as { _def?: { typeName?: string;[key: string]: unknown } })._def;
    const typeName = def?.typeName;

    switch (typeName) {
        case 'ZodString':
            return { type: 'string' };
        case 'ZodNumber':
            return { type: 'number' };
        case 'ZodBoolean':
            return { type: 'boolean' };
        case 'ZodArray':
            return { type: 'array', items: zodToJsonSchemaSimple((def as { type: unknown }).type, `${path}[]`) };
        case 'ZodEnum':
            return { type: 'string', enum: (def as { values: unknown[] }).values };
        case 'ZodLiteral': {
            const value = (def as { value: unknown }).value;
            const valueType = typeof value;
            if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
                return { type: valueType, const: value };
            }
            return { const: value };
        }
        case 'ZodUnion': {
            const options = (def as { options: unknown[] }).options;
            return { anyOf: options.map((opt, i) => zodToJsonSchemaSimple(opt, `${path}.union[${i}]`)) };
        }
        case 'ZodObject': {
            const shapeSource = def?.shape as (() => Record<string, unknown>) | Record<string, unknown>;
            const shape = typeof shapeSource === 'function' ? shapeSource() : shapeSource || {};
            const properties: Record<string, unknown> = {};
            const required: string[] = [];

            for (const [key, value] of Object.entries(shape)) {
                const innerDef = (value as { _def?: { typeName?: string; innerType?: unknown } })._def;
                const isOptional = innerDef?.typeName === 'ZodOptional' || innerDef?.typeName === 'ZodDefault';
                const inner = isOptional ? innerDef?.innerType : value;
                properties[key] = zodToJsonSchemaSimple(inner, `${path}.${key}`);
                if (!isOptional) {
                    required.push(key);
                }
            }

            const result: Record<string, unknown> = { type: 'object', properties };
            if (required.length) {
                result.required = required;
            }
            return result;
        }
        case 'ZodOptional':
        case 'ZodNullable':
        case 'ZodDefault':
            return zodToJsonSchemaSimple((def as { innerType: unknown }).innerType, path);
        default:
            // Warn about unsupported types
            if (typeName && typeName.startsWith('Zod')) {
                console.warn(
                    `[qiniu-ai-sdk] Unsupported Zod type "${typeName}" at path "${path}". ` +
                    `Consider using zodToJsonSchema from '@bowenqt/qiniu-ai-sdk/ai-tools' for full Zod support.`
                );
            }
            return {};
    }
}

async function consumeStream(
    client: QiniuAI,
    request: ChatCompletionRequest,
    abortSignal?: AbortSignal
): Promise<StreamResult> {
    // JSON mode may not support streaming, use non-streaming to ensure complete JSON output
    const isJsonMode = request.response_format?.type === 'json_object'
        || request.response_format?.type === 'json_schema';

    if (isJsonMode) {
        // Use non-streaming API for JSON mode to avoid incomplete JSON
        const response = await client.chat.create(request, { signal: abortSignal });
        const choice = response.choices[0];
        const message = choice?.message;

        // Extract content from message
        let content = '';
        if (typeof message?.content === 'string') {
            content = message.content;
        } else if (Array.isArray(message?.content)) {
            content = message.content
                .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
                .map((part) => part.text)
                .join('');
        }

        // Apply fallback IDs to tool calls (same as streaming path)
        const toolCalls = (message?.tool_calls || []).map((tc, index) => ({
            ...tc,
            id: tc.id || `toolcall-${index}`,
        }));

        return {
            content,
            reasoningContent: '',
            toolCalls,
            finishReason: choice?.finish_reason || null,
            usage: response.usage,
        };
    }

    // Default: use streaming API
    const stream = client.chat.createStream(request, { signal: abortSignal });
    let finalResult: StreamResult | undefined;

    while (true) {
        const { value, done } = await stream.next();
        if (done) {
            finalResult = value;
            break;
        }
    }

    return finalResult || {
        content: '',
        reasoningContent: '',
        toolCalls: [],
        finishReason: null,
        usage: undefined,
    };
}

function toolResultsToMessages(toolCalls: ToolCall[], results: ToolResult[]): ChatMessage[] {
    return toolCalls.map((toolCall) => {
        const result = results.find((entry) => entry.toolCallId === toolCall.id);
        return {
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: result?.result ?? '',
        };
    });
}

async function executeTools(
    toolCalls: ToolCall[],
    tools: Record<string, Tool>,
    messages: ChatMessage[],
    abortSignal?: AbortSignal,
    approvalConfig?: ApprovalConfig,
): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
        const tool = tools[toolCall.function.name];
        if (!tool || !tool.execute) {
            throw new ToolExecutionError(toolCall.function.name, 'Tool is not implemented.');
        }

        const args = parseToolArguments(toolCall.function.arguments);

        // Check approval if tool requires it
        if (tool.requiresApproval) {
            // Validate source if provided (fail fast for JS callers with incomplete source)
            if (tool.source && !tool.source.namespace) {
                throw new Error(`Tool '${toolCall.function.name}' has source.type but missing source.namespace`);
            }
            const toolSource = tool.source ?? { type: 'user' as const, namespace: 'generateText' };

            // Create a minimal RegisteredTool-compatible object for checkApproval
            const toolForApproval = {
                name: toolCall.function.name,
                description: tool.description ?? '',
                parameters: (tool.parameters ?? {}) as any,
                source: toolSource,
                requiresApproval: tool.requiresApproval,
                approvalHandler: tool.approvalHandler,
            };

            const approvalResult = await checkApproval(
                toolForApproval,
                toolCall,
                args as Record<string, unknown>,
                messages as Array<{ role: string; content: unknown }>,
                approvalConfig,
            );

            if (!approvalResult.approved) {
                // Check for deferred approval - not supported in generateText
                if (approvalResult.deferred) {
                    throw new Error(
                        `Deferred approval not supported in generateText(). ` +
                        `Use generateTextWithGraph() with AgentGraph.invokeResumable() for resumable workflows.`
                    );
                }
                results.push({
                    toolCallId: toolCall.id,
                    result: approvalResult.rejectionMessage ?? '[Approval Rejected] Tool execution was denied.',
                });
                continue;
            }
        }

        const value = await tool.execute(args, {
            toolCallId: toolCall.id,
            messages,
            abortSignal,
        });

        results.push({
            toolCallId: toolCall.id,
            result: serializeToolResult(value),
        });
    }

    return results;
}

function parseToolArguments(payload: string): unknown {
    if (!payload) {
        return {};
    }

    try {
        return JSON.parse(payload);
    } catch {
        return payload;
    }
}

// ============================================================================
// G2/G4: Graph-based generateText implementation
// ============================================================================

import { AgentGraph, type AgentGraphOptions, type AgentGraphResult } from './agent-graph';
import type { RegisteredTool, ToolParameters } from '../lib/tool-registry';
import type { Skill } from '../modules/skills';

/**
 * Extended options for graph-based generation.
 */
export interface GenerateTextWithGraphOptions extends GenerateTextOptions {
    /** Skills to inject into the conversation */
    skills?: Skill[];
    /** Context token budget for compaction */
    maxContextTokens?: number;
    /** Event handler for node entry */
    onNodeEnter?: (nodeName: string) => void;
    /** Event handler for node exit */
    onNodeExit?: (nodeName: string) => void;
    /** Checkpointer for state persistence */
    checkpointer?: Checkpointer;
    /** Thread ID for checkpoint and memory (required if checkpointer or memory provided) */
    threadId?: string;
    /** Resume from checkpoint if available (default: true) */
    resumeFromCheckpoint?: boolean;
    /** Approval configuration for tool execution */
    approvalConfig?: ApprovalConfig;
    /** Memory manager for conversation summarization */
    memory?: MemoryManager;
    /** Guardrails for input/output filtering */
    guardrails?: Guardrail[];
    /** Agent ID for guardrail attribution (defaults to threadId or 'default') */
    agentId?: string;
}

/**
 * Extended result with graph-specific information.
 */
export interface GenerateTextWithGraphResult extends GenerateTextResult {
    /** Graph execution details */
    graphInfo?: {
        nodesVisited: string[];
        skillsInjected: string[];
        /** Compaction information */
        compaction?: {
            occurred: boolean;
            droppedSkills: string[];
            droppedMessages: number;
        };
    };
}

/**
 * Generate text using the AgentGraph runtime.
 * 
 * Benefits over generateText:
 * - Skills injection with automatic compaction
 * - Node-level event hooks (onNodeEnter/onNodeExit)
 * - Consistent event ordering (text→tool_call→tool_result)
 * - JSON mode non-streaming fallback
 * 
 * @example
 * ```typescript
 * const result = await generateTextWithGraph({
 *   client,
 *   model: 'deepseek-v3',
 *   messages: [{ role: 'user', content: 'Hello' }],
 *   skills: [await skillLoader.load('my-skill')],
 *   onStepFinish: (step) => console.log(step),
 * });
 * ```
 */
export async function generateTextWithGraph(
    options: GenerateTextWithGraphOptions
): Promise<GenerateTextWithGraphResult> {
    const {
        client,
        model,
        tools,
        skills,
        maxSteps = 10,
        maxContextTokens,
        onStepFinish,
        onNodeEnter,
        onNodeExit,
        abortSignal,
        temperature,
        topP,
        maxTokens,
        responseFormat,
        toolChoice,
        checkpointer,
        threadId,
        resumeFromCheckpoint = true,
        memory,
        guardrails,
    } = options;

    // Resolve agentId for guardrail attribution
    const resolvedAgentId = options.agentId ?? threadId ?? 'default';

    // Create guardrail chain if guardrails provided
    const guardrailChain = guardrails?.length ? new GuardrailChain(guardrails) : null;

    // Validate checkpointer + threadId combination
    if (checkpointer && !threadId) {
        throw new Error('threadId is required when checkpointer is provided');
    }

    // Try to resume from checkpoint if available
    let resumedMessages: ChatMessage[] | null = null;
    if (checkpointer && threadId && resumeFromCheckpoint) {
        const checkpoint = await checkpointer.load(threadId);
        if (checkpoint) {
            // Extract historical messages and append new input
            const historicalMessages = checkpoint.state.messages as ChatMessage[];
            const newMessages = normalizeMessages(options);
            // Only append new messages if there are any (avoid duplicating history)
            if (newMessages.length > 0) {
                resumedMessages = [...historicalMessages, ...newMessages];
            } else {
                resumedMessages = historicalMessages;
            }
        }
    }

    // Normalize messages - use resumed messages if available, otherwise input
    let messages = resumedMessages ?? normalizeMessages(options);

    // Pre-request guardrails: filter user input
    if (guardrailChain) {
        // Find last user message (reverse to find from end)
        const userMessages = messages.filter((m): m is ChatMessage => m.role === 'user');
        const lastUserMessage = userMessages[userMessages.length - 1];
        if (lastUserMessage) {
            const userContent = typeof lastUserMessage.content === 'string'
                ? lastUserMessage.content
                : JSON.stringify(lastUserMessage.content);

            const preResult = await guardrailChain.execute('pre-request', {
                content: userContent,
                agentId: resolvedAgentId,
                threadId,
            });

            if (!preResult.shouldProceed) {
                const blockingResult = preResult.results.find(r => r.action === 'block');
                throw new GuardrailBlockedError(
                    blockingResult?.reason ?? 'Request blocked by guardrail',
                    preResult.results
                );
            }

            // Apply redacted content if modified
            if (preResult.content !== userContent) {
                messages = messages.map(m =>
                    m === lastUserMessage
                        ? { ...m, content: preResult.content }
                        : m
                );
            }
        }
    }

    // Track current messages for tool context (will be updated during execution)
    let currentMessages = [...messages];

    // Convert tools to RegisteredTool format
    // High fix: use convertToolParameters for Zod support and preserve required fields
    const registeredTools: Record<string, RegisteredTool> = {};
    if (tools) {
        for (const [name, tool] of Object.entries(tools)) {
            // Convert parameters using same logic as generateText
            const convertedParams = convertToolParameters(tool.parameters);

            // Validate source if provided (fail fast for JS callers with incomplete source)
            if (tool.source && !tool.source.namespace) {
                throw new Error(`Tool '${name}' has source.type but missing source.namespace`);
            }
            const toolSource = tool.source ?? { type: 'user' as const, namespace: 'generateText' };

            registeredTools[name] = {
                name,
                description: tool.description || '',
                parameters: {
                    type: 'object',
                    properties: convertedParams.properties || convertedParams,
                    required: convertedParams.required,
                } as ToolParameters,
                source: toolSource,
                // Propagate approval fields for unified behavior
                requiresApproval: tool.requiresApproval,
                approvalHandler: tool.approvalHandler,
                execute: tool.execute
                    ? async (args: Record<string, unknown>, execContext?: { toolCallId: string; messages: Array<{ role: string; content: unknown }>; abortSignal?: AbortSignal }) => {
                        // Use context from execute-node (has real toolCallId), fallback to currentMessages
                        const context: ToolExecutionContext = execContext
                            ? {
                                toolCallId: execContext.toolCallId,
                                messages: execContext.messages as ChatMessage[],
                                abortSignal: execContext.abortSignal,
                            }
                            : {
                                toolCallId: '',
                                messages: currentMessages,
                                abortSignal,
                            };
                        return tool.execute!(args, context);
                    }
                    : undefined,
            };
        }
    }

    // Track nodes visited
    const nodesVisited: string[] = [];

    // Create AgentGraph
    const graph = new AgentGraph({
        client,
        model,
        tools: registeredTools,
        skills,
        maxSteps,
        maxContextTokens, // Pass through for compaction
        temperature,
        topP,
        maxTokens,
        responseFormat,
        toolChoice,
        abortSignal,
        events: {
            onStepFinish: (step) => {
                if (onStepFinish) {
                    // Convert internal StepResult to public StepResult
                    const publicStep: StepResult = {
                        type: step.type,
                        content: step.content,
                        reasoning: step.reasoning,
                        toolCalls: step.toolCalls,
                        toolResults: step.toolResults?.map(r => ({
                            toolCallId: r.toolCallId,
                            result: r.result,
                        })),
                    };
                    onStepFinish(publicStep);
                }
            },
            onNodeEnter: (nodeName) => {
                nodesVisited.push(nodeName);
                onNodeEnter?.(nodeName);
            },
            onNodeExit: onNodeExit,
        },
        approvalConfig: options.approvalConfig,
        memory,
        threadId,
    });

    // Execute graph
    const graphResult = await graph.invoke(messages);

    // Build result
    let finalText = graphResult.text;

    // Post-response guardrails: filter assistant output
    if (guardrailChain && finalText) {
        // Find blocking result for better error message
        const postResult = await guardrailChain.execute('post-response', {
            content: finalText,
            agentId: resolvedAgentId,
            threadId,
        });

        if (!postResult.shouldProceed) {
            // Find the actual blocking guardrail result
            const blockingResult = postResult.results.find(r => r.action === 'block');
            throw new GuardrailBlockedError(
                blockingResult?.reason ?? 'Response blocked by guardrail',
                postResult.results
            );
        }

        // Apply redacted content if modified
        if (postResult.content !== finalText) {
            finalText = postResult.content;
        }
    }

    // Save checkpoint AFTER post-response guardrails (use redacted content)
    if (checkpointer && threadId) {
        // Update final text in state if redacted
        const stateToSave = {
            ...graphResult.state,
            // Ensure final assistant message uses redacted content
        };
        await checkpointer.save(threadId, stateToSave);
    }

    return {
        text: finalText,
        reasoning: graphResult.reasoning,
        steps: graphResult.steps.map(s => ({
            type: s.type,
            content: s.content,
            reasoning: s.reasoning,
            toolCalls: s.toolCalls,
            toolResults: s.toolResults?.map(r => ({
                toolCallId: r.toolCallId,
                result: r.result,
            })),
        })),
        usage: graphResult.usage,
        finishReason: graphResult.finishReason,
        graphInfo: {
            nodesVisited,
            skillsInjected: skills?.map(s => s.name) || [],
            compaction: graphResult.compaction,
        },
    };
}

