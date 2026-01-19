/**
 * PostgreSQL Checkpointer implementation.
 * Requires pg as a peer dependency.
 *
 * @example
 * ```typescript
 * import { Pool } from 'pg';
 * import { PostgresCheckpointer } from '@bowenqt/qiniu-ai-sdk';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const checkpointer = new PostgresCheckpointer(pool, { tableName: 'checkpoints' });
 *
 * // Create table (run once)
 * await checkpointer.createTable();
 * ```
 */

import type { AgentState } from '../internal-types';
import type { Checkpoint, CheckpointMetadata, Checkpointer, SerializedAgentState } from './checkpointer';
import { serializeState } from './checkpointer';

/** Postgres client interface (compatible with pg Pool) */
export interface PostgresClient {
    query<T = unknown>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

/** Postgres checkpointer configuration */
export interface PostgresCheckpointerConfig {
    /** Table name (default: 'qiniu_checkpoints') */
    tableName?: string;
    /** Schema name (default: 'public') */
    schema?: string;
}

/**
 * PostgreSQL-based checkpointer.
 * Uses pg-compatible client interface.
 */
export class PostgresCheckpointer implements Checkpointer {
    private readonly client: PostgresClient;
    private readonly tableName: string;
    private readonly schema: string;

    constructor(client: PostgresClient, config: PostgresCheckpointerConfig = {}) {
        this.client = client;
        this.tableName = config.tableName ?? 'qiniu_checkpoints';
        this.schema = config.schema ?? 'public';
    }

    private get table(): string {
        return `"${this.schema}"."${this.tableName}"`;
    }

    /**
     * Create the checkpoints table if it doesn't exist.
     * Run this during application setup.
     */
    async createTable(): Promise<void> {
        await this.client.query(`
            CREATE TABLE IF NOT EXISTS ${this.table} (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                created_at BIGINT NOT NULL,
                step_count INTEGER NOT NULL,
                custom JSONB,
                state JSONB NOT NULL,
                created_at_ts TIMESTAMP DEFAULT NOW()
            )
        `);

        await this.client.query(`
            CREATE INDEX IF NOT EXISTS idx_${this.tableName}_thread_id 
            ON ${this.table} (thread_id)
        `);

        await this.client.query(`
            CREATE INDEX IF NOT EXISTS idx_${this.tableName}_created_at 
            ON ${this.table} (created_at DESC)
        `);
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
        const createdAt = Date.now();


        const metadata: CheckpointMetadata = {
            id,
            threadId,
            createdAt,
            stepCount: state.stepCount,
            status: (opts?.status as any) ?? 'active',
            pendingApproval: opts?.pendingApproval as any,
            custom: opts?.custom ?? (opts && !('status' in opts) ? opts as Record<string, unknown> : undefined),
        };

        const serializedState = serializeState(state);

        // Store status and pendingApproval in custom field for Postgres (schema migration needed for full support)
        const fullCustom = {
            ...metadata.custom,
            ...(metadata.status !== 'active' ? { __status: metadata.status } : {}),
            ...(metadata.pendingApproval ? { __pendingApproval: metadata.pendingApproval } : {}),
        };

        await this.client.query(
            `INSERT INTO ${this.table} (id, thread_id, created_at, step_count, custom, state) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, threadId, createdAt, state.stepCount, JSON.stringify(fullCustom), JSON.stringify(serializedState)]
        );

        return metadata;
    }

    async load(threadId: string): Promise<Checkpoint | null> {
        interface Row {
            id: string;
            thread_id: string;
            created_at: string;
            step_count: number;
            custom: Record<string, unknown>;
            state: SerializedAgentState;
        }

        const result = await this.client.query<Row>(
            `SELECT id, thread_id, created_at, step_count, custom, state 
             FROM ${this.table} 
             WHERE thread_id = $1 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [threadId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];

        // Extract status and pendingApproval from custom field
        const fullCustom = (row.custom || {}) as Record<string, unknown>;
        const status = (fullCustom.__status as 'active' | 'pending_approval' | 'completed') ?? 'active';
        const pendingApproval = fullCustom.__pendingApproval as CheckpointMetadata['pendingApproval'];
        const custom = Object.fromEntries(
            Object.entries(fullCustom).filter(([k]) => !k.startsWith('__'))
        );

        return {
            metadata: {
                id: row.id,
                threadId: row.thread_id,
                createdAt: Number(row.created_at),
                stepCount: row.step_count,
                status,
                pendingApproval,
                custom: Object.keys(custom).length > 0 ? custom : undefined,
            },
            state: row.state,
        };
    }

    async list(threadId: string): Promise<CheckpointMetadata[]> {
        interface Row {
            id: string;
            thread_id: string;
            created_at: string;
            step_count: number;
            custom: Record<string, unknown>;
        }

        const result = await this.client.query<Row>(
            `SELECT id, thread_id, created_at, step_count, custom 
             FROM ${this.table} 
             WHERE thread_id = $1 
             ORDER BY created_at DESC`,
            [threadId]
        );

        return result.rows.map(row => {
            // Extract status and pendingApproval from custom field
            const fullCustom = (row.custom || {}) as Record<string, unknown>;
            const status = (fullCustom.__status as 'active' | 'pending_approval' | 'completed') ?? 'active';
            const pendingApproval = fullCustom.__pendingApproval as CheckpointMetadata['pendingApproval'];
            const custom = Object.fromEntries(
                Object.entries(fullCustom).filter(([k]) => !k.startsWith('__'))
            );

            return {
                id: row.id,
                threadId: row.thread_id,
                createdAt: Number(row.created_at),
                stepCount: row.step_count,
                status,
                pendingApproval,
                custom: Object.keys(custom).length > 0 ? custom : undefined,
            };
        });
    }

    async delete(checkpointId: string): Promise<boolean> {
        const result = await this.client.query(
            `DELETE FROM ${this.table} WHERE id = $1`,
            [checkpointId]
        );
        return (result as { rowCount?: number }).rowCount === 1;
    }

    async clear(threadId: string): Promise<number> {
        const result = await this.client.query(
            `DELETE FROM ${this.table} WHERE thread_id = $1`,
            [threadId]
        );
        return (result as { rowCount?: number }).rowCount ?? 0;
    }
}
