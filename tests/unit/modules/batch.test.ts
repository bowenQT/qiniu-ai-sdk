import { describe, expect, it, vi } from 'vitest';
import { Batch, BATCH_HELPER_CONTRACT } from '../../../src/modules/batch';

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
    it('exposes explicit batch helper promotion and deferred boundaries', () => {
        expect(BATCH_HELPER_CONTRACT.promotionCandidates).toEqual(expect.arrayContaining([
            'BatchTaskSnapshot lifecycle helpers',
            'waitForCompletion',
        ]));
        expect(BATCH_HELPER_CONTRACT.deferredGaps).toEqual(expect.arrayContaining([
            'Mutating batch lifecycle probes remain env-gated and are not yet part of the default PR profile.',
            'Public maturity changes remain deferred until a tracked promotion decision artifact is recorded.',
        ]));
        expect(BATCH_HELPER_CONTRACT.defaultBehaviors).toEqual(expect.arrayContaining([
            'list() normalizes missing data arrays to [] so helper chaining remains predictable.',
            'waitForCompletion defaults to 2000ms polling and a 300000ms timeout unless overridden.',
        ]));
        expect(BATCH_HELPER_CONTRACT.verificationEvidence).toContain(
            'tests/unit/modules/batch.test.ts',
        );
    });

    it('creates a batch task handle and reuses it for get/wait/cancel/resume/delete', async () => {
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
        client.post
            .mockResolvedValueOnce({ id: 'batch_1', status: 'cancelling' })
            .mockResolvedValueOnce({ id: 'batch_1', status: 'in_progress' });
        client.delete.mockResolvedValueOnce({ deleted: true });

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
        await expect(handle.resume()).resolves.toMatchObject({ status: 'in_progress' });
        await expect(handle.delete()).resolves.toBeUndefined();

        expect(client.post).toHaveBeenNthCalledWith(2, '/batches/batch_1/cancel', {});
        expect(client.post).toHaveBeenNthCalledWith(3, '/batches/batch_1/resume', {});
        expect(client.delete).toHaveBeenCalledWith('/batches/batch_1');
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

        const listed = await batch.list({ page: 2, page_size: 20, status: 'completed' });
        expect(listed.object).toBe('list');
        expect(listed.data).toHaveLength(2);
        expect(listed.data[0]).toMatchObject({ id: 'batch_1', status: 'completed' });
        expect(listed.data[1]).toMatchObject({ id: 'batch_2', status: 'failed' });
        expect(typeof listed.data[0].get).toBe('function');
        expect(typeof listed.data[0].wait).toBe('function');
        expect(typeof listed.data[0].cancel).toBe('function');
        expect(typeof listed.data[0].resume).toBe('function');
        expect(typeof listed.data[0].delete).toBe('function');
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

    it('gets batches as handle-capable snapshots and supports chaining wait/cancel/resume/delete', async () => {
        const client = createMockClient();
        client.get
            .mockResolvedValueOnce({ id: 'batch_1', status: 'in_progress' })
            .mockResolvedValueOnce({ id: 'batch_1', status: 'completed' });
        client.post
            .mockResolvedValueOnce({ id: 'batch_1', status: 'cancelling' })
            .mockResolvedValueOnce({ id: 'batch_1', status: 'in_progress' });
        client.delete.mockResolvedValueOnce({ deleted: true });

        const batch = new Batch(client);
        const snapshot = await batch.get('batch_1');

        expect(snapshot).toMatchObject({ id: 'batch_1', status: 'in_progress' });
        expect(typeof snapshot.get).toBe('function');
        expect(typeof snapshot.wait).toBe('function');
        expect(typeof snapshot.cancel).toBe('function');
        expect(typeof snapshot.resume).toBe('function');
        expect(typeof snapshot.delete).toBe('function');
        await expect(snapshot.wait({ intervalMs: 1, timeoutMs: 100 })).resolves.toMatchObject({
            id: 'batch_1',
            status: 'completed',
        });
        await expect(snapshot.cancel()).resolves.toBeUndefined();
        await expect(snapshot.resume()).resolves.toMatchObject({ status: 'in_progress' });
        await expect(snapshot.delete()).resolves.toBeUndefined();

        expect(client.get).toHaveBeenCalledWith('/batches/batch_1');
        expect(client.post).toHaveBeenNthCalledWith(1, '/batches/batch_1/cancel', {});
        expect(client.post).toHaveBeenNthCalledWith(2, '/batches/batch_1/resume', {});
        expect(client.delete).toHaveBeenCalledWith('/batches/batch_1');
    });

    it('gets, resumes and deletes a batch', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue({ id: 'batch_1', status: 'completed' });
        client.post.mockResolvedValue({ id: 'batch_1', status: 'in_progress' });
        client.delete.mockResolvedValue({ deleted: true });

        const batch = new Batch(client);

        await expect(batch.resume('batch_1')).resolves.toMatchObject({ status: 'in_progress' });
        await expect(batch.delete('batch_1')).resolves.toBeUndefined();

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

    it('throws when get does not return a batch id', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue({ status: 'completed' });
        const batch = new Batch(client);

        await expect(batch.get('batch_1')).rejects.toThrow(
            'Batch get failed: no batch id returned for batch_1',
        );
    });
});
