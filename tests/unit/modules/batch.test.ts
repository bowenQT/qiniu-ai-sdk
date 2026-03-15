import { describe, expect, it, vi } from 'vitest';
import { Batch } from '../../../src/modules/batch';

function createMockClient() {
    return {
        post: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        getLogger: () => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        }),
    } as any;
}

describe('Batch', () => {
    it('creates a batch task handle and reuses it for get/wait/cancel', async () => {
        const client = createMockClient();
        client.post.mockResolvedValueOnce({
            id: 'batch_1',
            status: 'validating',
            endpoint: '/v1/chat/completions',
            input_files_url: 'https://example.com/input.jsonl',
        });
        client.get
            .mockResolvedValueOnce({
                id: 'batch_1',
                status: 'in_progress',
            })
            .mockResolvedValueOnce({
                id: 'batch_1',
                status: 'completed',
                output_files_url: 'https://example.com/output.jsonl',
            });
        client.post.mockResolvedValueOnce({ id: 'batch_1', status: 'cancelling' });

        const batch = new Batch(client);
        const handle = await batch.create({
            input_files_url: 'https://example.com/input.jsonl',
            endpoint: '/v1/chat/completions',
        });

        expect(handle.id).toBe('batch_1');
        expect(client.post).toHaveBeenNthCalledWith(1, '/batches', {
            input_files_url: 'https://example.com/input.jsonl',
            endpoint: '/v1/chat/completions',
        });

        await expect(handle.get()).resolves.toMatchObject({ status: 'in_progress' });
        await expect(handle.wait({ intervalMs: 1, timeoutMs: 100 })).resolves.toMatchObject({
            status: 'completed',
            output_files_url: 'https://example.com/output.jsonl',
        });
        await expect(handle.cancel()).resolves.toBeUndefined();
        expect(client.post).toHaveBeenLastCalledWith('/batches/batch_1/cancel', {});
    });

    it('lists batches with query params and normalizes missing data arrays', async () => {
        const client = createMockClient();
        client.get
            .mockResolvedValueOnce({
                object: 'list',
                data: [
                    { id: 'batch_1', status: 'completed' },
                    { id: 'batch_2', status: 'failed' },
                ],
            })
            .mockResolvedValueOnce({
                object: 'list',
            });

        const batch = new Batch(client);

        await expect(batch.list({ page: 2, page_size: 20, status: 'completed' })).resolves.toEqual({
            object: 'list',
            data: [
                { id: 'batch_1', status: 'completed' },
                { id: 'batch_2', status: 'failed' },
            ],
        });
        expect(client.get).toHaveBeenNthCalledWith(1, '/batches', {
            page: '2',
            page_size: '20',
            status: 'completed',
        });

        await expect(batch.list()).resolves.toEqual({
            object: 'list',
            data: [],
        });
    });

    it('gets, resumes and deletes a batch', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue({ id: 'batch_1', status: 'completed' });
        client.post.mockResolvedValue({ id: 'batch_1', status: 'in_progress' });
        client.delete.mockResolvedValue({ deleted: true });

        const batch = new Batch(client);

        await expect(batch.get('batch_1')).resolves.toMatchObject({ id: 'batch_1' });
        await expect(batch.resume('batch_1')).resolves.toMatchObject({ status: 'in_progress' });
        await expect(batch.delete('batch_1')).resolves.toBeUndefined();

        expect(client.get).toHaveBeenCalledWith('/batches/batch_1');
        expect(client.post).toHaveBeenCalledWith('/batches/batch_1/resume', {});
        expect(client.delete).toHaveBeenCalledWith('/batches/batch_1');
    });

    it('waits until a batch reaches a terminal status', async () => {
        const client = createMockClient();
        client.get
            .mockResolvedValueOnce({ id: 'batch_1', status: 'validating' })
            .mockResolvedValueOnce({ id: 'batch_1', status: 'finalizing' })
            .mockResolvedValueOnce({ id: 'batch_1', status: 'completed' });

        const batch = new Batch(client);

        await expect(batch.waitForCompletion('batch_1', {
            intervalMs: 1,
            timeoutMs: 100,
        })).resolves.toMatchObject({
            id: 'batch_1',
            status: 'completed',
        });
    });

    it('throws when create does not return a batch id', async () => {
        const client = createMockClient();
        client.post.mockResolvedValue({ status: 'validating' });
        const batch = new Batch(client);

        await expect(batch.create({
            input_files_url: 'https://example.com/input.jsonl',
            endpoint: '/v1/chat/completions',
        })).rejects.toThrow('Batch create failed: no batch id returned');
    });
});
