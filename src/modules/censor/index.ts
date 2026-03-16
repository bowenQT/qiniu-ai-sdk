/**
 * Content Moderation (Censor) module for Qiniu Cloud.
 * Provides image and video content safety detection.
 * 
 * @see https://developer.qiniu.com/censor/5588/image-censor
 * @see https://developer.qiniu.com/censor/5620/video-censor
 */

import { IQiniuClient } from '../../lib/types';
import { pollUntilComplete, type PollerOptions } from '../../lib/poller';
import { createUnsupportedTaskCancellation, type TaskHandle } from '../../lib/task-handle';

// ============================================================================
// Types
// ============================================================================

/** Scenes for content moderation */
export type CensorScene = 'pulp' | 'terror' | 'politician';

/** Suggestion result from moderation */
export type CensorSuggestion = 'pass' | 'review' | 'block';

/** Image censor request */
export interface ImageCensorRequest {
    /** Image URL (or qiniu:// URI) */
    uri: string;
    /** Optional request ID for tracking */
    id?: string;
    /** Scenes to check (default: all) */
    scenes?: CensorScene[];
}

/** Video censor request */
export interface VideoCensorRequest {
    /** Video URL (or qiniu:// URI) */
    uri: string;
    /** Optional request ID for tracking */
    id?: string;
    /** Scenes to check (default: all) */
    scenes?: CensorScene[];
    /** Frame capture interval in milliseconds (default: 5000) */
    intervalMs?: number;
}

/** Scene result from moderation */
export interface SceneResult {
    /** Scene type */
    scene: CensorScene;
    /** Suggestion */
    suggestion: CensorSuggestion;
    /** Detected label */
    label?: string;
    /** Confidence score (0-1) */
    score?: number;
    /** Detailed results */
    details?: Array<{
        label: string;
        score: number;
    }>;
}

/** Image censor response */
export interface ImageCensorResponse {
    /** Request ID */
    id?: string;
    /** Overall suggestion */
    suggestion: CensorSuggestion;
    /** Scene-specific results */
    scenes: SceneResult[];
}

/** Video censor job response */
export interface VideoCensorJobResponse {
    /** Job ID for tracking */
    jobId: string;
}

export interface VideoCensorWaitOptions {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    maxRetries?: number;
    onPoll?: PollerOptions<VideoCensorResult>['onPoll'];
}

export interface VideoCensorTaskHandle
    extends VideoCensorJobResponse,
        TaskHandle<VideoCensorResult, VideoCensorResult, VideoCensorWaitOptions> {
    id: string;
}

/** Video censor status */
export type VideoCensorStatus = 'WAITING' | 'DOING' | 'DONE' | 'FAILED';

/** Video censor result */
export interface VideoCensorResult {
    /** Job ID */
    jobId: string;
    /** Status */
    status: VideoCensorStatus;
    /** Overall suggestion (available when DONE) */
    suggestion?: CensorSuggestion;
    /** Scene results (available when DONE) */
    scenes?: SceneResult[];
    /** Error message (if FAILED) */
    error?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

interface ImageCensorApiResponse {
    code?: number;
    message?: string;
    error?: string;
    result?: {
        suggestion?: CensorSuggestion;
        scenes?: {
            [key: string]: {
                suggestion: CensorSuggestion;
                details?: Array<{
                    label: string;
                    score: number;
                }>;
            };
        };
    };
}

interface VideoCensorApiResponse {
    job?: string;
}

interface VideoCensorStatusApiResponse {
    id?: string;
    status?: VideoCensorStatus;
    result?: {
        suggestion?: CensorSuggestion;
        scenes?: {
            [key: string]: {
                suggestion: CensorSuggestion;
                details?: Array<{
                    label: string;
                    score: number;
                }>;
            };
        };
    };
    error?: string;
}

const TERMINAL_VIDEO_CENSOR_STATUSES: VideoCensorStatus[] = ['DONE', 'FAILED'];

function createVideoCensorTaskHandle(censor: Censor, jobId: string): VideoCensorTaskHandle {
    return {
        id: jobId,
        jobId,
        get: () => censor.getVideoStatus(jobId),
        wait: (options?: VideoCensorWaitOptions) => censor.waitForVideoCompletion(jobId, options),
        cancel: createUnsupportedTaskCancellation('Video censor', jobId),
    };
}

// ============================================================================
// Censor Class
// ============================================================================

/**
 * Content moderation service for images and videos.
 * 
 * @example
 * ```typescript
 * // Image moderation
 * const result = await client.censor.image({
 *     uri: 'https://example.com/photo.jpg',
 *     scenes: ['pulp', 'terror'],
 * });
 * console.log(result.suggestion); // 'pass', 'review', or 'block'
 * 
 * // Video moderation (async)
 * const job = await client.censor.video({
 *     uri: 'https://example.com/video.mp4',
 * });
 * const status = await client.censor.getVideoStatus(job.jobId);
 * ```
 */
export class Censor {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Moderate an image for unsafe content.
     */
    async image(request: ImageCensorRequest): Promise<ImageCensorResponse> {
        const logger = this.client.getLogger();
        const scenes = request.scenes ?? ['pulp', 'terror', 'politician'];

        logger.debug('Image censor request', { uri: request.uri, scenes });

        const response = await this.client.post<ImageCensorApiResponse>(
            '/v3/image/censor',
            {
                data: {
                    uri: request.uri,
                    id: request.id,
                },
                params: {
                    scenes,
                },
            }
        );

        return this.normalizeImageResponse(response, scenes);
    }

    /**
     * Start async video moderation job.
     */
    async video(request: VideoCensorRequest): Promise<VideoCensorTaskHandle> {
        const logger = this.client.getLogger();
        const scenes = request.scenes ?? ['pulp', 'terror', 'politician'];
        const intervalMs = request.intervalMs ?? 5000;

        logger.debug('Video censor request', { uri: request.uri, scenes, intervalMs });

        const response = await this.client.post<VideoCensorApiResponse>(
            '/v3/video/censor',
            {
                data: {
                    uri: request.uri,
                    id: request.id,
                },
                params: {
                    scenes,
                    cut_param: {
                        interval_msecs: intervalMs,
                    },
                },
            }
        );

        if (!response.job) {
            throw new Error('Video censor failed: no job ID returned');
        }

        return createVideoCensorTaskHandle(this, response.job);
    }

    /**
     * Get video moderation job status and result.
     */
    async getVideoStatus(jobIdOrHandle: string | Pick<VideoCensorJobResponse, 'jobId'>): Promise<VideoCensorResult> {
        const jobId = typeof jobIdOrHandle === 'string' ? jobIdOrHandle : jobIdOrHandle.jobId;
        const logger = this.client.getLogger();

        logger.debug('Get video censor status', { jobId });

        const response = await this.client.get<VideoCensorStatusApiResponse>(
            `/v3/jobs/video/${jobId}`
        );

        const status = response.status ?? 'WAITING';

        return {
            jobId,
            status,
            suggestion: response.result?.suggestion,
            scenes: response.result?.scenes
                ? this.normalizeScenes(response.result.scenes)
                : undefined,
            error: response.error,
        };
    }

    /**
     * Wait until a video moderation job reaches a terminal state.
     */
    async waitForVideoCompletion(
        jobIdOrHandle: string | Pick<VideoCensorJobResponse, 'jobId'>,
        options: VideoCensorWaitOptions = {},
    ): Promise<VideoCensorResult> {
        const jobId = typeof jobIdOrHandle === 'string' ? jobIdOrHandle : jobIdOrHandle.jobId;
        const { result } = await pollUntilComplete(jobId, {
            intervalMs: options.intervalMs ?? 2_000,
            timeoutMs: options.timeoutMs ?? 300_000,
            maxRetries: options.maxRetries ?? 3,
            signal: options.signal,
            onPoll: options.onPoll,
            logger: this.client.getLogger(),
            isTerminal: (state) => TERMINAL_VIDEO_CENSOR_STATUSES.includes(state.status),
            getStatus: (id) => this.getVideoStatus(id),
        });

        return result;
    }

    /**
     * Normalize image censor API response.
     * SECURITY: Fail-closed - throw on error/missing data rather than defaulting to 'pass'
     */
    private normalizeImageResponse(
        response: ImageCensorApiResponse,
        requestedScenes: CensorScene[]
    ): ImageCensorResponse {
        // Check for API error
        if (response.code && response.code !== 200) {
            throw new Error(`Censor API error (${response.code}): ${response.message || 'Unknown error'}`);
        }
        if (response.error) {
            throw new Error(`Censor API error: ${response.error}`);
        }

        const result = response.result;

        // Fail-closed: require explicit result
        if (!result || result.suggestion === undefined) {
            throw new Error('Censor API returned no result - cannot determine content safety');
        }

        return {
            suggestion: result.suggestion,
            scenes: result.scenes
                ? this.normalizeScenes(result.scenes)
                : requestedScenes.map(scene => ({
                    scene,
                    suggestion: result.suggestion!,
                })),
        };
    }

    /**
     * Normalize scenes object to array.
     */
    private normalizeScenes(
        scenes: { [key: string]: { suggestion: CensorSuggestion; details?: Array<{ label: string; score: number }> } }
    ): SceneResult[] {
        return Object.entries(scenes).map(([scene, data]) => ({
            scene: scene as CensorScene,
            suggestion: data.suggestion,
            details: data.details,
            label: data.details?.[0]?.label,
            score: data.details?.[0]?.score,
        }));
    }
}
