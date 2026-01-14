/**
 * Memory Node - Context Compaction with deterministic fallback.
 * 
 * Fallback order:
 * 1. Drop low-priority skills
 * 2. Drop oldest unprotected messages
 * 3. Throw ContextOverflowError
 */

import type { ChatMessage } from '../../lib/types';
import type { CompactionResult, CompactionConfig, ToolPair, InjectedSkill } from './types';

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
 * Implements deterministic fallback: skills → old messages → error
 */
export function compactMessages(
    messages: ChatMessage[],
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
    let currentTokens = config.estimateTokens(result.messages);
    if (currentTokens <= config.maxTokens) {
        return result;
    }

    result.occurred = true;

    // Build tool pairs (must be kept together)
    const { toolPairs, orphanCalls } = buildToolPairs(messages);
    result.orphanToolCalls = orphanCalls;

    // Identify protected indices (system, tool pairs)
    const protectedIndices = new Set<number>();

    // All system messages are protected
    messages.forEach((msg, idx) => {
        if (msg.role === 'system') {
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
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            protectedIndices.add(i);
            break;
        }
    }

    // Step 1: Drop skills (lowest priority first)
    if (injectedSkills.length > 0 && currentTokens > config.maxTokens) {
        const sortedSkills = [...injectedSkills].sort((a, b) => b.priority - a.priority);

        for (const skill of sortedSkills) {
            if (currentTokens <= config.maxTokens) break;

            // Remove skill content from messages
            result.droppedSkills.push(skill.name);
            currentTokens -= skill.tokenCount;
        }
    }

    // Step 2: Drop oldest unprotected messages
    const messagesToDrop: number[] = [];

    for (let i = 0; i < result.messages.length && currentTokens > config.maxTokens; i++) {
        if (!protectedIndices.has(i)) {
            messagesToDrop.push(i);
            currentTokens -= estimateSingleMessageTokens(result.messages[i]);
        }
    }

    if (messagesToDrop.length > 0) {
        result.messages = result.messages.filter((_, idx) => !messagesToDrop.includes(idx));
        result.droppedMessages = messagesToDrop.length;
    }

    // Step 3: Check if still over budget
    currentTokens = config.estimateTokens(result.messages);
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

/**
 * Estimate tokens for a single message.
 */
function estimateSingleMessageTokens(message: ChatMessage): number {
    const content = typeof message.content === 'string'
        ? message.content
        : message.content.map(p => p.text ?? '').join('');

    // Rough estimate: ~4 chars per token
    return Math.ceil(content.length / 4) + 10; // +10 for role/metadata
}
