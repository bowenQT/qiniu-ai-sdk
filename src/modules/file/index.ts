import { IQiniuClient } from '../../lib/types';

// ============================================================================
// Type Definitions
// ============================================================================

export type FileSource =
    | string
    | URL
    | Uint8Array
    | ArrayBuffer
    | Blob;

export interface FileCreateRequest {
    /** File data (base64/data URL/URL string) or binary input */
    file: FileSource;
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
        return this.client.post<FileResponse>('/files', {
            ...params,
            file: await normalizeFileSource(params.file),
        });
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

function normalizeFileStringSource(source: string): string {
    const trimmed = source.trim();
    const dataUrlMatch = trimmed.match(/^data:[^;]+;base64,(.+)$/i);
    return dataUrlMatch?.[1] ?? trimmed;
}

function bytesToBinaryString(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return binary;
}

function encodeBase64(bytes: Uint8Array): string {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('base64');
    }

    if (typeof btoa === 'undefined') {
        throw new Error('Global btoa() is required to encode binary file sources');
    }

    return btoa(bytesToBinaryString(bytes));
}

async function normalizeFileSource(source: FileSource): Promise<string> {
    if (typeof source === 'string') {
        return normalizeFileStringSource(source);
    }

    if (source instanceof URL) {
        return source.toString();
    }

    if (typeof Blob !== 'undefined' && source instanceof Blob) {
        return encodeBase64(new Uint8Array(await source.arrayBuffer()));
    }

    if (source instanceof Uint8Array) {
        return encodeBase64(source);
    }

    if (source instanceof ArrayBuffer) {
        return encodeBase64(new Uint8Array(source));
    }

    throw new Error('Unsupported file source');
}
