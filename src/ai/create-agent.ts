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
import {
    generateTextWithGraph,
    type GenerateTextWithGraphResult,
    type StepResult,
    type Tool,
} from './generate-text';

// ============================================================================
// Types
// ============================================================================

/** Agent configuration */
export interface AgentConfig {
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
}

/** Options for run with thread (persistent conversation) */
export interface AgentRunWithThreadOptions extends AgentRunOptions {
    /** Thread ID for checkpoint (required) */
    threadId: string;
    /** Resume from checkpoint if available (default: true) */
    resumeFromCheckpoint?: boolean;
}

/** Agent instance */
export interface Agent {
    /** Run agent once (no persistence) */
    run: (options: AgentRunOptions) => Promise<GenerateTextWithGraphResult>;
    /** Run agent with thread (persistent conversation) */
    runWithThread: (options: AgentRunWithThreadOptions) => Promise<GenerateTextWithGraphResult>;
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
        tools,
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
    } = config;

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
        tools,
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
        threadId,
        onStepFinish,
        onNodeEnter,
        onNodeExit,
    });

    return {
        /**
         * Run agent once without persistence.
         */
        async run(options: AgentRunOptions): Promise<GenerateTextWithGraphResult> {
            const { prompt, onStepFinish, onNodeEnter, onNodeExit } = options;

            return generateTextWithGraph(
                buildOptions(prompt, undefined, onStepFinish, onNodeEnter, onNodeExit),
            );
        },

        /**
         * Run agent with thread-based persistence.
         * Requires checkpointer to be configured in AgentConfig.
         */
        async runWithThread(options: AgentRunWithThreadOptions): Promise<GenerateTextWithGraphResult> {
            const { prompt, threadId, resumeFromCheckpoint = true, onStepFinish, onNodeEnter, onNodeExit } = options;

            if (!checkpointer) {
                throw new Error('runWithThread requires checkpointer to be configured in createAgent');
            }

            if (!threadId) {
                throw new Error('threadId is required for runWithThread');
            }

            return generateTextWithGraph({
                ...buildOptions(prompt, threadId, onStepFinish, onNodeEnter, onNodeExit),
                checkpointer,
                resumeFromCheckpoint,
            });
        },
    };
}
