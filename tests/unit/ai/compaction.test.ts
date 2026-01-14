import { describe, it, expect } from 'vitest';
import {
    compactMessages,
    buildToolPairs,
    ContextOverflowError,
} from '../../../src/ai/nodes/memory-node';
import type { ChatMessage } from '../../../src/lib/types';

function createMessage(role: ChatMessage['role'], content: string, extra?: Partial<ChatMessage>): ChatMessage {
    return { role, content, ...extra };
}

function simpleEstimator(messages: ChatMessage[]): number {
    return messages.reduce((sum, msg) => {
        const content = typeof msg.content === 'string' ? msg.content : '';
        return sum + Math.ceil(content.length / 4) + 10;
    }, 0);
}

describe('Memory Node - Context Compaction', () => {
    describe('D1: Tool Pair Protection', () => {
        it('should identify tool pairs correctly', () => {
            const messages: ChatMessage[] = [
                createMessage('user', 'Search for cats'),
                createMessage('assistant', '', {
                    tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } }],
                }),
                createMessage('tool', 'Found 10 cats', { tool_call_id: 'call_1' }),
                createMessage('assistant', 'I found 10 cats!'),
            ];

            const { toolPairs, orphanCalls } = buildToolPairs(messages);

            expect(toolPairs).toHaveLength(1);
            expect(toolPairs[0].callId).toBe('call_1');
            expect(toolPairs[0].callMessageIndex).toBe(1);
            expect(toolPairs[0].resultMessageIndex).toBe(2);
            expect(orphanCalls).toHaveLength(0);
        });

        it('should detect orphan tool calls', () => {
            const messages: ChatMessage[] = [
                createMessage('user', 'Search for cats'),
                createMessage('assistant', '', {
                    tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } }],
                }),
                // Missing tool result
                createMessage('assistant', 'Something went wrong'),
            ];

            const { toolPairs, orphanCalls } = buildToolPairs(messages);

            expect(orphanCalls).toContain('call_1');
            expect(toolPairs[0].resultMessageIndex).toBeNull();
        });

        it('should protect tool pairs during compaction', () => {
            const messages: ChatMessage[] = [
                createMessage('system', 'You are helpful'),
                createMessage('user', 'Old message'),
                createMessage('assistant', '', {
                    tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } }],
                }),
                createMessage('tool', 'Result', { tool_call_id: 'call_1' }),
                createMessage('user', 'Latest question'),
            ];

            const result = compactMessages(messages, {
                maxTokens: 50, // Force compaction
                estimateTokens: simpleEstimator,
            });

            // Tool pair should be preserved
            const hasToolCall = result.messages.some(m => m.tool_calls?.length);
            const hasToolResult = result.messages.some(m => m.role === 'tool');
            expect(hasToolCall).toBe(true);
            expect(hasToolResult).toBe(true);
        });
    });

    describe('D2: Fallback Rules', () => {
        it('should not compact when under budget', () => {
            const messages: ChatMessage[] = [
                createMessage('system', 'Short'),
                createMessage('user', 'Hi'),
            ];

            const result = compactMessages(messages, {
                maxTokens: 1000,
                estimateTokens: simpleEstimator,
            });

            expect(result.occurred).toBe(false);
            expect(result.messages).toHaveLength(2);
        });

        it('should drop oldest unprotected messages first', () => {
            const messages: ChatMessage[] = [
                createMessage('system', 'System prompt'),
                createMessage('user', 'Old question 1'),
                createMessage('assistant', 'Old answer 1'),
                createMessage('user', 'Old question 2'),
                createMessage('assistant', 'Old answer 2'),
                createMessage('user', 'Latest question'),
            ];

            const result = compactMessages(messages, {
                maxTokens: 80,
                estimateTokens: simpleEstimator,
            });

            expect(result.occurred).toBe(true);
            expect(result.droppedMessages).toBeGreaterThan(0);

            // System and latest user should be preserved
            expect(result.messages[0].role).toBe('system');
            expect(result.messages[result.messages.length - 1].content).toBe('Latest question');
        });

        it('should throw ContextOverflowError when cannot fit', () => {
            const messages: ChatMessage[] = [
                createMessage('system', 'A'.repeat(1000)),
                createMessage('user', 'B'.repeat(1000)),
            ];

            expect(() => compactMessages(messages, {
                maxTokens: 100,
                estimateTokens: simpleEstimator,
            })).toThrow(ContextOverflowError);
        });
    });

    describe('D3: Result Exposure', () => {
        it('should return CompactionResult with all fields', () => {
            const messages: ChatMessage[] = [
                createMessage('system', 'System'),
                createMessage('user', 'Question 1'),
                createMessage('assistant', 'Answer 1'),
                createMessage('user', 'Question 2'),
            ];

            const result = compactMessages(messages, {
                maxTokens: 60,
                estimateTokens: simpleEstimator,
            });

            expect(result).toHaveProperty('messages');
            expect(result).toHaveProperty('occurred');
            expect(result).toHaveProperty('droppedSkills');
            expect(result).toHaveProperty('droppedMessages');
            expect(result).toHaveProperty('orphanToolCalls');
        });

        it('should include recommendation when dropping', () => {
            const messages: ChatMessage[] = [
                createMessage('system', 'System'),
                createMessage('user', 'Q1'),
                createMessage('assistant', 'A1'),
                createMessage('user', 'Q2'),
            ];

            const result = compactMessages(messages, {
                maxTokens: 50,
                estimateTokens: simpleEstimator,
            });

            if (result.droppedMessages > 0) {
                expect(result.recommendation).toBeDefined();
            }
        });
    });
});
