/**
 * Unit tests for Dual Histories Pattern.
 * 
 * Verifies the internalMessages/messages separation
 * and backwards-compatible checkpoint migration.
 */

import { describe, it, expect } from 'vitest';
import {
    serializeState,
    deserializeCheckpoint,
    type Checkpoint,
    type SerializedAgentState,
} from '../../../src/ai/graph/checkpointer';
import type { AgentState, InternalMessage } from '../../../src/ai/internal-types';

describe('Dual Histories Pattern', () => {
    // Helper to create a valid AgentState with Dual Histories
    function createAgentState(messages: InternalMessage[]): AgentState {
        return {
            internalMessages: messages,
            get messages() { return this.internalMessages; },
            skills: [],
            tools: new Map(),
            stepCount: 0,
            maxSteps: 10,
            done: false,
            output: '',
            reasoning: '',
            finishReason: null,
        };
    }

    describe('serializeState', () => {
        it('should serialize using internalMessages field', () => {
            const messages: InternalMessage[] = [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there!', tool_calls: undefined },
            ];
            const state = createAgentState(messages);

            const serialized = serializeState(state);

            expect(serialized.internalMessages).toHaveLength(2);
            expect(serialized.internalMessages![0].content).toBe('Hello');
            expect(serialized.messages).toBeUndefined();
        });

        it('should preserve message metadata', () => {
            const messages: InternalMessage[] = [
                {
                    role: 'system',
                    content: 'Skill prompt',
                    _meta: { skillId: 'test-skill', droppable: true }
                },
            ];
            const state = createAgentState(messages);

            const serialized = serializeState(state);

            expect(serialized.internalMessages![0]._meta?.skillId).toBe('test-skill');
            expect(serialized.internalMessages![0]._meta?.droppable).toBe(true);
        });
    });

    describe('deserializeCheckpoint', () => {
        it('should restore state with internalMessages', () => {
            const checkpoint: Checkpoint = {
                metadata: {
                    id: 'ckpt_1',
                    threadId: 'thread_1',
                    createdAt: Date.now(),
                    stepCount: 5,
                },
                state: {
                    internalMessages: [
                        { role: 'user', content: 'Test' },
                    ],
                    stepCount: 5,
                    maxSteps: 10,
                    done: false,
                    output: '',
                    reasoning: '',
                    finishReason: null,
                },
            };

            const state = deserializeCheckpoint(checkpoint);

            expect(state.internalMessages).toHaveLength(1);
            expect(state.internalMessages[0].content).toBe('Test');
            // messages getter should return same array
            expect(state.messages).toBe(state.internalMessages);
        });

        it('should auto-migrate legacy checkpoint with messages field', () => {
            // Legacy checkpoint using old 'messages' field
            const legacyCheckpoint: Checkpoint = {
                metadata: {
                    id: 'ckpt_legacy',
                    threadId: 'thread_1',
                    createdAt: Date.now(),
                    stepCount: 3,
                },
                state: {
                    // Only messages field (legacy format)
                    messages: [
                        { role: 'user', content: 'Legacy message' },
                        { role: 'assistant', content: 'Legacy response' },
                    ],
                    stepCount: 3,
                    maxSteps: 10,
                    done: true,
                    output: 'Legacy response',
                    reasoning: '',
                    finishReason: 'stop',
                } as SerializedAgentState,
            };

            const state = deserializeCheckpoint(legacyCheckpoint);

            // Should migrate messages to internalMessages
            expect(state.internalMessages).toHaveLength(2);
            expect(state.internalMessages[0].content).toBe('Legacy message');
            expect(state.internalMessages[1].content).toBe('Legacy response');
            // messages getter should work
            expect(state.messages).toBe(state.internalMessages);
        });

        it('should prefer internalMessages over messages if both exist', () => {
            // Edge case: both fields present (shouldn't happen normally)
            const mixedCheckpoint: Checkpoint = {
                metadata: {
                    id: 'ckpt_mixed',
                    threadId: 'thread_1',
                    createdAt: Date.now(),
                    stepCount: 1,
                },
                state: {
                    internalMessages: [
                        { role: 'user', content: 'New format' },
                    ],
                    messages: [
                        { role: 'user', content: 'Old format' },
                    ],
                    stepCount: 1,
                    maxSteps: 10,
                    done: false,
                    output: '',
                    reasoning: '',
                    finishReason: null,
                } as SerializedAgentState,
            };

            const state = deserializeCheckpoint(mixedCheckpoint);

            // Should prefer internalMessages
            expect(state.internalMessages).toHaveLength(1);
            expect(state.internalMessages[0].content).toBe('New format');
        });

        it('should handle empty checkpoint gracefully', () => {
            const emptyCheckpoint: Checkpoint = {
                metadata: {
                    id: 'ckpt_empty',
                    threadId: 'thread_1',
                    createdAt: Date.now(),
                    stepCount: 0,
                },
                state: {
                    stepCount: 0,
                    maxSteps: 10,
                    done: false,
                    output: '',
                    reasoning: '',
                    finishReason: null,
                } as SerializedAgentState,
            };

            const state = deserializeCheckpoint(emptyCheckpoint);

            expect(state.internalMessages).toEqual([]);
            expect(state.messages).toEqual([]);
        });
    });

    describe('messages getter alias', () => {
        it('should reflect changes to internalMessages', () => {
            const state = createAgentState([
                { role: 'user', content: 'Original' },
            ]);

            // Add message via internalMessages
            state.internalMessages = [
                ...state.internalMessages,
                { role: 'assistant', content: 'Response' },
            ];

            // messages getter should reflect the change
            expect(state.messages).toHaveLength(2);
            expect(state.messages[1].content).toBe('Response');
        });
    });
});
