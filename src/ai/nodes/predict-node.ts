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
 * Correctly consumes the streaming generator and extracts the final result.
 */
export async function predict(options: PredictOptions): Promise<PredictResult> {
    const { client, model, messages, tools, abortSignal, ...rest } = options;

    // Build request
    const request: ChatCompletionRequest = {
        model,
        messages,
        stream: true,
        ...rest,
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

    // Execute streaming request and consume to get final result
    // createStream is an AsyncGenerator that yields chunks and returns StreamResult
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
