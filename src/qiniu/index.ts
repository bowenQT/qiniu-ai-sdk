/**
 * Qiniu provider and cloud API exports.
 * Use this entry point for provider-specific client APIs and model catalog.
 */

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

export {
    CHAT_MODELS,
    IMAGE_MODELS,
    VIDEO_MODELS,
    MODEL_CATALOG,
} from '../models';
export {
    listModels,
    getModelCapabilities,
    listModuleMaturities,
    getModuleMaturity,
} from '../lib/capability-registry';
export type {
    ChatModel,
    ImageModel as ImageModelType,
    VideoModel as VideoModelType,
    Model,
    ModelInfo,
} from '../models';
export type {
    ModuleMaturity,
    ValidationLevel,
    ModelCapabilityInfo,
    ModuleMaturityInfo,
    ListModelsOptions,
} from '../lib/capability-registry';

export { APIError } from '../lib/request';
export type { IQiniuClient } from '../lib/types';
export type { TaskHandle } from '../lib/task-handle';
export type {
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatCompletionChunk,
    ChatMessage,
    ContentPart,
    ToolCall,
    ChatDelta,
    ToolCallDelta,
    ResponseFormat,
} from '../lib/types';

export type { StreamOptions, StreamResult } from '../modules/chat';

export type {
    ImageGenerationRequest,
    ImageTaskResponse,
    ImageTaskHandle,
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
} from '../modules/image';

export type {
    VideoGenerationRequest,
    VideoTaskResponse,
    WaitOptions as VideoWaitOptions,
    VideoModel,
    FrameInput,
    KlingImageListItem,
    VideoReference,
    VideoRemixRequest,
    MultiPromptItem,
    CameraControl,
    DynamicMask,
    KlingDurationSeconds,
    VideoTaskHandle,
} from '../modules/video';

export type { WebSearchRequest, WebSearchResult } from '../modules/tools';
export type { OcrRequest, OcrResponse, OcrBlock } from '../modules/ocr';
export type { AsrRequest, AsrResponse, AudioFormat, WordTiming } from '../modules/asr';
export type { TtsRequest, TtsResponse, TtsEncoding, TtsStreamOptions, Voice } from '../modules/tts';
export type { UsageQuery, UsageResponse, UsageModelStat, UsageItem, UsageCategory, UsageValue } from '../modules/account';
export type { CreateKeysRequest, ApiKey } from '../modules/admin';

export { File as QiniuFile } from '../modules/file';
export type {
    FileCreateRequest,
    FileResponse,
    FileListResponse,
    FileListOptions,
} from '../modules/file';

export { Anthropic } from '../modules/anthropic';
export type {
    AnthropicRequest,
    AnthropicResponse,
    AnthropicMessage,
    AnthropicContentBlock,
} from '../modules/anthropic';

export {
    ResponseAPI,
    extractResponseOutputText,
    extractResponseReasoningSummaryText,
    extractResponseOutputMessages,
    toChatCompletionResponse,
} from '../modules/response';
export type {
    ResponseCreateRequest,
    ResponseCreateResponse,
    ResponseInputMessage,
    ResponseOutput,
    ResponseContentBlock,
    ResponseStreamEvent,
    ResponseStreamOptions,
    ResponseStreamResult,
} from '../modules/response';

export { Log } from '../modules/log';
export type {
    LogExportRequest,
    LogEntry,
} from '../modules/log';

export { Censor } from '../modules/censor';
export type {
    CensorScene,
    CensorSuggestion,
    ImageCensorRequest,
    ImageCensorResponse,
    VideoCensorRequest,
    VideoCensorJobResponse,
    VideoCensorStatus,
    VideoCensorResult,
    SceneResult,
} from '../modules/censor';

export {
    parseQiniuUri,
    resolveAsset,
    resolveAssets,
    AssetResolutionError,
} from '../lib/asset-resolver';
export type {
    QiniuAsset,
    ResolveOptions,
    ResolvedAsset,
} from '../lib/asset-resolver';

export { UrlCache, CachedSigner } from '../lib/signer';
export type {
    QiniuSigner,
    SignedUrl,
    SignOptions,
    UrlCacheConfig,
} from '../lib/signer';

export {
    buildVframeFop,
    buildVframeUrl,
    extractFrames,
    extractFrame,
    VframeError,
} from '../lib/vframe';
export type {
    VframeOptions,
    VideoFrame,
    VframeResult,
} from '../lib/vframe';

export {
    estimateAssetCost,
    detectAssetType,
} from '../lib/asset-cost';
export type {
    AssetType,
    AssetInfo,
    AssetCost,
    CostLevel,
    CostConfidence,
} from '../lib/asset-cost';
