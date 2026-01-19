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
     * Check if a call is allowed and track it.
     * 
     * @param agentId - The agent making the call
     * @param toolName - The tool being called (used if scope is 'tool')
     * @returns Whether the call is allowed
     */
    isAllowed(agentId: string, toolName: string): boolean {
        const key = this.getKey(agentId, toolName);
        const now = Date.now();
        const entry = this.getOrCreateEntry(key);

        // Remove expired timestamps
        this.pruneExpired(entry, now);

        return entry.timestamps.length < this.config.maxCalls;
    }

    /**
     * Track a call (should be called after isAllowed returns true).
     */
    track(agentId: string, toolName: string): void {
        const key = this.getKey(agentId, toolName);
        const entry = this.getOrCreateEntry(key);
        entry.timestamps.push(Date.now());
    }

    /**
     * Execute a call with rate limiting.
     * 
     * @param agentId - The agent making the call
     * @param toolName - The tool being called
     * @param execute - The function to execute
     * @returns Result of execution
     * @throws Error if rate limited and onLimit is 'reject'
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

        // Queue the call
        return this.enqueue(execute);
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

        // Time until oldest timestamp expires
        const oldest = entry.timestamps[0];
        return Math.max(0, oldest + this.config.windowMs - now);
    }

    /**
     * Reset rate limit for an agent/tool.
     */
    reset(agentId: string, toolName?: string): void {
        if (toolName && this.config.scope === 'tool') {
            this.entries.delete(this.getKey(agentId, toolName));
        } else {
            // Reset all entries for this agent
            for (const key of this.entries.keys()) {
                if (key.startsWith(`${agentId}:`)) {
                    this.entries.delete(key);
                }
            }
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
    // Private Methods
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

    private async enqueue<T>(execute: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push({
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

            // Wait until we have a slot
            // We use a simple "any agent" check since we don't have agent info in queue
            await this.waitForSlot();

            this.queue.shift();

            try {
                const result = await call.execute();
                call.resolve(result);
            } catch (error) {
                call.reject(error);
            }
        }

        this.processing = false;
    }

    private async waitForSlot(): Promise<void> {
        // Simple exponential backoff check
        const checkInterval = 100; // 100ms
        const maxWait = this.config.windowMs;
        let waited = 0;

        while (waited < maxWait) {
            // Check if any slot is available
            // Since we don't have context, wait for window to pass
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;

            // If we've waited long enough for at least one slot to free up
            if (waited >= this.config.windowMs) {
                return;
            }
        }
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
