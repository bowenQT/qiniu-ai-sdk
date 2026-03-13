import type {
    ChatCompletionChunk,
    ChatCompletionRequest,
    ChatCompletionResponse,
} from '../lib/types';
import type { StreamResult } from '../modules/chat';

/**
 * Minimal chat interface required by the core agent runtime.
 * Provider-specific clients can implement this contract without exposing
 * the full QiniuAI surface area.
 */
export interface LanguageModelChatAPI {
    create(
        request: ChatCompletionRequest,
        options?: { signal?: AbortSignal }
    ): Promise<ChatCompletionResponse>;
    createStream(
        request: Omit<ChatCompletionRequest, 'stream'>,
        options?: { signal?: AbortSignal }
    ): AsyncGenerator<ChatCompletionChunk, StreamResult, unknown>;
}

/**
 * Minimal provider contract used by the reusable agent core.
 */
export interface LanguageModelClient {
    chat: LanguageModelChatAPI;
    /**
     * Optional identity hook for capability caching. QiniuAI provides baseUrl,
     * but custom providers can omit it and still work.
     */
    getBaseUrl?: () => string;
}
