/**
 * PredictNode - LLM call abstraction.
 * Extracted from generateText for modular use in Graph Runtime.
 */

import type { QiniuAI } from '../../client';
import type { ChatMessage, ResponseFormat, ChatCompletionRequest } from '../../lib/types';
import type { StreamResult } from '../../modules/chat';
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

    // Execute streaming request
    const response = await client.chat.createStream(request, { signal: abortSignal });
    const result = await consumeStreamToResult(response);

    return {
        message: result.message,
        reasoning: result.reasoning,
        finishReason: result.finishReason,
        usage: result.usage,
    };
}

/**
 * Consume stream and build result.
 */
async function consumeStreamToResult(stream: AsyncIterable<StreamResult>): Promise<{
    message: ChatMessage;
    reasoning?: string;
    finishReason: string | null;
    usage?: PredictResult['usage'];
}> {
    let content = '';
    let reasoning = '';
    let finishReason: string | null = null;
    let usage: PredictResult['usage'] | undefined;
    const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

    for await (const chunk of stream) {
        if (chunk.content) content += chunk.content;
        if (chunk.reasoning) reasoning += chunk.reasoning;
        if (chunk.finishReason) finishReason = chunk.finishReason;
        if (chunk.usage) usage = chunk.usage;

        // Accumulate tool calls
        if (chunk.toolCalls) {
            for (const tc of chunk.toolCalls) {
                const existing = toolCalls.get(tc.index);
                if (existing) {
                    if (tc.id) existing.id = tc.id;
                    if (tc.name) existing.name = tc.name;
                    if (tc.arguments) existing.arguments += tc.arguments;
                } else {
                    toolCalls.set(tc.index, {
                        id: tc.id ?? '',
                        name: tc.name ?? '',
                        arguments: tc.arguments ?? '',
                    });
                }
            }
        }
    }

    // Build message
    const message: ChatMessage = {
        role: 'assistant',
        content,
    };

    if (toolCalls.size > 0) {
        message.tool_calls = Array.from(toolCalls.values()).map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
                name: tc.name,
                arguments: tc.arguments,
            },
        }));
    }

    return {
        message,
        reasoning: reasoning || undefined,
        finishReason,
        usage,
    };
}
