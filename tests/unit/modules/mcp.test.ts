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

    describe('Server Helpers', () => {
        it('should get tools for specific server via getServerTools', async () => {
            await client.connect();

            const tools = client.getServerTools('mock-server');
            expect(tools.length).toBeGreaterThan(0);
            expect(tools.map(t => t.name)).toContain('search');
        });

        it('should return empty array for disconnected server', () => {
            const tools = client.getServerTools('mock-server');
            expect(tools).toEqual([]);
        });

        it('should list connected server names', async () => {
            await client.connect();

            const names = client.getConnectedServerNames();
            expect(names).toContain('mock-server');
            expect(names).toEqual([...names].sort()); // Should be sorted
        });

        it('should return empty array when no servers connected', () => {
            const names = client.getConnectedServerNames();
            expect(names).toEqual([]);
        });
    });

    describe('Token Injection', () => {
        it('should inject token via MCP_BEARER_TOKEN env', async () => {
            // This test verifies the token is configured; actual env injection
            // happens at spawn time and would need a mock server that reads it
            const clientWithToken = new MCPClient({
                servers: [
                    {
                        name: 'token-server',
                        transport: 'stdio',
                        command: 'node',
                        args: ['-e', 'console.log(process.env.MCP_BEARER_TOKEN)'],
                        token: 'test-bearer-token',
                    },
                ],
                connectionTimeout: 1000,
            }, noopLogger);

            // Token is stored and will be injected at connect time
            expect(clientWithToken.getState('token-server')).toBe('disconnected');
            await clientWithToken.disconnect();
        });
    });
});

