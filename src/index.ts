// Main client
export { QiniuAI, QiniuAIOptions, consoleLogger, noopLogger, createFilteredLogger } from './client';
export type { Logger, LogLevel } from './lib/logger';

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
