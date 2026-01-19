/**
 * AgentGraph - High-level agent execution wrapper.
 * Encapsulates predict→execute→memory loop with event bridging.
 *
 * IMPORTANT: All compaction uses estimateMessageTokens from token-estimator.ts
 */

import type { QiniuAI } from '../client';
import type { ResponseFormat } from '../lib/types';
import type { RegisteredTool } from '../lib/tool-registry';
import type { Skill } from '../modules/skills';
import { StateGraph, END } from './graph';
import { predict, type PredictResult } from './nodes/predict-node';
import { executeTools, toolResultsToMessages, type ToolExecutionResult } from './nodes/execute-node';
import { compactMessages, ContextOverflowError } from './nodes/memory-node';
import type { CompactionConfig, CompactionResult } from './nodes/types';
import { estimateMessageTokens, type TokenEstimatorConfig } from '../lib/token-estimator';
import { normalizeContent } from '../lib/content-converter';
import type { MemoryManager } from './memory';
import type {
    AgentState,
    InternalMessage,
    InjectedSkill,
    StepResult,
    AgentGraphEvents,
} from './internal-types';
import { stripMeta } from './internal-types';
import { getGlobalTracer } from '../lib/tracer';
import type { ApprovalConfig } from './tool-approval';
import { checkApprovalBatch, DeferredApprovalError } from './tool-approval';
import type { Checkpointer, PendingApproval } from './graph/checkpointer';
import { deserializeCheckpoint, resumeWithApproval } from './graph/checkpointer';

/** AgentGraph options */
export interface AgentGraphOptions {
    client: QiniuAI;
    model: string;
    tools?: Record<string, RegisteredTool>;
    skills?: Skill[];
    maxSteps?: number;
    temperature?: number;
    topP?: number;
    /** Output token limit (sent to LLM) */
    maxTokens?: number;
    /** Context token budget for compaction (default: no compaction) */
    maxContextTokens?: number;
    /** Token estimator configuration */
    tokenEstimatorConfig?: TokenEstimatorConfig;
    responseFormat?: ResponseFormat;
    toolChoice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
    abortSignal?: AbortSignal;
    events?: AgentGraphEvents;
    /** Approval configuration for tool execution */
    approvalConfig?: ApprovalConfig;
    /** Memory manager for conversation summarization and long-term storage */
    memory?: MemoryManager;
    /** Thread ID for memory isolation (used with memory option) */
    threadId?: string;
}

/** AgentGraph result */
export interface AgentGraphResult {
    text: string;
    reasoning?: string;
    steps: StepResult[];
    usage?: AgentState['usage'];
    finishReason: string | null;
    /** Compaction information */
    compaction?: {
        /** Whether compaction occurred */
        occurred: boolean;
        /** Skills dropped during compaction */
        droppedSkills: string[];
        /** Number of messages dropped */
        droppedMessages: number;
    };
    /** Final agent state (for checkpointing) */
    state: AgentState;
}

/**
 * Options for resumable agent execution.
 */
export interface ResumableOptions {
    /** Thread ID for checkpoint isolation */
    threadId: string;
    /** Checkpointer for state persistence */
    checkpointer: Checkpointer;
    /** Resume from existing checkpoint */
    resume?: boolean;
    /** 
     * Approval decision for pending_approval checkpoints.
     * Required when resume=true and checkpoint status is 'pending_approval'.
     */
    approvalDecision?: boolean;
    /** Tool executor for resuming with approval - matches ToolExecutor type from checkpointer */
    toolExecutor?: (
        toolName: string,
        args: Record<string, unknown>,
        abortSignal?: AbortSignal
    ) => Promise<unknown>;
}

/**
 * Result from resumable agent execution.
 */
export interface ResumableResult extends AgentGraphResult {
    /** Whether execution was interrupted for approval */
    interrupted: boolean;
    /** Pending approval info if interrupted */
    pendingApproval?: PendingApproval;
}

/**
 * AgentGraph class for agent execution.
 */
export class AgentGraph {
    private readonly options: AgentGraphOptions;
    private readonly graph: ReturnType<typeof this.buildGraph>;
    private steps: StepResult[] = [];
    /** Compaction tracking */
    private compactionOccurred = false;
    private droppedSkills: string[] = [];
    private droppedMessages = 0;

    constructor(options: AgentGraphOptions) {
        this.options = options;
        this.graph = this.buildGraph();
    }

    /**
     * Compact messages if needed based on maxContextTokens.
     * Uses estimateMessageTokens from token-estimator.ts for all estimation.
     */
    private compactIfNeeded(state: AgentState): AgentState {
        const { maxContextTokens, tokenEstimatorConfig } = this.options;

        // Skip if no budget specified
        if (!maxContextTokens) {
            return state;
        }

        // Build compaction config using estimateMessageTokens
        const config: CompactionConfig = {
            maxTokens: maxContextTokens,
            estimateTokens: (msgs) => {
                return msgs.reduce(
                    (sum, msg) => sum + estimateMessageTokens(msg as any, tokenEstimatorConfig),
                    0
                );
            },
        };

        // Get current skills from _meta
        const currentSkills = this.getInjectedSkillsFromMessages(state.messages);

        // Perform compaction
        const result = compactMessages(state.messages, config, currentSkills);

        // Track compaction results
        if (result.occurred) {
            this.compactionOccurred = true;
            this.droppedSkills.push(...result.droppedSkills);
            this.droppedMessages += result.droppedMessages;
        }

        return {
            ...state,
            messages: result.messages as InternalMessage[],
            skills: this.getInjectedSkillsFromMessages(result.messages as InternalMessage[]),
        };
    }

    /**
     * Get injected skills from message _meta.
     * Priority is derived from skill name ASCII order, not message order.
     */
    private getInjectedSkillsFromMessages(messages: InternalMessage[]): InjectedSkill[] {
        const skills = messages
            .map((msg, idx) => ({ msg, idx }))
            .filter(({ msg }) => msg._meta?.skillId && msg._meta?.droppable)
            .map(({ msg, idx }) => ({
                name: msg._meta!.skillId!,
                priority: msg._meta!.priority ?? 0,
                messageIndex: idx,
                tokenCount: estimateMessageTokens(msg as any, this.options.tokenEstimatorConfig),
            }));

        // Sort by name for stable priority
        return skills.sort((a, b) => a.name.localeCompare(b.name))
            .map((s, idx) => ({ ...s, priority: idx }));
    }

    /**
     * Execute the agent graph.
     */
    async invoke(messages: InternalMessage[]): Promise<AgentGraphResult> {
        const tracer = getGlobalTracer();

        return tracer.withSpan('agent_graph.invoke', async (span) => {
            span.setAttribute('model', this.options.model);
            span.setAttribute('max_steps', this.options.maxSteps ?? 10);
            span.setAttribute('message_count', messages.length);

            // Reset steps and compaction tracking
            this.steps = [];
            this.compactionOccurred = false;
            this.droppedSkills = [];
            this.droppedMessages = 0;

            // Build tools map
            const toolsMap = new Map<string, RegisteredTool>();
            if (this.options.tools) {
                for (const [name, tool] of Object.entries(this.options.tools)) {
                    toolsMap.set(name, { ...tool, name });
                }
            }

            // Initialize state
            const initialState: AgentState = {
                messages: [...messages],
                skills: [],
                tools: toolsMap,
                stepCount: 0,
                maxSteps: this.options.maxSteps ?? 10,
                done: false,
                output: '',
                reasoning: '',
                finishReason: null,
                abortSignal: this.options.abortSignal,
                approvalConfig: this.options.approvalConfig,
            };

            // Apply Memory processing if configured
            if (this.options.memory) {
                const memoryResult = await this.options.memory.process(
                    initialState.messages,
                    { threadId: this.options.threadId ?? 'default' }
                );
                initialState.messages = memoryResult.messages;
                if (memoryResult.summarized) {
                    span.setAttribute('memory_summarized', true);
                }
                if (memoryResult.droppedCount > 0) {
                    span.setAttribute('memory_dropped', memoryResult.droppedCount);
                }
            }

            // Inject skills if provided
            if (this.options.skills?.length) {
                const injected = this.injectSkills(initialState.messages, this.options.skills);
                initialState.messages = injected.messages;
                initialState.skills = injected.skills;
                span.setAttribute('skills_injected', this.options.skills.length);
            }

            // Execute graph
            const finalState = await this.graph.invoke(initialState, {
                maxSteps: this.options.maxSteps ? this.options.maxSteps * 3 : 30,
            });

            // Persist to long-term memory if configured
            if (this.options.memory) {
                await this.options.memory.persist(
                    finalState.messages,
                    this.options.threadId ?? 'default'
                );
            }

            span.setAttribute('final_step_count', finalState.stepCount);
            span.setAttribute('finish_reason', finalState.finishReason ?? 'unknown');
            if (this.compactionOccurred) {
                span.setAttribute('compaction_occurred', true);
                span.setAttribute('dropped_skills', this.droppedSkills.length);
                span.setAttribute('dropped_messages', this.droppedMessages);
            }

            return {
                text: finalState.output,
                reasoning: finalState.reasoning || undefined,
                steps: this.steps,
                usage: finalState.usage,
                finishReason: finalState.finishReason,
                compaction: this.compactionOccurred ? {
                    occurred: true,
                    droppedSkills: this.droppedSkills,
                    droppedMessages: this.droppedMessages,
                } : undefined,
                state: finalState,
            };
        });
    }

    /**
     * Execute the agent graph with interrupt/resume support.
     * 
     * This method uses an explicit loop instead of StateGraph.invoke() to:
     * 1. Pre-check all tool approvals before execution (no side effects on defer)
     * 2. Save checkpoints at safe points (after execute)
     * 3. Support resuming from pending_approval or active checkpoints
     * 
     * @example
     * ```typescript
     * // Initial execution
     * const result = await agent.invokeResumable(messages, {
     *     threadId: 'session-123',
     *     checkpointer,
     * });
     * 
     * if (result.interrupted) {
     *     // Store result.pendingApproval for user review
     *     // Later, resume with approval:
     *     const resumed = await agent.invokeResumable([], {
     *         threadId: 'session-123',
     *         checkpointer,
     *         resume: true,
     *         approvalDecision: true,
     *         toolExecutor: async (tc) => tools[tc.function.name].execute(JSON.parse(tc.function.arguments)),
     *     });
     * }
     * ```
     */
    async invokeResumable(
        messages: InternalMessage[],
        options: ResumableOptions
    ): Promise<ResumableResult> {
        const tracer = getGlobalTracer();
        const { events } = this.options;

        return tracer.withSpan('agent_graph.invoke_resumable', async (span) => {
            span.setAttribute('thread_id', options.threadId);
            span.setAttribute('resume', options.resume ?? false);

            // Reset tracking
            this.steps = [];
            this.compactionOccurred = false;
            this.droppedSkills = [];
            this.droppedMessages = 0;

            // Build tools map
            const toolsMap = new Map<string, RegisteredTool>();
            if (this.options.tools) {
                for (const [name, tool] of Object.entries(this.options.tools)) {
                    toolsMap.set(name, { ...tool, name });
                }
            }

            let state: AgentState;

            if (options.resume) {
                // Resume mode: load from checkpoint
                if (messages.length > 0) {
                    // Log warning but don't error - messages are ignored in resume mode
                    span.setAttribute('resume_messages_ignored', messages.length);
                }

                const checkpoint = await options.checkpointer.load(options.threadId);
                if (!checkpoint) {
                    throw new Error(`No checkpoint found for thread: ${options.threadId}`);
                }

                if (checkpoint.metadata.status === 'completed') {
                    throw new Error('Cannot resume completed checkpoint');
                }

                if (checkpoint.metadata.status === 'pending_approval') {
                    // Resuming pending approval
                    if (options.approvalDecision === undefined) {
                        throw new Error('approvalDecision required for pending_approval checkpoint');
                    }
                    if (options.approvalDecision && !options.toolExecutor) {
                        throw new Error('toolExecutor required when approving');
                    }

                    // Use resumeWithApproval to handle the pending tool calls
                    const resumed = await resumeWithApproval(
                        checkpoint,
                        options.approvalDecision,
                        options.toolExecutor,
                        toolsMap
                    );
                    state = resumed.state;

                    // Add resume steps to tracking
                    if (resumed.toolResults) {
                        for (const result of resumed.toolResults) {
                            this.steps.push({
                                type: 'tool_result',
                                content: result.result,
                                toolResults: [result],
                            });
                            events?.onStepFinish?.({
                                type: 'tool_result',
                                content: result.result,
                                toolResults: [result],
                            });
                        }
                    }
                } else {
                    // Crash recovery: deserialize and continue
                    state = deserializeCheckpoint(checkpoint, toolsMap);
                }

                span.setAttribute('resumed_from_status', checkpoint.metadata.status ?? 'active');
            } else {
                // Fresh execution
                state = {
                    messages: [...messages],
                    skills: [],
                    tools: toolsMap,
                    stepCount: 0,
                    maxSteps: this.options.maxSteps ?? 10,
                    done: false,
                    output: '',
                    reasoning: '',
                    finishReason: null,
                    abortSignal: this.options.abortSignal,
                    approvalConfig: this.options.approvalConfig,
                };

                // Apply Memory processing if configured
                if (this.options.memory) {
                    const memoryResult = await this.options.memory.process(
                        state.messages,
                        { threadId: options.threadId }
                    );
                    state.messages = memoryResult.messages;
                }

                // Inject skills if provided
                if (this.options.skills?.length) {
                    const injected = this.injectSkills(state.messages, this.options.skills);
                    state.messages = injected.messages;
                    state.skills = injected.skills;
                }
            }

            // Explicit execution loop (NOT using StateGraph.invoke)
            while (!state.done && state.stepCount < state.maxSteps) {
                // 1. Predict
                events?.onNodeEnter?.('predict');
                const predictResult = await this.predictNode(state);
                state = { ...state, ...predictResult };
                events?.onNodeExit?.('predict');

                if (state.done) break;

                // 2. Pre-check all tool approvals BEFORE execution
                const lastMessage = state.messages[state.messages.length - 1];
                const toolCalls = lastMessage.tool_calls;

                if (toolCalls?.length) {
                    const batchCheck = await checkApprovalBatch(
                        toolCalls,
                        state.tools,
                        stripMeta(state.messages),
                        state.approvalConfig
                    );

                    if (batchCheck.deferredTools.length > 0) {
                        // Save checkpoint with pending_approval status
                        const pendingApproval: PendingApproval = {
                            toolCalls,
                            deferredTools: batchCheck.deferredTools,
                            requestedAt: Date.now(),
                        };

                        await options.checkpointer.save(options.threadId, state, {
                            status: 'pending_approval',
                            pendingApproval,
                        });

                        span.setAttribute('interrupted', true);
                        span.setAttribute('deferred_tools', batchCheck.deferredTools.join(','));

                        return {
                            text: state.output,
                            reasoning: state.reasoning || undefined,
                            steps: this.steps,
                            usage: state.usage,
                            finishReason: null,
                            compaction: this.compactionOccurred ? {
                                occurred: true,
                                droppedSkills: this.droppedSkills,
                                droppedMessages: this.droppedMessages,
                            } : undefined,
                            state,
                            interrupted: true,
                            pendingApproval,
                        };
                    }
                }

                // 3. Execute (all approvals passed)
                events?.onNodeEnter?.('execute');
                const executeResult = await this.executeNode(state);
                state = { ...state, ...executeResult };
                events?.onNodeExit?.('execute');

                // 4. Save checkpoint at safe point (after execute)
                await options.checkpointer.save(options.threadId, state, {
                    status: 'active',
                });
            }

            // Persist memory if configured
            if (this.options.memory) {
                await this.options.memory.persist(
                    state.messages,
                    options.threadId
                );
            }

            // Mark as completed
            await options.checkpointer.save(options.threadId, state, {
                status: 'completed',
            });

            span.setAttribute('completed', true);
            span.setAttribute('final_step_count', state.stepCount);

            return {
                text: state.output,
                reasoning: state.reasoning || undefined,
                steps: this.steps,
                usage: state.usage,
                finishReason: state.finishReason,
                compaction: this.compactionOccurred ? {
                    occurred: true,
                    droppedSkills: this.droppedSkills,
                    droppedMessages: this.droppedMessages,
                } : undefined,
                state,
                interrupted: false,
            };
        });
    }

    /**
     * Build the internal state graph.
     */
    private buildGraph() {
        const graph = new StateGraph<AgentState>()
            .addNode('predict', async (state) => this.predictNode(state))
            .addNode('execute', async (state) => this.executeNode(state))
            .addConditionalEdge('predict', (state) => {
                if (state.done) return END;
                return 'execute';
            })
            .addEdge('execute', 'predict')
            .setEntryPoint('predict');

        return graph.compile();
    }

    /**
     * Predict node - calls LLM.
     */
    private async predictNode(state: AgentState): Promise<Partial<AgentState>> {
        const tracer = getGlobalTracer();
        const { events } = this.options;

        return tracer.withSpan('agent_graph.predict', async (span) => {
            span.setAttribute('step_count', state.stepCount);
            span.setAttribute('message_count', state.messages.length);

            // Notify node entry
            events?.onNodeEnter?.('predict');

            // Check step limit
            if (state.stepCount >= state.maxSteps) {
                events?.onNodeExit?.('predict');
                return { done: true };
            }

            // Compact messages before prediction (if needed)
            const compactedState = this.compactIfNeeded(state);

            // Normalize multimodal content (image -> image_url) and strip metadata
            const apiMessages = stripMeta(compactedState.messages).map(msg => ({
                ...msg,
                content: normalizeContent(msg.content),
            }));

            // Execute prediction
            const result = await predict({
                client: this.options.client,
                model: this.options.model,
                messages: apiMessages,
                tools: Array.from(state.tools.values()),
                temperature: this.options.temperature,
                topP: this.options.topP,
                maxTokens: this.options.maxTokens,
                responseFormat: this.options.responseFormat,
                toolChoice: this.options.toolChoice,
                abortSignal: state.abortSignal,
            });

            // Build step result
            const textStep: StepResult = {
                type: 'text',
                content: result.message.content as string || '',
                reasoning: result.reasoning,
                toolCalls: result.message.tool_calls,
            };
            this.steps.push(textStep);
            events?.onStepFinish?.(textStep);

            // Check if done - use hasToolCalls as primary gate
            // High fix: finishReason can be null/missing, but tool_calls presence is reliable
            const hasToolCalls = (result.message.tool_calls?.length ?? 0) > 0;
            const isDone = !hasToolCalls;

            // Update state with compacted messages
            const newMessages: InternalMessage[] = [
                ...compactedState.messages,
                { ...result.message },
            ];

            events?.onNodeExit?.('predict');

            return {
                messages: newMessages,
                skills: compactedState.skills, // Preserve updated skill list
                stepCount: state.stepCount + 1,
                output: isDone ? (result.message.content as string || state.output) : state.output,
                reasoning: (state.reasoning || '') + (result.reasoning || ''),
                finishReason: result.finishReason,
                usage: result.usage,
                done: isDone,
            };
        });
    }

    /**
     * Execute node - runs tools.
     */
    private async executeNode(state: AgentState): Promise<Partial<AgentState>> {
        const tracer = getGlobalTracer();
        const { events } = this.options;

        return tracer.withSpan('agent_graph.execute', async (span) => {
            // Notify node entry
            events?.onNodeEnter?.('execute');

            // Get last message with tool calls
            const lastMessage = state.messages[state.messages.length - 1];
            const toolCalls = lastMessage.tool_calls;

            if (!toolCalls?.length) {
                events?.onNodeExit?.('execute');
                return {};
            }

            // Create tool call steps
            for (const tc of toolCalls) {
                const callStep: StepResult = {
                    type: 'tool_call',
                    content: tc.function.arguments,
                    toolCalls: [tc],
                };
                this.steps.push(callStep);
                events?.onStepFinish?.(callStep);
            }

            // Execute tools
            const results = await executeTools(
                toolCalls,
                state.tools,
                {
                    messages: stripMeta(state.messages),
                    abortSignal: state.abortSignal,
                },
                state.approvalConfig,
            );

            // Create tool result steps and messages
            const toolMessages = toolResultsToMessages(results);

            for (const result of results) {
                const resultStep: StepResult = {
                    type: 'tool_result',
                    content: result.result,
                    toolResults: [{ toolCallId: result.toolCallId, result: result.result }],
                };
                this.steps.push(resultStep);
                events?.onStepFinish?.(resultStep);
            }

            events?.onNodeExit?.('execute');

            // Build new messages with tool results
            const newMessages = [...state.messages, ...toolMessages.map(m => m as InternalMessage)];

            // Compact after execute if needed (tool results can be large)
            const postExecuteState = this.compactIfNeeded({ ...state, messages: newMessages });

            return {
                messages: postExecuteState.messages,
                skills: postExecuteState.skills,
            };
        });
    }

    /**
     * Inject skills into messages.
     * Each skill becomes a separate system message with _meta.
     */
    private injectSkills(
        messages: InternalMessage[],
        skills: Skill[]
    ): { messages: InternalMessage[]; skills: InjectedSkill[] } {
        // Sort skills by name (ASCII order)
        const sortedSkills = [...skills].sort((a, b) => a.name.localeCompare(b.name));

        // Find insertion point (after first system message, or at start)
        let insertIndex = 0;
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role === 'system') {
                insertIndex = i + 1;
                break;
            }
        }

        // Create skill messages
        const skillMessages: InternalMessage[] = sortedSkills.map((skill, idx) => ({
            role: 'system' as const,
            content: skill.content,
            _meta: {
                skillId: skill.name,
                droppable: true,
            },
        }));

        // Build injected skill metadata
        const injectedSkills: InjectedSkill[] = sortedSkills.map((skill, idx) => ({
            name: skill.name,
            priority: idx, // Lower index = lower priority = drop first
            messageIndex: insertIndex + idx,
            tokenCount: skill.tokenCount,
        }));

        // Insert skill messages
        const newMessages = [
            ...messages.slice(0, insertIndex),
            ...skillMessages,
            ...messages.slice(insertIndex),
        ];

        return { messages: newMessages, skills: injectedSkills };
    }
}
