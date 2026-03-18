import { IQiniuClient } from '../../lib/types';
import { pollUntilComplete, type PollerOptions } from '../../lib/poller';
import type { TaskHandle } from '../../lib/task-handle';

export type BatchStatus =
    | 'validating'
    | 'in_progress'
    | 'finalizing'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'cancelling'
    | 'cancelled'
    | (string & {});

export interface BatchCreateRequest {
    /** Input file URL or previously uploaded batch input */
    input_files_url: string;
    /** Target endpoint for each line item, e.g. /v1/chat/completions */
    endpoint: string;
    /** Server-side completion window */
    completion_window?: string;
    /** Optional name/label */
    name?: string;
    /** Optional description */
    description?: string;
    /** Optional metadata */
    metadata?: Record<string, string>;
    /** Forward-compatible additional provider fields */
    [key: string]: unknown;
}

export interface BatchResponse {
    id: string;
    object?: string;
    status?: BatchStatus;
    endpoint?: string;
    input_files_url?: string;
    output_files_url?: string;
    error_files_url?: string;
    completion_window?: string;
    created_at?: string;
    updated_at?: string;
    name?: string;
    description?: string;
    metadata?: Record<string, string>;
    request_counts?: {
        total?: number;
        completed?: number;
        failed?: number;
        cancelled?: number;
    };
    error?: {
        code?: string;
        message?: string;
        type?: string;
    };
    [key: string]: unknown;
}

export interface BatchTaskSnapshot
    extends BatchResponse,
        TaskHandle<BatchTaskSnapshot, BatchTaskSnapshot, BatchWaitOptions> {
    id: string;
    resume(): Promise<BatchCancelResponse>;
    delete(): Promise<void>;
}

export interface BatchListResponse {
    data: BatchTaskSnapshot[];
    object?: string;
    page?: number;
    page_size?: number;
    total?: number;
    has_more?: boolean;
    [key: string]: unknown;
}

interface BatchListRawResponse extends Omit<BatchListResponse, 'data'> {
    data: BatchResponse[];
}

export interface BatchListOptions {
    page?: number;
    page_size?: number;
    status?: BatchStatus;
}

export interface BatchWaitOptions {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    maxRetries?: number;
    onPoll?: PollerOptions<BatchResponse>['onPoll'];
}

export interface BatchCancelResponse {
    id?: string;
    status?: BatchStatus;
    message?: string;
    [key: string]: unknown;
}

export interface BatchTaskHandle extends BatchTaskSnapshot {}

export interface BatchHelperContract {
    helperSurface: string[];
    promotionCandidates: string[];
    deferredGaps: string[];
    verificationEvidence: string[];
    defaultBehaviors: string[];
}

export const BATCH_HELPER_CONTRACT: BatchHelperContract = Object.freeze({
    helperSurface: [
        'create',
        'get',
        'list',
        'cancel',
        'resume',
        'delete',
        'waitForCompletion',
        'BatchTaskSnapshot.get',
        'BatchTaskSnapshot.wait',
        'BatchTaskSnapshot.cancel',
        'BatchTaskSnapshot.resume',
        'BatchTaskSnapshot.delete',
    ],
    promotionCandidates: [
        'BatchTaskSnapshot lifecycle helpers',
        'waitForCompletion',
        'list/get snapshot refresh chaining',
    ],
    deferredGaps: [
        'Mutating batch lifecycle probes remain env-gated and are not yet part of the default PR profile.',
        'Public maturity changes remain deferred until a tracked promotion decision artifact is recorded.',
    ],
    verificationEvidence: [
        'tests/unit/modules/batch.test.ts',
        'qiniu-ai verify gate --lanes cloud-surface --strict',
        'docs/capability-scorecard.md',
    ],
    defaultBehaviors: [
        'list() normalizes missing data arrays to [] so helper chaining remains predictable.',
        'create/get/list snapshots expose the same get/wait/cancel/resume/delete lifecycle surface.',
        'waitForCompletion defaults to 2000ms polling and a 300000ms timeout unless overridden.',
    ],
});

const TERMINAL_BATCH_STATUSES: BatchStatus[] = [
    'completed',
    'failed',
    'expired',
    'cancelled',
];

function createBatchSnapshot(batch: Batch, response: BatchResponse): BatchTaskSnapshot {
    return {
        ...response,
        id: response.id,
        get: () => batch.get(response.id),
        wait: (options?: BatchWaitOptions) => batch.waitForCompletion(response.id, options),
        cancel: () => batch.cancel(response.id).then(() => undefined),
        resume: () => batch.resume(response.id),
        delete: () => batch.delete(response.id),
    };
}

function createBatchHandle(batch: Batch, response: BatchResponse): BatchTaskHandle {
    return createBatchSnapshot(batch, response);
}

export class Batch {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    async create(params: BatchCreateRequest): Promise<BatchTaskHandle> {
        const response = await this.client.post<BatchResponse>('/batches', params);
        if (!response?.id) {
            throw new Error('Batch create failed: no batch id returned');
        }
        return createBatchHandle(this, response);
    }

    async get(batchId: string): Promise<BatchTaskSnapshot> {
        const response = await this.client.get<BatchResponse>(`/batches/${encodeURIComponent(batchId)}`);
        if (!response?.id) {
            throw new Error(`Batch get failed: no batch id returned for ${batchId}`);
        }
        return createBatchSnapshot(this, response);
    }

    async list(options?: BatchListOptions): Promise<BatchListResponse> {
        const params: Record<string, string> = {};
        if (options?.page !== undefined) params.page = String(options.page);
        if (options?.page_size !== undefined) params.page_size = String(options.page_size);
        if (options?.status) params.status = options.status;

        const response = await this.client.get<BatchListRawResponse>(
            '/batches',
            Object.keys(params).length ? params : undefined,
        );

        return {
            ...response,
            data: Array.isArray(response.data)
                ? response.data.filter((item) => Boolean(item?.id)).map((item) => createBatchSnapshot(this, item))
                : [],
        };
    }

    async delete(batchId: string): Promise<void> {
        await this.client.delete(`/batches/${encodeURIComponent(batchId)}`);
    }

    async cancel(batchId: string): Promise<BatchCancelResponse> {
        return this.client.post<BatchCancelResponse>(`/batches/${encodeURIComponent(batchId)}/cancel`, {});
    }

    async resume(batchId: string): Promise<BatchCancelResponse> {
        return this.client.post<BatchCancelResponse>(`/batches/${encodeURIComponent(batchId)}/resume`, {});
    }

    async waitForCompletion(batchId: string, options: BatchWaitOptions = {}): Promise<BatchTaskSnapshot> {
        const logger = this.client.getLogger();
        const { result } = await pollUntilComplete(batchId, {
            intervalMs: options.intervalMs ?? 2000,
            timeoutMs: options.timeoutMs ?? 300_000,
            maxRetries: options.maxRetries ?? 3,
            signal: options.signal,
            onPoll: options.onPoll,
            logger,
            isTerminal: (batch) => TERMINAL_BATCH_STATUSES.includes((batch.status ?? '') as BatchStatus),
            getStatus: (id) => this.get(id),
        });

        return createBatchSnapshot(this, result);
    }
}
