/**
 * NodeMCPHost tests — verifies the real Node.js MCP host implementation.
 * Uses mock transports to avoid spawning actual MCP servers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SDK_VERSION } from '../../src/lib/version';

// Mock @modelcontextprotocol/sdk before import
const clientCtorCalls: Array<{ info: { name: string; version: string } }> = [];
const hostProbeMock = vi.fn();
const mockClientInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
        tools: [
            {
                name: 'search',
                description: 'Search the web',
                inputSchema: {
                    type: 'object',
                    properties: { query: { type: 'string' } },
                    required: ['query'],
                },
            },
        ],
    }),
    callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'search result' }],
    }),
    listResources: vi.fn().mockResolvedValue({
        resources: [{ uri: 'file:///readme.md', name: 'readme' }],
    }),
    readResource: vi.fn().mockResolvedValue({
        contents: [{ text: '# Hello' }],
    }),
    listPrompts: vi.fn().mockResolvedValue({
        prompts: [{ name: 'summarize', description: 'Summarize text' }],
    }),
    getPrompt: vi.fn().mockResolvedValue({
        messages: [{ role: 'user', content: { type: 'text', text: 'Please summarize: hello' } }],
    }),
    setNotificationHandler: vi.fn(),
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
    const MockClient = vi.fn().mockImplementation(function(this: any, info: { name: string; version: string }) {
        clientCtorCalls.push({ info });
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

vi.mock('../../src/node/mcp/http-transport', async () => {
    const actual = await vi.importActual<typeof import('../../src/node/mcp/http-transport')>('../../src/node/mcp/http-transport');
    return {
        ...actual,
        MCPHttpTransport: vi.fn().mockImplementation(function(this: any) {
            this.probe = hostProbeMock;
        }),
    };
});

describe('NodeMCPHost', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clientCtorCalls.length = 0;
        hostProbeMock.mockReset();
    });

    it('can be instantiated with server configs', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');

        const host = new NodeMCPHost({
            servers: [
                { name: 'test-server', transport: 'stdio', command: 'echo', args: ['hello'] },
            ],
        });

        expect(host).toBeDefined();
    });

    it('connect() initializes SDK Client for each server', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');
        const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

        const host = new NodeMCPHost({
            servers: [
                { name: 'server-a', transport: 'stdio', command: 'mcp-a' },
                {
                    name: 'server-b',
                    transport: 'http',
                    url: 'http://localhost:3000/mcp',
                    token: 'secret-token',
                    protocolVersion: '2025-11-25',
                    sessionId: 'session-1',
                    lastEventId: 'evt-12',
                    origin: 'https://app.example.com',
                },
            ],
        });

        await host.connect();

        // After connect, tools should be available
        const tools = host.getTools();
        // Each server returns 1 tool in mock, so 2 total
        expect(tools.length).toBe(2);
        expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
            new URL('http://localhost:3000/mcp'),
            expect.objectContaining({
                requestInit: {
                    headers: expect.objectContaining({
                        Accept: 'application/json, text/event-stream',
                        Authorization: 'Bearer secret-token',
                        'MCP-Protocol-Version': '2025-11-25',
                        'MCP-Session-Id': 'session-1',
                        'Last-Event-ID': 'evt-12',
                        Origin: 'https://app.example.com',
                    }),
                },
            }),
        );
        expect(clientCtorCalls[1]?.info).toEqual({
            name: 'qiniu-ai-sdk',
            version: SDK_VERSION,
        });
    });

    it('resolves tokenProvider for HTTP servers before connect', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');
        const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
        const tokenProvider = vi.fn().mockResolvedValue('dynamic-token');

        const host = new NodeMCPHost({
            servers: [
                {
                    name: 'server-c',
                    transport: 'http',
                    url: 'http://localhost:3001/mcp',
                    tokenProvider,
                },
            ],
        });

        await host.connect();

        expect(tokenProvider).toHaveBeenCalledTimes(1);
        expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
            new URL('http://localhost:3001/mcp'),
            expect.objectContaining({
                requestInit: {
                    headers: expect.objectContaining({
                        Accept: 'application/json, text/event-stream',
                        Authorization: 'Bearer dynamic-token',
                        'MCP-Protocol-Version': '2025-11-25',
                    }),
                },
            }),
        );
    });

    it('getTools() returns RegisteredTool[] with MCP source', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');

        const host = new NodeMCPHost({
            servers: [{ name: 'web', transport: 'stdio', command: 'mcp-web' }],
        });

        await host.connect();
        const tools = host.getTools();

        expect(tools[0].name).toBe('search');
        expect(tools[0].description).toBe('Search the web');
        expect(tools[0].source).toEqual({ type: 'mcp', namespace: 'web' });
        expect(tools[0].execute).toBeTypeOf('function');
        expect(tools[0].parameters).toHaveProperty('type', 'object');
    });

    it('tool.execute() calls SDK Client.callTool()', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');

        const host = new NodeMCPHost({
            servers: [{ name: 'web', transport: 'stdio', command: 'mcp-web' }],
        });

        await host.connect();
        const tools = host.getTools();
        const searchTool = tools[0];

        const result = await searchTool.execute!({ query: 'hello' }, {} as any);
        expect(result).toBe('search result');
    });

    it('listResources() returns resources from all servers', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');

        const host = new NodeMCPHost({
            servers: [{ name: 'fs', transport: 'stdio', command: 'mcp-fs' }],
        });

        await host.connect();
        const resources = await host.listResources!();

        expect(resources).toHaveLength(1);
        expect(resources[0].uri).toBe('file:///readme.md');
        expect(resources[0].serverName).toBe('fs');
    });

    it('readResource() delegates to correct server client', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');

        const host = new NodeMCPHost({
            servers: [{ name: 'fs', transport: 'stdio', command: 'mcp-fs' }],
        });

        await host.connect();
        const content = await host.readResource!('fs', 'file:///readme.md');

        expect(content).toBe('# Hello');
    });

    it('listPrompts() returns prompts from all servers', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');

        const host = new NodeMCPHost({
            servers: [{ name: 'prompt-srv', transport: 'stdio', command: 'mcp-prompts' }],
        });

        await host.connect();
        const prompts = await host.listPrompts!();

        expect(prompts).toHaveLength(1);
        expect(prompts[0].name).toBe('summarize');
        expect(prompts[0].serverName).toBe('prompt-srv');
    });

    it('getPrompt() delegates to correct server client', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');

        const host = new NodeMCPHost({
            servers: [{ name: 'prompt-srv', transport: 'stdio', command: 'mcp-prompts' }],
        });

        await host.connect();
        const prompt = await host.getPrompt!('prompt-srv', 'summarize', { text: 'hello' });

        expect(prompt).toContain('hello');
    });

    it('dispose() closes all SDK clients', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');

        const host = new NodeMCPHost({
            servers: [{ name: 'web', transport: 'stdio', command: 'mcp-web' }],
        });

        await host.connect();
        await host.dispose();

        // After dispose, getTools should return empty
        expect(host.getTools()).toHaveLength(0);
    });

    it('onToolsChanged() fires callback when tool list is refreshed', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');

        const host = new NodeMCPHost({
            servers: [{ name: 'web', transport: 'stdio', command: 'mcp-web' }],
        });

        const callback = vi.fn();
        host.onToolsChanged(callback);

        await host.connect();

        // onToolsChanged should have been called during connect
        expect(callback).toHaveBeenCalled();
    });

    it('probeServers() probes only configured HTTP servers', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');
        hostProbeMock.mockResolvedValue({
            tools: [{ name: 'ping', description: 'Ping', inputSchema: { type: 'object', properties: {} } }],
            eventStream: { status: 200, contentType: 'text/event-stream' },
        });

        const host = new NodeMCPHost({
            servers: [
                { name: 'stdio-server', transport: 'stdio', command: 'mcp-stdio' },
                { name: 'http-server', transport: 'http', url: 'https://mcp.example.com/mcp' },
            ],
        });

        const result = await host.probeServers({
            listTools: true,
            eventStream: true,
        });

        expect(result).toEqual([
            {
                serverName: 'http-server',
                result: {
                    tools: [{ name: 'ping', description: 'Ping', inputSchema: { type: 'object', properties: {} } }],
                    eventStream: { status: 200, contentType: 'text/event-stream' },
                },
            },
        ]);
        expect(hostProbeMock).toHaveBeenCalledTimes(1);
        expect(hostProbeMock).toHaveBeenCalledWith({
            listTools: true,
            eventStream: true,
        });
    });

    it('probeServer() probes one configured HTTP server by name', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');
        hostProbeMock.mockResolvedValue({
            tools: [{ name: 'ping', description: 'Ping', inputSchema: { type: 'object', properties: {} } }],
        });

        const host = new NodeMCPHost({
            servers: [
                { name: 'http-a', transport: 'http', url: 'https://a.example.com/mcp' },
                { name: 'http-b', transport: 'http', url: 'https://b.example.com/mcp' },
            ],
        });

        const result = await host.probeServer('http-b', { listTools: true });

        expect(result).toEqual({
            serverName: 'http-b',
            result: {
                tools: [{ name: 'ping', description: 'Ping', inputSchema: { type: 'object', properties: {} } }],
            },
        });
        expect(hostProbeMock).toHaveBeenCalledTimes(1);
        expect(hostProbeMock).toHaveBeenCalledWith({ listTools: true });
    });

    it('probeServer() rejects unknown server names', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');

        const host = new NodeMCPHost({
            servers: [{ name: 'http-a', transport: 'http', url: 'https://a.example.com/mcp' }],
        });

        await expect(host.probeServer('missing')).rejects.toThrow('MCP server "missing" not found');
        expect(hostProbeMock).not.toHaveBeenCalled();
    });

    it('probeServer() rejects non-http servers', async () => {
        const { NodeMCPHost } = await import('../../src/node/mcp-host');

        const host = new NodeMCPHost({
            servers: [{ name: 'stdio-a', transport: 'stdio', command: 'mcp-stdio' }],
        });

        await expect(host.probeServer('stdio-a')).rejects.toThrow(
            'MCP server "stdio-a" does not use HTTP transport and cannot be probed',
        );
        expect(hostProbeMock).not.toHaveBeenCalled();
    });
});
