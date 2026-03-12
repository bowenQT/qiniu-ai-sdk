/**
 * MCP Timeout Integration Tests — RFC §5 验证计划
 *
 * Validates that MCPToolPolicy timeout options are correctly
 * passed to SDK's RequestOptions and that errors propagate properly.
 *
 * Test scenarios:
 * 1. SDK-native timeout → callTool receives timeout → McpError propagation
 * 2. SDK signal cancel → AbortController.signal → abort → error propagation
 * 3. resetTimeoutOnProgress → correct value passed through
 * 4. maxTotalTimeout → conditionally included in RequestOptions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Capture callTool invocations for assertion
// ============================================================================
let capturedCallToolArgs: any[] = [];

const mockClientInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
        tools: [
            {
                name: 'slow-tool',
                description: 'A tool that may be slow',
                inputSchema: {
                    type: 'object',
                    properties: { input: { type: 'string' } },
                },
            },
        ],
    }),
    callTool: vi.fn().mockImplementation(async (params: any, _schema: any, options: any) => {
        capturedCallToolArgs.push({ params, options });
        return {
            content: [{ type: 'text', text: 'ok' }],
        };
    }),
    setNotificationHandler: vi.fn(),
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
    const MockClient = vi.fn().mockImplementation(function(this: any) {
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

describe('MCP Timeout Integration (RFC §5)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        capturedCallToolArgs = [];
    });

    // ========================================================================
    // Test 1: SDK-native timeout → callTool receives timeout → error propagation
    // ========================================================================
    describe('SDK-native timeout', () => {
        it('passes configured timeout to callTool RequestOptions', async () => {
            const { NodeMCPHost } = await import('../../src/node/mcp-host');

            const host = new NodeMCPHost({
                servers: [{
                    name: 'timeout-server',
                    transport: 'stdio',
                    command: 'echo',
                    toolPolicy: {
                        timeout: 5000,
                    },
                }],
            });

            await host.connect();
            const tools = host.getTools();
            expect(tools).toHaveLength(1);

            await tools[0].execute!({ input: 'test' }, {} as any);

            expect(capturedCallToolArgs).toHaveLength(1);
            expect(capturedCallToolArgs[0].options.timeout).toBe(5000);
        });

        it('uses default timeout (30000ms) when no policy configured', async () => {
            const { NodeMCPHost } = await import('../../src/node/mcp-host');

            const host = new NodeMCPHost({
                servers: [{
                    name: 'default-timeout-server',
                    transport: 'stdio',
                    command: 'echo',
                    // No toolPolicy
                }],
            });

            await host.connect();
            const tools = host.getTools();

            await tools[0].execute!({ input: 'test' }, {} as any);

            expect(capturedCallToolArgs[0].options.timeout).toBe(30000);
        });

        it('propagates McpError(RequestTimeout) when callTool times out', async () => {
            const { NodeMCPHost } = await import('../../src/node/mcp-host');

            // Make callTool reject with timeout error
            mockClientInstance.callTool.mockRejectedValueOnce(
                Object.assign(new Error('Request timed out'), {
                    code: -32000,
                    name: 'McpError',
                }),
            );

            const host = new NodeMCPHost({
                servers: [{
                    name: 'timeout-reject-server',
                    transport: 'stdio',
                    command: 'echo',
                    toolPolicy: { timeout: 100 },
                }],
            });

            await host.connect();
            const tools = host.getTools();

            await expect(tools[0].execute!({ input: 'test' }, {} as any))
                .rejects.toThrow('Request timed out');
        });
    });

    // ========================================================================
    // Test 2: SDK signal cancel → AbortController propagation
    // ========================================================================
    describe('SDK signal cancel', () => {
        it('AbortController abortion rejects callTool with AbortError', async () => {
            const { NodeMCPHost } = await import('../../src/node/mcp-host');

            // Make callTool throw AbortError (simulating SDK detecting abort)
            mockClientInstance.callTool.mockRejectedValueOnce(
                Object.assign(new Error('The operation was aborted'), {
                    name: 'AbortError',
                }),
            );

            const host = new NodeMCPHost({
                servers: [{
                    name: 'cancel-server',
                    transport: 'stdio',
                    command: 'echo',
                    toolPolicy: { timeout: 60000 },
                }],
            });

            await host.connect();
            const tools = host.getTools();

            // The host should propagate AbortError from SDK without swallowing it
            await expect(tools[0].execute!({ input: 'test' }, {} as any))
                .rejects.toThrow('The operation was aborted');
        });
    });

    // ========================================================================
    // Test 3: resetTimeoutOnProgress → correct value in RequestOptions
    // ========================================================================
    describe('resetTimeoutOnProgress', () => {
        it('passes resetTimeoutOnProgress=true when configured', async () => {
            const { NodeMCPHost } = await import('../../src/node/mcp-host');

            const host = new NodeMCPHost({
                servers: [{
                    name: 'progress-server',
                    transport: 'stdio',
                    command: 'echo',
                    toolPolicy: {
                        timeout: 10000,
                        resetTimeoutOnProgress: true,
                    },
                }],
            });

            await host.connect();
            const tools = host.getTools();

            await tools[0].execute!({ input: 'test' }, {} as any);

            expect(capturedCallToolArgs[0].options.resetTimeoutOnProgress).toBe(true);
        });

        it('defaults resetTimeoutOnProgress to false when not configured', async () => {
            const { NodeMCPHost } = await import('../../src/node/mcp-host');

            const host = new NodeMCPHost({
                servers: [{
                    name: 'no-progress-server',
                    transport: 'stdio',
                    command: 'echo',
                    // No toolPolicy
                }],
            });

            await host.connect();
            const tools = host.getTools();

            await tools[0].execute!({ input: 'test' }, {} as any);

            expect(capturedCallToolArgs[0].options.resetTimeoutOnProgress).toBe(false);
        });
    });

    // ========================================================================
    // Test 4: maxTotalTimeout → conditionally included in RequestOptions
    // ========================================================================
    describe('maxTotalTimeout', () => {
        it('includes maxTotalTimeout in RequestOptions when configured', async () => {
            const { NodeMCPHost } = await import('../../src/node/mcp-host');

            const host = new NodeMCPHost({
                servers: [{
                    name: 'maxtotal-server',
                    transport: 'stdio',
                    command: 'echo',
                    toolPolicy: {
                        timeout: 5000,
                        resetTimeoutOnProgress: true,
                        maxTotalTimeout: 60000,
                    },
                }],
            });

            await host.connect();
            const tools = host.getTools();

            await tools[0].execute!({ input: 'test' }, {} as any);

            expect(capturedCallToolArgs[0].options.maxTotalTimeout).toBe(60000);
        });

        it('omits maxTotalTimeout from RequestOptions when not configured', async () => {
            const { NodeMCPHost } = await import('../../src/node/mcp-host');

            const host = new NodeMCPHost({
                servers: [{
                    name: 'no-maxtotal-server',
                    transport: 'stdio',
                    command: 'echo',
                    toolPolicy: {
                        timeout: 5000,
                    },
                }],
            });

            await host.connect();
            const tools = host.getTools();

            await tools[0].execute!({ input: 'test' }, {} as any);

            expect(capturedCallToolArgs[0].options.maxTotalTimeout).toBeUndefined();
        });

        it('all timeout options compose correctly in a single RequestOptions', async () => {
            const { NodeMCPHost } = await import('../../src/node/mcp-host');

            const host = new NodeMCPHost({
                servers: [{
                    name: 'full-policy-server',
                    transport: 'stdio',
                    command: 'echo',
                    toolPolicy: {
                        timeout: 15000,
                        resetTimeoutOnProgress: true,
                        maxTotalTimeout: 120000,
                        requiresApproval: true,
                        maxOutputLength: 500_000,
                    },
                }],
            });

            await host.connect();
            const tools = host.getTools();

            // Verify requiresApproval is set on the tool
            expect(tools[0].requiresApproval).toBe(true);

            await tools[0].execute!({ input: 'test' }, {} as any);

            const opts = capturedCallToolArgs[0].options;
            expect(opts.timeout).toBe(15000);
            expect(opts.resetTimeoutOnProgress).toBe(true);
            expect(opts.maxTotalTimeout).toBe(120000);
        });
    });
});
