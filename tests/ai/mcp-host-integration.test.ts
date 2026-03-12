import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MCPHostProvider, RegisteredTool } from '../../src/lib/mcp-host-types';
import type { Tool } from '../../src/ai/generate-text';

// ============================================================================
// MCPHostProvider interface tests (via mock implementation)
// ============================================================================

/** Minimal mock implementation for interface testing */
function createMockHost(mockTools: RegisteredTool[] = []): MCPHostProvider {
    let toolsChangedCb: ((tools: RegisteredTool[]) => void) | null = null;
    let connected = false;

    return {
        async connect() { connected = true; },
        getTools() { return connected ? mockTools : []; },
        onToolsChanged(cb) {
            toolsChangedCb = cb;
            return () => { toolsChangedCb = null; };
        },
        dispose: async () => { connected = false; },
        // Test helper
        _triggerToolsChanged(tools: RegisteredTool[]) {
            mockTools = tools;
            toolsChangedCb?.(tools);
        },
    } as MCPHostProvider & { _triggerToolsChanged: (tools: RegisteredTool[]) => void };
}

function createMockTool(name: string): RegisteredTool {
    return {
        name,
        description: `Mock tool: ${name}`,
        parameters: { type: 'object', properties: {} },
        execute: async () => `result from ${name}`,
        source: { type: 'mcp' as const, namespace: 'mcp:test-server' },
    };
}

describe('MCPHostProvider interface', () => {
    it('exports MCPHostProvider type', async () => {
        const types = await import('../../src/lib/mcp-host-types');
        expect(types).toBeDefined();
    });
});

// ============================================================================
// Agent with hostProvider DI tests
// ============================================================================

describe('createAgent with hostProvider', () => {
    it('accepts hostProvider in config', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const host = createMockHost([createMockTool('search')]);

        // Should not throw — hostProvider is an optional field
        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            hostProvider: host,
        });

        expect(agent).toBeDefined();
        expect(agent.id).toBeDefined();
    });

    it('includes MCP tools in _tools after connect', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const host = createMockHost([createMockTool('mcp_search')]);

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            tools: { localTool: { execute: async () => 'local' } },
            hostProvider: host,
        });

        // Before connect: only local tools
        expect('mcp_search' in agent._tools).toBe(false);
        expect('localTool' in agent._tools).toBe(true);

        // Connect the host
        await agent.connectHost?.();

        // After connect: both local and MCP tools
        expect('mcp_search' in agent._tools).toBe(true);
        expect('localTool' in agent._tools).toBe(true);
    });

    it('_tools updates dynamically when MCP tools change', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const host = createMockHost([createMockTool('tool_a')]) as MCPHostProvider & { _triggerToolsChanged: (tools: RegisteredTool[]) => void };

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            hostProvider: host,
        });

        await agent.connectHost?.();
        expect('tool_a' in agent._tools).toBe(true);

        // Simulate hot update
        host._triggerToolsChanged([
            createMockTool('tool_a'),
            createMockTool('tool_b'),
        ]);

        expect('tool_b' in agent._tools).toBe(true);
    });

    it('dispose() disconnects the host', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const host = createMockHost([]);

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            hostProvider: host,
        });

        await agent.connectHost?.();
        await agent.dispose?.();

        // After dispose, host should be disconnected; getTools returns empty
        expect(host.getTools()).toEqual([]);
    });
});

// ============================================================================
// AgentExpert lazy lookup tests
// ============================================================================

describe('AgentExpert with dynamic tools', () => {
    it('tools getter reflects current agent._tools', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const { AgentExpert } = await import('../../src/ai/a2a/expert');
        const host = createMockHost([createMockTool('mcp_tool')]) as MCPHostProvider & { _triggerToolsChanged: (tools: RegisteredTool[]) => void };

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            tools: { localTool: { execute: async () => 'local' } },
            hostProvider: host,
        });

        await agent.connectHost?.();

        const expert = AgentExpert.from(agent, { expose: '*' });

        // Should see both local and MCP tools
        const toolNames = Object.keys(expert.tools);
        expect(toolNames.some(n => n.includes('localTool'))).toBe(true);
        expect(toolNames.some(n => n.includes('mcp_tool'))).toBe(true);
    });

    it('expose: "*" dynamically picks up new MCP tools', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const { AgentExpert } = await import('../../src/ai/a2a/expert');
        const host = createMockHost([createMockTool('tool_a')]) as MCPHostProvider & { _triggerToolsChanged: (tools: RegisteredTool[]) => void };

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            hostProvider: host,
        });

        await agent.connectHost?.();

        const expert = AgentExpert.from(agent, { expose: '*' });

        // Initially: tool_a only
        expect(Object.keys(expert.tools).some(n => n.includes('tool_b'))).toBe(false);

        // Hot update
        host._triggerToolsChanged([createMockTool('tool_a'), createMockTool('tool_b')]);

        // Now: both visible via getter
        expect(Object.keys(expert.tools).some(n => n.includes('tool_b'))).toBe(true);
    });

    it('expose: string[] restricts to whitelist even after update', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const { AgentExpert } = await import('../../src/ai/a2a/expert');
        const host = createMockHost([createMockTool('allowed'), createMockTool('forbidden')]) as MCPHostProvider & { _triggerToolsChanged: (tools: RegisteredTool[]) => void };

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            hostProvider: host,
        });

        await agent.connectHost?.();

        const expert = AgentExpert.from(agent, { expose: ['allowed'] });

        // Only 'allowed' should be visible
        const toolNames = Object.keys(expert.tools);
        expect(toolNames.some(n => n.includes('allowed'))).toBe(true);
        expect(toolNames.some(n => n.includes('forbidden'))).toBe(false);
    });

    it('callTool with lazy lookup calls current agent._tools', async () => {
        const { createAgent } = await import('../../src/ai/create-agent');
        const { AgentExpert } = await import('../../src/ai/a2a/expert');
        const host = createMockHost([createMockTool('dynamic_tool')]) as MCPHostProvider & { _triggerToolsChanged: (tools: RegisteredTool[]) => void };

        const agent = createAgent({
            client: {} as any,
            model: 'test-model',
            hostProvider: host,
        });

        await agent.connectHost?.();

        const expert = AgentExpert.from(agent, { expose: '*' });

        const result = await expert.callTool({
            tool: 'dynamic_tool',
            args: {},
        });

        expect(result.type).toBe('response');
    });
});
