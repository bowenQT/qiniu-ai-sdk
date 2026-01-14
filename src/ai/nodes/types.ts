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
    name: string;
    startIndex: number;
    endIndex: number;
    tokenCount: number;
    priority: number;
}
