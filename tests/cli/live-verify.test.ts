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
});
