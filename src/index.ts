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
export { AIError, ToolExecutionError, MaxStepsExceededError, StructuredOutputError } from './lib/errors';
export type { ValidationErrorItem } from './lib/errors';

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

// ============================================================================
// Agent SDK v7 - Skills, MCP, Graph, Checkpointer
// ============================================================================

// generateTextWithGraph
export { generateTextWithGraph } from './ai/generate-text';
export type { GenerateTextWithGraphOptions, GenerateTextWithGraphResult } from './ai/generate-text';

// AgentGraph
export { AgentGraph } from './ai/agent-graph';
export type { AgentGraphOptions, AgentGraphResult } from './ai/agent-graph';

// createAgent (reusable agent wrapper)
export { createAgent } from './ai/create-agent';
export type { AgentConfig, Agent, AgentRunOptions, AgentRunWithThreadOptions } from './ai/create-agent';

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
    VectorStore,
    VectorDocument,
} from './ai/memory';

// Skills
export { SkillLoader } from './modules/skills';
export type { Skill } from './modules/skills';

// MCP (Phase 1 + Phase 3)
export {
    MCPClient,
    MCPClientError,
    adaptMCPToolsToRegistry,
    getAllMCPToolsAsRegistered,
    // Phase 3: HTTP Transport
    MCPHttpTransport,
    MCPHttpTransportError,
    // Phase 3: OAuth
    PKCEFlow,
    DeviceCodeFlow,
    OAuthError,
    generateCodeVerifier,
    generateCodeChallenge,
    generateState,
    refreshAccessToken,
    // Phase 3: Token Store
    MemoryTokenStore,
    FileTokenStore,
    TokenManager,
} from './modules/mcp';
export type {
    MCPClientConfig,
    MCPServerConfig,
    MCPStdioServerConfig,
    MCPHttpServerConfig,
    MCPOAuthConfig,
    MCPToolDefinition,
    MCPToolResult,
    MCPConnectionState,
    MCPTransport,
    TokenProvider,
    OAuthTokens,
    TokenStore,
    FileTokenStoreConfig,
} from './modules/mcp';

// Checkpointer (Phase 1 + Phase 3 + Phase 5)
export {
    MemoryCheckpointer,
    deserializeCheckpoint,
    // Phase 3: Redis + Postgres
    RedisCheckpointer,
    PostgresCheckpointer,
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
    RedisClient,
    RedisCheckpointerConfig,
    PostgresClient,
    PostgresCheckpointerConfig,
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
