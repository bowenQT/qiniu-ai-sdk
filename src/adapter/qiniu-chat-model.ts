import type { QiniuAI } from '../client';
import type { ChatCompletionChunk, ChatCompletionRequest, ChatCompletionResponse, ToolCall } from '../lib/types';
import type { StreamResult } from '../modules/chat';
import { convertPromptToMessages, convertTools, convertToolChoice, convertResponseFormat, mapFinishReason } from './convert-prompt';
import { generatorToReadableStream } from './utils';
import type {
    LanguageModelV2,
    LanguageModelV2CallOptions,
    LanguageModelV2CallWarning,
    LanguageModelV2Content,
    LanguageModelV2FinishReason,
    LanguageModelV2StreamPart,
    LanguageModelV2ToolCall,
    LanguageModelV2Usage,
} from './types';

export class QiniuChatModel implements LanguageModelV2 {
    specificationVersion = 'v2' as const;
    provider = 'qiniu';
    modelId: string;
    supportedUrls: Record<string, RegExp[]> = {
        'image/*': [/^https?:\/\//i, /^data:image\//i],
    };

    private client: QiniuAI;

    constructor(client: QiniuAI, modelId: string) {
        this.client = client;
        this.modelId = modelId;
    }

    async doGenerate(options: LanguageModelV2CallOptions): Promise<{
        content: Array<LanguageModelV2Content>;
        finishReason: LanguageModelV2FinishReason;
        usage: LanguageModelV2Usage;
        warnings: Array<LanguageModelV2CallWarning>;
        response?: {
            id?: string;
            timestamp?: Date;
            modelId?: string;
        };
    }> {
        const request = this.buildChatRequest(options);
        const response = await this.client.chat.create(request);
        const choice = response.choices[0];

        const content: LanguageModelV2Content[] = [];
        const messageText = extractMessageText(choice?.message);
        if (messageText) {
            content.push({ type: 'text', text: messageText });
        }

        if (choice?.message?.tool_calls) {
            content.push(...mapToolCalls(choice.message.tool_calls));
        }

        return {
            content,
            finishReason: mapFinishReason(choice?.finish_reason),
            usage: mapUsage(response.usage),
            warnings: [],
            response: mapResponseMetadata(response),
        };
    }

    async doStream(options: LanguageModelV2CallOptions): Promise<{ stream: ReadableStream<LanguageModelV2StreamPart> }> {
        const request = this.buildChatRequest(options);
        const generator = this.client.chat.createStream(request, { signal: options.abortSignal });
        const transformed = this.transformToStreamEvents(generator);

        return {
            stream: generatorToReadableStream(transformed),
        };
    }

    private buildChatRequest(options: LanguageModelV2CallOptions): ChatCompletionRequest {
        return {
            model: this.modelId,
            messages: convertPromptToMessages(options.prompt),
            temperature: options.temperature,
            top_p: options.topP,
            max_tokens: options.maxOutputTokens,
            stop: options.stopSequences,
            presence_penalty: options.presencePenalty,
            frequency_penalty: options.frequencyPenalty,
            tools: convertTools(options.tools),
            tool_choice: convertToolChoice(options.toolChoice),
            response_format: convertResponseFormat(options.responseFormat),
        };
    }

    private async *transformToStreamEvents(
        generator: AsyncGenerator<ChatCompletionChunk, StreamResult>
    ): AsyncGenerator<LanguageModelV2StreamPart> {
        yield { type: 'stream-start', warnings: [] };

        const toolCallState = new Map<string, { name: string; argsText: string }>();
        const toolCallIdsByIndex = new Map<number, string>();
        let usage: LanguageModelV2Usage = mapUsage(undefined);
        let finishReason: LanguageModelV2FinishReason = 'unknown';
        let responseMetadata: { id?: string; modelId?: string; timestamp?: Date } = {};
        let finalResult: StreamResult | undefined;

        while (true) {
            const { value, done } = await generator.next();
            if (done) {
                finalResult = value;
                break;
            }

            const chunk = value;
            responseMetadata = mergeResponseMetadata(responseMetadata, chunk);

            const choice = chunk.choices[0];
            if (choice?.finish_reason) {
                finishReason = mapFinishReason(choice.finish_reason);
            }

            const delta = choice?.delta;
            if (delta?.content) {
                yield { type: 'text', text: delta.content };
            }

            if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                    const toolCallId = resolveToolCallId(toolCall, toolCallIdsByIndex);
                    const existing = toolCallState.get(toolCallId) || { name: '', argsText: '' };
                    if (toolCall.function?.name) {
                        existing.name = toolCall.function.name;
                    }
                    if (toolCall.function?.arguments) {
                        existing.argsText += toolCall.function.arguments;
                        yield {
                            type: 'tool-call-delta',
                            toolCallId,
                            toolCallType: 'function',
                            toolName: existing.name,
                            argsTextDelta: toolCall.function.arguments,
                        };
                    }
                    toolCallState.set(toolCallId, existing);
                }
            }

            if (chunk.usage) {
                usage = mapUsage(chunk.usage);
            }
        }

        if (finalResult?.usage) {
            usage = mapUsage(finalResult.usage);
        }
        if (finalResult?.finishReason) {
            finishReason = mapFinishReason(finalResult.finishReason);
        }

        const finalToolCalls = finalResult?.toolCalls?.length
            ? finalResult.toolCalls.map((toolCall) => ({
                toolCallId: toolCall.id,
                toolName: toolCall.function.name,
                argsText: toolCall.function.arguments,
            }))
            : Array.from(toolCallState.entries()).map(([toolCallId, value]) => ({
                toolCallId,
                toolName: value.name,
                argsText: value.argsText,
            }));

        for (const toolCall of finalToolCalls) {
            yield {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                args: toolCall.argsText,
            };
        }

        if (responseMetadata.id || responseMetadata.modelId || responseMetadata.timestamp) {
            yield {
                type: 'response-metadata',
                id: responseMetadata.id,
                modelId: responseMetadata.modelId,
                timestamp: responseMetadata.timestamp,
            };
        }

        yield {
            type: 'finish',
            finishReason,
            usage,
        };
    }
}

function resolveToolCallId(
    toolCall: { id?: string; index: number },
    toolCallIdsByIndex: Map<number, string>
): string {
    if (toolCall.id) {
        return toolCall.id;
    }

    const existing = toolCallIdsByIndex.get(toolCall.index);
    if (existing) {
        return existing;
    }

    const generated = `toolcall-${toolCall.index}`;
    toolCallIdsByIndex.set(toolCall.index, generated);
    return generated;
}

function extractMessageText(message?: ChatCompletionResponse['choices'][number]['message']): string {
    if (!message) {
        return '';
    }

    if (typeof message.content === 'string') {
        return message.content;
    }

    if (Array.isArray(message.content)) {
        return message.content
            .map((part) => (part.type === 'text' ? part.text ?? '' : ''))
            .join('');
    }

    return '';
}

function mapUsage(usage?: ChatCompletionResponse['usage']): LanguageModelV2Usage {
    return {
        inputTokens: usage?.prompt_tokens,
        outputTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
    };
}

function mapToolCalls(toolCalls?: ToolCall[]): LanguageModelV2ToolCall[] {
    if (!toolCalls || toolCalls.length === 0) {
        return [];
    }

    return toolCalls.map((toolCall) => ({
        type: 'tool-call',
        toolCallType: 'function',
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        args: toolCall.function.arguments,
    }));
}

function mapResponseMetadata(response: ChatCompletionResponse): {
    id?: string;
    timestamp?: Date;
    modelId?: string;
} {
    return {
        id: response.id,
        modelId: response.model,
        timestamp: response.created ? new Date(response.created * 1000) : undefined,
    };
}

function mergeResponseMetadata(
    current: { id?: string; modelId?: string; timestamp?: Date },
    chunk: ChatCompletionChunk
): { id?: string; modelId?: string; timestamp?: Date } {
    return {
        id: current.id || chunk.id,
        modelId: current.modelId || chunk.model,
        timestamp: current.timestamp || (chunk.created ? new Date(chunk.created * 1000) : undefined),
    };
}
