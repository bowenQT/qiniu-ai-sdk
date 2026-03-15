/**
 * TDD RED: File module tests for Phase 2
 * Tests for the new /v1/files API module.
 */
import { describe, it, expect, vi } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createMockFetch, createStaticMockFetch } from '../../mocks/fetch';

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

    it('should build a file content part from an uploaded file id', () => {
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
        });

        expect(client.file.toContentPart('qfile-123', { format: 'video/mp4' })).toEqual({
            type: 'file',
            file: {
                file_id: 'qfile-123',
                format: 'video/mp4',
            },
        });
    });

    it('should infer file format from uploaded file metadata when building content parts', () => {
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
        });

        expect(client.file.toContentPart({
            id: 'qfile-clip',
            filename: 'clip.mp4',
        })).toEqual({
            type: 'file',
            file: {
                file_id: 'qfile-clip',
                format: 'video/mp4',
            },
        });

        expect(client.file.toContentPart({
            id: 'qfile-doc',
            filename: 'spec.pdf',
        })).toEqual({
            type: 'file',
            file: {
                file_id: 'qfile-doc',
                format: 'application/pdf',
            },
        });
    });

    it('should omit format when no override or known filename extension is available', () => {
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
        });

        expect(client.file.toContentPart({
            id: 'qfile-raw',
            filename: 'blob.bin',
        })).toEqual({
            type: 'file',
            file: {
                file_id: 'qfile-raw',
            },
        });
    });

    it('should prefer server-provided content_type when building content parts', () => {
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
        });

        expect(client.file.toContentPart({
            id: 'qfile-server',
            file_name: 'mystery.bin',
            content_type: 'video/mp4',
        })).toEqual({
            type: 'file',
            file: {
                file_id: 'qfile-server',
                format: 'video/mp4',
            },
        });
    });

    it('should build a qfile user message from an uploaded file reference', () => {
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: createStaticMockFetch({ status: 200, body: {} }).adapter,
        });

        expect(client.file.toUserMessage('这段视频里发生了什么？', {
            id: 'qfile-video',
            file_name: 'clip.mp4',
        })).toEqual({
            role: 'user',
            content: [
                { type: 'text', text: '这段视频里发生了什么？' },
                {
                    type: 'file',
                    file: {
                        file_id: 'qfile-video',
                        format: 'video/mp4',
                    },
                },
            ],
        });
    });

    it('should wait until a file becomes ready', async () => {
        const mockFetch = createMockFetch([
            {
                status: 200,
                body: { id: 'qfile-1', object: 'file', status: 'pending', created_at: 1, expires_at: 2 },
            },
            {
                status: 200,
                body: {
                    id: 'qfile-1',
                    object: 'file',
                    status: 'ready',
                    created_at: 1,
                    synced_at: 2,
                    expires_at: 3,
                    file_name: 'clip.mp4',
                    content_type: 'video/mp4',
                },
            },
        ]);
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.file.waitForReady('qfile-1', {
            intervalMs: 1,
            timeoutMs: 100,
        });

        expect(result.status).toBe('ready');
        expect(mockFetch.calls).toHaveLength(2);
    });

    it('should throw when a file reaches failed terminal state', async () => {
        const mockFetch = createStaticMockFetch({
            status: 200,
            body: {
                id: 'qfile-failed',
                object: 'file',
                status: 'failed',
                created_at: 1,
                expires_at: 2,
                error: {
                    code: 'file_adapter_sync_failed',
                    message: 'Failed to download file from source URL',
                },
            },
        });
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        await expect(client.file.waitForReady('qfile-failed', {
            intervalMs: 1,
            timeoutMs: 100,
        })).rejects.toThrow('File qfile-failed is not ready: Failed to download file from source URL');
    });

    it('should upload, wait, and build a qfile content part in one step', async () => {
        const mockFetch = createMockFetch([
            {
                status: 200,
                body: {
                    id: 'qfile-uploaded',
                    object: 'file',
                    status: 'uploading',
                    created_at: 1,
                    file_name: 'clip.mp4',
                },
            },
            {
                status: 200,
                body: {
                    id: 'qfile-uploaded',
                    object: 'file',
                    status: 'ready',
                    created_at: 1,
                    synced_at: 2,
                    expires_at: 3,
                    file_name: 'clip.mp4',
                    content_type: 'video/mp4',
                },
            },
        ]);
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const part = await client.file.createContentPart({
            file: 'SGVsbG8=',
            filename: 'clip.mp4',
            purpose: 'assistants',
        }, {
            intervalMs: 1,
            timeoutMs: 100,
        });

        expect(JSON.parse(String(mockFetch.calls[0]?.init?.body))).toMatchObject({
            file: 'SGVsbG8=',
            filename: 'clip.mp4',
            purpose: 'assistants',
        });
        expect(part).toEqual({
            type: 'file',
            file: {
                file_id: 'qfile-uploaded',
                format: 'video/mp4',
            },
        });
    });

    it('should return both ready file and content part via createContentPartResult', async () => {
        const mockFetch = createMockFetch([
            {
                status: 200,
                body: {
                    id: 'qfile-uploaded-result',
                    object: 'file',
                    status: 'uploading',
                    created_at: 1,
                    file_name: 'clip.mp4',
                },
            },
            {
                status: 200,
                body: {
                    id: 'qfile-uploaded-result',
                    object: 'file',
                    status: 'ready',
                    created_at: 1,
                    synced_at: 2,
                    expires_at: 3,
                    file_name: 'clip.mp4',
                    content_type: 'video/mp4',
                },
            },
        ]);
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.file.createContentPartResult({
            file: 'SGVsbG8=',
            filename: 'clip.mp4',
            purpose: 'assistants',
        }, {
            intervalMs: 1,
            timeoutMs: 100,
        });

        expect(result).toEqual({
            file: expect.objectContaining({
                id: 'qfile-uploaded-result',
                status: 'ready',
                content_type: 'video/mp4',
            }),
            part: {
                type: 'file',
                file: {
                    file_id: 'qfile-uploaded-result',
                    format: 'video/mp4',
                },
            },
        });
    });

    it('should upload, wait, and build a qfile user message in one step', async () => {
        const mockFetch = createMockFetch([
            {
                status: 200,
                body: {
                    id: 'qfile-user-message',
                    object: 'file',
                    status: 'uploading',
                    created_at: 1,
                    file_name: 'clip.mp4',
                },
            },
            {
                status: 200,
                body: {
                    id: 'qfile-user-message',
                    object: 'file',
                    status: 'ready',
                    created_at: 1,
                    synced_at: 2,
                    expires_at: 3,
                    file_name: 'clip.mp4',
                    content_type: 'video/mp4',
                },
            },
        ]);
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const message = await client.file.createUserMessage('分析这个视频', {
            file: 'SGVsbG8=',
            filename: 'clip.mp4',
            purpose: 'assistants',
        }, {
            intervalMs: 1,
            timeoutMs: 100,
        });

        expect(message).toEqual({
            role: 'user',
            content: [
                { type: 'text', text: '分析这个视频' },
                {
                    type: 'file',
                    file: {
                        file_id: 'qfile-user-message',
                        format: 'video/mp4',
                    },
                },
            ],
        });
    });

    it('should return both ready file and qfile user message via createUserMessageResult', async () => {
        const mockFetch = createMockFetch([
            {
                status: 200,
                body: {
                    id: 'qfile-user-message-result',
                    object: 'file',
                    status: 'uploading',
                    created_at: 1,
                    file_name: 'clip.mp4',
                },
            },
            {
                status: 200,
                body: {
                    id: 'qfile-user-message-result',
                    object: 'file',
                    status: 'ready',
                    created_at: 1,
                    synced_at: 2,
                    expires_at: 3,
                    file_name: 'clip.mp4',
                    content_type: 'video/mp4',
                },
            },
        ]);
        const client = new QiniuAI({
            apiKey: 'sk-test',
            adapter: mockFetch.adapter,
        });

        const result = await client.file.createUserMessageResult('分析这个视频', {
            file: 'SGVsbG8=',
            filename: 'clip.mp4',
            purpose: 'assistants',
        }, {
            intervalMs: 1,
            timeoutMs: 100,
        });

        expect(result).toEqual({
            file: expect.objectContaining({
                id: 'qfile-user-message-result',
                status: 'ready',
                content_type: 'video/mp4',
            }),
            message: {
                role: 'user',
                content: [
                    { type: 'text', text: '分析这个视频' },
                    {
                        type: 'file',
                        file: {
                            file_id: 'qfile-user-message-result',
                            format: 'video/mp4',
                        },
                    },
                ],
            },
        });
    });
});
