// Main client
export {
    QiniuAI,
    consoleLogger,
    noopLogger,
    createFilteredLogger,
    defaultFetchAdapter,
    composeMiddleware,
    retryMiddleware,
    headersMiddleware,
    timingMiddleware,
} from './client';

export type {
    QiniuAIOptions,
    Logger,
    LogLevel,
    FetchAdapter,
    Middleware,
    MiddlewareRequest,
    MiddlewareResponse,
    RequestOptions,
} from './client';

// Error types
export { APIError } from './lib/request';

// Shared types
export * from './lib/types';

// Module types - Chat
export type { ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk, ChatMessage, ContentPart, ToolCall } from './lib/types';

// Module types - Image
export type { ImageGenerationRequest, ImageTaskResponse, WaitOptions as ImageWaitOptions } from './modules/image';

// Module types - Video
export type { VideoGenerationRequest, VideoTaskResponse, WaitOptions as VideoWaitOptions } from './modules/video';

// Module types - Tools
export type { WebSearchRequest, WebSearchResult } from './modules/tools';
