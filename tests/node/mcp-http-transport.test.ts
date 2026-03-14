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
const fetchMock = vi.fn();

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
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
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

    it('opens resumable event streams with Last-Event-ID', async () => {
        const { MCPHttpTransport } = await import('../../src/node/mcp/http-transport');
        fetchMock.mockResolvedValue(new Response('event: message\n\n', {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
        }));

        const transport = new MCPHttpTransport({
            name: 'server-c',
            transport: 'http',
            url: 'https://mcp.example.com/mcp',
            sessionId: 'session-99',
            lastEventId: 'evt-41',
        });

        const response = await transport.openEventStream();

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://mcp.example.com/mcp',
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    Accept: 'text/event-stream',
                    'MCP-Session-Id': 'session-99',
                    'Last-Event-ID': 'evt-41',
                }),
            }),
        );
    });

    it('terminates sessions with DELETE and reports unsupported servers', async () => {
        const { MCPHttpTransport } = await import('../../src/node/mcp/http-transport');

        fetchMock
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(new Response(null, { status: 405 }));

        const transport = new MCPHttpTransport({
            name: 'server-d',
            transport: 'http',
            url: 'https://mcp.example.com/mcp',
            sessionId: 'session-delete',
        });

        expect(await transport.terminateSession()).toBe(true);
        expect(await transport.terminateSession()).toBe(false);

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://mcp.example.com/mcp',
            expect.objectContaining({
                method: 'DELETE',
                headers: expect.objectContaining({
                    'MCP-Session-Id': 'session-delete',
                }),
            }),
        );
    });

    it('discovers OAuth metadata from protected resource and authorization server', async () => {
        const { MCPHttpTransport } = await import('../../src/node/mcp/http-transport');
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify({
                resource: 'https://mcp.example.com',
                authorization_servers: ['https://auth.example.com'],
            }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
            .mockResolvedValueOnce(new Response(JSON.stringify({
                issuer: 'https://auth.example.com',
                authorization_endpoint: 'https://auth.example.com/authorize',
                token_endpoint: 'https://auth.example.com/token',
            }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

        const transport = new MCPHttpTransport({
            name: 'server-e',
            transport: 'http',
            url: 'https://mcp.example.com/mcp',
            protocolVersion: '2025-11-25',
        });

        const metadata = await transport.discoverOAuthMetadata();

        expect(metadata.protectedResource.authorization_servers).toEqual(['https://auth.example.com']);
        expect(metadata.authorizationServer?.token_endpoint).toBe('https://auth.example.com/token');
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://mcp.example.com/.well-known/oauth-protected-resource',
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    Accept: 'application/json',
                    'MCP-Protocol-Version': '2025-11-25',
                }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'https://auth.example.com/.well-known/oauth-authorization-server',
            expect.objectContaining({
                method: 'GET',
            }),
        );
    });
});
