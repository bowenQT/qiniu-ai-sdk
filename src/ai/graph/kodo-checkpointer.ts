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
 * import { KodoCheckpointer } from '@bowenqt/qiniu-ai-sdk';
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

import type { AgentState } from '../internal-types';
import type {
    Checkpointer,
    Checkpoint,
    CheckpointMetadata,
    CheckpointSaveOptions,
    SerializedAgentState,
} from './checkpointer';
import { serializeState } from './checkpointer';
import { createHmac } from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

/** Kodo region codes */
export type KodoRegion = 'z0' | 'z1' | 'z2' | 'na0' | 'cn-east-2' | 'ap-southeast-1';

/** Kodo region host configuration */
interface RegionHosts {
    up: string;
    rs: string;
    rsf: string;
    io: string;
}

/** Region host mapping */
const REGION_HOSTS: Record<KodoRegion, RegionHosts> = {
    'z0': { up: 'up.qiniup.com', rs: 'rs.qiniuapi.com', rsf: 'rsf.qiniuapi.com', io: 'iovip.qiniuio.com' },
    'z1': { up: 'up-z1.qiniup.com', rs: 'rs-z1.qiniuapi.com', rsf: 'rsf-z1.qiniuapi.com', io: 'iovip-z1.qiniuio.com' },
    'z2': { up: 'up-z2.qiniup.com', rs: 'rs-z2.qiniuapi.com', rsf: 'rsf-z2.qiniuapi.com', io: 'iovip-z2.qiniuio.com' },
    'na0': { up: 'up-na0.qiniup.com', rs: 'rs-na0.qiniuapi.com', rsf: 'rsf-na0.qiniuapi.com', io: 'iovip-na0.qiniuio.com' },
    'cn-east-2': { up: 'up-cn-east-2.qiniup.com', rs: 'rs-cn-east-2.qiniuapi.com', rsf: 'rsf-cn-east-2.qiniuapi.com', io: 'iovip-cn-east-2.qiniuio.com' },
    'ap-southeast-1': { up: 'up-ap-southeast-1.qiniup.com', rs: 'rs-ap-southeast-1.qiniuapi.com', rsf: 'rsf-ap-southeast-1.qiniuapi.com', io: 'iovip-ap-southeast-1.qiniuio.com' },
};

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

// ============================================================================
// Kodo Client
// ============================================================================

/** Internal Kodo API client */
class KodoClient {
    private readonly config: Required<Omit<KodoCheckpointerConfig, 'region' | 'downloadDomain'>> & { region: KodoRegion; downloadDomain?: string };
    private readonly hosts: RegionHosts;
    private cachedToken: { token: string; expiresAt: number } | null = null;

    constructor(config: KodoCheckpointerConfig) {
        this.config = {
            bucket: config.bucket,
            accessKey: config.accessKey,
            secretKey: config.secretKey,
            region: config.region ?? 'z0',
            prefix: config.prefix ?? 'checkpoints/',
            tokenExpiry: config.tokenExpiry ?? 3600,
            maxRetries: config.maxRetries ?? 3,
            downloadDomain: config.downloadDomain,
        };
        this.hosts = REGION_HOSTS[this.config.region];
    }

    /** Generate upload token (bucket-level scope for reuse) */
    private generateUploadToken(): string {
        const now = Math.floor(Date.now() / 1000);
        const deadline = now + this.config.tokenExpiry;

        // Check cache
        if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60000) {
            return this.cachedToken.token;
        }

        // PutPolicy with bucket-level scope (allows any key in bucket)
        const policy = {
            scope: this.config.bucket,
            deadline,
            insertOnly: 0, // Allow overwrite
        };

        const encodedPolicy = this.base64UrlSafe(JSON.stringify(policy));
        const sign = this.hmacSha1(encodedPolicy);
        const token = `${this.config.accessKey}:${this.base64UrlSafe(sign)}:${encodedPolicy}`;

        // Cache
        this.cachedToken = { token, expiresAt: deadline * 1000 - 60000 };

        return token;
    }

    /** Generate management authorization */
    private generateAuth(path: string, body?: string): string {
        const data = `${path}\n${body ?? ''}`;
        const sign = this.hmacSha1(data);
        return `QBox ${this.config.accessKey}:${this.base64UrlSafe(sign)}`;
    }

    /** Base64 URL-safe encoding */
    private base64UrlSafe(input: string | Buffer): string {
        const b64 = Buffer.from(input).toString('base64');
        return b64.replace(/\+/g, '-').replace(/\//g, '_');
    }

    /** HMAC-SHA1 */
    private hmacSha1(data: string): Buffer {
        return createHmac('sha1', this.config.secretKey).update(data).digest();
    }

    /** Retry wrapper */
    private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
        let lastError: Error | null = null;
        for (let i = 0; i < this.config.maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;
                if (i < this.config.maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
                }
            }
        }
        throw lastError;
    }

    /** Full key with prefix */
    getFullKey(threadId: string): string {
        return `${this.config.prefix}${threadId}.json`;
    }

    /** Upload JSON data */
    async upload(key: string, data: unknown): Promise<void> {
        const token = this.generateUploadToken();
        const body = JSON.stringify(data);

        const formData = new FormData();
        formData.append('token', token);
        formData.append('key', key);
        formData.append('file', new Blob([body], { type: 'application/json' }), key);

        await this.withRetry(async () => {
            const response = await fetch(`https://${this.hosts.up}`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Upload failed: ${response.status} ${text}`);
            }
        });
    }

    /** Download JSON data */
    async download<T>(key: string): Promise<T | null> {
        return this.withRetry(async () => {
            // Determine download domain
            const domain = this.config.downloadDomain
                ?? `${this.config.bucket}.${this.hosts.io.replace('iovip', 'kodo')}`;

            // Generate signed URL for private bucket
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const baseUrl = `https://${domain}/${encodeURIComponent(key)}`;
            const toSign = `${baseUrl}?e=${deadline}`;
            const sign = this.hmacSha1(toSign);
            const signedUrl = `${baseUrl}?e=${deadline}&token=${this.config.accessKey}:${this.base64UrlSafe(sign)}`;

            const response = await fetch(signedUrl);

            if (response.status === 404) {
                return null;
            }

            if (!response.ok) {
                throw new Error(`Download failed: ${response.status}`);
            }

            return response.json() as Promise<T>;
        });
    }

    /** Delete object */
    async delete(key: string): Promise<boolean> {
        const encodedEntry = this.base64UrlSafe(`${this.config.bucket}:${key}`);
        const path = `/delete/${encodedEntry}`;
        const auth = this.generateAuth(path);

        return this.withRetry(async () => {
            const response = await fetch(`https://${this.hosts.rs}${path}`, {
                method: 'POST',
                headers: {
                    'Authorization': auth,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            if (response.status === 612) {
                return false; // Not found
            }

            if (!response.ok) {
                throw new Error(`Delete failed: ${response.status}`);
            }

            return true;
        });
    }

    /** List objects by prefix */
    async list(prefix: string): Promise<Array<{ key: string; putTime: number; fsize: number }>> {
        const items: Array<{ key: string; putTime: number; fsize: number }> = [];
        let marker: string | undefined;

        do {
            const params = new URLSearchParams({
                bucket: this.config.bucket,
                prefix,
                limit: '1000',
            });
            if (marker) params.set('marker', marker);

            const path = `/list?${params.toString()}`;
            const auth = this.generateAuth(path);

            const response = await this.withRetry(async () => {
                const res = await fetch(`https://${this.hosts.rsf}${path}`, {
                    headers: { 'Authorization': auth },
                });

                if (!res.ok) {
                    throw new Error(`List failed: ${res.status}`);
                }

                return res.json() as Promise<{
                    marker?: string;
                    items?: Array<{ key: string; putTime: number; fsize: number }>;
                }>;
            });

            if (response.items) {
                items.push(...response.items);
            }
            marker = response.marker;
        } while (marker);

        return items;
    }
}

// ============================================================================
// KodoCheckpointer
// ============================================================================

/**
 * Kodo-backed Checkpointer implementation.
 * 
 * Stores checkpoints as JSON objects in Qiniu Kodo.
 * Each thread has one checkpoint file: `{prefix}{threadId}.json`
 */
export class KodoCheckpointer implements Checkpointer {
    private readonly client: KodoClient;
    private readonly prefix: string;

    constructor(config: KodoCheckpointerConfig) {
        this.client = new KodoClient(config);
        this.prefix = config.prefix ?? 'checkpoints/';
    }

    /**
     * Save a checkpoint.
     */
    async save(
        threadId: string,
        state: AgentState,
        options?: CheckpointSaveOptions | Record<string, unknown>
    ): Promise<CheckpointMetadata> {
        // Check for suppressCheckpoint (parallel execution)
        if (options && 'suppressCheckpoint' in options && (options as CheckpointSaveOptions).suppressCheckpoint) {
            return {
                id: `suppressed_${Date.now()}`,
                threadId,
                createdAt: Date.now(),
                stepCount: state.stepCount,
                status: 'active',
            };
        }

        const key = this.client.getFullKey(threadId);
        const serialized = serializeState(state);

        // Extract options - handle both new CheckpointSaveOptions and legacy custom object
        let status: 'active' | 'pending_approval' | 'completed' = 'active';
        let pendingApproval: CheckpointMetadata['pendingApproval'] | undefined;
        let custom: Record<string, unknown> | undefined;

        if (options) {
            if ('status' in options || 'pendingApproval' in options || 'custom' in options) {
                // New CheckpointSaveOptions format
                const opts = options as CheckpointSaveOptions;
                status = opts.status ?? 'active';
                pendingApproval = opts.pendingApproval;
                custom = opts.custom;
            } else {
                // Legacy: treat entire object as custom metadata
                custom = options as Record<string, unknown>;
            }
        }

        const metadata: CheckpointMetadata = {
            id: threadId, // Simplified: single checkpoint per thread
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

        await this.client.upload(key, checkpoint);

        return metadata;
    }

    /**
     * Load the latest checkpoint for a thread.
     */
    async load(threadId: string): Promise<Checkpoint | null> {
        const key = this.client.getFullKey(threadId);
        return this.client.download<Checkpoint>(key);
    }

    /**
     * List checkpoints for a specific thread.
     * Since we store single checkpoint per thread, this returns 0 or 1 item.
     */
    async list(threadId: string): Promise<CheckpointMetadata[]> {
        // Direct download (single checkpoint per thread model)
        const checkpoint = await this.load(threadId);
        return checkpoint ? [checkpoint.metadata] : [];
    }

    /**
     * Delete a single checkpoint.
     */
    async delete(checkpointId: string): Promise<boolean> {
        // For single checkpoint per thread, checkpointId is the threadId
        const key = this.client.getFullKey(checkpointId);
        return this.client.delete(key);
    }

    /**
     * Clear all checkpoints for a thread.
     */
    async clear(threadId: string): Promise<number> {
        const key = this.client.getFullKey(threadId);
        const deleted = await this.client.delete(key);
        return deleted ? 1 : 0;
    }

    /**
     * Clear history, keeping only the latest checkpoint.
     * Kodo uses single-file storage per thread, so this is always a no-op.
     */
    async clearHistory(_threadId: string): Promise<number> {
        // Kodo stores one checkpoint per thread, so no history to clear
        return 0;
    }
}
