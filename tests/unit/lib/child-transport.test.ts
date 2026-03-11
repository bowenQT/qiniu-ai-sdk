import { describe, it, expect } from 'vitest';
import { ChildTransport } from '../../../src/lib/child-transport';
import { createStaticMockFetch, createBinaryMockFetch } from '../../mocks/fetch';
import type { RequestContext } from '../../../src/lib/request';
import type { FetchAdapter } from '../../../src/lib/middleware';
import { noopLogger } from '../../../src/lib/logger';

function createTestContext(adapter: FetchAdapter): RequestContext {
    return {
        logger: noopLogger,
        adapter,
        middleware: undefined,
        baseHeaders: { 'Authorization': 'Bearer sk-parent' },
        defaultTimeout: 5000,
    };
}

describe('ChildTransport', () => {
    describe('constructor', () => {
        it('should normalize trailing slashes from baseUrl', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: { ok: true } });
            const ctx = createTestContext(mockFetch.adapter);
            const transport = new ChildTransport('https://sandbox.api.com/', ctx);

            await transport.get('/sandboxes');

            expect(mockFetch.calls[0].url).toBe('https://sandbox.api.com/sandboxes');
        });

        it('should override auth headers with extraHeaders', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: {} });
            const ctx = createTestContext(mockFetch.adapter);
            const transport = new ChildTransport('https://sandbox.api.com', ctx, {
                'X-API-Key': 'sb-key-123',
            });

            await transport.post('/sandboxes', { templateId: 'base' });

            const headers = mockFetch.calls[0].init?.headers as Record<string, string>;
            expect(headers['X-API-Key']).toBe('sb-key-123');
            // Parent's Bearer should NOT be present (overridden)
            expect(headers['Authorization']).toBeUndefined();
        });
    });

    describe('post()', () => {
        it('should POST JSON and return parsed data', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { sandboxID: 'sb-123', state: 'running' },
            });
            const ctx = createTestContext(mockFetch.adapter);
            const transport = new ChildTransport('https://sandbox.api.com', ctx);

            const result = await transport.post<{ sandboxID: string }>('/sandboxes', {
                templateId: 'base',
            });

            expect(result.sandboxID).toBe('sb-123');
            expect(mockFetch.calls[0].init?.method).toBe('POST');
        });
    });

    describe('get()', () => {
        it('should GET with query params', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: [{ sandboxID: 'sb-1' }],
            });
            const ctx = createTestContext(mockFetch.adapter);
            const transport = new ChildTransport('https://sandbox.api.com', ctx);

            await transport.get('/sandboxes', { state: 'running' });

            expect(mockFetch.calls[0].url).toContain('state=running');
        });
    });

    describe('delete()', () => {
        it('should send DELETE request', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: {} });
            const ctx = createTestContext(mockFetch.adapter);
            const transport = new ChildTransport('https://sandbox.api.com', ctx);

            await transport.delete('/sandboxes/sb-123');

            expect(mockFetch.calls[0].init?.method).toBe('DELETE');
            expect(mockFetch.calls[0].url).toBe('https://sandbox.api.com/sandboxes/sb-123');
        });
    });

    describe('getRaw()', () => {
        it('should return raw Response for binary content', async () => {
            const binaryData = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG header
            const mockFetch = createBinaryMockFetch(binaryData, 'image/png');
            const ctx = createTestContext(mockFetch.adapter);
            const transport = new ChildTransport('https://envd.sandbox.com', ctx);

            const response = await transport.getRaw('/files/image.png');

            expect(response.ok).toBe(true);
            const buffer = await response.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            expect(bytes[0]).toBe(0x89); // PNG magic byte
        });
    });

    describe('postRaw()', () => {
        it('should return raw Response', async () => {
            const binaryData = new Uint8Array([0x01, 0x02, 0x03]);
            const mockFetch = createBinaryMockFetch(binaryData);
            const ctx = createTestContext(mockFetch.adapter);
            const transport = new ChildTransport('https://envd.sandbox.com', ctx);

            const response = await transport.postRaw('/rpc/Method', { cmd: 'ls' });

            expect(response.ok).toBe(true);
        });
    });

    describe('inherits parent infrastructure', () => {
        it('should use parent adapter for all requests', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: { ok: true } });
            const ctx = createTestContext(mockFetch.adapter);
            const transport = new ChildTransport('https://other.api.com', ctx);

            await transport.post('/test', {});

            // Verify the parent's mock adapter was called
            expect(mockFetch.calls).toHaveLength(1);
        });
    });

    describe('error handling', () => {
        it('should throw on non-OK response for getRaw', async () => {
            const mockFetch = createStaticMockFetch({ status: 404, body: { message: 'Not found' } });
            const ctx = createTestContext(mockFetch.adapter);
            const transport = new ChildTransport('https://sandbox.api.com', ctx);

            await expect(transport.getRaw('/notfound')).rejects.toThrow('Not found');
        });
    });
});
