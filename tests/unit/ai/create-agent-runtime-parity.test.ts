import { describe, expect, it, vi } from 'vitest';
import { createAgent } from '../../../src/ai/create-agent';
import type { Checkpointer } from '../../../src/ai/graph/checkpointer';
import type { LanguageModelClient } from '../../../src/core/client';
import type { MCPHostProvider } from '../../../src/lib/mcp-host-types';
import type { RegisteredTool } from '../../../src/lib/tool-registry';

function createMockClient(text = 'Hello from agent'): LanguageModelClient {
    return {
        chat: {
            create: vi.fn().mockResolvedValue({
                choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
            }),
            async *createStream() {
                yield {
                    choices: [{ index: 0, delta: { content: text } }],
                };
                return {
                    content: text,
                    reasoningContent: '',
                    toolCalls: [],
                    finishReason: 'stop',
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
                };
            },
        },
        getBaseUrl: () => 'https://api.example.com/v1',
    };
}

function createMockCheckpointer(): Checkpointer {
    return {
        save: vi.fn().mockResolvedValue({ id: 'ckpt_1', threadId: 'thread-1', createdAt: Date.now(), stepCount: 1 }),
        load: vi.fn().mockResolvedValue(null),
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(true),
        clear: vi.fn().mockResolvedValue(0),
    };
}

function createMockTool(name: string): RegisteredTool {
    return {
        name,
        description: `Tool ${name}`,
        parameters: { type: 'object', properties: {} },
        execute: async () => 'ok',
        source: { type: 'mcp', namespace: 'mcp:test' },
    };
}

function createMockHost(toolName = 'mcp_search'): {
    host: MCPHostProvider;
    connectSpy: ReturnType<typeof vi.fn>;
} {
    let connected = false;
    const connectSpy = vi.fn(async () => {
        connected = true;
    });

    const host: MCPHostProvider = {
        connect: connectSpy,
        getTools: () => connected ? [createMockTool(toolName)] : [],
        onToolsChanged: () => () => { },
        dispose: vi.fn(async () => {
            connected = false;
        }),
    };

    return { host, connectSpy };
}

describe('createAgent runtime parity', () => {
    it('lazy-connects MCP host for run and reuses the connection for stream', async () => {
        const client = createMockClient();
        const { host, connectSpy } = createMockHost();
        const agent = createAgent({
            client,
            model: 'test-model',
            hostProvider: host,
        });

        const runResult = await agent.run({ prompt: 'hello' });
        const streamResult = await agent.stream({ prompt: 'hello again' });

        expect(runResult.text).toBe('Hello from agent');
        expect(await streamResult.text).toBe('Hello from agent');
        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(agent._tools.mcp_search).toBeDefined();
    });

    it('lazy-connects MCP host for runWithThread and streamWithThread with the same semantics', async () => {
        const client = createMockClient('Threaded reply');
        const checkpointer = createMockCheckpointer();
        const { host, connectSpy } = createMockHost('thread_tool');
        const agent = createAgent({
            client,
            model: 'test-model',
            checkpointer,
            hostProvider: host,
        });

        const runResult = await agent.runWithThread({
            threadId: 'thread-1',
            prompt: 'hello',
        });
        const streamResult = await agent.streamWithThread({
            threadId: 'thread-1',
            prompt: 'continue',
        });

        expect(runResult.text).toBe('Threaded reply');
        expect(await streamResult.text).toBe('Threaded reply');
        expect(connectSpy).toHaveBeenCalledTimes(1);
        expect(agent._tools.thread_tool).toBeDefined();
    });
});
