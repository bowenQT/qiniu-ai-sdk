import {
    IQiniuClient,
    type ContentPartWithCacheControl,
    type ImageObject,
    type ThinkingBlock,
} from '../../lib/types';
import { normalizeContentAsync } from '../../lib/content-converter';

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
    temperature?: number;
    max_output_tokens?: number;
}

export interface ResponseInputMessage {
    role: 'user' | 'assistant' | 'system' | 'developer';
    content: string | ResponseInputContentPart[];
}

export type ResponseInputContentPart = ContentPartWithCacheControl;

export interface ResponseOutput {
    type: string;
    role?: string;
    content?: ResponseContentBlock[];
    thinking_blocks?: ThinkingBlock[];
    images?: ImageObject[];
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
    status: string;
    output?: ResponseOutput[];
    /**
     * Convenience projection of text blocks from `output`.
     * Mirrors the mainstream Response API ergonomics for direct text consumption.
     */
    output_text?: string;
    reasoning?: {
        effort?: string;
        encrypted_content?: string;
    };
    usage?: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
    };
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
        });

        const response = await this.client.post<ResponseCreateResponse>('/llm/v1/responses', request);
        return {
            ...response,
            output_text: extractResponseOutputText(response),
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
