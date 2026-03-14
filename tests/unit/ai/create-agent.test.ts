/**
 * Tests for createAgent module.
 */

import { describe, it, expect, vi } from 'vitest';
import { createAgent } from '../../../src/ai/create-agent';
import { MemorySessionStore } from '../../../src/ai/session-store';
import type { QiniuAI } from '../../../src/client';
import type { Checkpointer } from '../../../src/ai/graph/checkpointer';

// Mock client
const createMockClient = (): QiniuAI => ({
    chat: {
        create: vi.fn().mockResolvedValue({
            choices: [{ message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        createStream: vi.fn(async function* () {
            yield {
                choices: [{ index: 0, delta: { content: 'Hello!' }, finish_reason: 'stop' }],
            };
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
} as unknown as QiniuAI);

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
