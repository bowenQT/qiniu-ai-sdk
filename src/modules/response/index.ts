import {
    type ChatCompletionResponse,
    IQiniuClient,
    type ChatMessage,
    type ContentPartWithCacheControl,
    type ImageObject,
    type ThinkingBlock,
} from '../../lib/types';
import { normalizeContentAsync } from '../../lib/content-converter';

const RESPONSE_API_VERSION = '2025-04-01-preview';

// ============================================================================
// Type Definitions (Response API - @experimental)
// ============================================================================

/**
 * @experimental This API is invite-only and may change without notice.
 */
export interface ResponseCreateRequest {
    model: string;
    input: string | ResponseInputMessage[];
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
        return {
            ...response,
            output_text: response.output_text ?? extractResponseOutputText(response),
        };
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
     * Create a response and immediately project it into OpenAI-compatible chat-completion shape.
     * Useful when callers want Response API semantics on the wire but chat-style consumption.
     */
    async createChatCompletion(params: ResponseCreateRequest): Promise<ChatCompletionResponse> {
        return toChatCompletionResponse(await this.create(params));
    }

    /**
     * Create a follow-up response and project it into chat-completion shape.
     */
    async followUpChatCompletion(params: ResponseFollowUpRequest): Promise<ChatCompletionResponse> {
        return toChatCompletionResponse(await this.followUp(params));
    }

    /**
     * Create a response and directly return its projected output text.
     */
    async createText(params: ResponseCreateRequest): Promise<string | undefined> {
        return extractResponseOutputText(await this.create(params));
    }

    /**
     * Create a follow-up response and directly return its projected output text.
     */
    async followUpText(params: ResponseFollowUpRequest): Promise<string | undefined> {
        return extractResponseOutputText(await this.followUp(params));
    }

    /**
     * Create a response and directly return its projected output messages.
     */
    async createMessages(params: ResponseCreateRequest): Promise<ChatMessage[]> {
        return extractResponseOutputMessages(await this.create(params));
    }

    /**
     * Create a follow-up response and directly return its projected output messages.
     */
    async followUpMessages(params: ResponseFollowUpRequest): Promise<ChatMessage[]> {
        return extractResponseOutputMessages(await this.followUp(params));
    }

    /**
     * Create a response and directly return its projected reasoning summary text.
     */
    async createReasoningSummaryText(params: ResponseCreateRequest): Promise<string | undefined> {
        return extractResponseReasoningSummaryText(await this.create(params));
    }

    /**
     * Create a follow-up response and directly return its projected reasoning summary text.
     */
    async followUpReasoningSummaryText(params: ResponseFollowUpRequest): Promise<string | undefined> {
        return extractResponseReasoningSummaryText(await this.followUp(params));
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

export function toChatCompletionResponse(
    response: ResponseCreateResponse,
): ChatCompletionResponse {
    const outputMessages = extractResponseOutputMessages(response);
    const primaryMessage = outputMessages.at(-1) ?? {
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
        input: await Promise.all(params.input.map(async (message) => ({
            ...message,
            content: await normalizeContentAsync(message.content),
        }))),
    };
}
