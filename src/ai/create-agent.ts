/**
 * createAgent - Lightweight wrapper for building reusable agents.
 * Simplifies the configuration of generateTextWithGraph.
 */

import type { LanguageModelClient } from '../core/client';
import type { ResponseFormat } from '../lib/types';
import type { ChatMessage } from '../lib/types';
import type { Skill } from '../modules/skills/types';
import type { Checkpointer } from './graph/checkpointer';
import type { ApprovalConfig } from './tool-approval';
import type { MemoryManager } from './memory';
import type { Guardrail } from './guardrails';
import type { MCPHostProvider } from '../lib/mcp-host-types';
import type { RegisteredTool } from '../lib/tool-registry';
import type { SessionStore, SessionRecord } from './session-store';
import { ToolRegistry } from '../lib/tool-registry';
import { extractSessionMessages, forkSessionSaveInput } from './session-store';
import { AgentGraph, type ResumableResult } from './agent-graph';
import {
    generateTextWithGraph,
    type GenerateTextWithGraphResult,
    type StepResult,
    type Tool,
} from './generate-text';
import { streamText, type StreamTextResult } from './stream-text';

// ============================================================================
// Types
// ============================================================================

/** Agent configuration */
export interface AgentConfig {
    /** Agent ID for A2A identification (auto-generated if not provided) */
    id?: string;
    /** Language-model client */
    client: LanguageModelClient;
    /** Model to use */
    model: string;
    /** System prompt */
    system?: string;
    /** Tools available to the agent */
    tools?: Record<string, Tool>;
    /** Skills to inject */
    skills?: Skill[];
    /** Maximum steps per invocation */
    maxSteps?: number;
    /** Context token budget for compaction */
    maxContextTokens?: number;
    /** Temperature (0-2) */
    temperature?: number;
    /** Top-p sampling */
    topP?: number;
    /** Maximum output tokens */
    maxTokens?: number;
    /** Response format */
    responseFormat?: ResponseFormat;
    /** Tool choice strategy */
    toolChoice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
    /** Abort signal */
    abortSignal?: AbortSignal;
    /** Approval configuration for tool execution */
    approvalConfig?: ApprovalConfig;
    /** Checkpointer for state persistence */
    checkpointer?: Checkpointer;
    /** Memory manager for conversation summarization */
    memory?: MemoryManager;
    /** Higher-level session persistence (checkpoint + summary) */
    sessionStore?: SessionStore;
    /** Guardrails for input/output filtering */
    guardrails?: Guardrail[];
    /** MCP Host Provider (Node-only, injected via DI) */
    hostProvider?: MCPHostProvider;
    /** Skill injection configuration */
    skillInjection?: {
        /** References injection mode (default: none) */
        referenceMode?: 'none' | 'summary' | 'full';
    };
}

/** Options for single run (without thread) */
export interface AgentRunOptions {
    /** User prompt */
    prompt: string;
    /** Step finish callback */
    onStepFinish?: (step: StepResult) => void;
    /** Node enter callback */
    onNodeEnter?: (nodeName: string) => void;
    /** Node exit callback */
    onNodeExit?: (nodeName: string) => void;
    /** Abort signal for cancellation */
    abortSignal?: AbortSignal;
}

/** Options for run with thread (persistent conversation) */
export interface AgentRunWithThreadOptions extends AgentRunOptions {
    /** Thread ID for checkpoint (required) */
    threadId: string;
    /** Resume from checkpoint if available (default: true) */
    resumeFromCheckpoint?: boolean;
}

/** Options for streaming run (without thread) */
export interface AgentStreamOptions {
    /** User prompt */
    prompt: string;
    /** Step finish callback */
    onStepFinish?: (step: StepResult) => void;
    /** Node enter callback */
    onNodeEnter?: (nodeName: string) => void;
    /** Node exit callback */
    onNodeExit?: (nodeName: string) => void;
    /** Abort signal for cancellation */
    abortSignal?: AbortSignal;
}

/** Options for streaming run with thread */
export interface AgentStreamWithThreadOptions extends AgentStreamOptions {
    /** Thread ID for checkpoint (required) */
    threadId: string;
    /** Resume from checkpoint if available (default: true) */
    resumeFromCheckpoint?: boolean;
}

/** Options for resumable threaded runs with approval interruption support */
export interface AgentRunResumableWithThreadOptions extends AgentRunOptions {
    /** Thread ID for checkpoint isolation and resume */
    threadId: string;
    /** Resume from persisted thread history before appending this prompt (default: true) */
    resumeFromCheckpoint?: boolean;
}

/** Options for resuming a previously interrupted or active thread */
export interface AgentResumeThreadOptions extends AgentThreadOptions {
    /**
     * Approval decision for pending approvals.
     * Required when resuming a pending_approval thread.
     */
    approvalDecision?: boolean;
    /**
     * Optional override for tool execution during approval resume.
     * Defaults to the agent's current tool registry.
     */
    toolExecutor?: (
        toolName: string,
        args: Record<string, unknown>,
        abortSignal?: AbortSignal
    ) => Promise<unknown>;
}

/** Result from resumable agent thread execution */
export type AgentResumableThreadResult = ResumableResult;

/** Options for thread lifecycle helpers */
export interface AgentThreadOptions {
    /** Thread ID for persistence lookup/cleanup */
    threadId: string;
}

/** Options for thread forking helpers */
export interface AgentForkThreadOptions {
    /** Source thread ID to clone from */
    fromThreadId: string;
    /** Target thread ID to clone into */
    toThreadId: string;
    /** Allow overwriting an existing target thread */
    overwrite?: boolean;
}

/** Options for restoring a persisted thread record into a thread id */
export interface AgentRestoreThreadOptions {
    /** Target thread ID to restore into */
    threadId: string;
    /** Previously exported / loaded thread record */
    record: SessionRecord;
    /** Allow overwriting an existing target thread */
    overwrite?: boolean;
}

/** Options for moving persisted thread state into another thread id */
export interface AgentMoveThreadOptions {
    /** Source thread ID to move from */
    fromThreadId: string;
    /** Target thread ID to move into */
    toThreadId: string;
    /** Allow overwriting an existing target thread */
    overwrite?: boolean;
}

/** Agent instance */
export interface Agent {
    /** Agent ID for A2A identification */
    readonly id: string;
    /** Registered tools — dynamic getter (merges user + MCP tools) */
    readonly _tools: Record<string, Tool>;
    /** Run agent once (no persistence) */
    run: (options: AgentRunOptions) => Promise<GenerateTextWithGraphResult>;
    /** Run agent with thread (persistent conversation) */
    runWithThread: (options: AgentRunWithThreadOptions) => Promise<GenerateTextWithGraphResult>;
    /** Stream agent output (no persistence) */
    stream: (options: AgentStreamOptions) => Promise<StreamTextResult>;
    /** Stream agent output with thread (persistent conversation) */
    streamWithThread: (options: AgentStreamWithThreadOptions) => Promise<StreamTextResult>;
    /** Run agent with approval interruption / resume support */
    runResumableWithThread: (options: AgentRunResumableWithThreadOptions) => Promise<AgentResumableThreadResult>;
    /** Resume an interrupted or active thread */
    resumeThread: (options: AgentResumeThreadOptions) => Promise<AgentResumableThreadResult>;
    /** Load the persisted thread record, if any */
    loadThread: (options: AgentThreadOptions) => Promise<SessionRecord | null>;
    /** Replay persisted thread messages without exposing checkpoint internals */
    replayThread: (options: AgentThreadOptions) => Promise<ChatMessage[]>;
    /** Fork persisted thread state into another thread */
    forkThread: (options: AgentForkThreadOptions) => Promise<SessionRecord>;
    /** Restore a persisted thread record into a thread */
    restoreThread: (options: AgentRestoreThreadOptions) => Promise<SessionRecord>;
    /** Move persisted thread state into another thread id */
    moveThread: (options: AgentMoveThreadOptions) => Promise<SessionRecord>;
    /** Clear persisted thread state */
    clearThread: (options: AgentThreadOptions) => Promise<void>;
    /** Connect MCP host (if hostProvider configured) */
    connectHost?: () => Promise<void>;
    /** Disconnect and clean up MCP host */
    dispose?: () => Promise<void>;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Create a reusable agent with pre-configured settings.
 * 
 * @example
 * ```typescript
 * const assistant = createAgent({
 *   client,
 *   model: 'gemini-2.5-flash',
 *   system: 'You are a helpful assistant.',
 *   tools: { search: searchTool },
 *   skills: [codingSkill],
 * });
 * 
 * // Single run
 * const result = await assistant.run({ prompt: 'Hello!' });
 * 
 * // Persistent conversation
 * const result = await assistant.runWithThread({
 *   threadId: 'user-123',
 *   prompt: 'Continue our chat...',
 * });
 *
 * // Fork a persisted thread into a new branch
 * await assistant.forkThread({
 *   fromThreadId: 'user-123',
 *   toThreadId: 'user-123-branch-a',
 * });
 *
 * // Restore a previously loaded thread record into a new thread
 * const snapshot = await assistant.loadThread({ threadId: 'user-123' });
 * if (snapshot) {
 *   await assistant.restoreThread({
 *     threadId: 'user-123-restored',
 *     record: snapshot,
 *   });
 * }
 *
 * // Move a persisted thread to a new thread id
 * await assistant.moveThread({
 *   fromThreadId: 'user-123',
 *   toThreadId: 'user-123-renamed',
 * });
 * ```
 */
export function createAgent(config: AgentConfig): Agent {
    const {
        client,
        model,
        system,
        tools: userTools,
        skills,
        maxSteps,
        maxContextTokens,
        temperature,
        topP,
        maxTokens,
        responseFormat,
        toolChoice,
        abortSignal,
        approvalConfig,
        checkpointer,
        memory,
        sessionStore,
        guardrails,
        hostProvider,
    } = config;

    // Tool registry for proper priority-based conflict resolution
    const toolRegistry = new ToolRegistry();
    let hostConnected = false;
    let unsubscribeToolsChanged: (() => void) | undefined;

    /** Register MCP tools into registry */
    function syncMcpTools(mcpTools: RegisteredTool[]): void {
        // Remove existing MCP + user tools, preserving builtin meta-tools
        toolRegistry.removeBySourceType('mcp');
        toolRegistry.removeBySourceType('user');

        // Re-register MCP tools first (lower priority)
        for (const t of mcpTools) {
            toolRegistry.register(t);
        }

        // Re-register user tools (higher priority, will override MCP if conflict)
        if (userTools) {
            for (const [name, tool] of Object.entries(userTools)) {
                toolRegistry.register({
                    name,
                    description: tool.description ?? '',
                    parameters: (tool.parameters as any) ?? { type: 'object' as const, properties: {} },
                    source: tool.source ?? { type: 'user' as const, namespace: 'user:createAgent' },
                    execute: tool.execute as any,
                    requiresApproval: tool.requiresApproval,
                    approvalHandler: tool.approvalHandler as any,
                });
            }
        }
    }

    /** Get current merged tools via ToolRegistry (user > skill > mcp > builtin) */
    function currentTools(): Record<string, Tool> {
        const result: Record<string, Tool> = {};
        for (const t of toolRegistry.getAll()) {
            result[t.name] = t as unknown as Tool;
        }
        return result;
    }

    /** Get registered tools with full runtime metadata */
    function currentRegisteredTools(): Record<string, RegisteredTool> {
        const result: Record<string, RegisteredTool> = {};
        for (const t of toolRegistry.getAll()) {
            result[t.name] = t;
        }
        return result;
    }

    // Initialize with user tools
    syncMcpTools([]);

    const requirePersistentThreadSupport = (operation: string, threadId: string): void => {
        if (!checkpointer && !sessionStore) {
            throw new Error(`${operation} requires checkpointer or sessionStore to be configured in createAgent`);
        }
        if (!threadId) {
            throw new Error(`threadId is required for ${operation}`);
        }
    };

    const requireForkThreadSupport = (fromThreadId: string, toThreadId: string): void => {
        requirePersistentThreadSupport('forkThread', fromThreadId);
        if (!toThreadId) {
            throw new Error('toThreadId is required for forkThread');
        }
        if (fromThreadId === toThreadId) {
            throw new Error('forkThread requires fromThreadId and toThreadId to be different');
        }
    };

    const requireRestoreThreadSupport = (threadId: string): void => {
        requirePersistentThreadSupport('restoreThread', threadId);
    };

    const requireMoveThreadSupport = (fromThreadId: string, toThreadId: string): void => {
        requirePersistentThreadSupport('moveThread', fromThreadId);
        if (!toThreadId) {
            throw new Error('toThreadId is required for moveThread');
        }
        if (fromThreadId === toThreadId) {
            throw new Error('moveThread requires fromThreadId and toThreadId to be different');
        }
    };

    const resolveResumableCheckpointer = (operation: string): Checkpointer => {
        if (checkpointer) {
            return checkpointer;
        }
        const sessionCheckpointer = (sessionStore as unknown as { checkpointer?: Checkpointer } | undefined)?.checkpointer;
        if (sessionCheckpointer) {
            return sessionCheckpointer;
        }
        throw new Error(`${operation} requires a checkpointer or checkpointer-backed sessionStore`);
    };

    const restoreThreadRecord = async (
        targetThreadId: string,
        record: SessionRecord,
        overwrite = false,
        operation: 'forkThread' | 'restoreThread' | 'moveThread' = 'restoreThread',
    ): Promise<SessionRecord> => {
        requireRestoreThreadSupport(targetThreadId);

        if (!overwrite) {
            const existing = await loadThreadRecord(targetThreadId);
            if (existing) {
                throw new Error(`${operation} target already exists: ${targetThreadId}`);
            }
        }

        const saveInput = forkSessionSaveInput(record, targetThreadId);

        if (sessionStore) {
            return sessionStore.save(saveInput);
        }

        if (checkpointer) {
            const saved = await checkpointer.save(
                targetThreadId,
                saveInput.state as any,
                saveInput.checkpointMetadata,
            );
            const checkpoint = await checkpointer.load(targetThreadId);
            return {
                threadId: targetThreadId,
                checkpoint: checkpoint ?? {
                    metadata: saved,
                    state: saveInput.state as any,
                },
                messages: saveInput.messages,
                summary: saveInput.summary,
                updatedAt: saved.createdAt ?? Date.now(),
            };
        }

        throw new Error('restoreThread requires checkpointer or sessionStore to be configured in createAgent');
    };

    const loadThreadRecord = async (threadId: string): Promise<SessionRecord | null> => {
        const sessionRecord = sessionStore ? await sessionStore.load(threadId) : null;
        if (sessionRecord) {
            return sessionRecord;
        }

        if (!checkpointer) {
            return null;
        }

        const checkpoint = await checkpointer.load(threadId);
        if (!checkpoint) {
            return null;
        }

        return {
            threadId,
            checkpoint,
            messages: extractSessionMessages(checkpoint),
            updatedAt: checkpoint.metadata.createdAt,
        };
    };

    const restoreThreadSummary = async (threadId: string): Promise<SessionRecord | null> => {
        const loaded = sessionStore ? await sessionStore.load(threadId) : null;
        if (threadId && memory && loaded?.summary) {
            memory.setSummary(threadId, loaded.summary);
        }
        return loaded;
    };

    const buildThreadMessages = async (
        prompt: string,
        threadId: string,
        resumeFromCheckpoint = true,
        resumableCheckpointer?: Checkpointer,
    ): Promise<ChatMessage[]> => {
        const loadedSession = await restoreThreadSummary(threadId);
        if (resumeFromCheckpoint) {
            const checkpoint = loadedSession?.checkpoint
                ?? (resumableCheckpointer ? await resumableCheckpointer.load(threadId) : null);
            const historicalMessages = checkpoint
                ? extractSessionMessages(checkpoint)
                : (loadedSession?.messages ?? null);
            if (historicalMessages) {
                const hasHistoricalSystem = historicalMessages.some(message => message.role === 'system');
                const prefixMessages = (!hasHistoricalSystem && system)
                    ? [{ role: 'system' as const, content: system }]
                    : [];
                return [...prefixMessages, ...historicalMessages, { role: 'user', content: prompt }];
            }
        }

        const freshMessages: ChatMessage[] = [];
        if (system) {
            freshMessages.push({ role: 'system', content: system });
        }
        freshMessages.push({ role: 'user', content: prompt });
        return freshMessages;
    };

    const createRuntimeGraph = (
        threadId: string,
        onStepFinish?: (step: StepResult) => void,
        onNodeEnter?: (nodeName: string) => void,
        onNodeExit?: (nodeName: string) => void,
        signal?: AbortSignal,
    ): AgentGraph => new AgentGraph({
        client,
        model,
        tools: currentRegisteredTools(),
        skills,
        maxSteps,
        maxContextTokens,
        temperature,
        topP,
        maxTokens,
        responseFormat,
        toolChoice,
        abortSignal: signal ?? abortSignal,
        approvalConfig,
        memory,
        threadId,
        guardrails,
        agentId,
        skillReferenceMode: config.skillInjection?.referenceMode,
        events: {
            onStepFinish,
            onNodeEnter,
            onNodeExit,
        },
    });

    const syncResumableSessionState = async (
        threadId: string,
        result: AgentResumableThreadResult,
        resumableCheckpointer: Checkpointer,
    ): Promise<void> => {
        if (!sessionStore) {
            return;
        }

        const checkpoint = await resumableCheckpointer.load(threadId);
        await sessionStore.save({
            threadId,
            state: checkpoint?.state ?? result.state,
            checkpointMetadata: checkpoint?.metadata,
            summary: memory?.getSummary(threadId),
        });
    };

    const createDefaultToolExecutor = async (
        threadId: string,
    ): Promise<(
        toolName: string,
        args: Record<string, unknown>,
        abortSignal?: AbortSignal
    ) => Promise<unknown>> => {
        const messages = extractSessionMessages(await loadThreadRecord(threadId));
        return async (toolName, args, resumeAbortSignal) => {
            const tool = currentTools()[toolName];
            if (!tool?.execute) {
                throw new Error(`Tool '${toolName}' is not implemented.`);
            }
            return tool.execute(args, {
                toolCallId: '',
                messages,
                abortSignal: resumeAbortSignal,
            });
        };
    };

    // Helper to build common options
    const buildOptions = (
        prompt: string,
        threadId?: string,
        onStepFinish?: (step: StepResult) => void,
        onNodeEnter?: (nodeName: string) => void,
        onNodeExit?: (nodeName: string) => void,
    ) => ({
        client,
        model,
        prompt,
        system,
        tools: currentTools(),
        skills,
        maxSteps,
        maxContextTokens,
        temperature,
        topP,
        maxTokens,
        responseFormat,
        toolChoice,
        abortSignal,
        approvalConfig,
        memory,
        sessionStore,
        guardrails,
        threadId,
        onStepFinish,
        onNodeEnter,
        onNodeExit,
        skillReferenceMode: config.skillInjection?.referenceMode,
    });

    // Build options helper for streamText
    const buildStreamOptions = (
        prompt: string,
        onStepFinish?: (step: StepResult) => void,
        onNodeEnter?: (nodeName: string) => void,
        onNodeExit?: (nodeName: string) => void,
    ) => ({
        client,
        model,
        prompt,
        system,
        tools: currentTools(),
        skills,
        maxSteps,
        maxContextTokens,
        temperature,
        topP,
        maxTokens,
        responseFormat,
        toolChoice,
        approvalConfig,
        memory,
        sessionStore,
        guardrails,
        skillReferenceMode: config.skillInjection?.referenceMode,
        agentId,
        onStepFinish,
        onNodeEnter,
        onNodeExit,
    });

    // Generate agent ID
    const agentId = config.id ?? `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const agent: Agent = {
        id: agentId,

        /** Dynamic tools getter: merges user tools + MCP tools */
        get _tools(): Record<string, Tool> {
            return currentTools();
        },

        /**
         * Run agent once without persistence.
         */
        async run(options: AgentRunOptions): Promise<GenerateTextWithGraphResult> {
            const { prompt, onStepFinish, onNodeEnter, onNodeExit, abortSignal: runAbortSignal } = options;

            // Lazy connect MCP host on first run
            if (hostProvider && !hostConnected) {
                await agent.connectHost!();
            }

            return generateTextWithGraph({
                ...buildOptions(prompt, undefined, onStepFinish, onNodeEnter, onNodeExit),
                abortSignal: runAbortSignal ?? abortSignal,
                agentId,
            });
        },

        /**
         * Run agent with thread-based persistence.
         */
        async runWithThread(options: AgentRunWithThreadOptions): Promise<GenerateTextWithGraphResult> {
            const { prompt, threadId, resumeFromCheckpoint = true, onStepFinish, onNodeEnter, onNodeExit } = options;

            requirePersistentThreadSupport('runWithThread', threadId);

            // Lazy connect MCP host on first run
            if (hostProvider && !hostConnected) {
                await agent.connectHost!();
            }

            return generateTextWithGraph({
                ...buildOptions(prompt, threadId, onStepFinish, onNodeEnter, onNodeExit),
                checkpointer,
                sessionStore,
                resumeFromCheckpoint,
                agentId,
            });
        },

        /**
         * Stream agent output (no persistence).
         */
        async stream(options: AgentStreamOptions): Promise<StreamTextResult> {
            const { prompt, onStepFinish, onNodeEnter, onNodeExit, abortSignal: streamAbortSignal } = options;

            // Lazy connect MCP host on first stream
            if (hostProvider && !hostConnected) {
                await agent.connectHost!();
            }

            return streamText({
                ...buildStreamOptions(prompt, onStepFinish, onNodeEnter, onNodeExit),
                abortSignal: streamAbortSignal ?? abortSignal,
            });
        },

        /**
         * Stream agent output with thread-based persistence.
         */
        async streamWithThread(options: AgentStreamWithThreadOptions): Promise<StreamTextResult> {
            const { prompt, threadId, resumeFromCheckpoint = true, onStepFinish, onNodeEnter, onNodeExit, abortSignal: streamAbortSignal } = options;

            requirePersistentThreadSupport('streamWithThread', threadId);

            // Lazy connect MCP host on first stream
            if (hostProvider && !hostConnected) {
                await agent.connectHost!();
            }

            return streamText({
                ...buildStreamOptions(prompt, onStepFinish, onNodeEnter, onNodeExit),
                threadId,
                checkpointer,
                sessionStore,
                resumeFromCheckpoint,
                abortSignal: streamAbortSignal ?? abortSignal,
            });
        },

        async runResumableWithThread(options: AgentRunResumableWithThreadOptions): Promise<AgentResumableThreadResult> {
            const {
                prompt,
                threadId,
                resumeFromCheckpoint = true,
                onStepFinish,
                onNodeEnter,
                onNodeExit,
                abortSignal: runAbortSignal,
            } = options;

            requirePersistentThreadSupport('runResumableWithThread', threadId);
            const resumableCheckpointer = resolveResumableCheckpointer('runResumableWithThread');

            if (hostProvider && !hostConnected) {
                await agent.connectHost!();
            }

            const graph = createRuntimeGraph(
                threadId,
                onStepFinish,
                onNodeEnter,
                onNodeExit,
                runAbortSignal,
            );
            const messages = await buildThreadMessages(
                prompt,
                threadId,
                resumeFromCheckpoint,
                resumableCheckpointer,
            );
            const result = await graph.invokeResumable(messages as any, {
                threadId,
                checkpointer: resumableCheckpointer,
            });
            await syncResumableSessionState(threadId, result, resumableCheckpointer);
            return result;
        },

        async resumeThread(options: AgentResumeThreadOptions): Promise<AgentResumableThreadResult> {
            const { threadId, approvalDecision } = options;

            requirePersistentThreadSupport('resumeThread', threadId);
            const resumableCheckpointer = resolveResumableCheckpointer('resumeThread');
            await restoreThreadSummary(threadId);

            if (hostProvider && !hostConnected) {
                await agent.connectHost!();
            }

            const graph = createRuntimeGraph(threadId, undefined, undefined, undefined, abortSignal);
            const result = await graph.invokeResumable([], {
                threadId,
                checkpointer: resumableCheckpointer,
                resume: true,
                approvalDecision,
                toolExecutor: options.toolExecutor
                    ?? (approvalDecision ? await createDefaultToolExecutor(threadId) : undefined),
            });
            await syncResumableSessionState(threadId, result, resumableCheckpointer);
            return result;
        },

        async loadThread(options: AgentThreadOptions): Promise<SessionRecord | null> {
            const { threadId } = options;
            requirePersistentThreadSupport('loadThread', threadId);
            return loadThreadRecord(threadId);
        },

        async replayThread(options: AgentThreadOptions): Promise<ChatMessage[]> {
            const { threadId } = options;
            requirePersistentThreadSupport('replayThread', threadId);
            return extractSessionMessages(await loadThreadRecord(threadId));
        },

        async forkThread(options: AgentForkThreadOptions): Promise<SessionRecord> {
            const { fromThreadId, toThreadId, overwrite = false } = options;
            requireForkThreadSupport(fromThreadId, toThreadId);

            const source = await loadThreadRecord(fromThreadId);
            if (!source) {
                throw new Error(`forkThread could not find source thread: ${fromThreadId}`);
            }

            return restoreThreadRecord(toThreadId, source, overwrite, 'forkThread');
        },

        async restoreThread(options: AgentRestoreThreadOptions): Promise<SessionRecord> {
            const { threadId, record, overwrite = false } = options;
            return restoreThreadRecord(threadId, record, overwrite, 'restoreThread');
        },

        async moveThread(options: AgentMoveThreadOptions): Promise<SessionRecord> {
            const { fromThreadId, toThreadId, overwrite = false } = options;
            requireMoveThreadSupport(fromThreadId, toThreadId);

            const source = await loadThreadRecord(fromThreadId);
            if (!source) {
                throw new Error(`moveThread could not find source thread: ${fromThreadId}`);
            }

            const moved = await restoreThreadRecord(toThreadId, source, overwrite, 'moveThread');
            await agent.clearThread({ threadId: fromThreadId });
            return moved;
        },

        async clearThread(options: AgentThreadOptions): Promise<void> {
            const { threadId } = options;
            requirePersistentThreadSupport('clearThread', threadId);

            if (sessionStore) {
                await sessionStore.clear(threadId);
            }

            if (checkpointer && !sessionStore) {
                await checkpointer.clear(threadId);
            } else if (checkpointer && sessionStore) {
                const sessionCheckpointer = (sessionStore as unknown as { checkpointer?: Checkpointer }).checkpointer;
                if (sessionCheckpointer !== checkpointer) {
                    await checkpointer.clear(threadId);
                }
            }
        },

        /** Connect MCP host provider (lazy connection) */
        async connectHost() {
            if (!hostProvider || hostConnected) return;

            await hostProvider.connect();
            hostConnected = true;

            // Register initial tools via ToolRegistry
            const hostTools = hostProvider.getTools();
            syncMcpTools(hostTools);

            // Register meta-tools if host supports resources/prompts
            if (hostProvider.listResources) {
                const provider = hostProvider;
                toolRegistry.register({
                    name: 'mcp_list_resources',
                    description: 'List available MCP resources',
                    parameters: { type: 'object' as const, properties: {} },
                    source: { type: 'builtin' as const, namespace: 'builtin:mcp-meta' },
                    execute: async () => {
                        const resources = await provider.listResources!();
                        return JSON.stringify(resources);
                    },
                });
            }
            if (hostProvider.readResource) {
                const provider = hostProvider;
                toolRegistry.register({
                    name: 'mcp_read_resource',
                    description: 'Read an MCP resource by server and URI',
                    parameters: {
                        type: 'object' as const,
                        properties: {
                            server: { type: 'string', description: 'Server name' },
                            uri: { type: 'string', description: 'Resource URI' },
                        },
                        required: ['server', 'uri'],
                    },
                    source: { type: 'builtin' as const, namespace: 'builtin:mcp-meta' },
                    execute: async (args: Record<string, unknown>) => {
                        return provider.readResource!(args.server as string, args.uri as string);
                    },
                });
            }
            if (hostProvider.listPrompts) {
                const provider = hostProvider;
                toolRegistry.register({
                    name: 'mcp_list_prompts',
                    description: 'List available MCP prompts',
                    parameters: { type: 'object' as const, properties: {} },
                    source: { type: 'builtin' as const, namespace: 'builtin:mcp-meta' },
                    execute: async () => {
                        const prompts = await provider.listPrompts!();
                        return JSON.stringify(prompts);
                    },
                });
            }
            if (hostProvider.getPrompt) {
                const provider = hostProvider;
                toolRegistry.register({
                    name: 'mcp_get_prompt',
                    description: 'Get an MCP prompt by server, name, and optional arguments',
                    parameters: {
                        type: 'object' as const,
                        properties: {
                            server: { type: 'string', description: 'Server name' },
                            name: { type: 'string', description: 'Prompt name' },
                            args: { type: 'object', description: 'Prompt arguments' },
                        },
                        required: ['server', 'name'],
                    },
                    source: { type: 'builtin' as const, namespace: 'builtin:mcp-meta' },
                    execute: async (args: Record<string, unknown>) => {
                        return provider.getPrompt!(
                            args.server as string,
                            args.name as string,
                            args.args as Record<string, string> | undefined,
                        );
                    },
                });
            }

            // Subscribe to hot updates
            unsubscribeToolsChanged = hostProvider.onToolsChanged((updatedTools) => {
                syncMcpTools(updatedTools);
            });
        },

        /** Disconnect MCP host and clean up */
        async dispose() {
            unsubscribeToolsChanged?.();
            unsubscribeToolsChanged = undefined;
            hostConnected = false;
            toolRegistry.clear();
            syncMcpTools([]);
            if (hostProvider) {
                await hostProvider.dispose();
            }
        },
    };

    return agent;
}
