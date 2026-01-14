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

// Model catalog
export {
    CHAT_MODELS,
    IMAGE_MODELS,
    VIDEO_MODELS,
    MODEL_CATALOG,
} from './models';

export type {
    ChatModel,
    ImageModel as ImageModelType,
    VideoModel as VideoModelType,
    Model,
    ModelInfo,
} from './models';

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
export { AIError, ToolExecutionError, MaxStepsExceededError } from './lib/errors';

// Shared types
export * from './lib/types';

// Message helpers
export { appendMessages, truncateHistory } from './lib/messages';
export type { TruncateOptions } from './lib/messages';

// Native generateText
export { generateText, serializeToolResult } from './ai/generate-text';
export type {
    GenerateTextOptions,
    GenerateTextResult,
    StepResult,
    Tool,
    ToolResult,
} from './ai/generate-text';

// Module types - Chat (including new streaming types)
export type {
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatCompletionChunk,
    ChatMessage,
    ContentPart,
    ToolCall,
    ChatDelta,
    ToolCallDelta,
} from './lib/types';

// Chat streaming types
export type { StreamOptions, StreamResult } from './modules/chat';

// SSE utilities (for advanced users who want to parse streams manually)
export { parseSSEStream, createStreamAccumulator, accumulateDelta } from './lib/sse';
export type { SSEParseOptions, StreamAccumulator } from './lib/sse';

// Polling utilities (for advanced users who want to create custom pollers)
export { pollUntilComplete, createPoller } from './lib/poller';
export type { PollerOptions, PollResult } from './lib/poller';

// Module types - Image
export type {
    ImageGenerationRequest,
    ImageTaskResponse,
    ImageCreateResult,
    ImageGenerateResult,
    ImageUsage,
    SyncImageResponse,
    AsyncImageResponse,
    WaitOptions as ImageWaitOptions,
    ImageModel,
    ImageEditRequest,
    ImageEditResponse,
    ImageConfig,
    ImageReference,
} from './modules/image';

// Module types - Video
export type {
    VideoGenerationRequest,
    VideoTaskResponse,
    WaitOptions as VideoWaitOptions,
    VideoModel,
    FrameInput,
    KlingImageListItem,
    VideoReference,
    VideoRemixRequest,
} from './modules/video';

// Module types - Tools
export type { WebSearchRequest, WebSearchResult } from './modules/tools';

// Module types - OCR
export type { OcrRequest, OcrResponse, OcrBlock } from './modules/ocr';

// Module types - ASR
export type { AsrRequest, AsrResponse, AudioFormat, WordTiming } from './modules/asr';

// Module types - TTS
export type { TtsRequest, TtsResponse, TtsEncoding, TtsStreamOptions, Voice } from './modules/tts';

// Module types - Account
export type { UsageQuery, UsageResponse, UsageModelStat, UsageItem, UsageCategory, UsageValue } from './modules/account';

// Module types - Admin
export type { CreateKeysRequest, ApiKey } from './modules/admin';
