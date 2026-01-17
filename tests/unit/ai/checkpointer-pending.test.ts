/**
 * Tests for Checkpointer pending approval functionality.
 */

import { describe, it, expect, vi } from 'vitest';
import {
    MemoryCheckpointer,
    isPendingApproval,
    getPendingApproval,
    resumeWithApproval,
    deserializeCheckpoint,
} from '../../../src/ai/graph/checkpointer';
import type {
    Checkpoint,
    PendingApproval,
    CheckpointSaveOptions,
} from '../../../src/ai/graph/checkpointer';
import type { AgentState } from '../../../src/ai/internal-types';

describe('Checkpointer Pending Approval', () => {
    const createMockState = (): AgentState => ({
        messages: [{ role: 'user', content: 'Hello' }],
        skills: [],
        tools: new Map(),
        stepCount: 1,
        maxSteps: 10,
        done: false,
        output: '',
        reasoning: '',
        finishReason: null,
        abortSignal: undefined,
    });

    const createPendingApproval = (): PendingApproval => ({
        toolCall: {
            id: 'call_123',
            function: {
                name: 'sendEmail',
                arguments: '{"to": "user@example.com"}',
            },
        },
        toolName: 'sendEmail',
        args: { to: 'user@example.com' },
        requestedAt: Date.now(),
    });

    describe('MemoryCheckpointer save with options', () => {
        it('should save checkpoint with active status by default', async () => {
            const checkpointer = new MemoryCheckpointer();
            const state = createMockState();

            const metadata = await checkpointer.save('thread-1', state);

            expect(metadata.status).toBe('active');
            expect(metadata.pendingApproval).toBeUndefined();
        });

        it('should save checkpoint with pending_approval status', async () => {
            const checkpointer = new MemoryCheckpointer();
            const state = createMockState();
            const pending = createPendingApproval();

            const options: CheckpointSaveOptions = {
                status: 'pending_approval',
                pendingApproval: pending,
            };

            const metadata = await checkpointer.save('thread-1', state, options);

            expect(metadata.status).toBe('pending_approval');
            expect(metadata.pendingApproval).toEqual(pending);
        });

        it('should preserve custom metadata alongside status', async () => {
            const checkpointer = new MemoryCheckpointer();
            const state = createMockState();

            const options: CheckpointSaveOptions = {
                status: 'active',
                custom: { userId: 'user-123' },
            };

            const metadata = await checkpointer.save('thread-1', state, options);

            expect(metadata.status).toBe('active');
            expect(metadata.custom).toEqual({ userId: 'user-123' });
        });

        it('should handle legacy custom-only format', async () => {
            const checkpointer = new MemoryCheckpointer();
            const state = createMockState();

            // Legacy format: just a Record<string, unknown>
            const legacyCustom = { userId: 'user-123', sessionId: 'sess-456' };

            const metadata = await checkpointer.save('thread-1', state, legacyCustom);

            expect(metadata.status).toBe('active');
            expect(metadata.custom).toEqual(legacyCustom);
        });
    });

    describe('isPendingApproval', () => {
        it('should return true for pending_approval checkpoint', () => {
            const checkpoint: Checkpoint = {
                metadata: {
                    id: 'ckpt_1',
                    threadId: 'thread-1',
                    createdAt: Date.now(),
                    stepCount: 1,
                    status: 'pending_approval',
                    pendingApproval: createPendingApproval(),
                },
                state: {
                    messages: [],
                    stepCount: 1,
                    maxSteps: 10,
                    done: false,
                    output: '',
                    reasoning: '',
                    finishReason: null,
                },
            };

            expect(isPendingApproval(checkpoint)).toBe(true);
        });

        it('should return false for active checkpoint', () => {
            const checkpoint: Checkpoint = {
                metadata: {
                    id: 'ckpt_1',
                    threadId: 'thread-1',
                    createdAt: Date.now(),
                    stepCount: 1,
                    status: 'active',
                },
                state: {
                    messages: [],
                    stepCount: 1,
                    maxSteps: 10,
                    done: false,
                    output: '',
                    reasoning: '',
                    finishReason: null,
                },
            };

            expect(isPendingApproval(checkpoint)).toBe(false);
        });
    });

    describe('getPendingApproval', () => {
        it('should return pending approval info', () => {
            const pending = createPendingApproval();
            const checkpoint: Checkpoint = {
                metadata: {
                    id: 'ckpt_1',
                    threadId: 'thread-1',
                    createdAt: Date.now(),
                    stepCount: 1,
                    status: 'pending_approval',
                    pendingApproval: pending,
                },
                state: {
                    messages: [],
                    stepCount: 1,
                    maxSteps: 10,
                    done: false,
                    output: '',
                    reasoning: '',
                    finishReason: null,
                },
            };

            const result = getPendingApproval(checkpoint);
            expect(result).toEqual(pending);
        });

        it('should return null for non-pending checkpoint', () => {
            const checkpoint: Checkpoint = {
                metadata: {
                    id: 'ckpt_1',
                    threadId: 'thread-1',
                    createdAt: Date.now(),
                    stepCount: 1,
                    status: 'active',
                },
                state: {
                    messages: [],
                    stepCount: 1,
                    maxSteps: 10,
                    done: false,
                    output: '',
                    reasoning: '',
                    finishReason: null,
                },
            };

            expect(getPendingApproval(checkpoint)).toBeNull();
        });
    });

    describe('resumeWithApproval', () => {
        const createPendingCheckpoint = (): Checkpoint => ({
            metadata: {
                id: 'ckpt_1',
                threadId: 'thread-1',
                createdAt: Date.now(),
                stepCount: 1,
                status: 'pending_approval',
                pendingApproval: createPendingApproval(),
            },
            state: {
                messages: [{ role: 'user', content: 'Send email' }],
                stepCount: 1,
                maxSteps: 10,
                done: false,
                output: '',
                reasoning: '',
                finishReason: null,
            },
        });

        it('should return rejection message when not approved', async () => {
            const checkpoint = createPendingCheckpoint();

            const result = await resumeWithApproval(checkpoint, false);

            expect(result.approved).toBe(false);
            expect(result.toolExecuted).toBe(false);
            expect(result.toolResult).toContain('Rejected');
            expect(result.state.messages).toHaveLength(2); // original + tool result
        });

        it('should return synthetic result when approved without executor', async () => {
            const checkpoint = createPendingCheckpoint();

            const result = await resumeWithApproval(checkpoint, true);

            expect(result.approved).toBe(true);
            expect(result.toolExecuted).toBe(false);
            expect(result.toolResult).toContain('approved');
        });

        it('should execute tool when approved with executor', async () => {
            const checkpoint = createPendingCheckpoint();
            const mockExecutor = vi.fn().mockResolvedValue({ success: true, emailId: 'msg-123' });

            const result = await resumeWithApproval(checkpoint, true, mockExecutor);

            expect(result.approved).toBe(true);
            expect(result.toolExecuted).toBe(true);
            expect(mockExecutor).toHaveBeenCalledWith(
                'sendEmail',
                { to: 'user@example.com' },
                undefined,
            );
            expect(result.toolResult).toContain('emailId');
        });

        it('should handle executor errors', async () => {
            const checkpoint = createPendingCheckpoint();
            const mockExecutor = vi.fn().mockRejectedValue(new Error('SMTP failed'));

            const result = await resumeWithApproval(checkpoint, true, mockExecutor);

            expect(result.approved).toBe(true);
            expect(result.toolExecuted).toBe(true);
            expect(result.toolResult).toContain('SMTP failed');
        });

        it('should throw if checkpoint has no pending approval', async () => {
            const checkpoint: Checkpoint = {
                metadata: {
                    id: 'ckpt_1',
                    threadId: 'thread-1',
                    createdAt: Date.now(),
                    stepCount: 1,
                    status: 'active',
                },
                state: {
                    messages: [],
                    stepCount: 1,
                    maxSteps: 10,
                    done: false,
                    output: '',
                    reasoning: '',
                    finishReason: null,
                },
            };

            await expect(resumeWithApproval(checkpoint, true)).rejects.toThrow(
                'Checkpoint does not have pending approval',
            );
        });
    });
});
