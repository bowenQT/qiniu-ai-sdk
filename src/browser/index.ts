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
} from '../ai/memory';

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
// MCP (Browser-compatible HTTP transport only)
// ============================================================================
export {
    adaptMCPToolsToRegistry,
    getAllMCPToolsAsRegistered,
    MCPHttpTransport,
    MCPHttpTransportError,
    // OAuth (browser-compatible)
    PKCEFlow,
    DeviceCodeFlow,
    OAuthError,
    generateCodeVerifier,
    generateCodeChallenge,
    generateState,
    refreshAccessToken,
    // Token Store (memory only, not file)
    MemoryTokenStore,
    TokenManager,
} from '../modules/mcp';

export type {
    MCPClientConfig,
    MCPServerConfig,
    MCPHttpServerConfig,
    MCPOAuthConfig,
    MCPToolDefinition,
    MCPToolResult,
    MCPConnectionState,
    MCPTransport,
    TokenProvider,
    OAuthTokens,
    TokenStore,
} from '../modules/mcp';

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
