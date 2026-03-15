import { describe, expect, it, vi } from 'vitest';
import { Admin } from '../../../src/modules/admin';
import { APIError } from '../../../src/lib/request';

function createMockClient() {
    return {
        post: vi.fn(),
        get: vi.fn(),
        getLogger: () => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        }),
    } as any;
}

describe('Admin', () => {
    it('creates API keys via the current /apikeys contract and normalizes nested key payloads', async () => {
        const client = createMockClient();
        client.post.mockResolvedValue({
            status: true,
            data: {
                keys: [
                    {
                        key: 'sk-1',
                        name: 'prod-key-1',
                        createdAt: '2026-03-15T00:00:00Z',
                        enabled: true,
                    },
                ],
            },
        });

        const admin = new Admin(client);
        const keys = await admin.createKeys({
            count: 1,
            names: ['prod-key-1'],
        });

        expect(client.post).toHaveBeenCalledWith('/apikeys', {
            count: 1,
            names: ['prod-key-1'],
        });
        expect(keys).toEqual([
            expect.objectContaining({
                key: 'sk-1',
                name: 'prod-key-1',
                created_at: '2026-03-15T00:00:00Z',
                status: 'active',
                enabled: true,
            }),
        ]);
    });

    it('falls back to the legacy admin endpoint when /apikeys is unavailable', async () => {
        const client = createMockClient();
        client.post
            .mockRejectedValueOnce(new APIError('Not found', 404))
            .mockResolvedValueOnce({
                keys: [
                    {
                        key: 'sk-legacy',
                        name: 'legacy-key',
                        created_at: '2026-03-15T00:00:00Z',
                    },
                ],
            });

        const admin = new Admin(client);
        const keys = await admin.createKeys({
            count: 1,
            name_prefix: 'legacy-',
        });

        expect(client.post).toHaveBeenNthCalledWith(1, '/apikeys', {
            count: 1,
            name_prefix: 'legacy-',
        });
        expect(client.post).toHaveBeenNthCalledWith(2, '/admin/keys', {
            count: 1,
            name_prefix: 'legacy-',
        });
        expect(keys[0]?.key).toBe('sk-legacy');
    });

    it('validates explicit names before making a request', async () => {
        const admin = new Admin(createMockClient());

        await expect(admin.createKeys({
            count: 2,
            names: ['only-one'],
        })).rejects.toThrow('names length must match count');
    });

    it('normalizes listKeys responses from nested data payloads', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue({
            data: {
                keys: [
                    {
                        key: 'sk-list',
                        name: 'list-key',
                        createdAt: '2026-03-15T00:00:00Z',
                        enabled: false,
                    },
                ],
            },
        });

        const admin = new Admin(client);
        const keys = await admin.listKeys();

        expect(client.get).toHaveBeenCalledWith('/admin/keys');
        expect(keys).toEqual([
            expect.objectContaining({
                key: 'sk-list',
                name: 'list-key',
                created_at: '2026-03-15T00:00:00Z',
                status: 'revoked',
            }),
        ]);
    });

    it('normalizes getKey responses and returns null for 404', async () => {
        const client = createMockClient();
        client.get
            .mockResolvedValueOnce({
                data: {
                    key: 'sk-detail',
                    name: 'detail-key',
                    createdAt: '2026-03-15T00:00:00Z',
                    enabled: true,
                },
            })
            .mockRejectedValueOnce(new APIError('missing', 404));

        const admin = new Admin(client);

        await expect(admin.getKey('sk-detail')).resolves.toEqual(
            expect.objectContaining({
                key: 'sk-detail',
                created_at: '2026-03-15T00:00:00Z',
                status: 'active',
            }),
        );
        await expect(admin.getKey('sk-missing')).resolves.toBeNull();
    });

    it('revokeKey posts to the revoke endpoint', async () => {
        const client = createMockClient();
        client.post.mockResolvedValue(undefined);
        const admin = new Admin(client);

        await admin.revokeKey('sk-revoke');

        expect(client.post).toHaveBeenCalledWith('/admin/keys/revoke', { key: 'sk-revoke' });
    });
});
