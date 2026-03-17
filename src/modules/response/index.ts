import {
    type ChatCompletionChunk,
    type ChatCompletionResponse,
    IQiniuClient,
    type ChatMessage,
    type ContentPartWithCacheControl,
    type ImageObject,
    type ThinkingBlock,
} from '../../lib/types';
import { normalizeContentAsync } from '../../lib/content-converter';
import { PartialJsonParser } from '../../lib/partial-json-parser';
import { parseSSEStream } from '../../lib/sse';

const RESPONSE_API_VERSION = '2025-04-01-preview';

// ============================================================================
// Type Definitions (Response API - @experimental)
// ============================================================================

/**
 * @experimental This API is invite-only and may change without notice.
 */
export interface ResponseCreateRequest {
    model: string;
    input: string | ResponseInputMessage[] | ChatMessage[];
    reasoning?: {
        effort?: 'low' | 'medium' | 'high';
        summary?: 'auto' | 'concise' | 'detailed';
    };
    include?: string[];
    instructions?: string;
    stream?: boolean;
    metadata?: Record<string, unknown>;
    text?: {
        format?: {
            type: 'text' | 'json_object' | 'json_schema';
            name?: string;
            description?: string;
            strict?: boolean;
            schema?: Record<string, unknown>;
        };
        verbosity?: 'low' | 'medium' | 'high';
    };
    temperature?: number;
    top_p?: number;
    max_output_tokens?: number;
    previous_response_id?: string | null;
    store?: boolean;
    background?: boolean;
    parallel_tool_calls?: boolean;
    tools?: unknown[];
    tool_choice?: 'auto' | 'none' | 'required' | { type: string; name?: string };
    truncation?: 'disabled' | 'auto';
    user?: string | null;
}

/**
 * Convenience alias for creating a follow-up response from an existing response id.
 * Mirrors `previous_response_id` while keeping the transport contract explicit.
 */
export interface ResponseFollowUpRequest extends Omit<ResponseCreateRequest, 'previous_response_id'> {
    previousResponseId: string;
}

export interface ResponseInputMessage {
    role: 'user' | 'assistant' | 'system' | 'developer';
    content: string | ResponseInputContentPart[];
}

export type ResponseInputContentPart = ContentPartWithCacheControl;
export type ResponseInputLikeMessage = ResponseInputMessage | ChatMessage;

export interface ResponseOutput {
    type: string;
    id?: string;
    role?: string;
    status?: string | null;
    content?: ResponseContentBlock[];
    thinking_blocks?: ThinkingBlock[];
    images?: ImageObject[];
    summary?: Array<{ type: string; text?: string }>;
    encrypted_content?: string;
}

export interface ResponseContentBlock {
    type: string;
    text?: string;
    image_url?: { url: string; checksum?: string };
    file_url?: { url: string; detail?: string };
    input_audio?: { data: string; format: 'wav' | 'mp3' | 'ogg' | 'pcm' };
    video_url?: { url: string };
    thinking?: string;
    annotations?: unknown[];
}

/**
 * @experimental This API is invite-only and may change without notice.
 */
export interface ResponseCreateResponse {
    id: string;
    object?: string;
    created_at?: number;
    model?: string;
    status: string;
    output?: ResponseOutput[];
    /**
     * Convenience projection of text blocks from `output`.
     * Mirrors the mainstream Response API ergonomics for direct text consumption.
     */
    output_text?: string;
    error?: unknown;
    incomplete_details?: unknown;
    instructions?: string | null;
    metadata?: Record<string, unknown>;
    reasoning?: {
        effort?: string;
        summary?: string;
        encrypted_content?: string;
    };
    parallel_tool_calls?: boolean;
    temperature?: number;
    tool_choice?: unknown;
    tools?: unknown[];
    top_p?: number;
    previous_response_id?: string | null;
    text?: {
        format?: { type?: string };
        verbosity?: string;
    };
    truncation?: string;
    usage?: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
        input_tokens_details?: unknown;
        output_tokens_details?: unknown;
        cost?: unknown;
    };
    user?: string | null;
    store?: boolean;
    background?: boolean;
    completed_at?: number;
    content_filters?: unknown[];
    max_tool_calls?: number | null;
    prompt_cache_key?: string | null;
    prompt_cache_retention?: string | null;
    safety_identifier?: string | null;
    service_tier?: string;
    top_logprobs?: number;
}

export interface ResponseStreamEvent {
    type: string;
    [key: string]: unknown;
}

export interface ResponseStreamOptions {
    signal?: AbortSignal;
}

export interface ResponseStreamResult {
    response?: ResponseCreateResponse;
    outputText: string;
    eventCount: number;
    message?: ChatMessage;
    messages: ChatMessage[];
    reasoningSummaryText?: string;
    reasoning?: ResponseOutput;
    encryptedContent?: string;
}

export interface ResponseChatCompletionStreamResult extends ResponseStreamResult {
    completion?: ChatCompletionResponse;
}

export interface ResponseChatCompletionResult {
    response: ResponseCreateResponse;
    completion: ChatCompletionResponse;
}

export interface ResponseJsonResult<T = unknown> {
    response: ResponseCreateResponse;
    json: T;
}

export interface ResponseTextResult {
    response: ResponseCreateResponse;
    outputText?: string;
}

export interface ResponseMessagesResult {
    response: ResponseCreateResponse;
    messages: ChatMessage[];
}

export interface ResponseMessageResult {
    response: ResponseCreateResponse;
    message?: ChatMessage;
}

export interface ResponseMessageStreamResult extends ResponseStreamResult {
    message?: ChatMessage;
}

export interface ResponseReasoningSummaryResult {
    response: ResponseCreateResponse;
    reasoningSummaryText?: string;
}

export interface ResponseReasoningResult extends ResponseReasoningSummaryResult {
    reasoning?: ResponseOutput;
    encryptedContent?: string;
}

export interface ResponseMessagesStreamResult extends ResponseStreamResult {
    messages: ChatMessage[];
}

export type ResponseDeepPartial<T> = T extends object
    ? { [P in keyof T]?: ResponseDeepPartial<T[P]> }
    : T;

export interface ResponseJsonStreamResult<T = unknown> extends ResponseStreamResult {
    json?: T;
}

export interface ResponseHelperContract {
    helperSurface: string[];
    promotionCandidates: string[];
    deferredGaps: string[];
    verificationEvidence: string[];
    defaultBehaviors: string[];
}

export interface ResponsePromotionReadinessContract {
    officialSurface: string[];
    deferredHelpers: string[];
    requiredLiveEvidence: string[];
    trackedDecisionPath: string;
    decisionStatus: 'held';
}

export const RESPONSE_API_HELPER_CONTRACT: ResponseHelperContract = Object.freeze({
    helperSurface: [
        'create',
        'followUp',
        'createStream',
        'followUpStream',
        'createText',
        'followUpText',
        'createTextResult',
        'followUpTextResult',
        'createMessageStream',
        'followUpMessageStream',
        'createMessagesStream',
        'followUpMessagesStream',
        'createJson',
        'followUpJson',
        'createJsonResult',
        'followUpJsonResult',
        'createJsonStream',
        'followUpJsonStream',
        'createChatCompletion',
        'followUpChatCompletion',
        'createChatCompletionResult',
        'followUpChatCompletionResult',
        'createChatCompletionStream',
        'followUpChatCompletionStream',
        'createReasoningResult',
        'followUpReasoningResult',
    ],
    promotionCandidates: [
        'createTextResult/followUpTextResult',
        'createJsonResult/followUpJsonResult',
        'createMessagesResult/followUpMessagesResult',
        'createChatCompletionResult/followUpChatCompletionResult',
        'createReasoningResult/followUpReasoningResult',
        'createTextStream/followUpTextStream',
        'createJsonStream/followUpJsonStream',
        'createChatCompletionStream/followUpChatCompletionStream',
    ],
    deferredGaps: [
        'Tool-call and function-role Response API array inputs remain explicitly unsupported.',
        'Projection helpers continue to depend on provider-specific experimental event shapes.',
        'Maturity promotion stays deferred until tracked promotion decisions and live evidence approve it.',
    ],
    verificationEvidence: [
        'tests/unit/modules/response.test.ts',
        'qiniu-ai verify gate --lanes cloud-surface --strict',
        'docs/capability-scorecard.md',
    ],
    defaultBehaviors: [
        'JSON helpers default text.format.type=json_object unless the caller already sets text.format.',
        'ChatMessage[] input accepts only role/content fields and rejects tool/function-role payloads.',
        'createMessageStream returns the latest assistant output message at stream completion.',
    ],
});

export const RESPONSE_API_PROMOTION_READINESS_CONTRACT: ResponsePromotionReadinessContract = Object.freeze({
    officialSurface: [
        'create',
        'followUp',
        'createTextResult/followUpTextResult',
        'createJsonResult/followUpJsonResult',
        'createMessagesResult/followUpMessagesResult',
        'createChatCompletionResult/followUpChatCompletionResult',
        'createReasoningResult/followUpReasoningResult',
    ],
    deferredHelpers: [
        'createStream/followUpStream',
        'createTextStream/followUpTextStream',
        'createJsonStream/followUpJsonStream',
        'createChatCompletionStream/followUpChatCompletionStream',
        'provider-only projection helpers outside the official result-oriented surface',
    ],
    requiredLiveEvidence: [
        'pr: chat,response-api',
        'nightly: chat,response-api,response-api-stream',
    ],
    trackedDecisionPath: '.trellis/decisions/phase2/phase2-cloud-surface-responseapi-promotion-readiness.json',
    decisionStatus: 'held',
});

// ============================================================================
// ResponseAPI Class
// ============================================================================

/**
 * @experimental Response API — invite-only, subject to change.
 *
 * This module provides access to /v1/llm/v1/responses endpoint.
 */
export class ResponseAPI {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Create a response via the experimental Response API.
     * @experimental This endpoint requires whitelist access.
     */
    async create(params: ResponseCreateRequest): Promise<ResponseCreateResponse> {
        const logger = this.client.getLogger();
        const request = await normalizeResponseRequest(params);

        logger.debug('Response API create (experimental)', {
            model: request.model,
            endpoint: '/llm/v1/responses',
            hasReasoning: !!request.reasoning,
            apiVersion: RESPONSE_API_VERSION,
        });

        const response = await this.client.post<ResponseCreateResponse>(
            `/llm/v1/responses?api-version=${encodeURIComponent(RESPONSE_API_VERSION)}`,
            request,
        );
        return normalizeResponseCreateResponse(response);
    }

    /**
     * Create a follow-up response chained from a previous response.
     * @experimental This endpoint requires whitelist access.
     */
    async followUp(params: ResponseFollowUpRequest): Promise<ResponseCreateResponse> {
        const { previousResponseId, ...request } = params;
        return this.create({
            ...request,
            previous_response_id: previousResponseId,
        });
    }

    /**
     * Create a streaming response via the experimental Response API.
     * Emits raw provider events while accumulating a minimal text/result summary.
     */
    async *createStream(
        params: Omit<ResponseCreateRequest, 'stream'>,
        options: ResponseStreamOptions = {},
    ): AsyncGenerator<ResponseStreamEvent, ResponseStreamResult, unknown> {
        const logger = this.client.getLogger();
        const { signal } = options;
        const request = await normalizeResponseRequest({ ...params, stream: true });

        logger.debug('Response API stream (experimental)', {
            model: request.model,
            endpoint: '/llm/v1/responses',
            apiVersion: RESPONSE_API_VERSION,
        });

        const response = await this.client.postStream(
            `/llm/v1/responses?api-version=${encodeURIComponent(RESPONSE_API_VERSION)}`,
            request,
            undefined,
            { signal },
        );

        let outputText = '';
        let finalResponse: ResponseCreateResponse | undefined;
        let eventCount = 0;

        for await (const event of parseSSEStream<ResponseStreamEvent>(response, { signal, logger })) {
            eventCount += 1;

            if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
                outputText += event.delta;
            }

            if (event.type === 'response.completed') {
                const completed = extractCompletedResponse(event);
                if (completed) {
                    finalResponse = normalizeResponseCreateResponse(completed);
                    outputText = finalResponse.output_text ?? outputText;
                }
            }

            yield event;
        }

        return {
            response: finalResponse,
            outputText,
            eventCount,
            message: finalResponse
                ? extractResponseOutputMessage(finalResponse)
                : (outputText
                    ? { role: 'assistant', content: outputText }
                    : undefined),
            messages: finalResponse
                ? extractResponseOutputMessages(finalResponse)
                : (outputText
                    ? [{ role: 'assistant', content: outputText }]
                    : []),
            reasoningSummaryText: finalResponse ? extractResponseReasoningSummaryText(finalResponse) : undefined,
            reasoning: finalResponse ? extractResponseReasoningOutput(finalResponse) : undefined,
            encryptedContent: finalResponse ? extractResponseReasoningEncryptedContent(finalResponse) : undefined,
        };
    }

    /**
     * Create a streaming follow-up response chained from a previous response.
     */
    async *followUpStream(
        params: ResponseFollowUpRequest,
        options: ResponseStreamOptions = {},
    ): AsyncGenerator<ResponseStreamEvent, ResponseStreamResult, unknown> {
        const { previousResponseId, ...request } = params;
        return yield* this.createStream({
            ...request,
            previous_response_id: previousResponseId,
        }, options);
    }

    /**
     * Create a streaming response and emit only output-text deltas.
     */
    async *createTextStream(
        params: Omit<ResponseCreateRequest, 'stream'>,
        options: ResponseStreamOptions = {},
    ): AsyncGenerator<string, ResponseStreamResult, unknown> {
        const stream = this.createStream(params, options);

        while (true) {
            const next = await stream.next();
            if (next.done) {
                return next.value;
            }
            if (next.value.type === 'response.output_text.delta' && typeof next.value.delta === 'string') {
                yield next.value.delta;
            }
        }
    }

    /**
     * Create a streaming follow-up response and emit only output-text deltas.
     */
    async *followUpTextStream(
        params: ResponseFollowUpRequest,
        options: ResponseStreamOptions = {},
    ): AsyncGenerator<string, ResponseStreamResult, unknown> {
        const { previousResponseId, ...request } = params;
        return yield* this.createTextStream({
            ...request,
            previous_response_id: previousResponseId,
        }, options);
    }

    /**
     * Create a streaming response and emit progressive assistant-message snapshots.
     */
    async *createMessageStream(
        params: Omit<ResponseCreateRequest, 'stream'>,
        options: ResponseStreamOptions = {},
    ): AsyncGenerator<ChatMessage, ResponseMessageStreamResult, unknown> {
        const stream = this.createMessagesStream(params, options);

        while (true) {
            const next = await stream.next();
            if (next.done) {
                return {
                    ...next.value,
                    message: next.value.messages.at(-1),
                };
            }

            const latestMessage = next.value.at(-1);
            if (latestMessage) {
                yield latestMessage;
            }
        }
    }

    /**
     * Create a streaming follow-up response and emit progressive assistant-message snapshots.
     */
    async *followUpMessageStream(
        params: ResponseFollowUpRequest,
        options: ResponseStreamOptions = {},
    ): AsyncGenerator<ChatMessage, ResponseMessageStreamResult, unknown> {
        const { previousResponseId, ...request } = params;
        return yield* this.createMessageStream({
            ...request,
            previous_response_id: previousResponseId,
        }, options);
    }

    /**
     * Create a streaming response and emit projected output-message snapshots.
     */
    async *createMessagesStream(
        params: Omit<ResponseCreateRequest, 'stream'>,
        options: ResponseStreamOptions = {},
    ): AsyncGenerator<ChatMessage[], ResponseMessagesStreamResult, unknown> {
        const stream = this.createStream(params, options);
        let streamedText = '';
        let latestMessages: ChatMessage[] = [];
        let finalResult: ResponseStreamResult | undefined;
        let lastSignature: string | undefined;

        const emitSnapshot = function* (messages: ChatMessage[]): Generator<ChatMessage[]> {
            const signature = JSON.stringify(messages);
            if (signature !== lastSignature) {
                lastSignature = signature;
                yield messages;
            }
        };

        while (true) {
            const next = await stream.next();
            if (next.done) {
                finalResult = next.value;
                break;
            }

            if (next.value.type === 'response.output_text.delta' && typeof next.value.delta === 'string') {
                streamedText += next.value.delta;
                latestMessages = [{
                    role: 'assistant',
                    content: streamedText,
                }];
                yield* emitSnapshot(latestMessages);
                continue;
            }

            if (next.value.type === 'response.completed') {
                const completed = extractCompletedResponse(next.value);
                if (!completed) {
                    continue;
                }
                const normalized = normalizeResponseCreateResponse(completed);
                latestMessages = extractResponseOutputMessages(normalized);
                if (latestMessages.length === 0 && streamedText.length > 0) {
                    latestMessages = [{
                        role: 'assistant',
                        content: streamedText,
                    }];
                }
                yield* emitSnapshot(latestMessages);
            }
        }

        const finalMessages = finalResult?.response
            ? extractResponseOutputMessages(finalResult.response)
            : latestMessages;

        return {
            ...finalResult,
            messages: finalMessages.length > 0 ? finalMessages : latestMessages,
        };
    }

    /**
     * Create a streaming follow-up response and emit projected output-message snapshots.
     */
    async *followUpMessagesStream(
        params: ResponseFollowUpRequest,
        options: ResponseStreamOptions = {},
    ): AsyncGenerator<ChatMessage[], ResponseMessagesStreamResult, unknown> {
        const { previousResponseId, ...request } = params;
        return yield* this.createMessagesStream({
            ...request,
            previous_response_id: previousResponseId,
        }, options);
    }

    /**
     * Create a streaming response and project it into chat-completion chunk shape.
     * Useful for callers that want Response API semantics on the wire with chat-style streaming consumption.
     */
    async *createChatCompletionStream(
        params: Omit<ResponseCreateRequest, 'stream'>,
        options: ResponseStreamOptions = {},
    ): AsyncGenerator<ChatCompletionChunk, ResponseChatCompletionStreamResult, unknown> {
        const stream = this.createStream(params, options);
        const startedAt = Math.floor(Date.now() / 1000);
        let responseId = 'response-stream';
        let createdAt = startedAt;
        let model = params.model;
        let roleEmitted = false;
        let completion: ChatCompletionResponse | undefined;

        while (true) {
            const next = await stream.next();
            if (next.done) {
                return {
                    ...next.value,
                    completion,
                };
            }

            syncStreamMetadata(next.value);

            if (next.value.type === 'response.output_text.delta' && typeof next.value.delta === 'string') {
                if (!roleEmitted) {
                    roleEmitted = true;
                    yield buildChatCompletionChunk({
                        id: responseId,
                        created: createdAt,
                        model,
                        delta: { role: 'assistant' },
                    });
                }

                yield buildChatCompletionChunk({
                    id: responseId,
                    created: createdAt,
                    model,
                    delta: { content: next.value.delta },
                });
                continue;
            }

            if (next.value.type === 'response.completed') {
                const completed = extractCompletedResponse(next.value);
                if (!completed) {
                    continue;
                }

                const normalized = normalizeResponseCreateResponse(completed);
                responseId = normalized.id;
                createdAt = normalized.created_at ?? createdAt;
                model = normalized.model ?? model;
                completion = toChatCompletionResponse(normalized);

                if (!roleEmitted && typeof normalized.output_text === 'string' && normalized.output_text.length > 0) {
                    roleEmitted = true;
                    yield buildChatCompletionChunk({
                        id: responseId,
                        created: createdAt,
                        model,
                        delta: { role: 'assistant' },
                    });
                    yield buildChatCompletionChunk({
                        id: responseId,
                        created: createdAt,
                        model,
                        delta: { content: normalized.output_text },
                    });
                }

                yield buildChatCompletionChunk({
                    id: responseId,
                    created: createdAt,
                    model,
                    delta: {},
                    finishReason: mapResponseFinishReason(normalized.status),
                    usage: completion.usage,
                });
            }
        }

        function syncStreamMetadata(event: ResponseStreamEvent): void {
            const envelope = extractResponseEnvelope(event);
            if (!envelope) return;
            if (typeof envelope.id === 'string' && envelope.id.length > 0) {
                responseId = envelope.id;
            }
            if (typeof envelope.created_at === 'number') {
                createdAt = envelope.created_at;
            }
            if (typeof envelope.model === 'string' && envelope.model.length > 0) {
                model = envelope.model;
            }
        }
    }

    /**
     * Create a streaming follow-up response and project it into chat-completion chunk shape.
     */
    async *followUpChatCompletionStream(
        params: ResponseFollowUpRequest,
        options: ResponseStreamOptions = {},
    ): AsyncGenerator<ChatCompletionChunk, ResponseChatCompletionStreamResult, unknown> {
        const { previousResponseId, ...request } = params;
        return yield* this.createChatCompletionStream({
            ...request,
            previous_response_id: previousResponseId,
        }, options);
    }

    /**
     * Create a response and immediately project it into OpenAI-compatible chat-completion shape.
     * Useful when callers want Response API semantics on the wire but chat-style consumption.
     */
    async createChatCompletion(params: ResponseCreateRequest): Promise<ChatCompletionResponse> {
        return (await this.createChatCompletionResult(params)).completion;
    }

    /**
     * Create a follow-up response and project it into chat-completion shape.
     */
    async followUpChatCompletion(params: ResponseFollowUpRequest): Promise<ChatCompletionResponse> {
        return (await this.followUpChatCompletionResult(params)).completion;
    }

    /**
     * Create a response and return both the raw response and projected chat-completion shape.
     */
    async createChatCompletionResult(params: ResponseCreateRequest): Promise<ResponseChatCompletionResult> {
        const response = await this.create(params);
        return {
            completion: toChatCompletionResponse(response),
            response,
        };
    }

    /**
     * Create a follow-up response and return both the raw response and projected chat-completion shape.
     */
    async followUpChatCompletionResult(
        params: ResponseFollowUpRequest,
    ): Promise<ResponseChatCompletionResult> {
        const response = await this.followUp(params);
        return {
            completion: toChatCompletionResponse(response),
            response,
        };
    }

    /**
     * Create a response and parse its projected output text as JSON.
     * Defaults to `text.format.type = json_object` when no explicit format is provided.
     */
    async createJson<T = unknown>(params: ResponseCreateRequest): Promise<T> {
        return (await this.createJsonResult<T>(params)).json;
    }

    /**
     * Create a follow-up response and parse its projected output text as JSON.
     * Defaults to `text.format.type = json_object` when no explicit format is provided.
     */
    async followUpJson<T = unknown>(params: ResponseFollowUpRequest): Promise<T> {
        return (await this.followUpJsonResult<T>(params)).json;
    }

    /**
     * Create a response and return both the raw response and parsed JSON payload.
     * Defaults to `text.format.type = json_object` when no explicit format is provided.
     */
    async createJsonResult<T = unknown>(params: ResponseCreateRequest): Promise<ResponseJsonResult<T>> {
        const response = await this.create(withDefaultJsonFormat(params));
        return {
            response,
            json: parseResponseOutputJson<T>(response),
        };
    }

    /**
     * Create a follow-up response and return both the raw response and parsed JSON payload.
     * Defaults to `text.format.type = json_object` when no explicit format is provided.
     */
    async followUpJsonResult<T = unknown>(params: ResponseFollowUpRequest): Promise<ResponseJsonResult<T>> {
        const response = await this.followUp(withDefaultJsonFormat(params));
        return {
            response,
            json: parseResponseOutputJson<T>(response),
        };
    }

    /**
     * Create a streaming response and emit partial JSON snapshots.
     * Defaults to `text.format.type = json_object` when no explicit format is provided.
     */
    async *createJsonStream<T = unknown>(
        params: Omit<ResponseCreateRequest, 'stream'>,
        options: ResponseStreamOptions = {},
    ): AsyncGenerator<ResponseDeepPartial<T>, ResponseJsonStreamResult<T>, unknown> {
        const parser = new PartialJsonParser();
        const stream = this.createTextStream(withDefaultJsonFormat(params), options);
        let finalResult: ResponseStreamResult | undefined;

        while (true) {
            const next = await stream.next();
            if (next.done) {
                finalResult = next.value;
                break;
            }

            parser.append(next.value);
            const partial = parser.parsePartial<T>();
            if (partial.value !== null) {
                yield partial.value as ResponseDeepPartial<T>;
            }
        }

        const json = parseResponseOutputJson<T>({
            id: finalResult?.response?.id ?? 'response-stream',
            output: finalResult?.response?.output,
            output_text: finalResult?.response?.output_text ?? finalResult?.outputText,
        });

        return {
            ...finalResult,
            json,
        };
    }

    /**
     * Create a streaming follow-up response and emit partial JSON snapshots.
     */
    async *followUpJsonStream<T = unknown>(
        params: ResponseFollowUpRequest,
        options: ResponseStreamOptions = {},
    ): AsyncGenerator<ResponseDeepPartial<T>, ResponseJsonStreamResult<T>, unknown> {
        const { previousResponseId, ...request } = params;
        return yield* this.createJsonStream<T>({
            ...request,
            previous_response_id: previousResponseId,
        }, options);
    }

    /**
     * Create a response and directly return its projected output text.
     */
    async createText(params: ResponseCreateRequest): Promise<string | undefined> {
        return (await this.createTextResult(params)).outputText;
    }

    /**
     * Create a follow-up response and directly return its projected output text.
     */
    async followUpText(params: ResponseFollowUpRequest): Promise<string | undefined> {
        return (await this.followUpTextResult(params)).outputText;
    }

    /**
     * Create a response and return both the raw response and projected output text.
     */
    async createTextResult(params: ResponseCreateRequest): Promise<ResponseTextResult> {
        const response = await this.create(params);
        return {
            response,
            outputText: extractResponseOutputText(response),
        };
    }

    /**
     * Create a follow-up response and return both the raw response and projected output text.
     */
    async followUpTextResult(params: ResponseFollowUpRequest): Promise<ResponseTextResult> {
        const response = await this.followUp(params);
        return {
            response,
            outputText: extractResponseOutputText(response),
        };
    }

    /**
     * Create a response and directly return its primary projected output message.
     */
    async createMessage(params: ResponseCreateRequest): Promise<ChatMessage | undefined> {
        return (await this.createMessageResult(params)).message;
    }

    /**
     * Create a follow-up response and directly return its primary projected output message.
     */
    async followUpMessage(params: ResponseFollowUpRequest): Promise<ChatMessage | undefined> {
        return (await this.followUpMessageResult(params)).message;
    }

    /**
     * Create a response and return both the raw response and its primary projected output message.
     */
    async createMessageResult(params: ResponseCreateRequest): Promise<ResponseMessageResult> {
        const response = await this.create(params);
        return {
            response,
            message: extractResponseOutputMessage(response),
        };
    }

    /**
     * Create a follow-up response and return both the raw response and its primary projected output message.
     */
    async followUpMessageResult(params: ResponseFollowUpRequest): Promise<ResponseMessageResult> {
        const response = await this.followUp(params);
        return {
            response,
            message: extractResponseOutputMessage(response),
        };
    }

    /**
     * Create a response and directly return its projected output messages.
     */
    async createMessages(params: ResponseCreateRequest): Promise<ChatMessage[]> {
        return (await this.createMessagesResult(params)).messages;
    }

    /**
     * Create a follow-up response and directly return its projected output messages.
     */
    async followUpMessages(params: ResponseFollowUpRequest): Promise<ChatMessage[]> {
        return (await this.followUpMessagesResult(params)).messages;
    }

    /**
     * Create a response and return both the raw response and projected output messages.
     */
    async createMessagesResult(params: ResponseCreateRequest): Promise<ResponseMessagesResult> {
        const response = await this.create(params);
        return {
            response,
            messages: extractResponseOutputMessages(response),
        };
    }

    /**
     * Create a follow-up response and return both the raw response and projected output messages.
     */
    async followUpMessagesResult(params: ResponseFollowUpRequest): Promise<ResponseMessagesResult> {
        const response = await this.followUp(params);
        return {
            response,
            messages: extractResponseOutputMessages(response),
        };
    }

    /**
     * Create a response and directly return its projected reasoning summary text.
     */
    async createReasoningSummaryText(params: ResponseCreateRequest): Promise<string | undefined> {
        return (await this.createReasoningSummaryTextResult(params)).reasoningSummaryText;
    }

    /**
     * Create a follow-up response and directly return its projected reasoning summary text.
     */
    async followUpReasoningSummaryText(params: ResponseFollowUpRequest): Promise<string | undefined> {
        return (await this.followUpReasoningSummaryTextResult(params)).reasoningSummaryText;
    }

    /**
     * Create a response and return its projected reasoning payload.
     */
    async createReasoningResult(
        params: ResponseCreateRequest,
    ): Promise<ResponseReasoningResult> {
        const response = await this.create(params);
        return {
            response,
            reasoning: extractResponseReasoningOutput(response),
            reasoningSummaryText: extractResponseReasoningSummaryText(response),
            encryptedContent: extractResponseReasoningEncryptedContent(response),
        };
    }

    /**
     * Create a follow-up response and return its projected reasoning payload.
     */
    async followUpReasoningResult(
        params: ResponseFollowUpRequest,
    ): Promise<ResponseReasoningResult> {
        const response = await this.followUp(params);
        return {
            response,
            reasoning: extractResponseReasoningOutput(response),
            reasoningSummaryText: extractResponseReasoningSummaryText(response),
            encryptedContent: extractResponseReasoningEncryptedContent(response),
        };
    }

    /**
     * Create a response and return both the raw response and projected reasoning summary text.
     */
    async createReasoningSummaryTextResult(
        params: ResponseCreateRequest,
    ): Promise<ResponseReasoningSummaryResult> {
        const response = await this.create(params);
        return {
            response,
            reasoningSummaryText: extractResponseReasoningSummaryText(response),
        };
    }

    /**
     * Create a follow-up response and return both the raw response and projected reasoning summary text.
     */
    async followUpReasoningSummaryTextResult(
        params: ResponseFollowUpRequest,
    ): Promise<ResponseReasoningSummaryResult> {
        const response = await this.followUp(params);
        return {
            response,
            reasoningSummaryText: extractResponseReasoningSummaryText(response),
        };
    }
}

export function extractResponseOutputText(response: Pick<ResponseCreateResponse, 'output'>): string | undefined {
    const parts: string[] = [];

    for (const item of response.output ?? []) {
        for (const block of item.content ?? []) {
            if (typeof block.text === 'string') {
                parts.push(block.text);
            }
        }
    }

    return parts.length > 0 ? parts.join('') : undefined;
}

export function parseResponseOutputJson<T = unknown>(
    response: Pick<ResponseCreateResponse, 'output' | 'output_text' | 'id'>,
): T {
    const outputText = response.output_text ?? extractResponseOutputText(response);
    if (typeof outputText !== 'string' || outputText.trim().length === 0) {
        throw new Error(`Response ${response.id ?? 'unknown'} did not contain JSON output text`);
    }

    try {
        return JSON.parse(outputText) as T;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Response ${response.id ?? 'unknown'} did not contain valid JSON output text: ${message}`);
    }
}

function normalizeResponseCreateResponse(response: ResponseCreateResponse): ResponseCreateResponse {
    return {
        ...response,
        output_text: response.output_text ?? extractResponseOutputText(response),
    };
}

function withDefaultJsonFormat<T extends ResponseCreateRequest | ResponseFollowUpRequest>(params: T): T {
    if (params.text?.format) {
        return params;
    }

    return {
        ...params,
        text: {
            ...params.text,
            format: {
                type: 'json_object',
            },
        },
    };
}

export function extractResponseReasoningSummaryText(
    response: Pick<ResponseCreateResponse, 'output'>,
): string | undefined {
    const parts: string[] = [];

    for (const item of response.output ?? []) {
        for (const summary of item.summary ?? []) {
            if (typeof summary.text === 'string' && summary.text.length > 0) {
                parts.push(summary.text);
            }
        }
    }

    return parts.length > 0 ? parts.join('\n\n') : undefined;
}

export function extractResponseReasoningOutput(
    response: Pick<ResponseCreateResponse, 'output'>,
): ResponseOutput | undefined {
    const reasoningOutputs = (response.output ?? []).filter((item) => item.type === 'reasoning');
    return reasoningOutputs.at(-1);
}

export function extractResponseReasoningEncryptedContent(
    response: Pick<ResponseCreateResponse, 'output' | 'reasoning'>,
): string | undefined {
    const reasoningOutput = extractResponseReasoningOutput(response);
    if (typeof reasoningOutput?.encrypted_content === 'string' && reasoningOutput.encrypted_content.length > 0) {
        return reasoningOutput.encrypted_content;
    }
    const fallback = response.reasoning?.encrypted_content;
    return typeof fallback === 'string' && fallback.length > 0 ? fallback : undefined;
}

export function extractResponseOutputMessages(
    response: Pick<ResponseCreateResponse, 'output'>,
): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const item of response.output ?? []) {
        if (item.type !== 'message') continue;

        const normalizedContent = normalizeResponseOutputContent(item.content ?? []);
        const content = normalizedContent.every((part) => part.type === 'text')
            ? normalizedContent.map((part) => (part.type === 'text' ? part.text : '')).join('')
            : normalizedContent;

        messages.push({
            role: normalizeResponseRole(item.role),
            content,
            ...(item.thinking_blocks ? { thinking_blocks: item.thinking_blocks } : {}),
            ...(item.images ? { images: item.images } : {}),
        });
    }

    return messages;
}

export function extractResponseOutputMessage(
    response: Pick<ResponseCreateResponse, 'output'>,
): ChatMessage | undefined {
    return extractResponseOutputMessages(response).at(-1);
}

export function toChatCompletionResponse(
    response: ResponseCreateResponse,
): ChatCompletionResponse {
    const primaryMessage = extractResponseOutputMessage(response) ?? {
        role: 'assistant' as const,
        content: response.output_text ?? '',
    };

    return {
        id: response.id,
        object: 'chat.completion',
        created: response.created_at ?? 0,
        model: response.model ?? '',
        choices: [
            {
                index: 0,
                message: primaryMessage,
                finish_reason: mapResponseFinishReason(response.status),
            },
        ],
        usage: response.usage
            ? {
                prompt_tokens: response.usage.input_tokens,
                completion_tokens: response.usage.output_tokens,
                total_tokens: response.usage.total_tokens,
            }
            : undefined,
    };
}

function mapResponseFinishReason(status: string | undefined): ChatCompletionResponse['choices'][number]['finish_reason'] {
    if (status === 'completed') return 'stop';
    return null;
}

function buildChatCompletionChunk(params: {
    id: string;
    created: number;
    model: string;
    delta: ChatCompletionChunk['choices'][number]['delta'];
    finishReason?: ChatCompletionChunk['choices'][number]['finish_reason'];
    usage?: ChatCompletionChunk['usage'];
}): ChatCompletionChunk {
    return {
        id: params.id,
        object: 'chat.completion.chunk',
        created: params.created,
        model: params.model,
        choices: [
            {
                index: 0,
                delta: params.delta,
                finish_reason: params.finishReason ?? null,
            },
        ],
        usage: params.usage,
    };
}

function normalizeResponseRole(role?: string): ChatMessage['role'] {
    if (role === 'system' || role === 'user' || role === 'assistant' || role === 'tool' || role === 'function') {
        return role;
    }
    return 'assistant';
}

function normalizeResponseOutputContent(content: ResponseContentBlock[]): ContentPartWithCacheControl[] {
    const parts: ContentPartWithCacheControl[] = [];

    for (const block of content) {
        if ((block.type === 'output_text' || block.type === 'text') && typeof block.text === 'string') {
            parts.push({ type: 'text', text: block.text });
            continue;
        }
        if (block.type === 'image_url' && block.image_url) {
            parts.push({ type: 'image_url', image_url: block.image_url });
            continue;
        }
        if (block.type === 'file_url' && block.file_url) {
            parts.push({ type: 'file_url', file_url: block.file_url });
            continue;
        }
        if (block.type === 'input_audio' && block.input_audio) {
            parts.push({ type: 'input_audio', input_audio: block.input_audio });
            continue;
        }
        if (block.type === 'video_url' && block.video_url) {
            parts.push({ type: 'video_url', video_url: block.video_url });
            continue;
        }
        if (block.type === 'thinking' && typeof block.thinking === 'string') {
            parts.push({ type: 'thinking', thinking: block.thinking });
        }
    }

    return parts;
}

async function normalizeResponseRequest(params: ResponseCreateRequest): Promise<ResponseCreateRequest> {
    if (typeof params.input === 'string') {
        return params;
    }

    return {
        ...params,
        input: await Promise.all(params.input.map((message) => normalizeResponseInputMessage(message))),
    };
}

async function normalizeResponseInputMessage(message: ResponseInputLikeMessage): Promise<ResponseInputMessage> {
    if (
        'tool_calls' in message
        || 'tool_call_id' in message
        || 'name' in message
        || 'reasoning_content' in message
        || 'thinking_blocks' in message
        || 'images' in message
    ) {
        throw new Error('Response API array input only supports role/content message fields');
    }

    if (
        message.role !== 'user'
        && message.role !== 'assistant'
        && message.role !== 'system'
        && message.role !== 'developer'
    ) {
        throw new Error(`Response API array input does not support role "${message.role}"`);
    }

    return {
        role: message.role,
        content: typeof message.content === 'string'
            ? message.content
            : await normalizeContentAsync(message.content),
    };
}

function extractCompletedResponse(event: ResponseStreamEvent): ResponseCreateResponse | undefined {
    const response = extractResponseEnvelope(event);
    if (!response) {
        return undefined;
    }
    if (typeof response.id !== 'string' || typeof response.status !== 'string') {
        return undefined;
    }
    return response as unknown as ResponseCreateResponse;
}

function extractResponseEnvelope(event: ResponseStreamEvent): Record<string, unknown> | undefined {
    if (isRecord(event.response)) {
        return event.response;
    }
    if (isRecord(event.data) && isRecord(event.data.response)) {
        return event.data.response;
    }
    return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object';
}
