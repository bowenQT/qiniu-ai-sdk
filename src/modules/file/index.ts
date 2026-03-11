import { IQiniuClient } from '../../lib/types';

// ============================================================================
// Type Definitions
// ============================================================================

export interface FileCreateRequest {
    /** File data (base64 encoded or URL) */
    file: string;
    /** Purpose of the file */
    purpose?: string;
    /** Optional filename */
    filename?: string;
    /** Kodo source configuration */
    kodo_source?: {
        bucket: string;
        key: string;
    };
}

export interface FileResponse {
    id: string;
    object?: string;
    bytes?: number;
    created_at?: number;
    filename?: string;
    purpose?: string;
    status?: string;
    status_details?: string;
}

export interface FileListResponse {
    data: FileResponse[];
    object?: string;
    has_more?: boolean;
}

export interface FileListOptions {
    /** Filter by status */
    status?: string;
    /** Cursor for pagination */
    after?: string;
    /** Number of results per page */
    limit?: number;
}

// ============================================================================
// File Class
// ============================================================================

export class File {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Create a file upload task
     */
    async create(params: FileCreateRequest): Promise<FileResponse> {
        return this.client.post<FileResponse>('/files', params);
    }

    /**
     * Get file status by ID
     */
    async get(fileId: string): Promise<FileResponse> {
        return this.client.get<FileResponse>(`/files/${encodeURIComponent(fileId)}`);
    }

    /**
     * List user files
     */
    async list(options?: FileListOptions): Promise<FileListResponse> {
        const params: Record<string, string> = {};
        if (options?.status) params.status = options.status;
        if (options?.after) params.after = options.after;
        if (options?.limit) params.limit = String(options.limit);

        return this.client.get<FileListResponse>('/files', Object.keys(params).length > 0 ? params : undefined);
    }
}
