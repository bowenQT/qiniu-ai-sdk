import { IQiniuClient, type FileContentPart } from '../../lib/types';
import { pollUntilComplete, type PollerOptions } from '../../lib/poller';

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
    file_name?: string;
    purpose?: string;
    status?: string;
    status_details?: string;
    model?: string;
    synced_at?: number;
    expires_at?: number;
    file_size?: number;
    content_type?: string;
    error?: {
        code: string;
        message: string;
        type?: string;
        param?: string;
    };
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

export type FileReferenceInput = string | Pick<FileResponse, 'id' | 'filename' | 'file_name' | 'content_type'>;

export interface FileContentPartOptions {
    /** Explicit MIME type / format override for the referenced file */
    format?: string;
}

export interface FileWaitOptions {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onPoll?: PollerOptions<FileResponse>['onPoll'];
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

    /**
     * Poll file processing until the file is ready for inference.
     */
    async waitForReady(file: string | Pick<FileResponse, 'id'>, options: FileWaitOptions = {}): Promise<FileResponse> {
        const fileId = typeof file === 'string' ? file : file.id;
        const { result } = await pollUntilComplete(fileId, {
            intervalMs: options.intervalMs ?? 1000,
            timeoutMs: options.timeoutMs ?? 120_000,
            signal: options.signal,
            onPoll: options.onPoll,
            isTerminal: (state) => ['ready', 'failed', 'expired'].includes(state.status || ''),
            getStatus: (id) => this.get(id),
            logger: this.client.getLogger(),
        });

        if (result.status === 'ready') {
            return result;
        }

        const detail = result.error?.message || result.status_details || result.status || 'unknown';
        throw new Error(`File ${fileId} is not ready: ${detail}`);
    }

    /**
     * Build a chat/response content part referencing an uploaded file.
     * Useful for Gemini qfile and other file-aware multimodal calls.
     */
    toContentPart(file: FileReferenceInput, options: FileContentPartOptions = {}): FileContentPart {
        const reference = typeof file === 'string' ? { id: file } : file;
        const format = options.format
            ?? reference.content_type
            ?? inferFileFormat(reference.filename ?? reference.file_name);

        return {
            type: 'file',
            file: {
                file_id: reference.id,
                ...(format ? { format } : {}),
            },
        };
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

function inferFileFormat(filename?: string): string | undefined {
    if (!filename) {
        return undefined;
    }

    const lower = filename.toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.ogg')) return 'audio/ogg';
    if (lower.endsWith('.txt')) return 'text/plain';
    if (lower.endsWith('.md')) return 'text/markdown';
    if (lower.endsWith('.csv')) return 'text/csv';
    if (lower.endsWith('.json')) return 'application/json';
    if (lower.endsWith('.docx')) {
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (lower.endsWith('.xlsx')) {
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (lower.endsWith('.pptx')) {
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    }

    return undefined;
}
