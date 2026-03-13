/**
 * PredictNode - LLM call abstraction.
 * Extracted from generateText for modular use in Graph Runtime.
 */

import type { LanguageModelClient } from '../../core/client';
import type { ChatMessage, ResponseFormat, ChatCompletionRequest, ToolCall } from '../../lib/types';
import type { RegisteredTool } from '../../lib/tool-registry';

/** Token-level chunk emitted during streaming prediction */
export type PredictChunk =
    | { type: 'text-delta'; textDelta: string }
    | { type: 'reasoning-delta'; reasoningDelta: string }
    | { type: 'tool-call-delta'; index: number; id?: string; name?: string; argumentsDelta?: string };

/** Predict options */
export interface PredictOptions {
    client: LanguageModelClient;
    model: string;
    messages: ChatMessage[];
    tools?: RegisteredTool[];
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    responseFormat?: ResponseFormat;
    toolChoice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
    abortSignal?: AbortSignal;
    /** Optional callback for token-level streaming events. Fault-isolated: errors are silently caught. */
    onChunk?: (chunk: PredictChunk) => void;
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
    const { client, model, messages, tools, abortSignal, temperature, topP, maxTokens, responseFormat, toolChoice, onChunk } = options;

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
        // Non-streaming path for JSON mode (onChunk not applicable)
        return predictNonStreaming(client, request, abortSignal);
    }

    // Streaming path (default)
    return predictStreaming(client, request, abortSignal, onChunk);
}

/**
 * Streaming prediction.
 */
async function predictStreaming(
    client: LanguageModelClient,
    request: ChatCompletionRequest,
    abortSignal?: AbortSignal,
    onChunk?: (chunk: PredictChunk) => void,
): Promise<PredictResult> {
    // Execute streaming request and consume to get final result
    const generator = client.chat.createStream(request, { signal: abortSignal });

    // Consume all chunks, emitting events via onChunk if provided
    let result: IteratorResult<unknown, {
        content: string;
        reasoningContent: string;
        toolCalls: ToolCall[];
        finishReason: string | null;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    }>;

    do {
        result = await generator.next();
        if (!result.done && onChunk) {
            try {
                const chunk = result.value as { choices?: { delta?: { content?: string; reasoning_content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> } }[] };
                const delta = chunk?.choices?.[0]?.delta;
                if (delta?.content) {
                    onChunk({ type: 'text-delta', textDelta: delta.content });
                }
                if (delta?.reasoning_content) {
                    onChunk({ type: 'reasoning-delta', reasoningDelta: delta.reasoning_content });
                }
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        onChunk({
                            type: 'tool-call-delta',
                            index: tc.index ?? 0,
                            id: tc.id,
                            name: tc.function?.name,
                            argumentsDelta: tc.function?.arguments,
                        });
                    }
                }
            } catch { /* Fault isolation: callback errors do not interrupt main flow */ }
        }
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
    client: LanguageModelClient,
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
