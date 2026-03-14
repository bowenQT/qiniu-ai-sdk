/**
 * KodoCheckpointer - State persistence using Qiniu Kodo Object Storage.
 *
 * Implements the Checkpointer interface for serverless-compatible
 * durable state management.
 *
 * **⚠️ Node.js Only**: This module uses `node:crypto` for HMAC-SHA1 signing
 * and is NOT compatible with Edge runtimes (CloudFlare Workers, Vercel Edge).
 * For Edge environments, use MemoryCheckpointer or implement a backend proxy.
 *
 * **Download Domain**: If your bucket doesn't have a default Kodo domain bound,
 * you MUST provide `downloadDomain` to avoid 404 errors on load().
 *
 * @example
 * ```typescript
 * import { KodoCheckpointer } from '@bowenqt/qiniu-ai-sdk/node';
 *
 * const checkpointer = new KodoCheckpointer({
 *     bucket: 'my-checkpoints',
 *     accessKey: process.env.QINIU_ACCESS_KEY!,
 *     secretKey: process.env.QINIU_SECRET_KEY!,
 *     region: 'z0',
 *     // Required if bucket has no default Kodo domain
 *     downloadDomain: 'cdn.example.com',
 * });
 * ```
 */

import type { AgentState } from '../ai/internal-types';
import type {
    Checkpointer,
    Checkpoint,
    CheckpointMetadata,
    CheckpointSaveOptions,
} from '../ai/graph/checkpointer';
import { serializeState } from '../ai/graph/checkpointer';
import { KodoClient, type KodoRegion } from './internal/kodo-client';

export type { KodoRegion } from './internal/kodo-client';

/** KodoCheckpointer configuration */
export interface KodoCheckpointerConfig {
    /** Kodo bucket name */
    bucket: string;
    /** Qiniu Access Key */
    accessKey: string;
    /** Qiniu Secret Key */
    secretKey: string;
    /** Region code (default: 'z0') */
    region?: KodoRegion;
    /** Key prefix (default: 'checkpoints/') */
    prefix?: string;
    /** Upload token expiry in seconds (default: 3600) */
    tokenExpiry?: number;
    /** Max retries for API calls (default: 3) */
    maxRetries?: number;
    /**
     * Download domain (e.g., 'cdn.example.com').
     * **REQUIRED** unless bucket has a default Kodo domain bound.
     * Without this, load() will return 404 errors.
     */
    downloadDomain?: string;
}

/**
 * Kodo-backed Checkpointer implementation.
 *
 * Stores checkpoints as JSON objects in Qiniu Kodo.
 * Each thread has one checkpoint file: `{prefix}{threadId}.json`
 */
export class KodoCheckpointer implements Checkpointer {
    private readonly client: KodoClient;

    constructor(config: KodoCheckpointerConfig) {
        this.client = new KodoClient(config);
    }

    async save(
        threadId: string,
        state: AgentState,
        options?: CheckpointSaveOptions | Record<string, unknown>,
    ): Promise<CheckpointMetadata> {
        if (options && 'suppressCheckpoint' in options && (options as CheckpointSaveOptions).suppressCheckpoint) {
            return {
                id: `suppressed_${Date.now()}`,
                threadId,
                createdAt: Date.now(),
                stepCount: state.stepCount,
                status: 'active',
            };
        }

        const key = this.client.getObjectKey(`${threadId}.json`);
        const serialized = serializeState(state);

        let status: 'active' | 'pending_approval' | 'completed' = 'active';
        let pendingApproval: CheckpointMetadata['pendingApproval'] | undefined;
        let custom: Record<string, unknown> | undefined;

        if (options) {
            if ('status' in options || 'pendingApproval' in options || 'custom' in options) {
                const opts = options as CheckpointSaveOptions;
                status = opts.status ?? 'active';
                pendingApproval = opts.pendingApproval;
                custom = opts.custom;
            } else {
                custom = options as Record<string, unknown>;
            }
        }

        const metadata: CheckpointMetadata = {
            id: threadId,
            threadId,
            createdAt: Date.now(),
            stepCount: state.stepCount,
            status,
            pendingApproval,
            custom,
        };

        const checkpoint: Checkpoint = {
            metadata,
            state: serialized,
        };

        await this.client.uploadJson(key, checkpoint);

        return metadata;
    }

    async load(threadId: string): Promise<Checkpoint | null> {
        const key = this.client.getObjectKey(`${threadId}.json`);
        return this.client.downloadJson<Checkpoint>(key);
    }

    async list(threadId: string): Promise<CheckpointMetadata[]> {
        const checkpoint = await this.load(threadId);
        return checkpoint ? [checkpoint.metadata] : [];
    }

    async delete(checkpointId: string): Promise<boolean> {
        const key = this.client.getObjectKey(`${checkpointId}.json`);
        return this.client.delete(key);
    }

    async clear(threadId: string): Promise<number> {
        const key = this.client.getObjectKey(`${threadId}.json`);
        const deleted = await this.client.delete(key);
        return deleted ? 1 : 0;
    }

    async clearHistory(_threadId: string, _keepId?: string): Promise<number> {
        return 0;
    }
}
