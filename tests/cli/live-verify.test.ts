import { describe, expect, it } from 'vitest';
import { verifyLiveLane } from '../../src/cli/live-verify';

describe('CLI live verification helpers', () => {
    it('warns for foundation lane until a direct live probe exists', async () => {
        const result = await verifyLiveLane({
            lane: 'foundation',
            env: {},
        });

        expect(result.exitCode).toBe(2);
        expect(result.checks[0]?.message).toContain('foundation lane has no direct live API probe yet');
    });

    it('fails fast when live verification is requested without QINIU_API_KEY', async () => {
        const result = await verifyLiveLane({
            lane: 'cloud-surface',
            env: {},
        });

        expect(result.exitCode).toBe(1);
        expect(result.checks.some((check) => check.message.includes('Missing QINIU_API_KEY'))).toBe(true);
    });

    it('reports maturity evidence and optional file workflow skip for cloud-surface lane', async () => {
        const result = await verifyLiveLane({
            lane: 'cloud-surface',
            env: {
                QINIU_API_KEY: 'sk-test',
            },
            createQiniuClient: () => ({
                chat: {
                    create: async () => ({
                        choices: [{ message: { content: 'pong' } }],
                    }),
                },
                file: {
                    create: async () => ({ id: 'unused', status: 'ready' }),
                    waitForReady: async () => ({ id: 'unused', status: 'ready' }),
                    toContentPart: () => ({
                        type: 'file',
                        file: { file_id: 'unused', format: 'text/plain' },
                    }),
                },
                response: {
                    createText: async () => 'response',
                },
            }) as any,
        });

        expect(result.exitCode).toBe(2);
        expect(result.checks.some((check) => check.message.includes('chat: GA'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('file: GA'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('Chat probe succeeded'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('File/qfile live probe was skipped'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('Response API live probe was skipped'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('Response API stream live probe was skipped'))).toBe(false);
    });

    it('runs the optional file workflow probe when explicitly enabled', async () => {
        const result = await verifyLiveLane({
            lane: 'cloud-surface',
            env: {
                QINIU_API_KEY: 'sk-test',
                QINIU_LIVE_VERIFY_FILE_WORKFLOW: '1',
            },
            createQiniuClient: () => ({
                chat: {
                    create: async () => ({
                        choices: [{ message: { content: 'pong' } }],
                    }),
                },
                file: {
                    create: async () => ({ id: 'qfile-123', status: 'uploading' }),
                    waitForReady: async () => ({ id: 'qfile-123', status: 'ready', content_type: 'text/plain' }),
                    toContentPart: () => ({
                        type: 'file',
                        file: { file_id: 'qfile-123', format: 'text/plain' },
                    }),
                    delete: async () => ({ id: 'qfile-123', deleted: true }),
                },
                response: {
                    createText: async () => 'response',
                },
            }) as any,
        });

        expect(result.exitCode).toBe(2);
        expect(result.checks.some((check) => check.message.includes('File workflow probe succeeded: qfile-123 (text/plain)'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('File cleanup succeeded: qfile-123'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('Response API live probe was skipped'))).toBe(true);
    });

    it('warns when file workflow cleanup cannot run because delete() is unavailable', async () => {
        const result = await verifyLiveLane({
            lane: 'cloud-surface',
            env: {
                QINIU_API_KEY: 'sk-test',
                QINIU_LIVE_VERIFY_FILE_WORKFLOW: '1',
            },
            createQiniuClient: () => ({
                chat: {
                    create: async () => ({
                        choices: [{ message: { content: 'pong' } }],
                    }),
                },
                file: {
                    create: async () => ({ id: 'qfile-no-delete', status: 'ready', content_type: 'text/plain' }),
                    toContentPart: () => ({
                        type: 'file',
                        file: { file_id: 'qfile-no-delete', format: 'text/plain' },
                    }),
                },
                response: {
                    createText: async () => 'response',
                },
            }) as any,
        });

        expect(result.exitCode).toBe(2);
        expect(result.checks.some((check) => check.message.includes('File workflow probe succeeded: qfile-no-delete (text/plain)'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('File cleanup was skipped: delete() is not available for qfile-no-delete'))).toBe(true);
    });

    it('runs the optional Response API probe when explicitly enabled', async () => {
        const result = await verifyLiveLane({
            lane: 'cloud-surface',
            env: {
                QINIU_API_KEY: 'sk-test',
                QINIU_LIVE_VERIFY_RESPONSE_API: '1',
                QINIU_LIVE_VERIFY_RESPONSE_MODEL: 'gpt-5.2',
            },
            createQiniuClient: () => ({
                chat: {
                    create: async () => ({
                        choices: [{ message: { content: 'pong' } }],
                    }),
                },
                file: {
                    create: async () => ({ id: 'unused', status: 'ready' }),
                    waitForReady: async () => ({ id: 'unused', status: 'ready' }),
                    toContentPart: () => ({
                        type: 'file',
                        file: { file_id: 'unused', format: 'text/plain' },
                    }),
                },
                response: {
                    createText: async () => 'response',
                },
            }) as any,
        });

        expect(result.exitCode).toBe(2);
        expect(result.checks.some((check) => check.message.includes('Response API probe succeeded: response'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('Response API stream live probe was skipped'))).toBe(true);
    });

    it('runs the optional Response API stream probe when explicitly enabled', async () => {
        async function* mockTextStream(): AsyncGenerator<string, { outputText: string }, unknown> {
            yield 'stream';
            yield '-response';
            return { outputText: 'stream-response' };
        }

        const result = await verifyLiveLane({
            lane: 'cloud-surface',
            env: {
                QINIU_API_KEY: 'sk-test',
                QINIU_LIVE_VERIFY_RESPONSE_API: '1',
                QINIU_LIVE_VERIFY_RESPONSE_STREAM: '1',
            },
            createQiniuClient: () => ({
                chat: {
                    create: async () => ({
                        choices: [{ message: { content: 'pong' } }],
                    }),
                },
                file: {
                    create: async () => ({ id: 'unused', status: 'ready' }),
                    waitForReady: async () => ({ id: 'unused', status: 'ready' }),
                    toContentPart: () => ({
                        type: 'file',
                        file: { file_id: 'unused', format: 'text/plain' },
                    }),
                },
                response: {
                    createText: async () => 'response',
                    createTextStream: mockTextStream,
                },
            }) as any,
        });

        expect(result.exitCode).toBe(2);
        expect(result.checks.some((check) => check.message.includes('Response API probe succeeded: response'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('Response API stream probe succeeded: stream-response'))).toBe(true);
    });

    it('warns when node-integrations lane skips MCP live probing', async () => {
        const result = await verifyLiveLane({
            lane: 'node-integrations',
            env: {
                QINIU_API_KEY: 'sk-test',
                QINIU_ACCESS_KEY: 'ak-test',
                QINIU_SECRET_KEY: 'secret-test',
            },
            createNodeClient: () => ({
                chat: {
                    create: async () => ({
                        choices: [{ message: { content: 'node' } }],
                    }),
                },
            }) as any,
        });

        expect(result.exitCode).toBe(2);
        expect(result.checks.some((check) => check.message.includes('Node lane chat probe succeeded: node'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP live probe was skipped'))).toBe(true);
    });

    it('runs the optional MCP live probe for node-integrations lane', async () => {
        const result = await verifyLiveLane({
            lane: 'node-integrations',
            env: {
                QINIU_API_KEY: 'sk-test',
                QINIU_ACCESS_KEY: 'ak-test',
                QINIU_SECRET_KEY: 'secret-test',
                QINIU_LIVE_VERIFY_MCP_URL: 'https://mcp.example.com/mcp',
                QINIU_LIVE_VERIFY_MCP_LIST_TOOLS: '1',
                QINIU_LIVE_VERIFY_MCP_LIST_RESOURCES: '1',
                QINIU_LIVE_VERIFY_MCP_LIST_PROMPTS: '1',
                QINIU_LIVE_VERIFY_MCP_READ_RESOURCE_URI: 'file:///readme.md',
                QINIU_LIVE_VERIFY_MCP_GET_PROMPT_NAME: 'summarize',
                QINIU_LIVE_VERIFY_MCP_GET_PROMPT_ARGS_JSON: '{"text":"hello"}',
                QINIU_LIVE_VERIFY_MCP_TOOL_NAME: 'ping',
                QINIU_LIVE_VERIFY_MCP_TOOL_ARGS_JSON: '{"echo":"pong"}',
                QINIU_LIVE_VERIFY_MCP_OAUTH_DISCOVERY: '1',
                QINIU_LIVE_VERIFY_MCP_TERMINATE: '1',
            },
            createNodeClient: () => ({
                chat: {
                    create: async () => ({
                        choices: [{ message: { content: 'node' } }],
                    }),
                },
            }) as any,
            createMcpTransport: () => ({
                connect: async () => undefined,
                listTools: async () => [{ name: 'ping' }, { name: 'echo' }],
                listResources: async () => [{ uri: 'file:///readme.md' }],
                listPrompts: async () => [{ name: 'summarize' }],
                readResourceContents: async () => [{ text: '# Hello', mimeType: 'text/markdown' }],
                readResource: async () => '# Hello',
                getPromptMessages: async () => [{ role: 'user', content: { type: 'text', text: 'Please summarize hello' } }],
                getPrompt: async () => 'Please summarize hello',
                executeTool: async () => ({
                    content: [{ type: 'text', text: 'pong' }],
                }),
                openEventStream: async () => new Response('event: ready\n\n', {
                    status: 200,
                    headers: { 'Content-Type': 'text/event-stream' },
                }),
                discoverOAuthMetadata: async () => ({
                    protectedResource: { authorization_servers: ['https://auth.example.com'] },
                    authorizationServer: { issuer: 'https://auth.example.com' },
                }),
                terminateSession: async () => true,
                disconnect: async () => undefined,
            }),
        });

        expect(result.exitCode).toBe(0);
        expect(result.checks.some((check) => check.message.includes('Node lane chat probe succeeded: node'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP tool listing probe succeeded: 2 tools'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP resource listing probe succeeded: 1 resources'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP prompt listing probe succeeded: 1 prompts'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP resource read probe succeeded: # Hello'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP structured resource read probe succeeded: 1 contents'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP prompt get probe succeeded: Please summarize hello'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP structured prompt get probe succeeded: 1 messages'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP tool call probe succeeded: ping -> pong'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP event stream probe succeeded: 200 (text/event-stream)'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP OAuth metadata probe succeeded: https://auth.example.com'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP DELETE terminate probe succeeded.'))).toBe(true);
    });

    it('prefers transport.probe() when the MCP transport exposes it', async () => {
        const result = await verifyLiveLane({
            lane: 'node-integrations',
            env: {
                QINIU_API_KEY: 'sk-test',
                QINIU_ACCESS_KEY: 'ak-test',
                QINIU_SECRET_KEY: 'secret-test',
                QINIU_LIVE_VERIFY_MCP_URL: 'https://mcp.example.com/mcp',
                QINIU_LIVE_VERIFY_MCP_LIST_TOOLS: '1',
                QINIU_LIVE_VERIFY_MCP_LIST_RESOURCES: '1',
                QINIU_LIVE_VERIFY_MCP_LIST_PROMPTS: '1',
                QINIU_LIVE_VERIFY_MCP_READ_RESOURCE_URI: 'file:///readme.md',
                QINIU_LIVE_VERIFY_MCP_GET_PROMPT_NAME: 'summarize',
                QINIU_LIVE_VERIFY_MCP_GET_PROMPT_ARGS_JSON: '{"text":"hello"}',
                QINIU_LIVE_VERIFY_MCP_TOOL_NAME: 'ping',
                QINIU_LIVE_VERIFY_MCP_TOOL_ARGS_JSON: '{"echo":"pong"}',
                QINIU_LIVE_VERIFY_MCP_OAUTH_DISCOVERY: '1',
                QINIU_LIVE_VERIFY_MCP_TERMINATE: '1',
            },
            createNodeClient: () => ({
                chat: {
                    create: async () => ({
                        choices: [{ message: { content: 'node' } }],
                    }),
                },
            }) as any,
            createMcpTransport: () => ({
                probe: async () => ({
                    tools: [{ name: 'ping' }, { name: 'echo' }],
                    resources: [{ uri: 'file:///readme.md' }],
                    prompts: [{ name: 'summarize' }],
                    resourceContents: [{ text: '# Hello', mimeType: 'text/markdown' }],
                    resourceText: '# Hello',
                    promptMessages: [{ role: 'user', content: { type: 'text', text: 'Please summarize hello' } }],
                    promptText: 'Please summarize hello',
                    toolResult: {
                        content: [{ type: 'text', text: 'pong' }],
                    },
                    eventStream: {
                        status: 200,
                        contentType: 'text/event-stream',
                    },
                    oauthMetadata: {
                        protectedResource: { authorization_servers: ['https://auth.example.com'] },
                        authorizationServer: { issuer: 'https://auth.example.com' },
                    },
                    terminated: true,
                }),
                openEventStream: async () => new Response('event: unused\n\n', {
                    status: 200,
                    headers: { 'Content-Type': 'text/event-stream' },
                }),
                discoverOAuthMetadata: async () => ({
                    protectedResource: { authorization_servers: ['https://unused.example.com'] },
                    authorizationServer: { issuer: 'https://unused.example.com' },
                }),
                terminateSession: async () => false,
            }),
        });

        expect(result.exitCode).toBe(0);
        expect(result.checks.some((check) => check.message.includes('MCP tool listing probe succeeded: 2 tools'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP resource listing probe succeeded: 1 resources'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP prompt listing probe succeeded: 1 prompts'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP resource read probe succeeded: # Hello'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP structured resource read probe succeeded: 1 contents'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP prompt get probe succeeded: Please summarize hello'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP structured prompt get probe succeeded: 1 messages'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP tool call probe succeeded: ping -> pong'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP event stream probe succeeded: 200 (text/event-stream)'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP OAuth metadata probe succeeded: https://auth.example.com'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP DELETE terminate probe succeeded.'))).toBe(true);
    });
});
