import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditLogger } from '../../src/ai/guardrails';
import { createKodoAuditSink } from '../../src/node';

describe('createKodoAuditSink', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-13T12:34:56.789Z'));
        vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('should upload newline-delimited audit entries to Kodo', async () => {
        const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const sink = createKodoAuditSink({
            bucket: 'audit-bucket',
            accessKey: 'test-ak',
            secretKey: 'test-sk',
            region: 'z0',
            prefix: 'guardrail/audit',
        });

        const result = await auditLogger({
            sink,
            onError: 'block',
            async: false,
        }).process({
            phase: 'pre-request',
            content: 'secret payload',
            agentId: 'agent-1',
        });

        expect(result.action).toBe('pass');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://up.qiniup.com');
        expect(init.method).toBe('POST');

        const body = init.body as FormData;
        expect(body.get('key')).toBe('guardrail/audit/2026/03/13/1773405296789-4fzzzxjy.ndjson');

        const file = body.get('file') as File;
        const content = await file.text();
        expect(content.trim().split('\n')).toHaveLength(1);
        expect(JSON.parse(content)).toMatchObject({
            agentId: 'agent-1',
            phase: 'pre-request',
            content: '[CONTENT_REDACTED]',
        });
    });

    it('should retry temporary upload failures', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response('upstream error', { status: 503 }))
            .mockResolvedValueOnce(new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const sink = createKodoAuditSink({
            bucket: 'audit-bucket',
            accessKey: 'test-ak',
            secretKey: 'test-sk',
            maxRetries: 2,
        });

        const resultPromise = auditLogger({
            sink,
            onError: 'block',
            async: false,
        }).process({
            phase: 'pre-request',
            content: 'retry me',
            agentId: 'agent-2',
        });
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.action).toBe('pass');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should respect onError=warn when uploads keep failing', async () => {
        const fetchMock = vi.fn(async () => new Response('still failing', { status: 503 }));
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.stubGlobal('fetch', fetchMock);

        const sink = createKodoAuditSink({
            bucket: 'audit-bucket',
            accessKey: 'test-ak',
            secretKey: 'test-sk',
            maxRetries: 2,
        });

        const resultPromise = auditLogger({
            sink,
            onError: 'warn',
            async: false,
        }).process({
            phase: 'pre-request',
            content: 'warn only',
            agentId: 'agent-3',
        });
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.action).toBe('pass');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(warnSpy).toHaveBeenCalledWith(
            '[AuditLogger] Failed to write logs:',
            expect.any(Error)
        );
    });

    it('should block synchronously when uploads keep failing and onError=block', async () => {
        const fetchMock = vi.fn(async () => new Response('still failing', { status: 503 }));
        vi.stubGlobal('fetch', fetchMock);

        const sink = createKodoAuditSink({
            bucket: 'audit-bucket',
            accessKey: 'test-ak',
            secretKey: 'test-sk',
            maxRetries: 2,
        });

        const resultPromise = auditLogger({
            sink,
            onError: 'block',
            async: false,
        }).process({
            phase: 'pre-request',
            content: 'must block',
            agentId: 'agent-4',
        });
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.action).toBe('block');
        expect(result.reason).toContain('Upload failed: 503');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
