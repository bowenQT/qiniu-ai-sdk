/**
 * AgentGraph - High-level agent execution wrapper.
 * Encapsulates predict→execute→memory loop with event bridging.
 */

import type { QiniuAI } from '../client';
import type { ResponseFormat } from '../lib/types';
import type { RegisteredTool } from '../lib/tool-registry';
import type { Skill } from '../modules/skills';
import { StateGraph, END } from './graph';
import { predict, type PredictResult } from './nodes/predict-node';
import { executeTools, toolResultsToMessages, type ToolExecutionResult } from './nodes/execute-node';
import type {
    AgentState,
    InternalMessage,
    InjectedSkill,
    StepResult,
    AgentGraphEvents,
} from './internal-types';
import { stripMeta } from './internal-types';

/** AgentGraph options */
export interface AgentGraphOptions {
    client: QiniuAI;
    model: string;
    tools?: Record<string, RegisteredTool>;
    skills?: Skill[];
    maxSteps?: number;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    responseFormat?: ResponseFormat;
    toolChoice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
    abortSignal?: AbortSignal;
    events?: AgentGraphEvents;
}

/** AgentGraph result */
export interface AgentGraphResult {
    text: string;
    reasoning?: string;
    steps: StepResult[];
    usage?: AgentState['usage'];
    finishReason: string | null;
}

/**
 * AgentGraph class for agent execution.
 */
export class AgentGraph {
    private readonly options: AgentGraphOptions;
    private readonly graph: ReturnType<typeof this.buildGraph>;
    private steps: StepResult[] = [];

    constructor(options: AgentGraphOptions) {
        this.options = options;
        this.graph = this.buildGraph();
    }

    /**
     * Execute the agent graph.
     */
    async invoke(messages: InternalMessage[]): Promise<AgentGraphResult> {
        // Reset steps
        this.steps = [];

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
        };

        // Inject skills if provided
        if (this.options.skills?.length) {
            const injected = this.injectSkills(initialState.messages, this.options.skills);
            initialState.messages = injected.messages;
            initialState.skills = injected.skills;
        }

        // Execute graph
        const finalState = await this.graph.invoke(initialState, {
            maxSteps: this.options.maxSteps ? this.options.maxSteps * 3 : 30,
        });

        return {
            text: finalState.output,
            reasoning: finalState.reasoning || undefined,
            steps: this.steps,
            usage: finalState.usage,
            finishReason: finalState.finishReason,
        };
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
        const { events } = this.options;

        // Notify node entry
        events?.onNodeEnter?.('predict');

        // Check step limit
        if (state.stepCount >= state.maxSteps) {
            events?.onNodeExit?.('predict');
            return { done: true };
        }

        // Strip metadata before API call
        const apiMessages = stripMeta(state.messages);

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

        // Update state
        const newMessages: InternalMessage[] = [
            ...state.messages,
            { ...result.message },
        ];

        events?.onNodeExit?.('predict');

        return {
            messages: newMessages,
            stepCount: state.stepCount + 1,
            output: isDone ? (result.message.content as string || state.output) : state.output,
            reasoning: (state.reasoning || '') + (result.reasoning || ''),
            finishReason: result.finishReason,
            usage: result.usage,
            done: isDone,
        };
    }

    /**
     * Execute node - runs tools.
     */
    private async executeNode(state: AgentState): Promise<Partial<AgentState>> {
        const { events } = this.options;

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
            }
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

        return {
            messages: [...state.messages, ...toolMessages.map(m => m as InternalMessage)],
        };
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
