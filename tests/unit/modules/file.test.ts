/**
 * TDD RED: File module tests for Phase 2
 * Tests for the new /v1/files API module.
 */
import { describe, it, expect, vi } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createStaticMockFetch } from '../../mocks/fetch';

describe('Phase 2: File Module', () => {
    it('should have a file property on client', () => {
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
        });
        expect(client.file).toBeDefined();
    });

    it('should create a file upload', async () => {
        const mockResponse = {
            id: 'file-abc123',
            object: 'file',
            bytes: 1024,
            created_at: 1234567890,
            filename: 'test.pdf',
            purpose: 'assistants',
            status: 'uploaded',
        };

        const mockFetch = createStaticMockFetch({ status: 200, body: mockResponse });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.file.create({
            file: 'base64data',
            purpose: 'assistants',
        });

        expect(result.id).toBe('file-abc123');
        expect(result.status).toBe('uploaded');
        expect(JSON.parse(String(mockFetch.calls[0]?.init?.body))).toMatchObject({
            file: 'base64data',
            purpose: 'assistants',
        });
    });

    it('should normalize data URLs and binary file sources before upload', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: { id: 'file-bin', status: 'uploaded' },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await client.file.create({
            file: 'data:text/plain;base64,SGVsbG8=',
            purpose: 'assistants',
        });
        await client.file.create({
            file: new URL('https://example.com/spec.pdf'),
            purpose: 'assistants',
        });
        await client.file.create({
            file: Uint8Array.from([72, 105]),
            purpose: 'assistants',
        });
        await client.file.create({
            file: Uint8Array.from([72, 105]).buffer,
            purpose: 'assistants',
        });
        await client.file.create({
            file: new Blob([Uint8Array.from([72, 105])], { type: 'text/plain' }),
            purpose: 'assistants',
        });

        expect(JSON.parse(String(mockFetch.calls[0]?.init?.body)).file).toBe('SGVsbG8=');
        expect(JSON.parse(String(mockFetch.calls[1]?.init?.body)).file).toBe('https://example.com/spec.pdf');
        expect(JSON.parse(String(mockFetch.calls[2]?.init?.body)).file).toBe('SGk=');
        expect(JSON.parse(String(mockFetch.calls[3]?.init?.body)).file).toBe('SGk=');
        expect(JSON.parse(String(mockFetch.calls[4]?.init?.body)).file).toBe('SGk=');
    });

    it('should get file status', async () => {
        const mockResponse = {
            id: 'file-abc123',
            status: 'processed',
        };

        const mockFetch = createStaticMockFetch({ status: 200, body: mockResponse });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.file.get('file-abc123');
        expect(result.id).toBe('file-abc123');
        expect(result.status).toBe('processed');
    });

    it('should list files', async () => {
        const mockResponse = {
            data: [
                { id: 'file-1', status: 'processed' },
                { id: 'file-2', status: 'uploaded' },
            ],
        };

        const mockFetch = createStaticMockFetch({ status: 200, body: mockResponse });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.file.list();
        expect(result.data).toHaveLength(2);
    });
});
