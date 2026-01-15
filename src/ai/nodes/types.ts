/**
 * Context Compaction types and result.
 */

import type { ChatMessage } from '../../lib/types';

/** Compaction result returned to callers */
export interface CompactionResult {
    /** Compacted messages */
    messages: ChatMessage[];
    /** Whether compaction occurred */
    occurred: boolean;
    /** Skills dropped during compaction */
    droppedSkills: string[];
    /** Number of messages dropped */
    droppedMessages: number;
    /** Orphan tool calls (no matching result) */
    orphanToolCalls: string[];
    /** Recommendation for reducing context */
    recommendation?: string;
}

/** Compaction configuration */
export interface CompactionConfig {
    /** Maximum tokens allowed */
    maxTokens: number;
    /** Token estimator function */
    estimateTokens: (messages: ChatMessage[]) => number;
}

/** Tool pair tracking */
export interface ToolPair {
    callMessageIndex: number;
    callId: string;
    resultMessageIndex: number | null;
}

/** Skill injection metadata */
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

