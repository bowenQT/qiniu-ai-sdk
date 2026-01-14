import type { QiniuAI } from '../client';
import type { ChatCompletionRequest, ChatMessage, ToolCall, ResponseFormat } from '../lib/types';
import type { StreamResult } from '../modules/chat';
import { MaxStepsExceededError, ToolExecutionError } from '../lib/errors';

export interface ToolExecutionContext {
    toolCallId: string;
    messages: ChatMessage[];
    abortSignal?: AbortSignal;
}

export interface Tool {
    description?: string;
    parameters?: Record<string, unknown>;
    execute?: (args: unknown, context: ToolExecutionContext) => Promise<unknown> | unknown;
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

        const toolResults = await executeTools(streamResult.toolCalls, tools, messages, abortSignal);
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

    return {
        model,
        messages,
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
 * Supports: ZodString, ZodNumber, ZodBoolean, ZodArray, ZodEnum, ZodObject, ZodOptional, ZodNullable, ZodDefault
 * Unsupported types (union, literal, tuple, effects, map, set, etc.) will emit a warning and return {}
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
    abortSignal?: AbortSignal
): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
        const tool = tools[toolCall.function.name];
        if (!tool || !tool.execute) {
            throw new ToolExecutionError(toolCall.function.name, 'Tool is not implemented.');
        }

        const args = parseToolArguments(toolCall.function.arguments);
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
