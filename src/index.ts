// Root public surface
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
export {
    AIError,
    ToolExecutionError,
    MaxStepsExceededError,
    StructuredOutputError,
    FatalToolError,
    RecoverableError,
} from './lib/errors';
export type { ValidationErrorItem } from './lib/errors';

// Parallel execution
export {
    executeParallel,
    cloneStateForBranch,
    stampMessage,
    sortMessagesByBranch,
    stripBranchMeta,
    defaultParallelReducer,
} from './ai/graph/parallel-executor';
export type {
    ParallelBranch,
    ParallelConfig,
    ParallelResult,
} from './ai/graph/parallel-executor';

// A2A (Agent-to-Agent) Protocol
export {
    AgentExpert,
    A2ARateLimiter,
    RateLimitError,
    validateSchema,
    sanitizeArgs,
    generateRequestId,
    createA2ARequest,
    createA2AResponse,
    createA2AError,
} from './ai/a2a';
export type {
    A2AMessage,
    A2AError,
    A2AErrorCode,
    AgentExpertConfig,
    RateLimitConfig,
    CallToolRequest,
    RunTaskRequest,
    RunTaskResult,
    ValidationResult,
    JsonSchema,
} from './ai/a2a';

// Guardrails
export {
    GuardrailChain,
    GuardrailBlockedError,
    inputFilter,
    outputFilter,
    tokenLimiter,
    ACTION_PRIORITY,
} from './ai/guardrails';
export type {
    Guardrail,
    GuardrailPhase,
    GuardrailAction,
    GuardrailContext,
    GuardrailResult,
    GuardrailChainResult,
    ContentFilterConfig,
    ContentCategory,
    TokenLimiterConfig,
    GuardrailTokenStore,
} from './ai/guardrails';

// Crew (Multi-Agent Orchestration)
export {
    createCrew,
    createSequentialCrew,
    createParallelCrew,
    createHierarchicalCrew,
} from './ai/crew';
export type {
    OrchestrationMode,
    CrewConfig,
    CrewKickoffOptions,
    AgentResult,
    CrewResult,
    Crew,
} from './ai/crew';

// Shared types
export * from './lib/types';
export type { LanguageModelChatAPI, LanguageModelClient } from './core/client';

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

// generateObject (structured output)
export { generateObject } from './ai/generate-object';
export type {
    GenerateObjectOptions,
    GenerateObjectResult,
    GenerateObjectMode,
} from './ai/generate-object';

// streamObject (streaming structured output)
export { streamObject } from './ai/stream-object';
export type {
    StreamObjectOptions,
    StreamObjectResult,
    DeepPartial,
} from './ai/stream-object';

// Partial JSON parser (for advanced users)
export { PartialJsonParser, parsePartialJson } from './lib/partial-json-parser';
export type { ParseResult } from './lib/partial-json-parser';

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
    MultiPromptItem,
    CameraControl,
    DynamicMask,
    KlingDurationSeconds,
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

// Module types - File (Phase 2)
export { File as QiniuFile } from './modules/file';
export type {
    FileCreateRequest,
    FileResponse,
    FileListResponse,
    FileListOptions,
} from './modules/file';

// Module types - Anthropic Protocol (Phase 3)
export { Anthropic } from './modules/anthropic';
export type {
    AnthropicRequest,
    AnthropicResponse,
    AnthropicMessage,
    AnthropicContentBlock,
} from './modules/anthropic';

// Module types - Response API (Phase 3, @experimental)
export { ResponseAPI } from './modules/response';
export type {
    ResponseCreateRequest,
    ResponseCreateResponse,
    ResponseInputMessage,
    ResponseOutput,
    ResponseContentBlock,
} from './modules/response';

// Module types - Log Export (Phase 4)
export { Log } from './modules/log';
export type {
    LogExportRequest,
    LogEntry,
} from './modules/log';

// Re-export VideoTaskHandle (Phase 4)
export type { VideoTaskHandle } from './modules/video';

// ============================================================================
// Agent SDK v7 - Skills, MCP, Graph, Checkpointer
// Preferred new imports:
// - '@bowenqt/qiniu-ai-sdk/core' for reusable runtime APIs
// - '@bowenqt/qiniu-ai-sdk/qiniu' for Qiniu client/cloud APIs
// - '@bowenqt/qiniu-ai-sdk/node' for Node-only runtime integrations
// ============================================================================

// generateTextWithGraph
export { generateTextWithGraph } from './ai/generate-text';
export type { GenerateTextWithGraphOptions, GenerateTextWithGraphResult } from './ai/generate-text';

// AgentGraph
export { AgentGraph } from './ai/agent-graph';
export type { AgentGraphOptions, AgentGraphResult, TokenEvent } from './ai/agent-graph';

// streamText
export { streamText } from './ai/stream-text';
export type { StreamTextOptions, StreamTextResult } from './ai/stream-text';

// createAgent (reusable agent wrapper)
export { createAgent } from './ai/create-agent';
export type { AgentConfig, Agent, AgentRunOptions, AgentRunWithThreadOptions, AgentStreamOptions, AgentStreamWithThreadOptions } from './ai/create-agent';

// Tool Approval (Human-in-the-Loop)
export type { ApprovalConfig, ApprovalHandler, ApprovalContext, ApprovalResult } from './ai/tool-approval';

// Internal types (for advanced users)
export type { InternalMessage, AgentState, StepResult as GraphStepResult, AgentGraphEvents, MessageMeta } from './ai/internal-types';
export { stripMeta, isDroppable, getSkillId, getSummaryId, getDroppableId } from './ai/internal-types';

// Memory Manager
export { MemoryManager, InMemoryVectorStore, isDroppable as isMessageDroppable } from './ai/memory';
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
} from './ai/memory';

// Signer (browser-compatible delegate pattern)
export { UrlCache, CachedSigner } from './lib/signer';
export type {
    QiniuSigner,
    SignedUrl,
    SignOptions,
    UrlCacheConfig,
} from './lib/signer';

// Asset Resolution (v0.20)
export {
    parseQiniuUri,
    resolveAsset,
    resolveAssets,
    AssetResolutionError,
} from './lib/asset-resolver';
export type {
    QiniuAsset,
    ResolveOptions,
    ResolvedAsset,
} from './lib/asset-resolver';

// Video Frame Extraction (v0.20)
export {
    buildVframeFop,
    buildVframeUrl,
    extractFrames,
    extractFrame,
    VframeError,
} from './lib/vframe';
export type {
    VframeOptions,
    VideoFrame,
    VframeResult,
} from './lib/vframe';

// Asset Cost Estimation (v0.20)
export {
    estimateAssetCost,
    detectAssetType,
} from './lib/asset-cost';
export type {
    AssetType,
    AssetInfo,
    AssetCost,
    CostLevel,
    CostConfidence,
} from './lib/asset-cost';

// Content Moderation (v0.21)
export { Censor } from './modules/censor';
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
} from './modules/censor';

// Native Cloud Tools (v0.21)
export {
    QINIU_TOOLS,
    getQiniuToolsArray,
    getQiniuToolSchemas,
    qiniuOcrTool,
    qiniuImageCensorTool,
    qiniuVideoCensorTool,
    qiniuVframeTool,
} from './ai-tools/qiniu-tools';
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
} from './ai-tools/qiniu-tools';

// Checkpointer (Phase 1 + Phase 3 + Phase 5)
export {
    MemoryCheckpointer,
    deserializeCheckpoint,
    // Phase 5: Async Approval
    isPendingApproval,
    getPendingApproval,
    resumeWithApproval,
} from './ai/graph';
export type {
    Checkpointer,
    Checkpoint,
    CheckpointMetadata,
    SerializedAgentState,
    // Phase 5: Async Approval
    CheckpointStatus,
    CheckpointSaveOptions,
    PendingApproval,
    ResumeWithApprovalResult,
    ToolExecutor,
} from './ai/graph';

// Tool Registry
export { ToolRegistry, ToolConflictError } from './lib/tool-registry';
export type { RegisteredTool, ToolSource, ToolSourceType, ToolParameters, ToolRegistryConfig, ConflictStrategy } from './lib/tool-registry';

// Graph (for advanced users)
export { StateGraph, END, MaxGraphStepsError } from './ai/graph';
export type { NodeFunction, EdgeResolver, CompiledGraph, InvokeOptions, StateGraphConfig } from './ai/graph';

// Memory Node
export { compactMessages, buildToolPairs, ContextOverflowError } from './ai/nodes/memory-node';
export type { CompactionResult, CompactionConfig, ToolPair, InjectedSkill } from './ai/nodes';

// Token Estimator
export {
    createTokenEstimator,
    defaultContentEstimator,
    estimateMessageTokens,
    estimateMessagesTokens,
    DEFAULT_ESTIMATOR_CONFIG,
} from './lib/token-estimator';
export type { TokenEstimatorConfig, ContentEstimator, EstimableMessage } from './lib/token-estimator';

// Tracer (Observability)
export {
    NoopTracer,
    ConsoleTracer,
    setGlobalTracer,
    getGlobalTracer,
    redactContent,
    redactAttributes,
    DEFAULT_TRACER_CONFIG,
    PRODUCTION_TRACER_CONFIG,
} from './lib/tracer';
export type { Span, Tracer, TracerConfig } from './lib/tracer';

// OTel Tracer (optional)
export { OTelTracer } from './lib/otel-tracer';

// Metrics (v0.32.0 - Structured Telemetry Export)
export {
    MetricsCollector,
    createMetricsHandler,
} from './lib/metrics';
export type {
    AgentMetrics,
    ToolCallMetric,
    TokenLimiterUsage,
    MetricsLabels,
    MetricsExportConfig,
} from './lib/metrics';

// MCP Schema Validation (v0.32.0)
export {
    validateAgainstSchema,
    createToolValidator,
    SUPPORTED_KEYWORDS,
    UNSUPPORTED_KEYWORDS,
} from './modules/mcp/schema-validator';
export type {
    JsonSchema as MCPJsonSchema,
    ValidationResult as MCPValidationResult,
    ValidationError as MCPValidationError,
} from './modules/mcp/schema-validator';
