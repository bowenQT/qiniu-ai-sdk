import { IQiniuClient } from '../../lib/types';
import { pollUntilComplete } from '../../lib/poller';

/**
 * Supported image generation models
 */
export type ImageModel =
    | 'kling-v1'
    | 'kling-v1-5'
    | 'kling-v2'
    | 'flux-1.1-pro'
    | 'flux-1.1-ultra'
    | 'flux-1.1-dev'
    | 'flux-1.1-schnell'
    | 'ideogram-v3'
    | 'recraft-v3'
    | (string & {}); // Allow other strings for forward compatibility

export interface ImageReference {
    /** Image URL or base64 data */
    image: string;
    /** Reference type tag */
    image_type?: string;
}

export interface ImageConfig {
    aspect_ratio?: string;
    image_size?: '1K' | '2K' | '4K';
}

export interface ImageGenerationRequest {
    model: ImageModel;
    prompt: string;
    negative_prompt?: string;
    aspect_ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3' | '21:9';
    n?: number;
    image?: string; // base64 for image-to-image
    image_url?: string; // URL for image-to-image
    strength?: number; // 0.0 - 1.0
    // Kling reference images
    image_reference?: 'subject' | 'face';
    image_type?: string;
    subject_image_list?: ImageReference[];
    scene_image?: ImageReference;
    style_image?: ImageReference;
    // Gemini config
    image_config?: ImageConfig;
}

export interface ImageEditRequest {
    model: ImageModel;
    prompt?: string;
    negative_prompt?: string;
    aspect_ratio?: ImageGenerationRequest['aspect_ratio'];
    n?: number;
    strength?: number;
    image?: string;
    image_url?: string;
    images?: string[];
    mask?: string;
    // Kling reference images
    image_reference?: 'subject' | 'face';
    image_type?: string;
    subject_image_list?: ImageReference[];
    scene_image?: ImageReference;
    style_image?: ImageReference;
    // Gemini config
    image_config?: ImageConfig;
}

export interface ImageEditResponse {
    task_id?: string;
    created?: number;
    status?: string;
    status_message?: string;
    data?: {
        index: number;
        url: string;
    }[];
    error?: {
        code: string;
        message: string;
    };
    quantity?: number;
}

export interface ImageTaskResponse {
    task_id: string;
    created?: number;
    status?: string; // 'processing' | 'succeed' | 'failed' - but allow any string for forward compat
    status_message?: string;
    data?: {
        index: number;
        url: string;
    }[];
    error?: {
        code: string;
        message: string;
    };
    quantity?: number;
}

export interface WaitOptions {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal; // For cancellation support
    maxRetries?: number; // Max retries for transient errors during polling
}

const TERMINAL_STATUSES = ['succeed', 'failed'];

export class Image {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Create an image generation task
     */
    async create(params: ImageGenerationRequest): Promise<{ task_id: string }> {
        return this.client.post<{ task_id: string }>('/images/generations', params);
    }

    /**
     * Edit or transform images.
     */
    async edit(params: ImageEditRequest): Promise<ImageEditResponse> {
        const logger = this.client.getLogger();
        const response = await this.client.post<any>('/images/edits', params);

        if (Array.isArray(response)) {
            return { data: response };
        }
        if (response?.data && Array.isArray(response.data)) {
            return response as ImageEditResponse;
        }
        if (response?.result && Array.isArray(response.result.data)) {
            return response.result as ImageEditResponse;
        }
        if (response?.task_id || response?.data || response?.status) {
            return response as ImageEditResponse;
        }

        logger.warn('Unexpected image edit response format', { response });
        return response as ImageEditResponse;
    }

    /**
     * Get image generation task status
     */
    async get(taskId: string): Promise<ImageTaskResponse> {
        return this.client.get<ImageTaskResponse>(`/images/tasks/${taskId}`);
    }

    /**
     * Poll for completion with retry and cancellation support
     */
    async waitForCompletion(taskId: string, options: WaitOptions = {}): Promise<ImageTaskResponse> {
        const {
            intervalMs = 2000,
            timeoutMs = 120000,
            signal,
            maxRetries = 3,
        } = options;

        const logger = this.client.getLogger();

        const { result } = await pollUntilComplete<ImageTaskResponse>(taskId, {
            intervalMs,
            timeoutMs,
            maxRetries,
            signal,
            logger,
            isTerminal: (r) => {
                // Warn if status is missing
                if (r.status === undefined || r.status === null) {
                    logger.warn('Image task response missing status field', { taskId, result: r });
                    return false;
                }
                return TERMINAL_STATUSES.includes(r.status);
            },
            getStatus: (id) => this.get(id),
        });

        return result;
    }
}
