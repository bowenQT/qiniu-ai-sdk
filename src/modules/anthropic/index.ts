import {
    IQiniuClient,
    type CacheControl,
    type ContentPartWithCacheControl,
    type ImageContentPart,
} from '../../lib/types';
import { imageSourceToDataUrlAsync } from '../../lib/content-converter';

// ============================================================================
// Type Definitions (Anthropic Protocol)
// ============================================================================

export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string | AnthropicContentBlock[];
}

export interface AnthropicToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: unknown;
    cache_control?: CacheControl;
}

export interface AnthropicToolResultBlock {
    type: 'tool_result';
    tool_use_id: string;
    content: string | AnthropicToolResultContentBlock[];
    cache_control?: CacheControl;
}

export interface AnthropicImageBlock {
    type: 'image';
    source: {
        type: 'base64';
        media_type: string;
        data: string;
    };
    cache_control?: CacheControl;
}

export type AnthropicToolResultContentBlock =
    | ContentPartWithCacheControl
    | AnthropicImageBlock;

export type AnthropicContentBlock =
    | ContentPartWithCacheControl
    | AnthropicImageBlock
    | AnthropicToolUseBlock
    | AnthropicToolResultBlock;

export interface AnthropicSystemBlock {
    type: 'text';
    text: string;
    cache_control?: CacheControl;
}

export interface AnthropicRequest {
    model: string;
    messages: AnthropicMessage[];
    max_tokens: number;
    system?: string | AnthropicSystemBlock[];
    temperature?: number;
    top_p?: number;
    top_k?: number;
    stop_sequences?: string[];
    /** Tool definitions for function calling */
    tools?: AnthropicToolDefinition[];
    /** Tool choice constraint */
    tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
}

export interface AnthropicToolDefinition {
    name: string;
    description?: string;
    input_schema: Record<string, unknown>;
}

export interface AnthropicResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    content: AnthropicContentBlock[];
    model: string;
    stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
    stop_sequence?: string | null;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}

// ============================================================================
// Anthropic Class
// ============================================================================

export class Anthropic {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Create an Anthropic-style message via /v1/messages endpoint.
     * This uses a different request/response format than the OpenAI-compatible chat API.
     */
    async create(params: AnthropicRequest): Promise<AnthropicResponse> {
        const logger = this.client.getLogger();
        const request = await normalizeAnthropicRequest(params);

        logger.debug('Anthropic message create', {
            model: request.model,
            endpoint: '/messages',
            maxTokens: request.max_tokens,
        });

        return this.client.post<AnthropicResponse>('/messages', request);
    }
}

async function normalizeAnthropicRequest(params: AnthropicRequest): Promise<AnthropicRequest> {
    return {
        ...params,
        messages: await Promise.all(params.messages.map(async (message) => ({
            ...message,
            content: typeof message.content === 'string'
                ? message.content
                : await Promise.all(message.content.map((block) => normalizeAnthropicContentBlock(block))),
        }))),
    };
}

async function normalizeAnthropicContentBlock(
    block: AnthropicContentBlock,
): Promise<AnthropicContentBlock> {
    if (isAnthropicImageBlock(block) || isAnthropicToolUseBlock(block)) {
        return block;
    }

    if (isImageSugarBlock(block)) {
        return convertImageSugarToAnthropicBlock(block);
    }

    if (isAnthropicToolResultBlock(block) && typeof block.content !== 'string') {
        return {
            ...block,
            content: await Promise.all(block.content.map((part) => (
                isImageSugarBlock(part) ? convertImageSugarToAnthropicBlock(part) : part
            ))),
        };
    }

    return block;
}

function isAnthropicImageBlock(block: AnthropicContentBlock): block is AnthropicImageBlock {
    return block.type === 'image' && 'source' in block;
}

function isAnthropicToolUseBlock(block: AnthropicContentBlock): block is AnthropicToolUseBlock {
    return block.type === 'tool_use';
}

function isAnthropicToolResultBlock(block: AnthropicContentBlock): block is AnthropicToolResultBlock {
    return block.type === 'tool_result';
}

function isImageSugarBlock(
    block: AnthropicContentBlock | AnthropicToolResultContentBlock,
): block is ImageContentPart & { cache_control?: CacheControl } {
    return block.type === 'image' && 'image' in block;
}

async function convertImageSugarToAnthropicBlock(
    block: ImageContentPart & { cache_control?: CacheControl },
): Promise<AnthropicImageBlock> {
    const dataUrl = await imageSourceToDataUrlAsync(block.image);
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);

    if (!match) {
        throw new Error(
            'Anthropic image inputs require base64/data URL or binary image sources; remote image URLs are not supported.',
        );
    }

    return {
        type: 'image',
        source: {
            type: 'base64',
            media_type: match[1],
            data: match[2],
        },
        cache_control: block.cache_control,
    };
}
