/**
 * Tests for createAgent module.
 */

import { describe, it, expect, vi } from 'vitest';
import { createAgent } from '../../../src/ai/create-agent';
import { CheckpointerSessionStore, MemorySessionStore } from '../../../src/ai/session-store';
import type { QiniuAI } from '../../../src/client';
import type { Checkpointer } from '../../../src/ai/graph/checkpointer';
import { MemoryCheckpointer } from '../../../src/ai/graph';

// Mock client
const createMockClient = (): QiniuAI & { requests: any[] } => {
    const requests: any[] = [];

    return {
        requests,
        chat: {
            create: vi.fn().mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
            createStream: vi.fn(async function* (request: any) {
                requests.push(request);
                return {
                    content: 'Hello!',
                    reasoningContent: '',
                    toolCalls: [],
                    finishReason: 'stop',
                    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
                };
            }),
        },
        getBaseUrl: () => 'https://api.qnaigc.com/v1',
        post: vi.fn(),
        get: vi.fn(),
    } as unknown as QiniuAI & { requests: any[] };
};

const createSequentialStreamClient = (
    responses: Array<{
        content?: string;
        tool_calls?: any[];
        finishReason?: string;
    }>,
): QiniuAI & { requests: any[] } => {
    const requests: any[] = [];
    let callIndex = 0;

    return {
        requests,
        chat: {
            create: vi.fn(),
            createStream: vi.fn(async function* (request: any) {
                requests.push(request);
                const response = responses[callIndex++] ?? responses[responses.length - 1];
                return {
                    content: response.content ?? '',
                    reasoningContent: '',
                    toolCalls: response.tool_calls ?? [],
                    finishReason: response.finishReason ?? 'stop',
                    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
                };
            }),
        },
        getBaseUrl: () => 'https://api.qnaigc.com/v1',
        post: vi.fn(),
        get: vi.fn(),
    } as unknown as QiniuAI & { requests: any[] };
};

// Mock checkpointer
const createMockCheckpointer = (): Checkpointer => ({
    save: vi.fn().mockResolvedValue({ id: 'ckpt_1', threadId: 'test', createdAt: Date.now(), stepCount: 1 }),
    load: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
    clear: vi.fn().mockResolvedValue(0),
});

describe('createAgent', () => {
    describe('creation', () => {
        it('should create an agent with minimal config', () => {
            const client = createMockClient();

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
            });

            expect(agent).toBeDefined();
            expect(agent.run).toBeInstanceOf(Function);
            expect(agent.runWithThread).toBeInstanceOf(Function);
            expect(agent.runResumableWithThread).toBeInstanceOf(Function);
            expect(agent.resumeThread).toBeInstanceOf(Function);
        });

        it('should create an agent with full config', () => {
            const client = createMockClient();
            const checkpointer = createMockCheckpointer();

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                system: 'You are a helpful assistant.',
                tools: {
                    greet: {
                        description: 'Greet user',
                        parameters: {},
                        execute: async () => 'Hello!',
                    },
                },
                maxSteps: 5,
                temperature: 0.7,
                checkpointer,
            });

            expect(agent).toBeDefined();
        });
    });

    describe('runWithThread validation', () => {
        it('should throw if neither checkpointer nor sessionStore is configured', async () => {
            const client = createMockClient();

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
            });

            await expect(
                agent.runWithThread({ threadId: 'test', prompt: 'Hello' }),
            ).rejects.toThrow('runWithThread requires checkpointer or sessionStore');
        });

        it('should accept a sessionStore instead of checkpointer', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                sessionStore,
            });

            await expect(
                agent.runWithThread({ threadId: 'test', prompt: 'Hello' }),
            ).resolves.toBeDefined();
        });

        it('should throw if threadId is empty', async () => {
            const client = createMockClient();
            const checkpointer = createMockCheckpointer();

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                checkpointer,
            });

            await expect(
                agent.runWithThread({ threadId: '', prompt: 'Hello' }),
            ).rejects.toThrow('threadId is required');
        });

        it('resumes a thread without duplicating the configured system prompt', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                system: 'You are a helpful assistant.',
                sessionStore,
            });

            await agent.runWithThread({ threadId: 'thread-system', prompt: 'Hello' });
            await agent.runWithThread({ threadId: 'thread-system', prompt: 'Continue' });

            const secondRequest = client.requests[1];
            expect(secondRequest.messages.filter((message: { role: string }) => message.role === 'system')).toHaveLength(1);
            expect(secondRequest.messages[0]).toMatchObject({
                role: 'system',
                content: 'You are a helpful assistant.',
            });
            expect(secondRequest.messages.at(-1)).toMatchObject({
                role: 'user',
                content: 'Continue',
            });
        });

        it('restores a configured system prompt when loading a legacy checkpoint without one', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            await sessionStore.save({
                threadId: 'thread-legacy',
                state: {
                    internalMessages: [
                        { role: 'user', content: 'Earlier user turn' },
                        { role: 'assistant', content: 'Earlier assistant reply' },
                    ],
                    stepCount: 1,
                    maxSteps: 4,
                    done: false,
                    output: 'Earlier assistant reply',
                    reasoning: '',
                    finishReason: null,
                } as any,
            });

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                system: 'You are a helpful assistant.',
                sessionStore,
            });

            await agent.runWithThread({ threadId: 'thread-legacy', prompt: 'Continue' });

            const request = client.requests[0];
            expect(request.messages[0]).toMatchObject({
                role: 'system',
                content: 'You are a helpful assistant.',
            });
            expect(request.messages.filter((message: { role: string }) => message.role === 'system')).toHaveLength(1);
            expect(request.messages.at(-1)).toMatchObject({
                role: 'user',
                content: 'Continue',
            });
        });

        it('resumes a thread from session-store messages even without a checkpoint', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            await sessionStore.save({
                threadId: 'thread-message-only',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Earlier user turn' },
                    { role: 'assistant', content: 'Earlier assistant reply' },
                ],
                summary: 'Earlier summary',
            });

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                system: 'You are a helpful assistant.',
                sessionStore,
            });

            await agent.runWithThread({ threadId: 'thread-message-only', prompt: 'Continue' });

            const request = client.requests[0];
            expect(request.messages.filter((message: { role: string }) => message.role === 'system')).toHaveLength(1);
            expect(request.messages).toEqual([
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Earlier user turn' },
                { role: 'assistant', content: 'Earlier assistant reply' },
                { role: 'user', content: 'Continue' },
            ]);
        });

        it('streams a thread from session-store messages without duplicating the configured system prompt', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            await sessionStore.save({
                threadId: 'thread-stream-message-only',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Earlier user turn' },
                    { role: 'assistant', content: 'Earlier assistant reply' },
                ],
                summary: 'Earlier summary',
            });

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                system: 'You are a helpful assistant.',
                sessionStore,
            });

            const result = await agent.streamWithThread({
                threadId: 'thread-stream-message-only',
                prompt: 'Continue in stream',
            });

            await expect(result.text).resolves.toBe('Hello!');

            const request = client.requests[0];
            expect(request.messages.filter((message: { role: string }) => message.role === 'system')).toHaveLength(1);
            expect(request.messages).toEqual([
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Earlier user turn' },
                { role: 'assistant', content: 'Earlier assistant reply' },
                { role: 'user', content: 'Continue in stream' },
            ]);
        });

        it('persists streamed thread turns so replayThread includes the streamed assistant reply', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            await sessionStore.save({
                threadId: 'thread-stream-replay',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Earlier user turn' },
                    { role: 'assistant', content: 'Earlier assistant reply' },
                ],
                summary: 'Earlier summary',
            });

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                system: 'You are a helpful assistant.',
                sessionStore,
            });

            const result = await agent.streamWithThread({
                threadId: 'thread-stream-replay',
                prompt: 'Stream a follow up',
            });

            await expect(result.text).resolves.toBe('Hello!');
            await expect(agent.replayThread({ threadId: 'thread-stream-replay' })).resolves.toEqual([
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Earlier user turn' },
                { role: 'assistant', content: 'Earlier assistant reply' },
                { role: 'user', content: 'Stream a follow up' },
                { role: 'assistant', content: 'Hello!' },
            ]);
        });

        it('loads and replays persisted thread messages through the agent surface', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            await sessionStore.save({
                threadId: 'thread-replay-agent',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Earlier user turn' },
                    { role: 'assistant', content: 'Earlier assistant reply' },
                ],
                summary: 'Earlier summary',
            });

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                sessionStore,
            });

            await expect(agent.loadThread({ threadId: 'thread-replay-agent' })).resolves.toMatchObject({
                threadId: 'thread-replay-agent',
                summary: 'Earlier summary',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Earlier user turn' },
                    { role: 'assistant', content: 'Earlier assistant reply' },
                ],
            });
            await expect(agent.replayThread({ threadId: 'thread-replay-agent' })).resolves.toEqual([
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Earlier user turn' },
                { role: 'assistant', content: 'Earlier assistant reply' },
            ]);
        });

        it('forks persisted thread state through the agent surface', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            await sessionStore.save({
                threadId: 'thread-fork-source',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Original user turn' },
                    { role: 'assistant', content: 'Original assistant reply' },
                ],
                summary: 'fork summary',
            });

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                sessionStore,
            });

            await expect(agent.forkThread({
                fromThreadId: 'thread-fork-source',
                toThreadId: 'thread-fork-target',
            })).resolves.toMatchObject({
                threadId: 'thread-fork-target',
                summary: 'fork summary',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Original user turn' },
                    { role: 'assistant', content: 'Original assistant reply' },
                ],
            });

            await expect(agent.replayThread({ threadId: 'thread-fork-target' })).resolves.toEqual([
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Original user turn' },
                { role: 'assistant', content: 'Original assistant reply' },
            ]);
        });

        it('restores a loaded thread record into a new thread', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            await sessionStore.save({
                threadId: 'thread-restore-source',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Snapshot user turn' },
                    { role: 'assistant', content: 'Snapshot assistant reply' },
                ],
                summary: 'snapshot summary',
            });

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                sessionStore,
            });

            const record = await agent.loadThread({ threadId: 'thread-restore-source' });
            expect(record).toBeTruthy();

            await expect(agent.restoreThread({
                threadId: 'thread-restored',
                record: record!,
            })).resolves.toMatchObject({
                threadId: 'thread-restored',
                summary: 'snapshot summary',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Snapshot user turn' },
                    { role: 'assistant', content: 'Snapshot assistant reply' },
                ],
            });

            await expect(agent.replayThread({ threadId: 'thread-restored' })).resolves.toEqual([
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Snapshot user turn' },
                { role: 'assistant', content: 'Snapshot assistant reply' },
            ]);
        });

        it('rejects forking into an existing thread unless overwrite is enabled', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            await sessionStore.save({
                threadId: 'thread-fork-source-existing',
                messages: [{ role: 'user', content: 'Source' }],
            });
            await sessionStore.save({
                threadId: 'thread-fork-target-existing',
                messages: [{ role: 'user', content: 'Target' }],
            });

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                sessionStore,
            });

            await expect(agent.forkThread({
                fromThreadId: 'thread-fork-source-existing',
                toThreadId: 'thread-fork-target-existing',
            })).rejects.toThrow('forkThread target already exists');

            await expect(agent.forkThread({
                fromThreadId: 'thread-fork-source-existing',
                toThreadId: 'thread-fork-target-existing',
                overwrite: true,
            })).resolves.toMatchObject({
                threadId: 'thread-fork-target-existing',
                messages: [{ role: 'user', content: 'Source' }],
            });
        });

        it('rejects restoring into an existing thread unless overwrite is enabled', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            await sessionStore.save({
                threadId: 'thread-restore-existing',
                messages: [{ role: 'user', content: 'Existing target' }],
            });

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                sessionStore,
            });

            await expect(agent.restoreThread({
                threadId: 'thread-restore-existing',
                record: {
                    threadId: 'snapshot-record',
                    messages: [{ role: 'user', content: 'Restored source' }],
                    summary: 'restored summary',
                    updatedAt: Date.now(),
                },
            })).rejects.toThrow('restoreThread target already exists');

            await expect(agent.restoreThread({
                threadId: 'thread-restore-existing',
                record: {
                    threadId: 'snapshot-record',
                    messages: [{ role: 'user', content: 'Restored source' }],
                    summary: 'restored summary',
                    updatedAt: Date.now(),
                },
                overwrite: true,
            })).resolves.toMatchObject({
                threadId: 'thread-restore-existing',
                messages: [{ role: 'user', content: 'Restored source' }],
                summary: 'restored summary',
            });
        });

        it('moves a persisted thread into a new thread and clears the source', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            await sessionStore.save({
                threadId: 'thread-move-source',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Move me' },
                    { role: 'assistant', content: 'Moved' },
                ],
                summary: 'move summary',
            });

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                sessionStore,
            });

            await expect(agent.moveThread({
                fromThreadId: 'thread-move-source',
                toThreadId: 'thread-move-target',
            })).resolves.toMatchObject({
                threadId: 'thread-move-target',
                summary: 'move summary',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant.' },
                    { role: 'user', content: 'Move me' },
                    { role: 'assistant', content: 'Moved' },
                ],
            });

            await expect(agent.loadThread({ threadId: 'thread-move-source' })).resolves.toBeNull();
            await expect(agent.replayThread({ threadId: 'thread-move-target' })).resolves.toEqual([
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Move me' },
                { role: 'assistant', content: 'Moved' },
            ]);
        });

        it('rejects moving a thread onto itself', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                sessionStore,
            });

            await expect(agent.moveThread({
                fromThreadId: 'thread-same',
                toThreadId: 'thread-same',
            })).rejects.toThrow('moveThread requires fromThreadId and toThreadId to be different');
        });

        it('rejects forking a thread onto itself', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                sessionStore,
            });

            await expect(agent.forkThread({
                fromThreadId: 'thread-same',
                toThreadId: 'thread-same',
            })).rejects.toThrow('fromThreadId and toThreadId to be different');
        });

        it('clears persisted thread state through the agent surface', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            const checkpointer = createMockCheckpointer();
            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                sessionStore,
                checkpointer,
            });

            await sessionStore.save({
                threadId: 'thread-clear-agent',
                messages: [
                    { role: 'user', content: 'Clear me' },
                ],
                summary: 'clear summary',
            });

            await agent.clearThread({ threadId: 'thread-clear-agent' });

            await expect(agent.loadThread({ threadId: 'thread-clear-agent' })).resolves.toBeNull();
            expect(checkpointer.clear).toHaveBeenCalledWith('thread-clear-agent');
        });

        it('loads and replays thread state from a checkpointer when no sessionStore is configured', async () => {
            const client = createMockClient();
            const checkpointer = createMockCheckpointer();
            (checkpointer.load as ReturnType<typeof vi.fn>).mockResolvedValue({
                metadata: {
                    id: 'ckpt-only',
                    threadId: 'thread-checkpoint-only',
                    createdAt: 1,
                    stepCount: 1,
                },
                state: {
                    internalMessages: [
                        { role: 'user', content: 'Checkpoint user turn' },
                        { role: 'assistant', content: 'Checkpoint assistant reply' },
                    ],
                    stepCount: 1,
                    maxSteps: 4,
                    done: false,
                    output: 'Checkpoint assistant reply',
                    reasoning: '',
                    finishReason: null,
                },
            });

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                checkpointer,
            });

            await expect(agent.loadThread({ threadId: 'thread-checkpoint-only' })).resolves.toMatchObject({
                threadId: 'thread-checkpoint-only',
                messages: [
                    { role: 'user', content: 'Checkpoint user turn' },
                    { role: 'assistant', content: 'Checkpoint assistant reply' },
                ],
            });
            await expect(agent.replayThread({ threadId: 'thread-checkpoint-only' })).resolves.toEqual([
                { role: 'user', content: 'Checkpoint user turn' },
                { role: 'assistant', content: 'Checkpoint assistant reply' },
            ]);
        });

        it('forks thread state from a checkpointer when no sessionStore is configured', async () => {
            const client = createMockClient();
            const checkpointer = createMockCheckpointer();
            (checkpointer.load as ReturnType<typeof vi.fn>)
                .mockResolvedValueOnce({
                    metadata: {
                        id: 'ckpt-fork-source',
                        threadId: 'thread-checkpoint-fork-source',
                        createdAt: 1,
                        stepCount: 2,
                    },
                    state: {
                        internalMessages: [
                            { role: 'user', content: 'Checkpoint source user turn' },
                            { role: 'assistant', content: 'Checkpoint source assistant reply' },
                        ],
                        stepCount: 2,
                        maxSteps: 4,
                        done: false,
                        output: 'Checkpoint source assistant reply',
                        reasoning: '',
                        finishReason: null,
                    },
                })
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({
                    metadata: {
                        id: 'ckpt-fork-target',
                        threadId: 'thread-checkpoint-fork-target',
                        createdAt: 2,
                        stepCount: 2,
                    },
                    state: {
                        internalMessages: [
                            { role: 'user', content: 'Checkpoint source user turn' },
                            { role: 'assistant', content: 'Checkpoint source assistant reply' },
                        ],
                        stepCount: 2,
                        maxSteps: 4,
                        done: false,
                        output: 'Checkpoint source assistant reply',
                        reasoning: '',
                        finishReason: null,
                    },
                });

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                checkpointer,
            });

            await expect(agent.forkThread({
                fromThreadId: 'thread-checkpoint-fork-source',
                toThreadId: 'thread-checkpoint-fork-target',
            })).resolves.toMatchObject({
                threadId: 'thread-checkpoint-fork-target',
                messages: [
                    { role: 'user', content: 'Checkpoint source user turn' },
                    { role: 'assistant', content: 'Checkpoint source assistant reply' },
                ],
            });

            expect(checkpointer.save).toHaveBeenCalledWith(
                'thread-checkpoint-fork-target',
                expect.objectContaining({
                    internalMessages: [
                        { role: 'user', content: 'Checkpoint source user turn' },
                        { role: 'assistant', content: 'Checkpoint source assistant reply' },
                    ],
                }),
                expect.objectContaining({
                    stepCount: 2,
                }),
            );
        });

        it('restores thread state through a checkpointer when no sessionStore is configured', async () => {
            const client = createMockClient();
            const checkpointer = createMockCheckpointer();
            (checkpointer.load as ReturnType<typeof vi.fn>)
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({
                    metadata: {
                        id: 'ckpt-restored-target',
                        threadId: 'thread-checkpoint-restored-target',
                        createdAt: 2,
                        stepCount: 2,
                    },
                    state: {
                        internalMessages: [
                            { role: 'user', content: 'Restored checkpoint user turn' },
                            { role: 'assistant', content: 'Restored checkpoint assistant reply' },
                        ],
                        stepCount: 2,
                        maxSteps: 4,
                        done: false,
                        output: 'Restored checkpoint assistant reply',
                        reasoning: '',
                        finishReason: null,
                    },
                });

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                checkpointer,
            });

            await expect(agent.restoreThread({
                threadId: 'thread-checkpoint-restored-target',
                record: {
                    threadId: 'snapshot-record',
                    messages: [
                        { role: 'user', content: 'Restored checkpoint user turn' },
                        { role: 'assistant', content: 'Restored checkpoint assistant reply' },
                    ],
                    summary: 'restored checkpoint summary',
                    updatedAt: 1,
                },
            })).resolves.toMatchObject({
                threadId: 'thread-checkpoint-restored-target',
                messages: [
                    { role: 'user', content: 'Restored checkpoint user turn' },
                    { role: 'assistant', content: 'Restored checkpoint assistant reply' },
                ],
                summary: 'restored checkpoint summary',
            });

            expect(checkpointer.save).toHaveBeenCalledWith(
                'thread-checkpoint-restored-target',
                expect.objectContaining({
                    internalMessages: [
                        { role: 'user', content: 'Restored checkpoint user turn' },
                        { role: 'assistant', content: 'Restored checkpoint assistant reply' },
                    ],
                    stepCount: 0,
                    maxSteps: 1,
                }),
                undefined,
            );
        });
    });

    describe('approval config passthrough', () => {
        it('should accept approvalConfig in config', () => {
            const client = createMockClient();

            const agent = createAgent({
                client,
                model: 'gemini-2.5-flash',
                approvalConfig: {
                    onApprovalRequired: async () => true,
                    autoApproveSources: ['builtin'],
                },
            });

            expect(agent).toBeDefined();
        });
    });

    describe('resumable thread execution', () => {
        it('interrupts on deferred approval and resumes with the agent tool executor', async () => {
            const client = createSequentialStreamClient([
                {
                    tool_calls: [
                        {
                            id: 'call_deferred',
                            type: 'function',
                            function: { name: 'dangerousTool', arguments: '{"target":"prod"}' },
                        },
                    ],
                    finishReason: 'tool_calls',
                },
                {
                    content: 'All done after approval',
                    finishReason: 'stop',
                },
            ]);
            const checkpointer = new MemoryCheckpointer();
            let toolExecuted = false;

            const agent = createAgent({
                client,
                model: 'test-model',
                checkpointer,
                tools: {
                    dangerousTool: {
                        parameters: { target: { type: 'string' } },
                        requiresApproval: true,
                        approvalHandler: async () => ({ approved: false, deferred: true }),
                        execute: async (args: any) => {
                            toolExecuted = true;
                            return `executed:${args.target}`;
                        },
                    },
                },
            });

            const interrupted = await agent.runResumableWithThread({
                threadId: 'thread-deferred',
                prompt: 'Do the dangerous thing',
            });

            expect(interrupted.interrupted).toBe(true);
            expect(interrupted.pendingApproval?.toolCalls).toHaveLength(1);
            expect(toolExecuted).toBe(false);

            const resumed = await agent.resumeThread({
                threadId: 'thread-deferred',
                approvalDecision: true,
            });

            expect(resumed.interrupted).toBe(false);
            expect(resumed.text).toBe('All done after approval');
            expect(toolExecuted).toBe(true);

            const replayed = await agent.replayThread({ threadId: 'thread-deferred' });
            expect(replayed.some(message =>
                message.role === 'tool' && String(message.content).includes('executed:prod')
            )).toBe(true);
        });

        it('supports resumable runs with a checkpointer-backed sessionStore', async () => {
            const client = createSequentialStreamClient([
                {
                    tool_calls: [
                        {
                            id: 'call_deferred_session',
                            type: 'function',
                            function: { name: 'needsApproval', arguments: '{}' },
                        },
                    ],
                    finishReason: 'tool_calls',
                },
                {
                    content: 'Completed from backed session store',
                    finishReason: 'stop',
                },
            ]);
            const sessionStore = new CheckpointerSessionStore(new MemoryCheckpointer());

            const agent = createAgent({
                client,
                model: 'test-model',
                sessionStore,
                tools: {
                    needsApproval: {
                        requiresApproval: true,
                        approvalHandler: async () => ({ approved: false, deferred: true }),
                        execute: async () => 'ok',
                    },
                },
            });

            const interrupted = await agent.runResumableWithThread({
                threadId: 'thread-backed-store',
                prompt: 'Need approval',
            });

            expect(interrupted.interrupted).toBe(true);

            const loaded = await agent.loadThread({ threadId: 'thread-backed-store' });
            expect(loaded?.checkpoint?.metadata.status).toBe('pending_approval');

            const resumed = await agent.resumeThread({
                threadId: 'thread-backed-store',
                approvalDecision: true,
            });

            expect(resumed.interrupted).toBe(false);
            expect((await agent.loadThread({ threadId: 'thread-backed-store' }))?.checkpoint?.metadata.status).toBe('completed');
        });

        it('rejects resumable runs for non-checkpointer session stores', async () => {
            const client = createMockClient();
            const sessionStore = new MemorySessionStore();
            const agent = createAgent({
                client,
                model: 'test-model',
                sessionStore,
            });

            await expect(agent.runResumableWithThread({
                threadId: 'thread-memory-store',
                prompt: 'Hello',
            })).rejects.toThrow('runResumableWithThread requires a checkpointer or checkpointer-backed sessionStore');
        });
    });
});
