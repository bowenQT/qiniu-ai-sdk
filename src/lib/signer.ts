/**
 * Qiniu URL Signer Interface.
 * Abstracts signing logic so browser builds can delegate to backend.
 * 
 * @example Browser usage (delegate to backend):
 * ```typescript
 * const signer: QiniuSigner = {
 *     sign: async (bucket, key, options) => {
 *         const res = await fetch(`/api/sign?bucket=${bucket}&key=${key}`);
 *         return res.json();
 *     }
 * };
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/** Signed URL result */
export interface SignedUrl {
    /** Full signed URL */
    url: string;
    /** URL expiration timestamp (ms) */
    expiresAt: number;
}

/** Sign options */
export interface SignOptions {
    /** URL expiration in seconds (default: 3600) */
    expiry?: number;
    /** Processing fop command (e.g., 'vframe/jpg/offset/1') */
    fop?: string;
}

/** Signer interface - abstracts signing logic */
export interface QiniuSigner {
    /** Sign a resource URL */
    sign(bucket: string, key: string, options?: SignOptions): Promise<SignedUrl>;

    /** Get upload token for a bucket */
    getUploadToken?(bucket: string, key?: string): Promise<string>;
}

// ============================================================================
// URL Cache
// ============================================================================

/** Cache configuration */
export interface UrlCacheConfig {
    /** Maximum cached URLs (default: 100) */
    maxSize?: number;
    /** TTL safety margin - expire cache earlier than actual URL (default: 0.8 = 80% of TTL) */
    ttlSafetyMargin?: number;
}

/** Cached URL entry */
interface CacheEntry {
    signedUrl: SignedUrl;
    accessTime: number;
}

/**
 * LRU cache for signed URLs.
 * Automatically evicts expired and least-recently-used entries.
 */
export class UrlCache {
    private cache = new Map<string, CacheEntry>();
    private readonly config: Required<UrlCacheConfig>;

    constructor(config: UrlCacheConfig = {}) {
        this.config = {
            maxSize: config.maxSize ?? 100,
            ttlSafetyMargin: config.ttlSafetyMargin ?? 0.8,
        };
    }

    /** Get cache key */
    private getKey(bucket: string, key: string, fop?: string): string {
        return `${bucket}:${key}:${fop ?? ''}`;
    }

    /** Get cached URL if valid */
    get(bucket: string, key: string, fop?: string): SignedUrl | undefined {
        const cacheKey = this.getKey(bucket, key, fop);
        const entry = this.cache.get(cacheKey);

        if (!entry) return undefined;

        // Check if expired
        const adjustedExpiry = this.adjustExpiry(entry.signedUrl.expiresAt);
        if (Date.now() >= adjustedExpiry) {
            this.cache.delete(cacheKey);
            return undefined;
        }

        // Update access time
        entry.accessTime = Date.now();
        return entry.signedUrl;
    }

    /** Cache a signed URL */
    set(bucket: string, key: string, signedUrl: SignedUrl, fop?: string): void {
        const cacheKey = this.getKey(bucket, key, fop);

        // Check if key already exists (update, not new entry)
        if (this.cache.has(cacheKey)) {
            this.cache.set(cacheKey, {
                signedUrl,
                accessTime: Date.now(),
            });
            return;
        }

        // Evict if at capacity (only for new entries)
        if (this.cache.size >= this.config.maxSize) {
            this.evictLRU();
        }

        this.cache.set(cacheKey, {
            signedUrl,
            accessTime: Date.now(),
        });
    }

    /** Clear all cached URLs */
    clear(): void {
        this.cache.clear();
    }

    /** Get current cache size */
    get size(): number {
        return this.cache.size;
    }

    /** Adjust expiry with safety margin */
    private adjustExpiry(expiresAt: number): number {
        const now = Date.now();
        const ttl = expiresAt - now;
        return now + (ttl * this.config.ttlSafetyMargin);
    }

    /** Evict least recently used entry */
    private evictLRU(): void {
        let lruKey: string | undefined;
        let lruTime = Infinity;

        for (const [key, entry] of this.cache) {
            if (entry.accessTime < lruTime) {
                lruTime = entry.accessTime;
                lruKey = key;
            }
        }

        if (lruKey) {
            this.cache.delete(lruKey);
        }
    }
}

// ============================================================================
// Cached Signer Wrapper
// ============================================================================

/**
 * Wraps a signer with URL caching.
 * 
 * @example
 * ```typescript
 * const cachedSigner = new CachedSigner(baseSigner, { maxSize: 100 });
 * const url = await cachedSigner.sign('bucket', 'video.mp4', { fop: 'vframe/jpg/offset/1' });
 * ```
 */
export class CachedSigner implements QiniuSigner {
    private readonly cache: UrlCache;
    private readonly baseSigner: QiniuSigner;

    constructor(baseSigner: QiniuSigner, cacheConfig?: UrlCacheConfig) {
        this.baseSigner = baseSigner;
        this.cache = new UrlCache(cacheConfig);
    }

    async sign(bucket: string, key: string, options?: SignOptions): Promise<SignedUrl> {
        // Skip cache if custom expiry is specified (different TTLs = different URLs)
        if (options?.expiry) {
            return this.baseSigner.sign(bucket, key, options);
        }

        // Check cache first (only for default expiry)
        const cached = this.cache.get(bucket, key, options?.fop);
        if (cached) return cached;

        // Sign and cache
        const signedUrl = await this.baseSigner.sign(bucket, key, options);
        this.cache.set(bucket, key, signedUrl, options?.fop);
        return signedUrl;
    }

    async getUploadToken(bucket: string, key?: string): Promise<string> {
        if (!this.baseSigner.getUploadToken) {
            throw new Error('Base signer does not support upload tokens');
        }
        return this.baseSigner.getUploadToken(bucket, key);
    }

    /** Clear the URL cache */
    clearCache(): void {
        this.cache.clear();
    }

    /** Get cache statistics */
    get cacheSize(): number {
        return this.cache.size;
    }
}
