/**
 * PredictNode - LLM call abstraction.
 * Extracted from generateText for modular use in Graph Runtime.
 */

import type { QiniuAI } from '../../client';
import type { ChatMessage, ResponseFormat, ChatCompletionRequest, ToolCall } from '../../lib/types';
import type { RegisteredTool } from '../../lib/tool-registry';

/** Predict options */
export interface PredictOptions {
    client: QiniuAI;
    model: string;
    messages: ChatMessage[];
    tools?: RegisteredTool[];
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    responseFormat?: ResponseFormat;
    toolChoice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
    abortSignal?: AbortSignal;
}

/** Predict result */
export interface PredictResult {
    message: ChatMessage;
    reasoning?: string;
    finishReason: string | null;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * Execute a single LLM prediction.
 * For JSON mode (json_object/json_schema), uses non-streaming to avoid partial JSON.
 */
export async function predict(options: PredictOptions): Promise<PredictResult> {
    const { client, model, messages, tools, abortSignal, temperature, topP, maxTokens, responseFormat, toolChoice } = options;

    // Check if JSON mode - use non-streaming to avoid partial JSON
    const isJsonMode = responseFormat?.type === 'json_object' || responseFormat?.type === 'json_schema';

    // Build request with explicit field mapping (camelCase -> snake_case for API)
    const request: ChatCompletionRequest = {
        model,
        messages,
        stream: !isJsonMode, // Non-streaming for JSON mode
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        response_format: responseFormat,
        tool_choice: toolChoice,
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
        request.tools = tools.map(t => ({
            type: 'function' as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            },
        }));
    }

    if (isJsonMode) {
        // Non-streaming path for JSON mode
        return predictNonStreaming(client, request, abortSignal);
    }

    // Streaming path (default)
    return predictStreaming(client, request, abortSignal);
}

/**
 * Streaming prediction.
 */
async function predictStreaming(
    client: QiniuAI,
    request: ChatCompletionRequest,
    abortSignal?: AbortSignal
): Promise<PredictResult> {
    // Execute streaming request and consume to get final result
    const generator = client.chat.createStream(request, { signal: abortSignal });

    // Consume all chunks (we don't need them, just the final result)
    let result: IteratorResult<unknown, {
        content: string;
        reasoningContent: string;
        toolCalls: ToolCall[];
        finishReason: string | null;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    }>;

    do {
        result = await generator.next();
    } while (!result.done);

    // result.value is the StreamResult from the generator's return
    const streamResult = result.value;

    // Build message
    const message: ChatMessage = {
        role: 'assistant',
        content: streamResult.content,
    };

    if (streamResult.toolCalls.length > 0) {
        message.tool_calls = streamResult.toolCalls;
    }

    return {
        message,
        reasoning: streamResult.reasoningContent || undefined,
        finishReason: streamResult.finishReason,
        usage: streamResult.usage,
    };
}

/**
 * Non-streaming prediction for JSON mode.
 * Returns single final step, no token events.
 */
async function predictNonStreaming(
    client: QiniuAI,
    request: ChatCompletionRequest,
    abortSignal?: AbortSignal
): Promise<PredictResult> {
    // Medium fix: pass abortSignal to create method
    const response = await client.chat.create(request, { signal: abortSignal });

    const choice = response.choices?.[0];
    const message: ChatMessage = choice?.message || { role: 'assistant', content: '' };

    return {
        message,
        reasoning: undefined,
        finishReason: choice?.finish_reason || null,
        usage: response.usage,
    };
}

