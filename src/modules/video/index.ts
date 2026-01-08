import { IQiniuClient } from '../../lib/types';

export interface VideoGenerationRequest {
    model: string; // e.g., 'kling-video-o1', 'kling-v2-1', 'kling-v2-5-turbo'
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

        if (intervalMs <= 0 || timeoutMs <= 0) {
            throw new Error('intervalMs and timeoutMs must be positive numbers');
        }

        logger.debug('Starting video task polling', { id, intervalMs, timeoutMs });

        const start = Date.now();
        let consecutiveErrors = 0;

        while (Date.now() - start < timeoutMs) {
            if (signal?.aborted) {
                logger.info('Video task polling cancelled', { id });
                throw new Error('Operation cancelled');
            }

            try {
                const result = await this.get(id);
                consecutiveErrors = 0;

                // Detect missing status field - API response is malformed
                if (result.status === undefined || result.status === null) {
                    logger.warn('Video task response missing status field', { id, result });
                }

                if (result.status && TERMINAL_STATUSES.includes(result.status)) {
                    logger.info('Video task completed', {
                        id,
                        status: result.status,
                        duration: Date.now() - start,
                    });
                    return result;
                }

                if (result.status && !['in_progress', 'pending', 'queued', ...TERMINAL_STATUSES].includes(result.status)) {
                    logger.warn('Unexpected video task status', { id, status: result.status });
                }
            } catch (error) {
                consecutiveErrors++;
                logger.warn('Transient error polling video task', {
                    id,
                    attempt: consecutiveErrors,
                    maxRetries,
                    error: error instanceof Error ? error.message : String(error),
                });

                if (consecutiveErrors >= maxRetries) {
                    throw new Error(
                        `Failed to get task status after ${maxRetries} retries: ${error instanceof Error ? error.message : String(error)}`
                    );
                }
            }

            // Wait before next poll with proper cleanup
            await this.waitWithCancellation(intervalMs, signal);
        }

        logger.error('Video task timeout', { id, timeoutMs });
        throw new Error(`Timeout waiting for video generation after ${timeoutMs}ms`);
    }

    /**
     * Wait for specified duration with cancellation support and proper cleanup
     */
    private waitWithCancellation(ms: number, signal?: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new Error('Operation cancelled'));
                return;
            }

            const timeoutHandle = setTimeout(resolve, ms);

            if (signal) {
                const abortHandler = () => {
                    clearTimeout(timeoutHandle);
                    reject(new Error('Operation cancelled'));
                };

                signal.addEventListener('abort', abortHandler, { once: true });

                // Clean up listener when timeout completes normally
                setTimeout(() => {
                    signal.removeEventListener('abort', abortHandler);
                }, ms + 10);
            }
        });
    }
}
