/**
 * Server-Sent Events (SSE) stream parser for chat completions.
 * Parses the SSE format used by OpenAI-compatible APIs.
 */

import { Logger, noopLogger } from './logger';

/**
 * Options for SSE stream parsing
 */
export interface SSEParseOptions {
    signal?: AbortSignal;
    logger?: Logger;
}

/**
 * Parse SSE stream from a Response object.
 * Yields parsed JSON objects from each "data:" line.
 * Handles the [DONE] signal to terminate the stream.
 *
 * @param response - The Response object with SSE body
 * @param options - Parsing options
 * @yields Parsed JSON objects from SSE data lines
 */
export async function* parseSSEStream<T>(
    response: Response,
    options: SSEParseOptions = {}
): AsyncGenerator<T, void, unknown> {
    const { signal, logger = noopLogger } = options;

    if (!response.body) {
        throw new Error('Response body is null - cannot parse SSE stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
        while (true) {
            // Check for cancellation
            if (signal?.aborted) {
                logger.info('SSE stream cancelled by user');
                break;
            }

            const { done, value } = await reader.read();

            if (done) {
                logger.debug('SSE stream ended (reader done)');
                break;
            }

            // Decode chunk and add to buffer
            buffer += decoder.decode(value, { stream: true });

            // Process complete lines
            const lines = buffer.split('\n');
            // Keep the last incomplete line in buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();

                // Skip empty lines and comments
                if (!trimmedLine || trimmedLine.startsWith(':')) {
                    continue;
                }

                // Handle data lines
                if (trimmedLine.startsWith('data:')) {
                    const data = trimmedLine.slice(5).trim();

                    // Check for stream end signal
                    if (data === '[DONE]') {
                        logger.debug('SSE stream received [DONE] signal');
                        return;
                    }

                    // Parse JSON data
                    try {
                        const parsed = JSON.parse(data) as T;
                        yield parsed;
                    } catch (parseError) {
                        logger.warn('Failed to parse SSE data line', {
                            data,
                            error: parseError instanceof Error ? parseError.message : String(parseError),
                        });
                        // Continue processing - don't break the stream for one bad line
                    }
                }
            }
        }

        // Process any remaining data in buffer
        if (buffer.trim()) {
            const trimmedBuffer = buffer.trim();
            if (trimmedBuffer.startsWith('data:')) {
                const data = trimmedBuffer.slice(5).trim();
                if (data && data !== '[DONE]') {
                    try {
                        const parsed = JSON.parse(data) as T;
                        yield parsed;
                    } catch {
                        logger.warn('Failed to parse final SSE buffer', { data });
                    }
                }
            }
        }
    } finally {
        // Always release the reader
        reader.releaseLock();
    }
}

/**
 * Helper to accumulate streaming content from chunks.
 * Useful for aggregating delta content into a complete message.
 */
export interface StreamAccumulator {
    content: string;
    reasoningContent: string;
    toolCalls: Map<number, {
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }>;
}

export function createStreamAccumulator(): StreamAccumulator {
    return {
        content: '',
        reasoningContent: '',
        toolCalls: new Map(),
    };
}

/**
 * Accumulate a delta into the accumulator.
 * Returns the accumulated state.
 */
export function accumulateDelta(
    acc: StreamAccumulator,
    delta: {
        content?: string;
        reasoning_content?: string;
        tool_calls?: Array<{
            index: number;
            id?: string;
            type?: 'function';
            function?: {
                name?: string;
                arguments?: string;
            };
        }>;
    }
): StreamAccumulator {
    if (delta.content) {
        acc.content += delta.content;
    }

    if (delta.reasoning_content) {
        acc.reasoningContent += delta.reasoning_content;
    }

    if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
            const existing = acc.toolCalls.get(tc.index);
            if (existing) {
                // Append to existing tool call
                if (tc.function?.name) {
                    existing.function.name += tc.function.name;
                }
                if (tc.function?.arguments) {
                    existing.function.arguments += tc.function.arguments;
                }
            } else {
                // Create new tool call entry
                acc.toolCalls.set(tc.index, {
                    id: tc.id || '',
                    type: 'function',
                    function: {
                        name: tc.function?.name || '',
                        arguments: tc.function?.arguments || '',
                    },
                });
            }
        }
    }

    return acc;
}
