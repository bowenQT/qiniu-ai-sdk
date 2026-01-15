/**
 * Internal types for Agent Graph execution.
 * These types extend public types with internal metadata.
 */

import type { ChatMessage, ToolCall } from '../lib/types';
import type { RegisteredTool } from '../lib/tool-registry';
import type { Skill } from '../modules/skills';

/**
 * Internal metadata for messages.
 * Stripped before sending to API.
 */
export interface MessageMeta {
    /** Skill ID for skill-injected messages */
    skillId?: string;
    /** Whether this message can be dropped during compaction */
    droppable?: boolean;
    /** Original message index before injection */
    originalIndex?: number;
    /** Skill priority for stable compaction (lower = drop first) */
    priority?: number;
}

/**
 * Internal message with metadata.
 * API-bound messages have _meta stripped.
 */
export interface InternalMessage extends ChatMessage {
    _meta?: MessageMeta;
}

/**
 * Agent state for graph execution.
 */
export interface AgentState {
    /** Current messages in conversation */
    messages: InternalMessage[];
    /** Injected skills with metadata */
    skills: InjectedSkill[];
    /** Available tools */
    tools: Map<string, RegisteredTool>;
    /** Current step count */
    stepCount: number;
    /** Maximum allowed steps */
    maxSteps: number;
    /** Whether execution is complete */
    done: boolean;
    /** Final text output */
    output: string;
    /** Accumulated reasoning */
    reasoning: string;
    /** Finish reason from last prediction */
    finishReason: string | null;
    /** Token usage */
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    /** Abort signal for cancellation */
    abortSignal?: AbortSignal;
}

/**
 * Injected skill with position info for compaction.
 */
export interface InjectedSkill {
    /** Skill name */
    name: string;
    /** Priority for compaction (lower = drop first) */
    priority: number;
    /** Message index in messages array */
    messageIndex: number;
    /** Estimated token count */
    tokenCount: number;
}

/**
 * Step result for event callbacks.
 */
export interface StepResult {
    type: 'text' | 'tool_call' | 'tool_result';
    content: string;
    reasoning?: string;
    toolCalls?: ToolCall[];
    toolResults?: { toolCallId: string; result: string }[];
}

/**
 * Agent graph events.
 * Note: onToken is not supported in Phase 2 (no token-level streaming).
 */
export interface AgentGraphEvents {
    /** Called when a step completes */
    onStepFinish?: (step: StepResult) => void;
    /** Called when entering a node */
    onNodeEnter?: (nodeName: string) => void;
    /** Called when exiting a node */
    onNodeExit?: (nodeName: string) => void;
}

/**
 * Strip internal metadata from messages before API call.
 */
export function stripMeta(messages: InternalMessage[]): ChatMessage[] {
    return messages.map(({ _meta, ...msg }) => msg as ChatMessage);
}

/**
 * Check if message is droppable during compaction.
 */
export function isDroppable(message: InternalMessage): boolean {
    return message._meta?.droppable === true;
}

/**
 * Get skill ID from message.
 */
export function getSkillId(message: InternalMessage): string | undefined {
    return message._meta?.skillId;
}
