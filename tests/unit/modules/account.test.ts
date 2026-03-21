import { afterEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../../src/modules/account';

function createMockClient() {
    return {
        getAbsolute: vi.fn(async () => ({ status: true, data: [] })),
        getBaseUrl: vi.fn(() => 'https://api.qnaigc.com/v1'),
        getLogger: vi.fn(() => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        })),
        getApiKey: vi.fn(() => 'sk-test'),
        get: vi.fn(),
        post: vi.fn(),
        postAbsolute: vi.fn(),
        postStream: vi.fn(),
        createChildTransport: vi.fn(),
    };
}

describe('Account Module', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('currently exposes only the usage surface', () => {
        const publicMethods = Object.getOwnPropertyNames(Account.prototype)
            .filter((name) => name !== 'constructor')
            .sort();

        expect(publicMethods).toEqual(['usage']);
    });

    it('should sign AK/SK usage requests with a Qiniu authorization header', async () => {
        const mockClient = createMockClient();
        const account = new Account(mockClient as any);
        const importKey = vi.fn(async () => 'imported-key');
        const sign = vi.fn(async () => Uint8Array.from([1, 2, 3]).buffer);

        vi.stubGlobal('crypto', {
            subtle: {
                importKey,
                sign,
            },
        } as Crypto);

        await account.usage({
            granularity: 'day',
            start: '2026-03-01',
            end: '2026-03-02',
            auth: {
                accessKey: 'test-ak',
                secretKey: 'test-sk',
            },
        });

        expect(importKey).toHaveBeenCalledOnce();
        expect(sign).toHaveBeenCalledOnce();
        expect(mockClient.getAbsolute).toHaveBeenCalledWith(
            'https://api.qnaigc.com/v2/stat/usage',
            {
                granularity: 'day',
                start: '2026-03-01',
                end: '2026-03-02',
            },
            undefined,
            {
                headers: {
                    Authorization: 'Qiniu test-ak:AQID',
                },
            }
        );
    });

    it('should fail fast when Web Crypto is unavailable for AK/SK usage auth', async () => {
        const mockClient = createMockClient();
        const account = new Account(mockClient as any);

        vi.stubGlobal('crypto', {} as Crypto);

        await expect(account.usage({
            granularity: 'day',
            start: '2026-03-01',
            end: '2026-03-02',
            auth: {
                accessKey: 'test-ak',
                secretKey: 'test-sk',
            },
        })).rejects.toThrow('Web Crypto API is required for Qiniu auth signing');

        expect(mockClient.getAbsolute).not.toHaveBeenCalled();
    });

    it('should fail fast when btoa is unavailable for AK/SK usage auth', async () => {
        const mockClient = createMockClient();
        const account = new Account(mockClient as any);

        vi.stubGlobal('crypto', {
            subtle: {
                importKey: vi.fn(async () => 'imported-key'),
                sign: vi.fn(async () => Uint8Array.from([1, 2, 3]).buffer),
            },
        } as Crypto);
        vi.stubGlobal('btoa', undefined);

        await expect(account.usage({
            granularity: 'day',
            start: '2026-03-01',
            end: '2026-03-02',
            auth: {
                accessKey: 'test-ak',
                secretKey: 'test-sk',
            },
        })).rejects.toThrow('Global btoa() is required for Qiniu auth signing');

        expect(mockClient.getAbsolute).not.toHaveBeenCalled();
    });
});
