import { IQiniuClient } from '../../lib/types';
import { pollUntilComplete } from '../../lib/poller';

/**
 * Supported video generation models
 */
export type VideoModel =
    | 'kling-video-o1'
    | 'kling-v2-1'
    | 'kling-v2-5-turbo'
    | 'kling-v1-6'
    | 'vidu-2.0'
    | 'vidu-2.5'
    | (string & {}); // Allow other strings for forward compatibility

export interface VideoGenerationRequest {
    model: VideoModel;
    prompt: string;
    image?: string; // base64 for image-to-video
    image_url?: string; // URL for image-to-video
    duration?: '5' | '10'; // seconds
    aspect_ratio?: '16:9' | '1:1' | '9:16';
    mode?: 'std' | 'pro';
    negative_prompt?: string;
    cfg_scale?: number;
}

export interface VideoTaskResponse {
    id: string;
    object?: 'video';
    model?: string;
    status: string; // 'in_progress' | 'completed' | 'failed' - allow any for forward compat
    created_at?: number;
    updated_at?: number;
    completed_at?: number;
    seconds?: string;
    size?: string;
    mode?: 'std' | 'pro';
    task_result?: {
        videos: {
            id: string;
            url: string;
            duration: string;
        }[];
    };
    error?: {
        code: string;
        message: string;
    };
}

export interface WaitOptions {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    maxRetries?: number;
}

const TERMINAL_STATUSES = ['completed', 'failed'];

export class Video {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Create a video generation task
     */
    async create(params: VideoGenerationRequest): Promise<{ id: string }> {
        return this.client.post<{ id: string }>('/videos', params);
    }

    /**
     * Get video generation task status
     */
    async get(id: string): Promise<VideoTaskResponse> {
        return this.client.get<VideoTaskResponse>(`/videos/${id}`);
    }

    /**
     * Poll for completion with retry and cancellation support
     */
    async waitForCompletion(id: string, options: WaitOptions = {}): Promise<VideoTaskResponse> {
        const {
            intervalMs = 3000,
            timeoutMs = 600000, // 10 minutes default for video (longer than image)
            signal,
            maxRetries = 3,
        } = options;

        const logger = this.client.getLogger();

        const { result } = await pollUntilComplete<VideoTaskResponse>(id, {
            intervalMs,
            timeoutMs,
            maxRetries,
            signal,
            logger,
            isTerminal: (r) => {
                // Warn if status is missing
                if (r.status === undefined || r.status === null) {
                    logger.warn('Video task response missing status field', { id, result: r });
                    return false;
                }
                return TERMINAL_STATUSES.includes(r.status);
            },
            getStatus: (taskId) => this.get(taskId),
        });

        return result;
    }
}
