/**
 * Phase 3A tests:
 * - 3.2 MCP Tool Policy (timeout, maxOutputLength, requiresApproval)
 * - 3.3 SkillLoader → SkillValidator unification
 * - 3.4 denySources in tool-approval
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// 3.2 MCP Tool Policy
// ============================================================================

// Mock SDK Client
const mockClientInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
        tools: [
            {
                name: 'slow-tool',
                description: 'A slow tool',
                inputSchema: { type: 'object', properties: {} },
            },
        ],
    }),
    callTool: vi.fn(),
    listResources: vi.fn().mockResolvedValue({ resources: [] }),
    listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
    setNotificationHandler: vi.fn(),
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
    const MockClient = vi.fn().mockImplementation(function (this: any) {
        Object.assign(this, mockClientInstance);
    });
    return { Client: MockClient };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
    StdioClientTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
    StreamableHTTPClientTransport: vi.fn(),
}));

describe('3.2 MCP Tool Policy', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('MCPToolPolicy type is exported from mcp-host-types', async () => {
        const types = await import('../../src/lib/mcp-host-types');
        // MCPToolPolicy should be a type — just verify the module compiles
        expect(types).toBeDefined();
    });

    it('NodeMCPHostConfig accepts toolPolicy per server', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');

        const host = new NodeMCPHost({
            servers: [
                {
                    name: 'test-srv',
                    transport: 'stdio',
                    command: 'echo',
                    toolPolicy: {
                        timeout: 5000,
                        maxOutputLength: 100,
                        requiresApproval: true,
                    },
                },
            ],
        });

        expect(host).toBeDefined();
    });

    it('tools registered with requiresApproval from policy', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');

        const host = new NodeMCPHost({
            servers: [
                {
                    name: 'approved-srv',
                    transport: 'stdio',
                    command: 'echo',
                    toolPolicy: { requiresApproval: true },
                },
            ],
        });

        await host.connect();
        const tools = host.getTools();
        expect(tools[0].requiresApproval).toBe(true);
    });

    it('SDK RequestOptions.timeout is passed to callTool', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');
        mockClientInstance.callTool.mockResolvedValue({
            content: [{ type: 'text', text: 'ok' }],
        });

        const host = new NodeMCPHost({
            servers: [
                {
                    name: 'timeout-srv',
                    transport: 'stdio',
                    command: 'echo',
                    toolPolicy: { timeout: 5000 },
                },
            ],
        });

        await host.connect();
        const tools = host.getTools();
        await tools[0].execute!({ query: 'test' }, {} as any);

        // Verify callTool was called with RequestOptions containing timeout
        expect(mockClientInstance.callTool).toHaveBeenCalledWith(
            { name: 'slow-tool', arguments: { query: 'test' } },
            undefined,
            expect.objectContaining({ timeout: 5000 }),
        );
    });

    it('output truncated to maxOutputLength', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');
        const longText = 'A'.repeat(200);
        mockClientInstance.callTool.mockResolvedValue({
            content: [{ type: 'text', text: longText }],
        });

        const host = new NodeMCPHost({
            servers: [
                {
                    name: 'truncate-srv',
                    transport: 'stdio',
                    command: 'echo',
                    toolPolicy: { maxOutputLength: 50 },
                },
            ],
        });

        await host.connect();
        const tools = host.getTools();
        const result = (await tools[0].execute!({}, {} as any)) as string;

        expect(result.length).toBeLessThanOrEqual(100); // 50 + truncation message
        expect(result).toContain('[TRUNCATED');
    });

    it('default policy uses 30s timeout, 1M maxOutputLength, no approval', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');
        mockClientInstance.callTool.mockResolvedValue({
            content: [{ type: 'text', text: 'ok' }],
        });

        const host = new NodeMCPHost({
            servers: [
                { name: 'default-srv', transport: 'stdio', command: 'echo' },
            ],
        });

        await host.connect();
        const tools = host.getTools();
        expect(tools[0].requiresApproval).toBeFalsy();

        await tools[0].execute!({}, {} as any);
        expect(mockClientInstance.callTool).toHaveBeenCalledWith(
            expect.anything(),
            undefined,
            expect.objectContaining({ timeout: 30000 }),
        );
    });
});

// ============================================================================
// 3.3 SkillLoader → SkillValidator unification
// ============================================================================
describe('3.3 SkillLoader uses SkillValidator.isWithinRoot', () => {
    it('SkillLoader should not have its own isWithinRoot implementation', async () => {
        const { SkillLoader } = await import('../../src/node/skills/loader');
        // SkillLoader should delegate to SkillValidator, not have its own private method
        // We verify by checking prototype — the private method should not exist as own method
        const proto = SkillLoader.prototype;
        const ownMethods = Object.getOwnPropertyNames(proto);
        // After unification, isWithinRoot should NOT be on SkillLoader
        expect(ownMethods).not.toContain('isWithinRoot');
    });
});

// ============================================================================
// 3.4 denySources
// ============================================================================
describe('3.4 denySources in ApprovalConfig', () => {
    it('denySources blocks tool execution even if autoApproved', async () => {
        const { checkApproval } = await import('../../src/ai/tool-approval');

        const tool = {
            name: 'dangerous-tool',
            source: { type: 'mcp' as const, namespace: 'evil-server' },
            requiresApproval: true,
        };

        const toolCall = {
            id: 'call-1',
            function: { name: 'dangerous-tool', arguments: '{}' },
        };

        const result = await checkApproval(
            tool,
            toolCall,
            {},
            [],
            {
                autoApproveSources: ['mcp'],  // Would auto-approve all MCP
                denySources: ['mcp:evil-server'],  // But deny this specific one
            },
        );

        expect(result.approved).toBe(false);
    });

    it('denySources supports type-level deny', async () => {
        const { checkApproval } = await import('../../src/ai/tool-approval');

        const tool = {
            name: 'any-mcp-tool',
            source: { type: 'mcp' as const, namespace: 'any' },
            requiresApproval: true,
        };

        const toolCall = {
            id: 'call-2',
            function: { name: 'any-mcp-tool', arguments: '{}' },
        };

        const result = await checkApproval(
            tool,
            toolCall,
            {},
            [],
            { denySources: ['mcp'] },
        );

        expect(result.approved).toBe(false);
    });

    it('denySources has priority over autoApproveSources', async () => {
        const { checkApproval } = await import('../../src/ai/tool-approval');

        const tool = {
            name: 'mixed-tool',
            source: { type: 'mcp' as const, namespace: 'github' },
            requiresApproval: true,
        };

        const toolCall = {
            id: 'call-3',
            function: { name: 'mixed-tool', arguments: '{}' },
        };

        // deny and autoApprove both match — deny wins
        const result = await checkApproval(
            tool,
            toolCall,
            {},
            [],
            {
                autoApproveSources: ['mcp:github'],
                denySources: ['mcp:github'],
            },
        );

        expect(result.approved).toBe(false);
    });

    it('tools not matching denySources proceed normally', async () => {
        const { checkApproval } = await import('../../src/ai/tool-approval');

        const tool = {
            name: 'safe-tool',
            source: { type: 'builtin' as const, namespace: 'core' },
            requiresApproval: true,
        };

        const toolCall = {
            id: 'call-4',
            function: { name: 'safe-tool', arguments: '{}' },
        };

        const result = await checkApproval(
            tool,
            toolCall,
            {},
            [],
            {
                autoApproveSources: ['builtin'],
                denySources: ['mcp:evil'],
            },
        );

        // builtin:core is auto-approved and not denied
        expect(result.approved).toBe(true);
    });
});
