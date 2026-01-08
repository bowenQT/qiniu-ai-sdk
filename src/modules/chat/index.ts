import { IQiniuClient, ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk, ChatDelta, ToolCallDelta } from '../../lib/types';
import { parseSSEStream, createStreamAccumulator, accumulateDelta, StreamAccumulator } from '../../lib/sse';

/**
 * Options for streaming chat completion
 */
export interface StreamOptions {
    /**
     * AbortSignal for cancellation
     */
    signal?: AbortSignal;
}

/**
 * Accumulated result from streaming, available after stream completes
 */
export interface StreamResult {
    content: string;
    reasoningContent: string;
    toolCalls: Array<{
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }>;
    finishReason: string | null;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export class Chat {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Create a chat completion (non-streaming)
     */
    async create(params: ChatCompletionRequest): Promise<ChatCompletionResponse> {
        if (params.stream) {
            throw new Error(
                'For streaming, use chat.createStream() instead. ' +
                'The create() method only supports non-streaming requests.'
            );
        }
        return this.client.post<ChatCompletionResponse>('/chat/completions', params);
    }

    /**
     * Create a streaming chat completion.
     * 
     * Yields ChatCompletionChunk objects as they arrive from the server.
     * Each chunk contains delta content that should be accumulated.
     * 
     * Supports:
     * - Regular text content streaming
     * - Function Calling (tool_calls) with incremental argument streaming
     * - reasoning_content for models that expose thinking process (Gemini, Claude)
     * 
     * @example
     * ```typescript
     * const stream = client.chat.createStream({
     *   model: 'gemini-2.5-flash',
     *   messages: [{ role: 'user', content: 'Hello!' }],
     * });
     * 
     * let fullContent = '';
     * for await (const chunk of stream) {
     *   const delta = chunk.choices[0]?.delta;
     *   if (delta?.content) {
     *     fullContent += delta.content;
     *     process.stdout.write(delta.content);
     *   }
     * }
     * ```
     */
    async *createStream(
        params: Omit<ChatCompletionRequest, 'stream'>,
        options: StreamOptions = {}
    ): AsyncGenerator<ChatCompletionChunk, StreamResult, unknown> {
        const logger = this.client.getLogger();
        const { signal } = options;

        // Force stream: true
        const requestBody = { ...params, stream: true };

        logger.debug('Starting streaming chat completion', {
            model: params.model,
            messageCount: params.messages.length,
        });

        // Get raw response for SSE parsing
        const response = await this.client.postStream('/chat/completions', requestBody);

        // Create accumulator for final result
        const accumulator = createStreamAccumulator();
        let finishReason: string | null = null;
        let usage: ChatCompletionChunk['usage'] | undefined;

        // Parse and yield chunks
        for await (const chunk of parseSSEStream<ChatCompletionChunk>(response, { signal, logger })) {
            // Track finish reason and usage from the final chunk
            const choice = chunk.choices[0];
            if (choice) {
                if (choice.finish_reason) {
                    finishReason = choice.finish_reason;
                }
                if (choice.delta) {
                    accumulateDelta(accumulator, choice.delta);
                }
            }
            if (chunk.usage) {
                usage = chunk.usage;
            }

            yield chunk;
        }

        logger.debug('Streaming chat completion finished', {
            contentLength: accumulator.content.length,
            reasoningLength: accumulator.reasoningContent.length,
            toolCallCount: accumulator.toolCalls.size,
            finishReason,
        });

        // Return accumulated result
        return {
            content: accumulator.content,
            reasoningContent: accumulator.reasoningContent,
            toolCalls: Array.from(accumulator.toolCalls.values()),
            finishReason,
            usage,
        };
    }
}
