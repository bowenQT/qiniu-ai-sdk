/**
 * Memory Node - Context Compaction with deterministic fallback.
 * 
 * Fallback order:
 * 1. Drop low-priority skill messages (_meta.droppable)
 * 2. Drop oldest unprotected messages
 * 3. Throw ContextOverflowError
 */

import type { ChatMessage } from '../../lib/types';
import type { CompactionResult, CompactionConfig, ToolPair, InjectedSkill } from './types';
import type { InternalMessage } from '../internal-types';
import { isDroppable, getSkillId, getDroppableId } from '../internal-types';

/** Context overflow error */
export class ContextOverflowError extends Error {
    constructor(
        public readonly currentTokens: number,
        public readonly maxTokens: number,
        public readonly recommendation: string,
    ) {
        super(`Context overflow: ${currentTokens} tokens exceeds max ${maxTokens}. ${recommendation}`);
        this.name = 'ContextOverflowError';
    }
}

/**
 * Compact messages to fit within token budget.
 * Implements deterministic fallback: droppable skills → old messages → error
 * 
 * Key feature: recognizes _meta.droppable messages (skill-injected) for selective removal.
 */
export function compactMessages(
    messages: InternalMessage[],
    config: CompactionConfig,
    injectedSkills: InjectedSkill[] = [],
): CompactionResult {
    const result: CompactionResult = {
        messages: [...messages],
        occurred: false,
        droppedSkills: [],
        droppedMessages: 0,
        orphanToolCalls: [],
        recommendation: undefined,
    };

    // Check if compaction needed
    let currentTokens = config.estimateTokens(result.messages as ChatMessage[]);
    if (currentTokens <= config.maxTokens) {
        return result;
    }

    result.occurred = true;

    // Build tool pairs (must be kept together)
    const { toolPairs, orphanCalls } = buildToolPairs(result.messages as ChatMessage[]);
    result.orphanToolCalls = orphanCalls;

    // Identify protected indices
    const protectedIndices = new Set<number>();

    // Non-droppable system messages are protected
    result.messages.forEach((msg, idx) => {
        if (msg.role === 'system' && !isDroppable(msg)) {
            protectedIndices.add(idx);
        }
    });

    // Tool pairs are protected
    for (const pair of toolPairs) {
        protectedIndices.add(pair.callMessageIndex);
        if (pair.resultMessageIndex !== null) {
            protectedIndices.add(pair.resultMessageIndex);
        }
    }

    // Last user message is protected
    for (let i = result.messages.length - 1; i >= 0; i--) {
        if (result.messages[i].role === 'user') {
            protectedIndices.add(i);
            break;
        }
    }

    // Step 1: Drop droppable skill/summary messages (lowest priority first)
    // Collect all droppable messages with their IDs, tokens, and priority
    const droppableIndices: { idx: number; droppableId: string; tokens: number; priority: number }[] = [];

    result.messages.forEach((msg, idx) => {
        if (isDroppable(msg)) {
            const droppableId = getDroppableId(msg);
            if (droppableId) {
                const internalMsg = msg as InternalMessage;
                const skillIdx = injectedSkills.findIndex(s => s.name === droppableId);
                droppableIndices.push({
                    idx,
                    droppableId,
                    tokens: config.estimateTokens([msg as ChatMessage]),
                    // Use _meta.priority if set, else fallback to skill order, else 0
                    priority: internalMsg._meta?.priority ?? (skillIdx >= 0 ? skillIdx + 1 : 0),
                });
            }
        }
    });

    // Sort by priority (higher priority = keep, lower priority = drop first)
    droppableIndices.sort((a, b) => a.priority - b.priority);

    // Drop droppable messages until under budget
    const indicesToRemove = new Set<number>();

    for (const { idx, droppableId, tokens } of droppableIndices) {
        if (currentTokens <= config.maxTokens) break;

        indicesToRemove.add(idx);
        currentTokens -= tokens;

        if (!result.droppedSkills.includes(droppableId)) {
            result.droppedSkills.push(droppableId);
        }
    }

    // Step 2: Drop oldest unprotected non-skill messages
    for (let i = 0; i < result.messages.length && currentTokens > config.maxTokens; i++) {
        if (!protectedIndices.has(i) && !indicesToRemove.has(i) && !isDroppable(result.messages[i])) {
            indicesToRemove.add(i);
            currentTokens -= config.estimateTokens([result.messages[i] as ChatMessage]);
        }
    }

    // Apply removals
    if (indicesToRemove.size > 0) {
        const droppedSkillCount = droppableIndices.filter(d => indicesToRemove.has(d.idx)).length;
        const droppedNonSkillCount = indicesToRemove.size - droppedSkillCount;

        result.messages = result.messages.filter((_, idx) => !indicesToRemove.has(idx));
        result.droppedMessages = droppedNonSkillCount;
    }

    // Step 3: Check if still over budget
    currentTokens = config.estimateTokens(result.messages as ChatMessage[]);
    if (currentTokens > config.maxTokens) {
        result.recommendation = `Reduce system prompt or decrease skill count. Current: ${currentTokens}, Max: ${config.maxTokens}`;
        throw new ContextOverflowError(
            currentTokens,
            config.maxTokens,
            result.recommendation
        );
    }

    if (result.droppedSkills.length > 0 || result.droppedMessages > 0) {
        result.recommendation = `Dropped ${result.droppedSkills.length} skills and ${result.droppedMessages} messages to fit context.`;
    }

    return result;
}

/**
 * Build tool call/result pairs.
 * Returns pairs and orphan call IDs.
 */
export function buildToolPairs(messages: ChatMessage[]): {
    toolPairs: ToolPair[];
    orphanCalls: string[];
} {
    const toolPairs: ToolPair[] = [];
    const orphanCalls: string[] = [];

    messages.forEach((msg, idx) => {
        if (msg.role === 'assistant' && msg.tool_calls) {
            for (const call of msg.tool_calls) {
                // Find matching result
                const resultIdx = messages.findIndex(
                    (m, i) => i > idx && m.role === 'tool' && m.tool_call_id === call.id
                );

                if (resultIdx !== -1) {
                    toolPairs.push({
                        callMessageIndex: idx,
                        callId: call.id,
                        resultMessageIndex: resultIdx,
                    });
                } else {
                    // Orphan call - keep but warn
                    orphanCalls.push(call.id);
                    toolPairs.push({
                        callMessageIndex: idx,
                        callId: call.id,
                        resultMessageIndex: null,
                    });
                }
            }
        }
    });

    return { toolPairs, orphanCalls };
}


