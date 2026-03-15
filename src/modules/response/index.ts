import {
    IQiniuClient,
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
