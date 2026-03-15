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
            }) as any,
        });

        expect(result.exitCode).toBe(2);
        expect(result.checks.some((check) => check.message.includes('chat: GA'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('file: GA'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('Chat probe succeeded'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('File/qfile live probe was skipped'))).toBe(true);
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
                },
            }) as any,
        });

        expect(result.exitCode).toBe(0);
        expect(result.checks.some((check) => check.message.includes('File workflow probe succeeded: qfile-123 (text/plain)'))).toBe(true);
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
        expect(result.checks.some((check) => check.message.includes('MCP event stream probe succeeded: 200 (text/event-stream)'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP OAuth metadata probe succeeded: https://auth.example.com'))).toBe(true);
        expect(result.checks.some((check) => check.message.includes('MCP DELETE terminate probe succeeded.'))).toBe(true);
    });
});
