import { describe, it, expect, vi } from 'vitest';
import type { MCPHostProvider, RegisteredTool, MCPResource, MCPPrompt } from '../../src/lib/mcp-host-types';

// ============================================================================
// Mock host with resources + prompts
// ============================================================================

function createFullMockHost(): MCPHostProvider & { _triggerToolsChanged: (tools: RegisteredTool[]) => void } {
    let callback: ((tools: RegisteredTool[]) => void) | null = null;
    let tools: RegisteredTool[] = [];

    return {
        async connect() { },
        getTools() { return tools; },
        onToolsChanged(cb) {
            callback = cb;
            return () => { callback = null; };
        },
        async listResources() {
            return [
                { uri: 'file:///docs/readme.md', name: 'README', serverName: 'fs-server' },
                { uri: 'pgmq://messages', name: 'message_queue', serverName: 'db-server', mimeType: 'application/json' },
            ] as MCPResource[];
        },
        async readResource(_server: string, uri: string) {
            if (uri === 'file:///docs/readme.md') return '# Hello World';
            throw new Error(`Resource not found: ${uri}`);
        },
        async listPrompts() {
            return [
                { name: 'summarize', description: 'Summarize text', serverName: 'prompt-server', arguments: [{ name: 'text', required: true }] },
            ] as MCPPrompt[];
        },
        async getPrompt(_server: string, name: string, args?: Record<string, string>) {
            if (name === 'summarize') return `Please summarize: ${args?.text ?? ''}`;
            throw new Error(`Prompt not found: ${name}`);
        },
        async dispose() { },
        _triggerToolsChanged(newTools: RegisteredTool[]) {
            tools = newTools;
            callback?.(newTools);
        },
    };
}

// ============================================================================
// Meta-tools tests
// ============================================================================

describe('MCP meta-tools', () => {
    it('agent with hostProvider can list resources', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const host = createFullMockHost();

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            hostProvider: host,
        });

        await agent.connectHost?.();

        // The hostProvider should expose resources via its interface
        const resources = await host.listResources!();
        expect(resources).toHaveLength(2);
        expect(resources[0].name).toBe('README');
    });

    it('agent with hostProvider can read a resource', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const host = createFullMockHost();

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            hostProvider: host,
        });

        await agent.connectHost?.();

        const content = await host.readResource!('fs-server', 'file:///docs/readme.md');
        expect(content).toBe('# Hello World');
    });

    it('agent with hostProvider can list prompts', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const host = createFullMockHost();

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            hostProvider: host,
        });

        await agent.connectHost?.();

        const prompts = await host.listPrompts!();
        expect(prompts).toHaveLength(1);
        expect(prompts[0].name).toBe('summarize');
    });

    it('agent with hostProvider can get a prompt', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const host = createFullMockHost();

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            hostProvider: host,
        });

        await agent.connectHost?.();

        const prompt = await host.getPrompt!('prompt-server', 'summarize', { text: 'hello world' });
        expect(prompt).toContain('hello world');
    });
});

// ============================================================================
// Hot update + reconnect tests
// ============================================================================

describe('MCP hot update', () => {
    it('onToolsChanged triggers _tools refresh', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const host = createFullMockHost();

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            hostProvider: host,
        });

        await agent.connectHost?.();
        // Meta-tools are registered (mcp_list_resources, mcp_read_resource, mcp_list_prompts, mcp_get_prompt)
        const metaToolCount = 4;
        expect(Object.keys(agent._tools)).toHaveLength(metaToolCount);
        expect('mcp_list_resources' in agent._tools).toBe(true);

        // Simulate tool arrival
        host._triggerToolsChanged([{
            name: 'new_tool',
            description: 'arrived dynamically',
            execute: async () => 'dynamic result',
            source: { type: 'mcp' as const, namespace: 'mcp:test' },
        }]);

        expect('new_tool' in agent._tools).toBe(true);
        expect(Object.keys(agent._tools)).toHaveLength(metaToolCount + 1);
    });

    it('tool removal is reflected in _tools', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const host = createFullMockHost();

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            hostProvider: host,
        });

        await agent.connectHost?.();

        // Add two tools
        host._triggerToolsChanged([
            { name: 't1', execute: async () => '1', source: { type: 'mcp' as const, namespace: 'mcp:test' } },
            { name: 't2', execute: async () => '2', source: { type: 'mcp' as const, namespace: 'mcp:test' } },
        ]);
        const metaToolCount = 4;
        expect(Object.keys(agent._tools)).toHaveLength(metaToolCount + 2);

        // Remove one
        host._triggerToolsChanged([
            { name: 't1', execute: async () => '1', source: { type: 'mcp' as const, namespace: 'mcp:test' } },
        ]);
        expect(Object.keys(agent._tools)).toHaveLength(metaToolCount + 1);
        expect('t2' in agent._tools).toBe(false);
    });

    it('user tools take priority over MCP tools with same name', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const host = createFullMockHost();

        const userExecute = vi.fn(async () => 'user-result');
        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            tools: { search: { execute: userExecute } },
            hostProvider: host,
        });

        await agent.connectHost?.();

        // MCP tool with same name
        host._triggerToolsChanged([{
            name: 'search',
            execute: async () => 'mcp-result',
            source: { type: 'mcp' as const, namespace: 'mcp:test' },
        }]);

        // User tool should win
        const result = await agent._tools.search.execute!({}, {} as any);
        expect(result).toBe('user-result');
    });

    it('dispose unsubscribes from tool changes', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const host = createFullMockHost();

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            hostProvider: host,
        });

        await agent.connectHost?.();

        host._triggerToolsChanged([{
            name: 'tool_before_dispose',
            execute: async () => 'r',
            source: { type: 'mcp' as const, namespace: 'mcp:test' },
        }]);
        expect('tool_before_dispose' in agent._tools).toBe(true);

        await agent.dispose?.();

        // After dispose, _tools should be empty (MCP tools cleared)
        expect(Object.keys(agent._tools)).toHaveLength(0);
    });
});
