/**
 * Capability cache for model feature detection.
 * Caches model capabilities per client/baseUrl to avoid redundant probing.
 * 
 * @example
 * ```typescript
 * import { capabilityCache } from './capability-cache';
 * 
 * // Check if model supports streaming JSON
 * const supports = capabilityCache.get(client, 'gemini-2.5-flash', 'stream_json_schema');
 * 
 * // Cache result after probing
 * capabilityCache.set(client, 'gemini-2.5-flash', 'stream_json_schema', true);
 * ```
 */

import type { IQiniuClient } from './types';

/**
 * Capability types that can be cached.
 */
export type CapabilityType =
    | 'stream_json_schema'   // Streaming with JSON schema response format
    | 'stream_json_object'   // Streaming with JSON object response format
    | 'vision'               // Vision/image input support
    | 'tools'                // Tool/function calling support
    | 'reasoning';           // Extended thinking/reasoning support

/**
 * Capability cache entry.
 */
interface CacheEntry {
    supported: boolean;
    timestamp: number;
}

/**
 * Default TTL for cache entries (1 hour).
 */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/**
 * Capability cache implementation.
 * Scoped by baseUrl + model + capability to avoid cross-provider contamination.
 */
class CapabilityCache {
    private cache = new Map<string, CacheEntry>();
    private ttlMs: number;

    constructor(ttlMs = DEFAULT_TTL_MS) {
        this.ttlMs = ttlMs;
    }

    /**
     * Generate cache key from client, model, and capability.
     */
    private getKey(client: IQiniuClient, model: string, capability: CapabilityType): string {
        const baseUrl = client.getBaseUrl();
        return `${baseUrl}:${model}:${capability}`;
    }

    /**
     * Get cached capability status.
     * Returns undefined if not cached or expired.
     */
    get(client: IQiniuClient, model: string, capability: CapabilityType): boolean | undefined {
        const key = this.getKey(client, model, capability);
        const entry = this.cache.get(key);

        if (!entry) {
            return undefined;
        }

        // Check expiration
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return undefined;
        }

        return entry.supported;
    }

    /**
     * Set capability status.
     */
    set(client: IQiniuClient, model: string, capability: CapabilityType, supported: boolean): void {
        const key = this.getKey(client, model, capability);
        this.cache.set(key, {
            supported,
            timestamp: Date.now(),
        });
    }

    /**
     * Check if capability is cached and supported.
     */
    isSupported(client: IQiniuClient, model: string, capability: CapabilityType): boolean {
        return this.get(client, model, capability) === true;
    }

    /**
     * Check if capability is cached and not supported.
     */
    isNotSupported(client: IQiniuClient, model: string, capability: CapabilityType): boolean {
        return this.get(client, model, capability) === false;
    }

    /**
     * Clear all cached entries.
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Clear entries for a specific client.
     */
    clearForClient(client: IQiniuClient): void {
        const baseUrl = client.getBaseUrl();
        const keysToDelete: string[] = [];



        for (const key of this.cache.keys()) {
            if (key.startsWith(baseUrl + ':')) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            this.cache.delete(key);
        }
    }

    /**
     * Get cache size.
     */
    size(): number {
        return this.cache.size;
    }
}

/**
 * Global capability cache instance.
 */
export const capabilityCache = new CapabilityCache();

/**
 * Create a new capability cache with custom TTL (for testing).
 */
export function createCapabilityCache(ttlMs?: number): CapabilityCache {
    return new CapabilityCache(ttlMs);
}
