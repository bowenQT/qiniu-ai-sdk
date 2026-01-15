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
import { isDroppable, getSkillId } from '../internal-types';
import { estimateMessageTokens } from '../../lib/token-estimator';

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

    // Step 1: Drop droppable skill messages (lowest priority first)
    // Collect all droppable messages with their skill IDs
    const droppableIndices: { idx: number; skillId: string; tokens: number }[] = [];

    result.messages.forEach((msg, idx) => {
        if (isDroppable(msg)) {
            const skillId = getSkillId(msg);
            if (skillId) {
                droppableIndices.push({
                    idx,
                    skillId,
                    tokens: estimateMessageTokens(msg as ChatMessage),
                });
            }
        }
    });

    // Sort by priority (using injectedSkills order) - lowest priority first
    const skillPriorityMap = new Map<string, number>();
    injectedSkills.forEach((skill, i) => skillPriorityMap.set(skill.name, i));

    droppableIndices.sort((a, b) => {
        const priorityA = skillPriorityMap.get(a.skillId) ?? 0;
        const priorityB = skillPriorityMap.get(b.skillId) ?? 0;
        return priorityA - priorityB; // Lower priority (earlier in list) dropped first
    });

    // Drop droppable messages until under budget
    const indicesToRemove = new Set<number>();

    for (const { idx, skillId, tokens } of droppableIndices) {
        if (currentTokens <= config.maxTokens) break;

        indicesToRemove.add(idx);
        currentTokens -= tokens;

        if (!result.droppedSkills.includes(skillId)) {
            result.droppedSkills.push(skillId);
        }
    }

    // Step 2: Drop oldest unprotected non-skill messages
    for (let i = 0; i < result.messages.length && currentTokens > config.maxTokens; i++) {
        if (!protectedIndices.has(i) && !indicesToRemove.has(i) && !isDroppable(result.messages[i])) {
            indicesToRemove.add(i);
            currentTokens -= estimateMessageTokens(result.messages[i] as ChatMessage);
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


