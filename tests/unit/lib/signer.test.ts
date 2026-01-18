/**
 * Tests for InMemoryVectorStore with memory limits and Signer utilities.
 */
import { describe, it, expect, vi } from 'vitest';
import { InMemoryVectorStore, type VectorDocument } from '../../../src/ai/memory';
import { UrlCache, CachedSigner, type QiniuSigner, type SignedUrl } from '../../../src/lib/signer';

describe('InMemoryVectorStore with limits', () => {
    it('should respect maxEntries and evict FIFO when LRU not updated', async () => {
        const store = new InMemoryVectorStore({
            maxEntries: 2,
            evictionPolicy: 'lru',
        });

        // Add 2 documents one by one
        await store.add([{ id: 'a', content: 'doc A' }]);
        await store.add([{ id: 'b', content: 'doc B' }]);

        expect(store.size).toBe(2);

        // Add new document - should evict 'a' (oldest, since no access)
        await store.add([{ id: 'c', content: 'doc C' }]);

        expect(store.size).toBe(2);

        // Verify: 'a' evicted, 'b' and 'c' remain
        const results = await store.search('doc', 10);
        const ids = results.map(r => r.id);
        expect(ids).not.toContain('a');
        expect(ids).toContain('b');
        expect(ids).toContain('c');
    });

    it('should use FIFO eviction policy', async () => {
        const store = new InMemoryVectorStore({
            maxEntries: 2,
            evictionPolicy: 'fifo',
        });

        await store.add([{ id: 'first', content: 'doc 1' }]);
        await store.add([{ id: 'second', content: 'doc 2' }]);
        await store.add([{ id: 'third', content: 'doc 3' }]);

        expect(store.size).toBe(2);

        // First should be evicted
        const allDocs = await store.search('doc', 10);
        const ids = allDocs.map(r => r.id);
        expect(ids).not.toContain('first');
        expect(ids).toContain('second');
        expect(ids).toContain('third');
    });

    it('should call onWarn when threshold exceeded', async () => {
        const onWarn = vi.fn();
        const store = new InMemoryVectorStore({
            maxEntries: 10,
            warnThreshold: 0.5,
            onWarn,
        });

        // Add 5 documents (50%)
        await store.add([
            { id: '1', content: 'doc 1' },
            { id: '2', content: 'doc 2' },
            { id: '3', content: 'doc 3' },
            { id: '4', content: 'doc 4' },
            { id: '5', content: 'doc 5' },
        ]);

        expect(onWarn).toHaveBeenCalledWith(50, 10);
    });

    it('should report usage correctly', async () => {
        const store = new InMemoryVectorStore({ maxEntries: 100 });

        await store.add([
            { id: '1', content: 'doc 1' },
            { id: '2', content: 'doc 2' },
        ]);

        expect(store.size).toBe(2);
        expect(store.usage).toBe(0.02);
    });
});

describe('UrlCache', () => {
    it('should cache and return valid URLs', () => {
        const cache = new UrlCache({ maxSize: 10 });

        const signedUrl: SignedUrl = {
            url: 'https://cdn.qiniu.com/file.jpg?sign=xxx',
            expiresAt: Date.now() + 3600000, // 1 hour
        };

        cache.set('bucket', 'file.jpg', signedUrl);

        const cached = cache.get('bucket', 'file.jpg');
        expect(cached).toEqual(signedUrl);
    });

    it('should return undefined for expired URLs', () => {
        const cache = new UrlCache({
            maxSize: 10,
            ttlSafetyMargin: 0.5, // Expire at 50% of TTL
        });

        // Set expiry time to the past
        const signedUrl: SignedUrl = {
            url: 'https://cdn.qiniu.com/file.jpg?sign=xxx',
            expiresAt: Date.now() - 1000, // Already expired
        };

        cache.set('bucket', 'file.jpg', signedUrl);

        // Should be considered expired
        const cached = cache.get('bucket', 'file.jpg');
        expect(cached).toBeUndefined();
    });

    it('should handle fop parameter in cache key', () => {
        const cache = new UrlCache();

        const url1: SignedUrl = { url: 'url1', expiresAt: Date.now() + 3600000 };
        const url2: SignedUrl = { url: 'url2', expiresAt: Date.now() + 3600000 };

        cache.set('bucket', 'video.mp4', url1);
        cache.set('bucket', 'video.mp4', url2, 'vframe/jpg/offset/1');

        expect(cache.get('bucket', 'video.mp4')?.url).toBe('url1');
        expect(cache.get('bucket', 'video.mp4', 'vframe/jpg/offset/1')?.url).toBe('url2');
    });

    it('should evict LRU entries when at capacity', () => {
        const cache = new UrlCache({ maxSize: 2 });

        cache.set('b', 'a', { url: 'a', expiresAt: Date.now() + 3600000 });
        cache.set('b', 'b', { url: 'b', expiresAt: Date.now() + 3600000 });

        expect(cache.size).toBe(2);

        // Add new entry - should evict oldest
        cache.set('b', 'c', { url: 'c', expiresAt: Date.now() + 3600000 });

        expect(cache.size).toBe(2);
        // Either 'a' or 'b' evicted, 'c' should exist
        expect(cache.get('b', 'c')).toBeDefined();
    });
});

describe('CachedSigner', () => {
    it('should cache signed URLs', async () => {
        const mockSigner: QiniuSigner = {
            sign: vi.fn().mockResolvedValue({
                url: 'https://signed.url',
                expiresAt: Date.now() + 3600000,
            }),
        };

        const cached = new CachedSigner(mockSigner);

        // First call
        const result1 = await cached.sign('bucket', 'key');
        expect(result1.url).toBe('https://signed.url');
        expect(mockSigner.sign).toHaveBeenCalledTimes(1);

        // Second call - should use cache
        const result2 = await cached.sign('bucket', 'key');
        expect(result2.url).toBe('https://signed.url');
        expect(mockSigner.sign).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should pass through getUploadToken', async () => {
        const mockSigner: QiniuSigner = {
            sign: vi.fn(),
            getUploadToken: vi.fn().mockResolvedValue('upload-token'),
        };

        const cached = new CachedSigner(mockSigner);

        const token = await cached.getUploadToken('bucket');
        expect(token).toBe('upload-token');
    });

    it('should throw if base signer has no getUploadToken', async () => {
        const mockSigner: QiniuSigner = {
            sign: vi.fn(),
        };

        const cached = new CachedSigner(mockSigner);

        await expect(cached.getUploadToken('bucket'))
            .rejects.toThrow('Base signer does not support upload tokens');
    });
});
