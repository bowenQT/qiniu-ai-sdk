import { IQiniuClient } from '../../lib/types';

export interface ImageGenerationRequest {
    model: string; // e.g., 'kling-v1', 'kling-v1-5', 'kling-v2'
    prompt: string;
    negative_prompt?: string;
    aspect_ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3' | '21:9';
    n?: number;
    image?: string; // base64 for image-to-image
    image_url?: string; // URL for image-to-image
    strength?: number; // 0.0 - 1.0
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

        if (intervalMs <= 0 || timeoutMs <= 0) {
            throw new Error('intervalMs and timeoutMs must be positive numbers');
        }

        logger.debug('Starting image task polling', { taskId, intervalMs, timeoutMs });

        const start = Date.now();
        let consecutiveErrors = 0;

        while (Date.now() - start < timeoutMs) {
            // Check for cancellation
            if (signal?.aborted) {
                logger.info('Image task polling cancelled', { taskId });
                throw new Error('Operation cancelled');
            }

            try {
                const result = await this.get(taskId);
                consecutiveErrors = 0; // Reset on success

                // Check for terminal status
                if (result.status && TERMINAL_STATUSES.includes(result.status)) {
                    logger.info('Image task completed', {
                        taskId,
                        status: result.status,
                        duration: Date.now() - start,
                    });
                    return result;
                }

                // Warn if status is unexpected (but continue polling)
                if (result.status && !['processing', ...TERMINAL_STATUSES].includes(result.status)) {
                    logger.warn('Unexpected image task status', { taskId, status: result.status });
                }
            } catch (error) {
                consecutiveErrors++;
                logger.warn('Transient error polling image task', {
                    taskId,
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

            // Wait before next poll
            await new Promise((resolve, reject) => {
                const timeoutHandle = setTimeout(resolve, intervalMs);
                if (signal) {
                    signal.addEventListener('abort', () => {
                        clearTimeout(timeoutHandle);
                        reject(new Error('Operation cancelled'));
                    }, { once: true });
                }
            });
        }

        logger.error('Image task timeout', { taskId, timeoutMs });
        throw new Error(`Timeout waiting for image generation after ${timeoutMs}ms`);
    }
}
