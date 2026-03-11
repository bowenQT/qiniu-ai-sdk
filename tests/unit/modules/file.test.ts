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
