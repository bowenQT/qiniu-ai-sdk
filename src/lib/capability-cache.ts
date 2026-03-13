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

import type { LanguageModelClient } from '../core/client';

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
    private clientIds = new WeakMap<object, string>();
    private clientIdCounter = 0;
    private ttlMs: number;

    constructor(ttlMs = DEFAULT_TTL_MS) {
        this.ttlMs = ttlMs;
    }

    /**
     * Generate cache key from client, model, and capability.
     */
    private getClientIdentity(client: LanguageModelClient): string {
        if (typeof client.getBaseUrl === 'function') {
            return client.getBaseUrl();
        }

        const clientObject = client as object;
        const existingId = this.clientIds.get(clientObject);
        if (existingId) {
            return existingId;
        }

        const constructorName = (clientObject as { constructor?: { name?: string } }).constructor?.name ?? 'anonymous-client';
        const nextId = `${constructorName}:${++this.clientIdCounter}`;
        this.clientIds.set(clientObject, nextId);
        return nextId;
    }

    private getKey(client: LanguageModelClient, model: string, capability: CapabilityType): string {
        return `${this.getClientIdentity(client)}:${model}:${capability}`;
    }

    /**
     * Get cached capability status.
     * Returns undefined if not cached or expired.
     */
    get(client: LanguageModelClient, model: string, capability: CapabilityType): boolean | undefined {
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
    set(client: LanguageModelClient, model: string, capability: CapabilityType, supported: boolean): void {
        const key = this.getKey(client, model, capability);
        this.cache.set(key, {
            supported,
            timestamp: Date.now(),
        });
    }

    /**
     * Check if capability is cached and supported.
     */
    isSupported(client: LanguageModelClient, model: string, capability: CapabilityType): boolean {
        return this.get(client, model, capability) === true;
    }

    /**
     * Check if capability is cached and not supported.
     */
    isNotSupported(client: LanguageModelClient, model: string, capability: CapabilityType): boolean {
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
    clearForClient(client: LanguageModelClient): void {
        const clientIdentity = this.getClientIdentity(client);
        const keysToDelete: string[] = [];



        for (const key of this.cache.keys()) {
            if (key.startsWith(clientIdentity + ':')) {
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
