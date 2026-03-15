/**
 * Tests for createAgent module.
 */

import { describe, it, expect, vi } from 'vitest';
import { createAgent } from '../../../src/ai/create-agent';
import { MemorySessionStore } from '../../../src/ai/session-store';
import type { QiniuAI } from '../../../src/client';
import type { Checkpointer } from '../../../src/ai/graph/checkpointer';

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
});
