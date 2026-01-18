// Basic OpenAI-compatible types for Chat Completions

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | ContentPart[];
    name?: string;
    tool_calls?: ToolCall[];
    /** Required for tool role messages to match the corresponding tool_call */
    tool_call_id?: string;
}

/** Cross-platform image source types */
export type ImageSource =
    | Uint8Array      // Cross-platform binary
    | ArrayBuffer     // Cross-platform binary
    | Blob            // Browser
    | URL             // Cross-platform URL
    | string;         // base64 or URL string

/** Image URL content part (API format) */
export interface ImageUrlContentPart {
    type: 'image_url';
    image_url: {
        url: string;
        detail?: 'auto' | 'low' | 'high';
    };
}

/** Text content part */
export interface TextContentPart {
    type: 'text';
    text: string;
}

/** Image sugar content part (SDK convenience format) */
export interface ImageContentPart {
    type: 'image';
    image: ImageSource;
    /** Optional detail level for image processing */
    detail?: 'auto' | 'low' | 'high';
}

/** Content part for multimodal messages */
export type ContentPart = TextContentPart | ImageUrlContentPart | ImageContentPart;

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

export interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    top_p?: number;
    n?: number;
    stream?: boolean;
    stop?: string | string[];
    max_tokens?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    logit_bias?: Record<string, number>;
    user?: string;
    tools?: {
        type: 'function';
        function: {
            name: string;
            description?: string;
            parameters: Record<string, any>;
        };
    }[];
    tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
    /** Controls the output format (JSON mode) */
    response_format?: ResponseFormat;
}

/** Response format configuration for structured output */
export interface ResponseFormat {
    type: 'text' | 'json_object' | 'json_schema';
    json_schema?: {
        name: string;
        description?: string;
        strict?: boolean;
        schema: Record<string, unknown>;
    };
}

export interface ChatCompletionResponse {
    id: string;
    object: 'chat.completion';
    created: number;
    model: string;
    choices: {
        index: number;
        message: ChatMessage;
        finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

// Stream chunk type with enhanced delta for Function Calling and reasoning
export interface ToolCallDelta {
    index: number;
    id?: string;
    type?: 'function';
    function?: {
        name?: string;
        arguments?: string;  // Incremental JSON fragments
    };
}

export interface ChatDelta {
    role?: 'assistant';
    content?: string;
    reasoning_content?: string;  // Gemini/Claude thinking process
    tool_calls?: ToolCallDelta[];
}

export interface ChatCompletionChunk {
    id: string;
    object: 'chat.completion.chunk';
    created: number;
    model: string;
    choices: {
        index: number;
        delta: ChatDelta;
        finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

import type { Logger } from './logger';
import type { RequestOptions } from './request';

export interface IQiniuClient {
    post<T>(endpoint: string, body: unknown, requestId?: string, options?: RequestOptions): Promise<T>;
    get<T>(endpoint: string, params?: Record<string, string>, requestId?: string, options?: RequestOptions): Promise<T>;
    postStream(endpoint: string, body: unknown, requestId?: string, options?: RequestOptions & { signal?: AbortSignal }): Promise<Response>;
    getLogger(): Logger;
    getBaseUrl(): string;
}

/** Compaction info returned in GenerateTextResult */
export interface CompactionInfo {
    /** Whether compaction occurred */
    occurred: boolean;
    /** Skills dropped during compaction */
    droppedSkills: string[];
    /** Number of messages dropped */
    droppedMessages: number;
    /** Recommendation for reducing context */
    recommendation?: string;
}

