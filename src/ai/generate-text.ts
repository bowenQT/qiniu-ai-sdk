import type { QiniuAI } from '../client';
import type { ChatCompletionRequest, ChatMessage, ToolCall } from '../lib/types';
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
    } = options;

    const messages = normalizeMessages(options);
    const steps: StepResult[] = [];
    let accumulatedText = '';
    let accumulatedReasoning = '';
    let usage: GenerateTextResult['usage'];
    let finishReason: GenerateTextResult['finishReason'] = null;

    for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
        const request = buildChatRequest({ model, messages, tools });
        const streamResult = await consumeStream(client, request, abortSignal);

        if (streamResult.usage) {
            usage = streamResult.usage;
        }
        if (streamResult.finishReason !== undefined) {
            finishReason = streamResult.finishReason;
        }

        if (streamResult.content) {
            accumulatedText += streamResult.content;
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
                text: accumulatedText,
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
}): ChatCompletionRequest {
    const { model, messages, tools } = params;

    return {
        model,
        messages,
        tools: tools ? Object.entries(tools).map(([name, tool]) => ({
            type: 'function',
            function: {
                name,
                description: tool.description,
                parameters: tool.parameters ?? {},
            },
        })) : undefined,
    };
}

async function consumeStream(
    client: QiniuAI,
    request: ChatCompletionRequest,
    abortSignal?: AbortSignal
): Promise<StreamResult> {
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
