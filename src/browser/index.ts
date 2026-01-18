/**
 * Browser-safe exports.
 * This module explicitly lists only browser-compatible exports.
 * Node-only modules (SkillLoader, MCPClient, FileTokenStore) are excluded.
 */

// ============================================================================
// Core Client
// ============================================================================
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
} from '../client';

export type {
    QiniuAIOptions,
    Logger,
    LogLevel,
    FetchAdapter,
    Middleware,
    MiddlewareRequest,
    MiddlewareResponse,
    RequestOptions,
} from '../client';

// ============================================================================
// Model Catalog
// ============================================================================
export {
    CHAT_MODELS,
    IMAGE_MODELS,
    VIDEO_MODELS,
    MODEL_CATALOG,
} from '../models';

export type {
    ChatModel,
    ImageModel as ImageModelType,
    VideoModel as VideoModelType,
    Model,
    ModelInfo,
} from '../models';

// ============================================================================
// Error Types
// ============================================================================
export { APIError } from '../lib/request';
export { AIError, ToolExecutionError, MaxStepsExceededError, StructuredOutputError } from '../lib/errors';
export type { ValidationErrorItem } from '../lib/errors';

// ============================================================================
// Shared Types
// ============================================================================
export * from '../lib/types';

// ============================================================================
// AI Functions
// ============================================================================

// generateText
export { generateText, serializeToolResult, generateTextWithGraph } from '../ai/generate-text';
export type {
    GenerateTextOptions,
    GenerateTextResult,
    StepResult,
    Tool,
    ToolResult,
    GenerateTextWithGraphOptions,
    GenerateTextWithGraphResult,
} from '../ai/generate-text';

// generateObject
export { generateObject } from '../ai/generate-object';
export type {
    GenerateObjectOptions,
    GenerateObjectResult,
    GenerateObjectMode,
} from '../ai/generate-object';

// streamObject
export { streamObject } from '../ai/stream-object';
export type {
    StreamObjectOptions,
    StreamObjectResult,
    DeepPartial,
} from '../ai/stream-object';

// ============================================================================
// Agent SDK (Browser-compatible parts)
// ============================================================================

// AgentGraph
export { AgentGraph } from '../ai/agent-graph';
export type { AgentGraphOptions, AgentGraphResult } from '../ai/agent-graph';

// createAgent
export { createAgent } from '../ai/create-agent';
export type { AgentConfig, Agent, AgentRunOptions, AgentRunWithThreadOptions } from '../ai/create-agent';

// Tool Approval
export type { ApprovalConfig, ApprovalHandler, ApprovalContext, ApprovalResult } from '../ai/tool-approval';

// Internal types
export type { InternalMessage, AgentState, StepResult as GraphStepResult, AgentGraphEvents, MessageMeta } from '../ai/internal-types';
export { stripMeta, isDroppable, getSkillId, getSummaryId, getDroppableId } from '../ai/internal-types';

// Memory Manager
export { MemoryManager, InMemoryVectorStore, isDroppable as isMessageDroppable } from '../ai/memory';
export type {
    MemoryConfig,
    MemoryProcessOptions,
    MemoryProcessResult,
    ShortTermMemoryConfig,
    SummarizerConfig,
    LongTermMemoryConfig,
    TokenBudgetConfig,
    VectorStore,
    VectorDocument,
    InMemoryVectorStoreConfig,
} from '../ai/memory';

// Signer (browser-compatible - delegate to backend)
export { UrlCache, CachedSigner } from '../lib/signer';
export type {
    QiniuSigner,
    SignedUrl,
    SignOptions,
    UrlCacheConfig,
} from '../lib/signer';

// Asset Resolution (v0.20)
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

// Video Frame Extraction (v0.20)
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

// Asset Cost Estimation (v0.20)
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

// Content Moderation (v0.21)
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

// Native Cloud Tools (v0.21)
export {
    QINIU_TOOLS,
    getQiniuToolsArray,
    getQiniuToolSchemas,
    qiniuOcrTool,
    qiniuImageCensorTool,
    qiniuVideoCensorTool,
    qiniuVframeTool,
} from '../ai-tools/qiniu-tools';
export type {
    QiniuToolContext,
    OcrToolParams,
    OcrToolResult,
    ImageCensorToolParams,
    ImageCensorToolResult,
    VideoCensorToolParams,
    VideoCensorToolResult,
    VframeToolParams,
    VframeToolResult,
} from '../ai-tools/qiniu-tools';

// Graph (browser-compatible parts)
export {
    MemoryCheckpointer,
    deserializeCheckpoint,
    isPendingApproval,
    getPendingApproval,
    resumeWithApproval,
    StateGraph,
    END,
    MaxGraphStepsError,
} from '../ai/graph';

export type {
    Checkpointer,
    Checkpoint,
    CheckpointMetadata,
    SerializedAgentState,
    CheckpointStatus,
    CheckpointSaveOptions,
    PendingApproval,
    ResumeWithApprovalResult,
    ToolExecutor,
    NodeFunction,
    EdgeResolver,
    CompiledGraph,
    InvokeOptions,
    StateGraphConfig,
} from '../ai/graph';

// Tool Registry
export { ToolRegistry, ToolConflictError } from '../lib/tool-registry';
export type { RegisteredTool, ToolSource, ToolSourceType, ToolParameters, ToolRegistryConfig, ConflictStrategy } from '../lib/tool-registry';

// Memory Node
export { compactMessages, buildToolPairs, ContextOverflowError } from '../ai/nodes/memory-node';
export type { CompactionResult, CompactionConfig, ToolPair, InjectedSkill } from '../ai/nodes';

// Token Estimator
export {
    createTokenEstimator,
    defaultContentEstimator,
    estimateMessageTokens,
    estimateMessagesTokens,
    DEFAULT_ESTIMATOR_CONFIG,
} from '../lib/token-estimator';
export type { TokenEstimatorConfig, ContentEstimator, EstimableMessage } from '../lib/token-estimator';

// Tracer
export {
    NoopTracer,
    ConsoleTracer,
    setGlobalTracer,
    getGlobalTracer,
    redactContent,
    redactAttributes,
    DEFAULT_TRACER_CONFIG,
    PRODUCTION_TRACER_CONFIG,
} from '../lib/tracer';
export type { Span, Tracer, TracerConfig } from '../lib/tracer';

// ============================================================================
// MCP: NOT EXPORTED in browser
// ============================================================================
// The @modelcontextprotocol/sdk package is Node.js only.
// For MCP functionality, use '@bowenqt/qiniu-ai-sdk/node' instead.
//
// EXPLICITLY EXCLUDED:
// - MCPClient (requires child_process)
// - MCPHttpTransport (requires @modelcontextprotocol/sdk - Node only)
// - FileTokenStore (requires fs)
// - All MCP OAuth utilities (depend on @modelcontextprotocol/sdk)

// ============================================================================
// Utilities
// ============================================================================

// Message helpers
export { appendMessages, truncateHistory } from '../lib/messages';
export type { TruncateOptions } from '../lib/messages';

// Partial JSON parser
export { PartialJsonParser, parsePartialJson } from '../lib/partial-json-parser';
export type { ParseResult } from '../lib/partial-json-parser';

// SSE utilities
export { parseSSEStream, createStreamAccumulator, accumulateDelta } from '../lib/sse';
export type { SSEParseOptions, StreamAccumulator } from '../lib/sse';

// Polling utilities
export { pollUntilComplete, createPoller } from '../lib/poller';
export type { PollerOptions, PollResult } from '../lib/poller';

// ============================================================================
// Module Types (browser-safe)
// ============================================================================
export type { StreamOptions, StreamResult } from '../modules/chat';
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
} from '../modules/video';
export type { WebSearchRequest, WebSearchResult } from '../modules/tools';
export type { OcrRequest, OcrResponse, OcrBlock } from '../modules/ocr';
export type { AsrRequest, AsrResponse, AudioFormat, WordTiming } from '../modules/asr';
export type { TtsRequest, TtsResponse, TtsEncoding, TtsStreamOptions, Voice } from '../modules/tts';
export type { UsageQuery, UsageResponse, UsageModelStat, UsageItem, UsageCategory, UsageValue } from '../modules/account';
export type { CreateKeysRequest, ApiKey } from '../modules/admin';

// ============================================================================
// EXPLICITLY EXCLUDED (Node.js only):
// - SkillLoader (requires fs, path)
// - MCPClient (requires child_process)
// - FileTokenStore (requires fs)
// - RedisCheckpointer (requires redis client)
// - PostgresCheckpointer (requires pg client)
// - OTelTracer (requires @opentelemetry/api)
// ============================================================================
