// Basic OpenAI-compatible types for Chat Completions

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | ContentPart[];
    name?: string;
    tool_calls?: ToolCall[];
}

export interface ContentPart {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
        url: string;
        detail?: 'auto' | 'low' | 'high';
    };
}

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
