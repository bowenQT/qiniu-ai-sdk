import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock MCP SDK modules to avoid requiring actual MCP dependencies in tests
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: class MockStdio { },
}));

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
    Server: class MockServer {
        setRequestHandler() { }
        connect() { return Promise.resolve(); }
        close() { return Promise.resolve(); }
    },
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
    ListToolsRequestSchema: {},
    CallToolRequestSchema: {},
}));

// Import after mocks are set up
import { QiniuMCPServer, type DynamicTool } from '../../../src/modules/mcp/server';

describe('QiniuMCPServer - Dynamic Tool Registration', () => {
    let server: QiniuMCPServer;

    beforeEach(() => {
        server = new QiniuMCPServer({ apiKey: 'test-key' });
    });

    describe('registerTool', () => {
        it('should register a dynamic tool', () => {
            const tool: DynamicTool = {
                name: 'custom_tool',
                description: 'A custom tool',
                inputSchema: { type: 'object' },
                execute: async () => ({ success: true }),
            };

            server.registerTool(tool);
            expect(server.getDynamicToolNames()).toContain('custom_tool');
        });

        it('should throw on conflict by default', () => {
            const tool: DynamicTool = {
                name: 'my_tool',
                description: 'First tool',
                inputSchema: { type: 'object' },
                execute: async () => ({}),
            };

            server.registerTool(tool);
            expect(() => server.registerTool(tool)).toThrow('already registered');
        });

        it('should replace on conflict when onConflict is "replace"', () => {
            const tool1: DynamicTool = {
                name: 'my_tool',
                description: 'First version',
                inputSchema: { type: 'object' },
                execute: async () => ({ v: 1 }),
            };

            const tool2: DynamicTool = {
                name: 'my_tool',
                description: 'Second version',
                inputSchema: { type: 'object' },
                execute: async () => ({ v: 2 }),
            };

            server.registerTool(tool1);
            server.registerTool(tool2, { onConflict: 'replace' });

            expect(server.getDynamicToolNames()).toContain('my_tool');
            expect(server.getDynamicToolNames().length).toBe(1);
        });

        it('should throw when conflicting with built-in tool', () => {
            const tool: DynamicTool = {
                name: 'qiniu_chat', // Built-in tool name
                description: 'Trying to override',
                inputSchema: { type: 'object' },
                execute: async () => ({}),
            };

            expect(() => server.registerTool(tool)).toThrow('conflicts with built-in');
        });
    });

    describe('unregisterTool', () => {
        it('should remove a registered tool', () => {
            const tool: DynamicTool = {
                name: 'temp_tool',
                description: 'Temporary',
                inputSchema: { type: 'object' },
                execute: async () => ({}),
            };

            server.registerTool(tool);
            expect(server.getDynamicToolNames()).toContain('temp_tool');

            const removed = server.unregisterTool('temp_tool');
            expect(removed).toBe(true);
            expect(server.getDynamicToolNames()).not.toContain('temp_tool');
        });

        it('should return false for non-existent tool', () => {
            const removed = server.unregisterTool('non_existent');
            expect(removed).toBe(false);
        });
    });

    describe('getDynamicToolNames', () => {
        it('should return empty array initially', () => {
            expect(server.getDynamicToolNames()).toEqual([]);
        });

        it('should return all registered tool names', () => {
            server.registerTool({
                name: 'tool_a',
                description: 'A',
                inputSchema: { type: 'object' },
                execute: async () => ({}),
            });
            server.registerTool({
                name: 'tool_b',
                description: 'B',
                inputSchema: { type: 'object' },
                execute: async () => ({}),
            });

            const names = server.getDynamicToolNames();
            expect(names).toHaveLength(2);
            expect(names).toContain('tool_a');
            expect(names).toContain('tool_b');
        });
    });
});
