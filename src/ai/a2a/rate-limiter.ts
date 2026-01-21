/**
 * A2A Rate Limiter - Sliding window rate limiting for agent calls.
 */

import type { RateLimitConfig } from './types';

// ============================================================================
// Types
// ============================================================================

interface RateLimitEntry {
    timestamps: number[];
}

interface QueuedCall<T> {
    agentId: string;
    toolName: string;
    execute: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
}

// ============================================================================
// Rate Limiter
// ============================================================================

/**
 * Sliding window rate limiter for A2A calls.
 */
export class A2ARateLimiter {
    private config: Required<RateLimitConfig>;
    private entries = new Map<string, RateLimitEntry>();
    private queue: QueuedCall<unknown>[] = [];
    private processing = false;

    constructor(config: RateLimitConfig) {
        this.config = {
            maxCalls: config.maxCalls,
            windowMs: config.windowMs,
            scope: config.scope,
            onLimit: config.onLimit,
        };
    }

    /**
     * Check if a call is allowed.
     */
    isAllowed(agentId: string, toolName: string): boolean {
        const key = this.getKey(agentId, toolName);
        const now = Date.now();
        const entry = this.getOrCreateEntry(key);
        this.pruneExpired(entry, now);
        return entry.timestamps.length < this.config.maxCalls;
    }

    /**
     * Track a call.
     */
    track(agentId: string, toolName: string): void {
        const key = this.getKey(agentId, toolName);
        const entry = this.getOrCreateEntry(key);
        entry.timestamps.push(Date.now());
    }

    /**
     * Execute a call with rate limiting.
     * 
     * @throws RateLimitError if onLimit is 'reject' and limit exceeded
     * @throws RateLimitError if onLimit is 'queue' and wait times out (strict mode)
     */
    async execute<T>(
        agentId: string,
        toolName: string,
        execute: () => Promise<T>
    ): Promise<T> {
        if (this.isAllowed(agentId, toolName)) {
            this.track(agentId, toolName);
            return execute();
        }

        if (this.config.onLimit === 'reject') {
            throw new RateLimitError(
                agentId,
                toolName,
                this.getTimeUntilSlot(agentId, toolName)
            );
        }

        // Queue mode (strict): wait for slot or throw
        return this.enqueue(agentId, toolName, execute);
    }

    /**
     * Wait for a slot to become available (for external use).
     * Throws if timeout exceeded.
     */
    async waitForSlot(agentId: string, toolName: string, timeoutMs?: number): Promise<void> {
        const timeout = timeoutMs ?? this.config.windowMs * 2;
        const checkInterval = 50;
        let waited = 0;

        while (waited < timeout) {
            if (this.isAllowed(agentId, toolName)) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;
        }

        throw new RateLimitError(agentId, toolName, this.getTimeUntilSlot(agentId, toolName));
    }

    /**
     * Get time until next available slot (ms).
     */
    getTimeUntilSlot(agentId: string, toolName: string): number {
        const key = this.getKey(agentId, toolName);
        const entry = this.entries.get(key);
        if (!entry || entry.timestamps.length === 0) {
            return 0;
        }

        const now = Date.now();
        this.pruneExpired(entry, now);

        if (entry.timestamps.length < this.config.maxCalls) {
            return 0;
        }

        const oldest = entry.timestamps[0];
        return Math.max(0, oldest + this.config.windowMs - now);
    }

    /**
     * Reset rate limit for an agent/tool.
     */
    reset(agentId: string, toolName?: string): void {
        if (this.config.scope === 'tool') {
            if (toolName) {
                this.entries.delete(this.getKey(agentId, toolName));
            } else {
                const prefix = `${agentId}:`;
                for (const key of [...this.entries.keys()]) {
                    if (key.startsWith(prefix)) {
                        this.entries.delete(key);
                    }
                }
            }
        } else {
            this.entries.delete(agentId);
        }
    }

    /**
     * Clear all rate limit data.
     */
    clear(): void {
        this.entries.clear();
        this.queue = [];
    }

    // ========================================================================
    // Private
    // ========================================================================

    private getKey(agentId: string, toolName: string): string {
        return this.config.scope === 'tool'
            ? `${agentId}:${toolName}`
            : agentId;
    }

    private getOrCreateEntry(key: string): RateLimitEntry {
        let entry = this.entries.get(key);
        if (!entry) {
            entry = { timestamps: [] };
            this.entries.set(key, entry);
        }
        return entry;
    }

    private pruneExpired(entry: RateLimitEntry, now: number): void {
        const cutoff = now - this.config.windowMs;
        entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    }

    private async enqueue<T>(
        agentId: string,
        toolName: string,
        execute: () => Promise<T>
    ): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push({
                agentId,
                toolName,
                execute: execute as () => Promise<unknown>,
                resolve: resolve as (value: unknown) => void,
                reject,
            });
            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            const call = this.queue[0];

            try {
                // Strict wait - throws on timeout
                await this.waitForSlot(call.agentId, call.toolName);
                this.track(call.agentId, call.toolName);
                this.queue.shift();
                const result = await call.execute();
                call.resolve(result);
            } catch (error) {
                this.queue.shift();
                call.reject(error);
            }
        }

        this.processing = false;
    }
}

// ============================================================================
// Errors
// ============================================================================

export class RateLimitError extends Error {
    readonly code = 'RATE_LIMITED' as const;
    readonly agentId: string;
    readonly toolName: string;
    readonly retryAfterMs: number;

    constructor(agentId: string, toolName: string, retryAfterMs: number) {
        super(`Rate limit exceeded for ${agentId}:${toolName}. Retry after ${retryAfterMs}ms`);
        this.name = 'RateLimitError';
        this.agentId = agentId;
        this.toolName = toolName;
        this.retryAfterMs = retryAfterMs;
    }
}
