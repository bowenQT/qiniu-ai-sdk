/**
 * createAgent - Lightweight wrapper for building reusable agents.
 * Simplifies the configuration of generateTextWithGraph.
 */

import type { QiniuAI } from '../client';
import type { ResponseFormat } from '../lib/types';
import type { Skill } from '../modules/skills';
import type { Checkpointer } from './graph/checkpointer';
import type { ApprovalConfig } from './tool-approval';
import type { MemoryManager } from './memory';
import type { Guardrail } from './guardrails';
import type { MCPHostProvider } from '../lib/mcp-host-types';
import type { RegisteredTool } from '../lib/tool-registry';
import { ToolRegistry } from '../lib/tool-registry';
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
    /** Qiniu AI client */
    client: QiniuAI;
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

    // Initialize with user tools
    syncMcpTools([]);

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

            if (!checkpointer) {
                throw new Error('runWithThread requires checkpointer to be configured in createAgent');
            }

            if (!threadId) {
                throw new Error('threadId is required for runWithThread');
            }

            // Lazy connect MCP host on first run
            if (hostProvider && !hostConnected) {
                await agent.connectHost!();
            }

            return generateTextWithGraph({
                ...buildOptions(prompt, threadId, onStepFinish, onNodeEnter, onNodeExit),
                checkpointer,
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

            if (!checkpointer) {
                throw new Error('streamWithThread requires checkpointer to be configured in createAgent');
            }

            if (!threadId) {
                throw new Error('threadId is required for streamWithThread');
            }

            // Lazy connect MCP host on first stream
            if (hostProvider && !hostConnected) {
                await agent.connectHost!();
            }

            return streamText({
                ...buildStreamOptions(prompt, onStepFinish, onNodeEnter, onNodeExit),
                threadId,
                checkpointer,
                resumeFromCheckpoint,
                abortSignal: streamAbortSignal ?? abortSignal,
            });
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
