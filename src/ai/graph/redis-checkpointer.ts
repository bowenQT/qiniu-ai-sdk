/**
 * Redis Checkpointer implementation.
 * Requires ioredis as a peer dependency.
 *
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 * import { RedisCheckpointer } from '@bowenqt/qiniu-ai-sdk';
 *
 * const redis = new Redis('redis://localhost:6379');
 * const checkpointer = new RedisCheckpointer(redis, { prefix: 'myapp:' });
 * ```
 */

import type { AgentState } from '../internal-types';
import type { Checkpoint, CheckpointMetadata, Checkpointer, SerializedAgentState } from './checkpointer';
import { serializeState } from './checkpointer';

/** Redis client interface (compatible with ioredis) */
export interface RedisClient {
    set(key: string, value: string, exMode?: string, time?: number): Promise<'OK' | null>;
    get(key: string): Promise<string | null>;
    del(key: string | string[]): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    smembers(key: string): Promise<string[]>;
    sadd(key: string, ...members: string[]): Promise<number>;
    srem(key: string, ...members: string[]): Promise<number>;
}

/** Redis checkpointer configuration */
export interface RedisCheckpointerConfig {
    /** Key prefix (default: 'qiniu:checkpoint:') */
    prefix?: string;
    /** TTL in seconds (default: no expiry) */
    ttlSeconds?: number;
}

/**
 * Redis-based checkpointer.
 * Uses ioredis-compatible client interface.
 */
export class RedisCheckpointer implements Checkpointer {
    private readonly redis: RedisClient;
    private readonly prefix: string;
    private readonly ttlSeconds?: number;

    constructor(client: RedisClient, config: RedisCheckpointerConfig = {}) {
        this.redis = client;
        this.prefix = config.prefix ?? 'qiniu:checkpoint:';
        this.ttlSeconds = config.ttlSeconds;
    }

    private checkpointKey(id: string): string {
        return `${this.prefix}data:${id}`;
    }

    private threadKey(threadId: string): string {
        return `${this.prefix}thread:${threadId}`;
    }

    async save(
        threadId: string,
        state: AgentState,
        options?: Record<string, unknown>
    ): Promise<CheckpointMetadata> {
        // Check for suppressCheckpoint (parallel execution)
        const opts = options as { suppressCheckpoint?: boolean; status?: string; pendingApproval?: unknown; custom?: Record<string, unknown> } | undefined;
        if (opts?.suppressCheckpoint) {
            return {
                id: `suppressed_${Date.now()}`,
                threadId,
                createdAt: Date.now(),
                stepCount: state.stepCount,
                status: 'active',
            };
        }


        const id = `ckpt_${threadId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;


        const metadata: CheckpointMetadata = {
            id,
            threadId,
            createdAt: Date.now(),
            stepCount: state.stepCount,
            status: (opts?.status as any) ?? 'active',
            pendingApproval: opts?.pendingApproval as any,
            custom: opts?.custom ?? (opts && !('status' in opts) ? opts as Record<string, unknown> : undefined),
        };

        const checkpoint: Checkpoint = {
            metadata,
            state: serializeState(state),
        };

        const key = this.checkpointKey(id);
        const data = JSON.stringify(checkpoint);

        if (this.ttlSeconds) {
            await this.redis.set(key, data, 'EX', this.ttlSeconds);
        } else {
            await this.redis.set(key, data);
        }

        // Add to thread index
        await this.redis.sadd(this.threadKey(threadId), id);

        return metadata;
    }

    async load(threadId: string): Promise<Checkpoint | null> {
        const ids = await this.redis.smembers(this.threadKey(threadId));
        if (ids.length === 0) return null;

        let latest: Checkpoint | null = null;

        for (const id of ids) {
            const data = await this.redis.get(this.checkpointKey(id));
            if (data) {
                const checkpoint = JSON.parse(data) as Checkpoint;
                if (!latest || checkpoint.metadata.createdAt > latest.metadata.createdAt) {
                    latest = checkpoint;
                }
            }
        }

        return latest;
    }

    async list(threadId: string): Promise<CheckpointMetadata[]> {
        const ids = await this.redis.smembers(this.threadKey(threadId));
        const result: CheckpointMetadata[] = [];

        for (const id of ids) {
            const data = await this.redis.get(this.checkpointKey(id));
            if (data) {
                const checkpoint = JSON.parse(data) as Checkpoint;
                result.push(checkpoint.metadata);
            }
        }

        return result.sort((a, b) => b.createdAt - a.createdAt);
    }

    async delete(checkpointId: string): Promise<boolean> {
        const data = await this.redis.get(this.checkpointKey(checkpointId));
        if (!data) return false;

        const checkpoint = JSON.parse(data) as Checkpoint;
        await this.redis.del(this.checkpointKey(checkpointId));
        await this.redis.srem(this.threadKey(checkpoint.metadata.threadId), checkpointId);

        return true;
    }

    async clear(threadId: string): Promise<number> {
        const ids = await this.redis.smembers(this.threadKey(threadId));
        if (ids.length === 0) return 0;

        const keys = ids.map(id => this.checkpointKey(id));
        await this.redis.del(keys);
        await this.redis.del(this.threadKey(threadId));

        return ids.length;
    }

    async clearHistory(threadId: string, keepId?: string): Promise<number> {
        const checkpoints = await this.list(threadId);
        if (checkpoints.length <= 1) return 0;

        // Determine which ID to keep (provided or latest)
        const idToKeep = keepId || checkpoints[0].id;

        // Delete all except the one to keep
        let count = 0;
        for (const cp of checkpoints) {
            if (cp.id !== idToKeep) {
                await this.delete(cp.id);
                count++;
            }
        }

        return count;
    }
}
