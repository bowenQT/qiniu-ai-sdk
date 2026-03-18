/**
 * Core runtime exports.
 * Provider-agnostic agent orchestration lives here.
 */

export type { LanguageModelChatAPI, LanguageModelClient } from './client';

// Eval gate scaffold
export { compareEvalGateResults, summarizeEvalGateStatus } from '../lib/eval-gate';
export type {
    EvalBenchmarkCase,
    EvalBenchmarkSuite,
    EvalCaseReport,
    EvalCaseResult,
    EvalGateCheck,
    EvalGateMetricSummary,
    EvalGateResult,
    EvalGateStatus,
    EvalGraderResult,
    EvalRunArtifactRef,
    EvalRunReport,
} from '../lib/eval-gate';

// Control plane contracts
export {
    CONTROL_PLANE_ARTIFACT_KINDS,
    CONTROL_PLANE_ARTIFACT_LABELS,
    createRevisionRef,
    isArtifactLabel,
    isControlPlaneArtifactKind,
    normalizeArtifactLabels,
} from '../ai/control-plane';
export type {
    ArtifactLabel,
    ArtifactRevision,
    BenchmarkCase,
    BenchmarkDataset,
    CandidateBudgetProfile,
    CandidateStore,
    CandidateVersion,
    ControlPlaneArtifactKind,
    GateMetricSummary,
    GateResult,
    GraderResult,
    GraderStatus,
    PriceLookupInput,
    PricePolicy,
    PriceQuote,
    PromotionDecision,
    PromotionDecisionStatus,
    RevisionRef,
    RevisionStore,
    RunTrace,
    TraceCost,
    TraceStep,
    TraceStepType,
    TraceStore,
    TraceToolCall,
    TraceUsage,
    ToolTraceSource,
} from '../ai/control-plane';

// Error types
export {
    AIError,
    ToolExecutionError,
    MaxStepsExceededError,
    StructuredOutputError,
    FatalToolError,
    RecoverableError,
} from '../lib/errors';
export type { ValidationErrorItem } from '../lib/errors';

// Parallel execution
export {
    executeParallel,
    cloneStateForBranch,
    stampMessage,
    sortMessagesByBranch,
    stripBranchMeta,
    defaultParallelReducer,
} from '../ai/graph/parallel-executor';
export type {
    ParallelBranch,
    ParallelConfig,
    ParallelResult,
} from '../ai/graph/parallel-executor';

// A2A
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
} from '../ai/a2a';
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
} from '../ai/a2a';

// Guardrails (browser-safe subset)
export {
    GuardrailChain,
    GuardrailBlockedError,
} from '../ai/guardrails/chain';
export {
    inputFilter,
} from '../ai/guardrails/input-filter';
export {
    outputFilter,
} from '../ai/guardrails/output-filter';
export {
    toolFilter,
} from '../ai/guardrails/tool-filter';
export {
    tokenLimiter,
} from '../ai/guardrails/token-limiter';
export {
    ACTION_PRIORITY,
} from '../ai/guardrails/types';
export type {
    Guardrail,
    CanonicalGuardrailPhase,
    GuardrailPhase,
    GuardrailAction,
    GuardrailContext,
    GuardrailResult,
    GuardrailChainResult,
    ContentFilterConfig,
    ContentCategory,
    TokenLimiterConfig,
    GuardrailTokenStore,
} from '../ai/guardrails/types';

// Crew
export {
    createCrew,
    createSequentialCrew,
    createParallelCrew,
    createHierarchicalCrew,
} from '../ai/crew';
export type {
    OrchestrationMode,
    CrewConfig,
    CrewKickoffOptions,
    AgentResult,
    CrewResult,
    Crew,
} from '../ai/crew';

// Shared message types
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

// Message helpers
export { appendMessages, truncateHistory } from '../lib/messages';
export type { TruncateOptions } from '../lib/messages';

// generateText
export { generateText, generateTextWithGraph, serializeToolResult } from '../ai/generate-text';
export type {
    GenerateTextOptions,
    GenerateTextResult,
    GenerateTextWithGraphOptions,
    GenerateTextWithGraphResult,
    StepResult,
    Tool,
    ToolResult,
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

// Partial JSON parser
export { PartialJsonParser, parsePartialJson } from '../lib/partial-json-parser';
export type { ParseResult } from '../lib/partial-json-parser';

// Agent runtime
export { AgentGraph } from '../ai/agent-graph';
export type { AgentGraphOptions, AgentGraphResult, TokenEvent } from '../ai/agent-graph';

export { streamText } from '../ai/stream-text';
export type { StreamTextOptions, StreamTextResult } from '../ai/stream-text';

export { createAgent } from '../ai/create-agent';
export type {
    AgentConfig,
    Agent,
    AgentRunOptions,
    AgentRunWithThreadOptions,
    AgentRunResumableWithThreadOptions,
    AgentStreamOptions,
    AgentStreamWithThreadOptions,
    AgentResumeThreadOptions,
    AgentResumableThreadResult,
    AgentForkThreadOptions,
    AgentRestoreThreadOptions,
    AgentMoveThreadOptions,
    AgentThreadOptions,
} from '../ai/create-agent';

export type {
    ApprovalConfig,
    ApprovalHandler,
    ApprovalContext,
    ApprovalResult,
} from '../ai/tool-approval';

export type {
    InternalMessage,
    AgentState,
    StepResult as GraphStepResult,
    AgentGraphEvents,
    MessageMeta,
} from '../ai/internal-types';
export {
    stripMeta,
    isDroppable,
    getSkillId,
    getSummaryId,
    getDroppableId,
} from '../ai/internal-types';

// Skills (core type-only surface)
export type { Skill } from '../modules/skills/types';

// Memory
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
export {
    MemorySessionStore,
    CheckpointerSessionStore,
    buildSessionRecord,
    extractSessionMessages,
    replaySession,
} from '../ai/session-store';
export type {
    SessionStore,
    SessionRecord,
    SessionSaveInput,
    SessionRecordSource,
    SessionRestoreMode,
} from '../ai/session-store';

// Checkpointer and graph runtime
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

// Tool registry
export { ToolRegistry, ToolConflictError } from '../lib/tool-registry';
export type {
    RegisteredTool,
    ToolSource,
    ToolSourceType,
    ToolParameters,
    ToolRegistryConfig,
    ConflictStrategy,
} from '../lib/tool-registry';

// Memory node
export { compactMessages, buildToolPairs, ContextOverflowError } from '../ai/nodes/memory-node';
export type { CompactionResult, CompactionConfig, ToolPair, InjectedSkill } from '../ai/nodes';

// Token estimator
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

// Metrics
export {
    MetricsCollector,
    createMetricsHandler,
} from '../lib/metrics';
export type {
    AgentMetrics,
    ToolCallMetric,
    TokenLimiterUsage,
    MetricsLabels,
    MetricsExportConfig,
} from '../lib/metrics';
