// Basic OpenAI-compatible types for Chat Completions

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool' | 'function';
    content: string | ContentPartWithCacheControl[];
    name?: string;
    tool_calls?: ToolCall[];
    /** Required for tool role messages to match the corresponding tool_call */
    tool_call_id?: string;
    /** Reasoning/thinking content from models like Gemini, DeepSeek */
    reasoning_content?: string;
    /** Thinking blocks from Claude models */
    thinking_blocks?: ThinkingBlock[];
    /** Image objects in response */
    images?: ImageObject[];
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

/** Video URL content part */
export interface VideoUrlContentPart {
    type: 'video_url';
    video_url: { url: string };
}

/** File content part (file_id reference) */
export interface FileContentPart {
    type: 'file';
    file: {
        file_data?: string;
        file_id?: string;
        format?: string;
    };
}

/** Audio input content part */
export interface InputAudioContentPart {
    type: 'input_audio';
    input_audio: {
        data: string;
        format: 'wav' | 'mp3' | 'ogg' | 'pcm';
    };
}

/** File URL content part (docx/xlsx/pptx/pdf) */
export interface FileUrlContentPart {
    type: 'file_url';
    file_url: {
        url: string;
        detail?: string;
    };
}

/** Thinking content part (Claude) */
export interface ThinkingContentPart {
    type: 'thinking';
    thinking: string;
    signature?: string;
}

/** Video content part (URL list) */
export interface VideoContentPart {
    type: 'video';
    video: string[];
}

/** Cache control content part */
export interface CacheControl {
    type: string;
    ttl?: string;
}

/** Cache control content part */
export interface CacheControlContentPart {
    type: string;
    cache_control: CacheControl;
}

/** Thinking block object (Claude response) */
export interface ThinkingBlock {
    type: string;
    thinking: string;
    signature?: string;
}

/** Image object in response messages */
export interface ImageObject {
    type?: string;
    image_url?: {
        url: string;
        checksum?: string;
    };
    index?: number;
}

/** Content part for multimodal messages */
export type ContentPart =
    | TextContentPart
    | ImageUrlContentPart
    | ImageContentPart
    | VideoUrlContentPart
    | FileContentPart
    | InputAudioContentPart
    | FileUrlContentPart
    | ThinkingContentPart
    | VideoContentPart;

/** Content parts that may carry provider-specific cache directives */
export type ContentPartWithCacheControl =
    | (TextContentPart & { cache_control?: CacheControl })
    | (ImageUrlContentPart & { cache_control?: CacheControl })
    | (ImageContentPart & { cache_control?: CacheControl })
    | (VideoUrlContentPart & { cache_control?: CacheControl })
    | (FileContentPart & { cache_control?: CacheControl })
    | (InputAudioContentPart & { cache_control?: CacheControl })
    | (FileUrlContentPart & { cache_control?: CacheControl })
    | (ThinkingContentPart & { cache_control?: CacheControl })
    | (VideoContentPart & { cache_control?: CacheControl });

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

/** Thinking mode configuration */
export interface ThinkType {
    type: 'disabled' | 'enabled' | 'auto';
    budget_tokens?: number;
}

/** Reasoning configuration (OpenAI/DeepSeek) */
export interface ReasoningType {
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
    exclude?: boolean;
    /** Enable DeepSeek v3.1 thinking mode */
    enabled?: boolean;
}

/** Image configuration for Gemini image generation */
export interface ChatImageConfig {
    aspect_ratio?: string;
    image_size?: string;
}

/** Safety setting for Gemini models */
export interface SafetySetting {
    category: string;
    threshold: 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE';
}

/** Chat template kwargs (Tencent models) */
export interface ChatTemplateKwargs {
    thinking?: boolean;
    enable_thinking?: boolean;
    thinking_budget?: number;
}

export interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    top_p?: number;
    top_k?: number;
    n?: number;
    stream?: boolean;
    stop?: string | string[];
    max_tokens?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
    repetition_penalty?: number;
    logit_bias?: Record<string, number>;
    user?: string;
    tools?: {
        type: 'function';
        function: {
            name: string;
            description?: string;
            url?: string;
            parameters: Record<string, any>;
        };
    }[];
    tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
    /** Controls the output format (JSON mode) */
    response_format?: ResponseFormat;
    /** Request type */
    type?: string;
    /** Enable thinking mode */
    enable_thinking?: boolean;
    /** Thinking configuration */
    thinking?: ThinkType;
    /** Reasoning configuration (OpenAI/DeepSeek) */
    reasoning?: ReasoningType;
    /** Reasoning effort level */
    reasoning_effort?: 'low' | 'medium' | 'high' | 'minimal' | 'none';
    /** Supported modality types */
    modalities?: string[];
    /** Image config for Gemini image generation */
    image_config?: ChatImageConfig;
    /** Safety settings for Gemini models */
    safety_settings?: SafetySetting[];
    /** Chat template kwargs (Tencent) */
    chat_template_kwargs?: ChatTemplateKwargs;
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
import type { ChildTransport } from './child-transport';

export interface IQiniuClient {
    post<T>(endpoint: string, body: unknown, requestId?: string, options?: RequestOptions): Promise<T>;
    get<T>(endpoint: string, params?: Record<string, string>, requestId?: string, options?: RequestOptions): Promise<T>;
    delete<T>(endpoint: string, requestId?: string, options?: RequestOptions): Promise<T>;
    postStream(endpoint: string, body: unknown, requestId?: string, options?: RequestOptions & { signal?: AbortSignal }): Promise<Response>;
    /** GET using absolute URL (skips baseUrl prepend) */
    getAbsolute<T>(absoluteUrl: string, params?: Record<string, string>, requestId?: string, options?: RequestOptions): Promise<T>;
    /** POST using absolute URL (skips baseUrl prepend) */
    postAbsolute<T>(absoluteUrl: string, body: unknown, requestId?: string, options?: RequestOptions): Promise<T>;
    /** Create a child transport with a different baseUrl and auth headers */
    createChildTransport(baseUrl: string, extraHeaders?: Record<string, string>): ChildTransport;
    getLogger(): Logger;
    getBaseUrl(): string;
    getApiKey(): string;
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
