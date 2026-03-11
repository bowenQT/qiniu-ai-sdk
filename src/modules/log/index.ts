import { IQiniuClient } from '../../lib/types';

/**
 * Log export request parameters.
 * Endpoint: GET /v2/stat/export_log_file
 */
export interface LogExportRequest {
    /** Start time in RFC3339 format (required) */
    start: string;
    /** End time in RFC3339 format (required). Max 35 days from start. */
    end: string;
    /** Number of results per page, 1-500, default 100 */
    size?: number;
    /** Model name filter */
    model?: string;
    /** HTTP status code filter. 0 or omit for all. */
    code?: number;
    /** Page number, starting from 1 */
    page?: number;
    /** APIKey filter */
    apikey?: string;
}

/**
 * A single log entry from the export.
 */
export interface LogEntry {
    id: string;
    model_id?: string;
    api_key?: string;
    start_time?: string;
    end_time?: string;
    server_type?: string;
    code: number;
    state?: 'success' | 'fail';
    usage?: { input: number; output: number };
}

export class Log {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Export request logs as JSON.
     * Uses GET /v2/stat/export_log_file.
     */
    async export(request: LogExportRequest): Promise<LogEntry[]> {
        this.validate(request);

        const baseUrl = this.client.getBaseUrl();
        const absoluteUrl = baseUrl.replace(/\/v1$/, '') + '/v2/stat/export_log_file';

        const params: Record<string, string> = {
            start: request.start,
            end: request.end,
        };
        if (request.size !== undefined) params.size = String(request.size);
        if (request.model) params.model = request.model;
        if (request.code !== undefined) params.code = String(request.code);
        if (request.page !== undefined) params.page = String(request.page);
        if (request.apikey) params.apikey = request.apikey;

        return this.client.getAbsolute<LogEntry[]>(absoluteUrl, params);
    }

    private validate(req: LogExportRequest): void {
        const start = new Date(req.start);
        const end = new Date(req.end);
        if (isNaN(start.getTime())) {
            throw new Error(`start "${req.start}" is not a valid RFC3339 date`);
        }
        if (isNaN(end.getTime())) {
            throw new Error(`end "${req.end}" is not a valid RFC3339 date`);
        }
        if (start > end) {
            throw new Error('end must be after start');
        }
        const diffDays = (end.getTime() - start.getTime()) / 86400000;
        if (diffDays > 35) {
            throw new Error('time range cannot exceed 35 days');
        }
        if (req.size !== undefined && (req.size < 1 || req.size > 500)) {
            throw new Error('size must be between 1 and 500');
        }
        if (req.page !== undefined && req.page < 1) {
            throw new Error('page must be >= 1');
        }
    }
}
