import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { MCPClient, MCPClientError } from '../../../src/modules/mcp/client';
import { adaptMCPToolsToRegistry } from '../../../src/modules/mcp/adapter';
import { noopLogger } from '../../../src/lib/logger';

describe('MCPClient', () => {
    let client: MCPClient;
    const mockServerPath = path.join(__dirname, '../../mocks/mcp-server.ts');

    beforeEach(() => {
        client = new MCPClient({
            servers: [
                {
                    name: 'mock-server',
                    transport: 'stdio',
                    command: 'npx',
                    args: ['tsx', mockServerPath],
                },
            ],
            connectionTimeout: 10000,
        }, noopLogger);
    });

    afterEach(async () => {
        await client.disconnect();
    });

    describe('C1: Transport Minimal Implementation', () => {
        it('should connect to mock server via stdio', async () => {
            await client.connect();
            expect(client.getState('mock-server')).toBe('connected');
        });

        it('should handle connection timeout', async () => {
            const badClient = new MCPClient({
                servers: [
                    {
                        name: 'bad-server',
                        transport: 'stdio',
                        command: 'node',
                        args: ['-e', 'setTimeout(() => {}, 60000)'], // Never responds
                    },
                ],
                connectionTimeout: 500,
            }, noopLogger);

            await expect(badClient.connect()).rejects.toThrow('timeout');
            await badClient.disconnect();
        });

        it('should disconnect properly', async () => {
            await client.connect();
            await client.disconnect();
            expect(client.getState('mock-server')).toBe('disconnected');
        });
    });

    describe('C2: Bearer Token', () => {
        it('should accept token configuration', () => {
            const clientWithToken = new MCPClient({
                servers: [
                    {
                        name: 'auth-server',
                        transport: 'stdio',
                        command: 'echo',
                        args: ['test'],
                        token: 'secret-token',
                    },
                ],
            }, noopLogger);

            // Token is stored in config (would be used in headers for HTTP transport)
            expect(clientWithToken.getState('auth-server')).toBe('disconnected');
        });
    });

    describe('C3: Tool Discovery', () => {
        it('should list tools from server', async () => {
            await client.connect();

            const tools = client.getAllTools();
            expect(tools.length).toBeGreaterThan(0);

            const toolNames = tools.map(t => t.name);
            expect(toolNames).toContain('search');
            expect(toolNames).toContain('fetch');
        });

        it('should return tools in deterministic order', async () => {
            await client.connect();

            const tools1 = client.getAllTools().map(t => t.name);
            const tools2 = client.getAllTools().map(t => t.name);

            expect(tools1).toEqual(tools2);
        });

        it('should execute tool', async () => {
            await client.connect();

            const result = await client.executeTool('mock-server', 'search', { query: 'test' });
            expect(result.content).toBeDefined();
            expect(result.content[0].text).toContain('test');
        });
    });

    describe('Adapter', () => {
        it('should adapt MCP tools to RegisteredTool format', async () => {
            await client.connect();

            const mcpTools = client.getAllTools();
            const registeredTools = adaptMCPToolsToRegistry(mcpTools, 'mock-server', client);

            expect(registeredTools.length).toBe(mcpTools.length);

            const firstTool = registeredTools[0];
            expect(firstTool.source.type).toBe('mcp');
            expect(firstTool.source.namespace).toBe('mock-server');
            expect(typeof firstTool.execute).toBe('function');
        });

        it('should sort adapted tools by name', async () => {
            await client.connect();

            const mcpTools = client.getAllTools();
            const registeredTools = adaptMCPToolsToRegistry(mcpTools, 'mock-server', client);

            const names = registeredTools.map(t => t.name);
            const sorted = [...names].sort();
            expect(names).toEqual(sorted);
        });
    });
});
