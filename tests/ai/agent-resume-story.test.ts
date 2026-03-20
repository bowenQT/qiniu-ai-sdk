import { describe, expect, it, vi } from 'vitest';
import { createAgent } from '../../src/ai/create-agent';
import { MemoryCheckpointer } from '../../src/ai/graph';
import { CheckpointerSessionStore } from '../../src/ai/session-store';
import type { QiniuAI } from '../../src/client';

const createSequentialStreamClient = (
    responses: Array<{
        content?: string;
        tool_calls?: any[];
        finishReason?: string;
    }>,
): QiniuAI => {
    let callIndex = 0;

    return {
        chat: {
            create: vi.fn(),
            createStream: vi.fn(async function* (_request: any) {
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
    } as unknown as QiniuAI;
};

describe('createAgent resumable restart story', () => {
    it('resumes a pending-approval thread after rebuilding the agent from the same checkpointer-backed session store', async () => {
        const threadId = 'restartable-runtime-story';
        const checkpointer = new MemoryCheckpointer();
        const executions: string[] = [];

        const firstAgent = createAgent({
            client: createSequentialStreamClient([
                {
                    tool_calls: [
                        {
                            id: 'call_deferred_restart',
                            type: 'function',
                            function: { name: 'dangerousTool', arguments: '{"target":"prod"}' },
                        },
                    ],
                    finishReason: 'tool_calls',
                },
            ]),
            model: 'test-model',
            sessionStore: new CheckpointerSessionStore(checkpointer),
            tools: {
                dangerousTool: {
                    description: 'Execute a dangerous task',
                    parameters: {
                        type: 'object',
                        properties: {
                            target: { type: 'string' },
                        },
                        required: ['target'],
                    },
                    requiresApproval: true,
                    approvalHandler: async () => ({ approved: false, deferred: true }),
                    execute: async (args: any) => {
                        executions.push(`executed:${args.target}`);
                        return `executed:${args.target}`;
                    },
                },
            },
        });

        const interrupted = await firstAgent.runResumableWithThread({
            threadId,
            prompt: 'Deploy to prod',
        });

        expect(interrupted.interrupted).toBe(true);
        expect(interrupted.pendingApproval?.toolCalls).toHaveLength(1);
        expect(executions).toEqual([]);
        await expect(firstAgent.loadThread({ threadId })).resolves.toMatchObject({
            source: 'checkpointer',
            restoreMode: 'resumable',
            checkpointStatus: 'pending_approval',
        });

        await firstAgent.dispose();

        const resumedAgent = createAgent({
            client: createSequentialStreamClient([
                {
                    content: 'Deployment completed after approval',
                    finishReason: 'stop',
                },
            ]),
            model: 'test-model',
            sessionStore: new CheckpointerSessionStore(checkpointer),
            tools: {
                dangerousTool: {
                    description: 'Execute a dangerous task',
                    parameters: {
                        type: 'object',
                        properties: {
                            target: { type: 'string' },
                        },
                        required: ['target'],
                    },
                    requiresApproval: true,
                    approvalHandler: async () => ({ approved: false, deferred: true }),
                    execute: async (args: any) => {
                        executions.push(`executed:${args.target}`);
                        return `executed:${args.target}`;
                    },
                },
            },
        });

        await expect(resumedAgent.loadThread({ threadId })).resolves.toMatchObject({
            source: 'checkpointer',
            restoreMode: 'resumable',
            checkpointStatus: 'pending_approval',
        });

        const resumed = await resumedAgent.resumeThread({
            threadId,
            approvalDecision: true,
        });

        expect(resumed.interrupted).toBe(false);
        expect(resumed.text).toBe('Deployment completed after approval');
        expect(executions).toEqual(['executed:prod']);

        await expect(resumedAgent.loadThread({ threadId })).resolves.toMatchObject({
            source: 'checkpointer',
            restoreMode: 'checkpoint',
            checkpointStatus: 'completed',
        });

        const replayed = await resumedAgent.replayThread({ threadId });
        expect(replayed.some(message =>
            message.role === 'tool' && String(message.content).includes('executed:prod')
        )).toBe(true);

        await resumedAgent.dispose();

        const restartedAgent = createAgent({
            client: createSequentialStreamClient([{ content: 'unused after replay' }]),
            model: 'test-model',
            sessionStore: new CheckpointerSessionStore(checkpointer),
        });

        await expect(restartedAgent.loadThread({ threadId })).resolves.toMatchObject({
            source: 'checkpointer',
            restoreMode: 'checkpoint',
            checkpointStatus: 'completed',
            checkpoint: {
                state: {
                    output: 'Deployment completed after approval',
                },
            },
        });

        const replayAfterRestart = await restartedAgent.replayThread({ threadId });
        expect(replayAfterRestart.some(message =>
            message.role === 'tool' && String(message.content).includes('executed:prod')
        )).toBe(true);

        await restartedAgent.dispose();
    });
});
