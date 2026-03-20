import { describe, expect, it, vi } from 'vitest';
import { createAgent } from '../../src/ai/create-agent';
import { MemoryCheckpointer } from '../../src/ai/graph';
import { CheckpointerSessionStore } from '../../src/ai/session-store';
import type { QiniuAI } from '../../src/client';
import type { MCPHostProvider } from '../../src/lib/mcp-host-types';
import type { RegisteredTool } from '../../src/lib/tool-registry';

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

function createHostProvider(): MCPHostProvider & { connect: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; getTools: ReturnType<typeof vi.fn>; onToolsChanged: ReturnType<typeof vi.fn> } {
    const hostTools: RegisteredTool[] = [
        {
            name: 'hostNow',
            description: 'Return the current timestamp',
            parameters: { type: 'object', properties: {} },
            source: { type: 'mcp', namespace: 'runtime-smoke' },
            execute: async () => '2026-03-20T00:00:00.000Z',
        },
    ];

    return {
        connect: vi.fn().mockResolvedValue(undefined),
        getTools: vi.fn().mockReturnValue(hostTools),
        onToolsChanged: vi.fn().mockReturnValue(() => undefined),
        dispose: vi.fn().mockResolvedValue(undefined),
    };
}

describe('runtime story smoke', () => {
    it('covers the mainline createAgent story with session, approval resume, and MCP host composition', async () => {
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
        const sessionStore = new CheckpointerSessionStore(new MemoryCheckpointer());
        const hostProvider = createHostProvider();
        let toolExecuted = false;

        const agent = createAgent({
            client,
            model: 'test-model',
            sessionStore,
            hostProvider,
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
                        toolExecuted = true;
                        return `executed:${args.target}`;
                    },
                },
            },
        });

        const interrupted = await agent.runResumableWithThread({
            threadId: 'runtime-story',
            prompt: 'Do the dangerous thing',
        });

        expect(hostProvider.connect).toHaveBeenCalledTimes(1);
        expect(hostProvider.getTools).toHaveBeenCalledTimes(1);
        expect(interrupted.interrupted).toBe(true);
        expect(interrupted.pendingApproval?.toolCalls).toHaveLength(1);
        expect(toolExecuted).toBe(false);
        expect(agent._tools.hostNow).toBeDefined();

        await expect(agent.loadThread({ threadId: 'runtime-story' })).resolves.toMatchObject({
            source: 'checkpointer',
            restoreMode: 'resumable',
            checkpointStatus: 'pending_approval',
        });

        const resumed = await agent.resumeThread({
            threadId: 'runtime-story',
            approvalDecision: true,
        });

        expect(resumed.interrupted).toBe(false);
        expect(resumed.text).toBe('All done after approval');
        expect(toolExecuted).toBe(true);

        await expect(agent.loadThread({ threadId: 'runtime-story' })).resolves.toMatchObject({
            source: 'checkpointer',
            restoreMode: 'checkpoint',
            checkpointStatus: 'completed',
        });

        await agent.dispose();
        expect(hostProvider.dispose).toHaveBeenCalledTimes(1);
    });
});
