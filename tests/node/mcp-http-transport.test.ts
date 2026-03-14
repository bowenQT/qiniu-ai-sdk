import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SDK_VERSION } from '../../src/lib/version';

const transportCtorCalls: Array<{ url: URL; options: unknown }> = [];
const clientCtorCalls: Array<{ info: { name: string; version: string } }> = [];

const mockClientInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool: vi.fn(),
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
    const MockClient = vi.fn().mockImplementation(function(this: any, info: { name: string; version: string }) {
        clientCtorCalls.push({ info });
        Object.assign(this, mockClientInstance);
    });
    return { Client: MockClient };
});

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
    StreamableHTTPClientTransport: vi.fn().mockImplementation(function(this: any, url: URL, options: unknown) {
        transportCtorCalls.push({ url, options });
        Object.assign(this, { close: vi.fn() });
    }),
}));

describe('MCPHttpTransport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        transportCtorCalls.length = 0;
        clientCtorCalls.length = 0;
    });

    it('builds MCP 2025-11-25 headers and SDK metadata on connect', async () => {
        const { MCPHttpTransport } = await import('../../src/node/mcp/http-transport');

        const transport = new MCPHttpTransport({
            name: 'server-a',
            transport: 'http',
            url: 'https://mcp.example.com/mcp',
            token: 'static-token',
            sessionId: 'session-42',
            origin: 'https://app.example.com',
        });

        await transport.connect();

        expect(transportCtorCalls[0]).toEqual({
            url: new URL('https://mcp.example.com/mcp'),
            options: expect.objectContaining({
                requestInit: {
                    headers: expect.objectContaining({
                        Accept: 'application/json, text/event-stream',
                        Authorization: 'Bearer static-token',
                        'MCP-Protocol-Version': '2025-11-25',
                        'MCP-Session-Id': 'session-42',
                        Origin: 'https://app.example.com',
                    }),
                },
            }),
        });
        expect(clientCtorCalls[0]?.info).toEqual({
            name: 'qiniu-ai-sdk',
            version: SDK_VERSION,
        });
    });

    it('prefers tokenProvider when static token is absent', async () => {
        const { MCPHttpTransport } = await import('../../src/node/mcp/http-transport');
        const tokenProvider = vi.fn().mockResolvedValue('dynamic-token');

        const transport = new MCPHttpTransport({
            name: 'server-b',
            transport: 'http',
            url: 'https://mcp.example.com/mcp',
            tokenProvider,
            protocolVersion: '2025-11-25',
        });

        await transport.connect();

        expect(tokenProvider).toHaveBeenCalledTimes(1);
        expect(transportCtorCalls[0]?.options).toEqual(expect.objectContaining({
            requestInit: {
                headers: expect.objectContaining({
                    Authorization: 'Bearer dynamic-token',
                    'MCP-Protocol-Version': '2025-11-25',
                }),
            },
        }));
    });
});
