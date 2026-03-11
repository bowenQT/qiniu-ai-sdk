import { IQiniuClient } from '../../lib/types';

// ============================================================================
// Type Definitions (Anthropic Protocol)
// ============================================================================

export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string | AnthropicContentBlock[];
}

export interface AnthropicContentBlock {
    type: 'text' | 'image' | 'tool_use' | 'tool_result';
    text?: string;
    source?: {
        type: 'base64';
        media_type: string;
        data: string;
    };
    id?: string;
    name?: string;
    input?: unknown;
    tool_use_id?: string;
    content?: string;
}

export interface AnthropicRequest {
    model: string;
    messages: AnthropicMessage[];
    max_tokens: number;
    system?: string;
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

        logger.debug('Anthropic message create', {
            model: params.model,
            endpoint: '/messages',
            maxTokens: params.max_tokens,
        });

        return this.client.post<AnthropicResponse>('/messages', params);
    }
}
