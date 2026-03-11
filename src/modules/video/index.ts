import type { VideoModel as CatalogVideoModel } from '../../models';
import { IQiniuClient } from '../../lib/types';
import { pollUntilComplete } from '../../lib/poller';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Supported video generation models
 */
export type VideoModel = CatalogVideoModel | (string & {}); // Allow other strings for forward compatibility

/**
 * Universal frame input - supports multiple sources
 * Used for first/last frame specification in video generation
 */
export interface FrameInput {
    /** HTTP/HTTPS URL */
    url?: string;
    /** Base64 encoded data (without data: prefix) */
    base64?: string;
    /** GCS URI (Veo only) */
    gcsUri?: string;
    /** MIME type (optional, auto-inferred if not provided) */
    mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
}

/**
 * Kling image_list item for multi-frame video generation
 * Used with kling-video-o1 model
 */
export interface KlingImageListItem {
    /** Image URL or base64 data */
    image: string;
    /** Frame type */
    type: 'first_frame' | 'end_frame';
}

/**
 * Video reference for Kling video_list parameter
 * Used for video-to-video generation with reference
 */
export interface VideoReference {
    /** Video URL */
    video_url: string;
    /** Reference type */
    refer_type?: 'base' | 'feature';
    /** Keep original sound from reference video */
    keep_original_sound?: 'yes' | 'no';
}

/**
 * Video remix request parameters
 */
export interface VideoRemixRequest {
    model?: VideoModel;
    prompt?: string;
    negative_prompt?: string;
    duration?: '5' | '10' | number;
    aspect_ratio?: '16:9' | '1:1' | '9:16';
    size?: string;
    mode?: 'std' | 'pro';
    cfg_scale?: number;
    [key: string]: unknown;
}

/**
 * Video generation request parameters
 * Supports Kling, Veo, Sora, and other models with smart adaptation
 */
export interface VideoGenerationRequest {
    /** Model to use for video generation */
    model: VideoModel;
    /** Text prompt describing the video */
    prompt: string;

    // === Basic image-to-video (backward compatible) ===
    /** Base64 encoded image for image-to-video */
    image?: string;
    /** Image URL for image-to-video */
    image_url?: string;

    // === Universal first/last frame control (recommended) ===
    /**
     * First and last frame specification
     * Works with both Kling and Veo models
     * SDK automatically transforms to model-specific format
     */
    frames?: {
        first?: FrameInput;
        last?: FrameInput;
    };

    // === Kling native parameters ===
    /**
     * Multi-frame list for kling-video-o1
     * Alternative to `frames` for native Kling API compatibility
     */
    image_list?: KlingImageListItem[];
    /** Last frame image for kling-v2-5-turbo */
    image_tail?: string;
    /** Reference image / first frame for kling-v2-1 */
    input_reference?: string;
    /** Video reference list for video-to-video generation */
    video_list?: VideoReference[];

    // === Common parameters ===
    /** Duration in seconds */
    duration?: '5' | '10' | number;
    /** Aspect ratio */
    aspect_ratio?: '16:9' | '1:1' | '9:16';
    /** Video size (Kling specific, e.g., '1920x1080') */
    size?: string;
    /** Generation mode */
    mode?: 'std' | 'pro';
    /** Negative prompt */
    negative_prompt?: string;
    /** CFG scale */
    cfg_scale?: number;

    // === Veo specific parameters ===
    /** Generate audio for the video (Veo only) */
    generate_audio?: boolean;
    /** Output resolution (Veo 3 only) */
    resolution?: '720p' | '1080p';
    /** Seed for deterministic output (Veo/viduq) */
    seed?: number;
    /** Number of samples to generate (Veo only, 1-4) */
    sample_count?: number;
    /** Person generation control (Veo only) */
    person_generation?: 'allow_adult' | 'dont_allow';

    // === viduq specific parameters ===
    /** Movement amplitude (viduq only) */
    movement_amplitude?: 'auto' | 'small' | 'medium' | 'large';
    /** Enable audio-video generation (viduq only) */
    audio?: boolean;
    /** Voice ID for audio (viduq only) */
    voice_id?: string;
    /** Use recommended prompts (viduq only, costs 10 additional credits) */
    is_rec?: boolean;
}

/**
 * Video task response
 * Normalized structure that works with all models
 */
export interface VideoTaskResponse {
    /** Task ID */
    id: string;
    /** Object type */
    object?: 'video';
    /** Model used */
    model?: string;
    /** Task status (normalized to lowercase) */
    status: string;
    /** Status message */
    message?: string;
    /** Creation timestamp */
    created_at?: number | string;
    /** Last update timestamp */
    updated_at?: number | string;
    /** Completion timestamp */
    completed_at?: number;
    /** Video duration */
    seconds?: string;
    /** Video size/resolution */
    size?: string;
    /** Generation mode */
    mode?: 'std' | 'pro';

    /**
     * Unified video result (normalized)
     * SDK ensures this structure is populated regardless of model
     */
    task_result?: {
        videos: {
            id?: string;
            url: string;
            duration?: string;
            mimeType?: string;
        }[];
    };

    /**
     * Veo raw data (preserved for debugging)
     */
    data?: {
        raiMediaFilteredCount?: number;
        videos?: { url: string; mimeType: string }[];
    };

    /** Error information */
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

// ============================================================================
// Internal Types (for adapter transformation)
// ============================================================================

/**
 * Veo API payload structure (Google Vertex AI style)
 * @internal
 */
interface VeoPayload {
    model: string;
    instances: Array<{
        prompt: string;
        image?: {
            uri?: string;
            bytesBase64Encoded?: string;
            mimeType?: string;
        };
        lastFrame?: {
            uri?: string;
            bytesBase64Encoded?: string;
            mimeType?: string;
        };
    }>;
    parameters?: {
        generateAudio?: boolean;
        durationSeconds?: number;
        aspectRatio?: string;
        sampleCount?: number;
        resolution?: string;
        seed?: number;
        negativePrompt?: string;
        personGeneration?: string;
    };
}

/**
 * Raw Veo API response (before normalization)
 * @internal
 */
interface VeoRawResponse {
    id: string;
    model?: string;
    status: string;
    message?: string;
    data?: {
        raiMediaFilteredCount?: number;
        videos?: { url: string; mimeType: string }[];
    };
    created_at?: string;
    updated_at?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

// Terminal statuses for polling (supports both Kling lowercase and Veo capitalized)
const TERMINAL_STATUSES = ['completed', 'failed', 'Completed', 'Failed'];

/**
 * Check if a model is a Veo model
 */
function isVeoModel(model: string): boolean {
    return model.startsWith('veo-');
}

/**
 * Check if a model is a viduq model
 */
function isViduqModel(model: string): boolean {
    return model.startsWith('viduq');
}

/**
 * Infer viduq input type from request params
 */
type ViduqInputType = 'text-to-video' | 'image-to-video';

function inferViduqInputType(params: VideoGenerationRequest): ViduqInputType {
    if (params.image_url || params.image || params.frames?.first) {
        return 'image-to-video';
    }
    return 'text-to-video';
}

/**
 * Build viduq fal-ai endpoint path
 */
function buildViduqEndpoint(model: string, inputType: ViduqInputType, baseUrl: string): string {
    // viduq1 → q1, viduq2 → q2, viduq2-pro → q2/...pro, viduq2-turbo → q2/...turbo
    let path: string;
    if (model === 'viduq1') {
        path = `/queue/fal-ai/vidu/q1/${inputType}`;
    } else if (model === 'viduq2') {
        path = `/queue/fal-ai/vidu/q2/${inputType}`;
    } else if (model === 'viduq2-pro') {
        path = `/queue/fal-ai/vidu/q2/${inputType}/pro`;
    } else if (model === 'viduq2-turbo') {
        path = `/queue/fal-ai/vidu/q2/${inputType}/turbo`;
    } else {
        // Forward-compat: try to infer from model name
        const variant = model.replace('viduq', '');  // e.g., "3", "3-pro"
        path = `/queue/fal-ai/vidu/q${variant}/${inputType}`;
    }
    return baseUrl.replace(/\/v1$/, '') + path;
}

/**
 * Transform VideoGenerationRequest to viduq payload
 */
function transformToViduqPayload(params: VideoGenerationRequest): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        prompt: params.prompt,
    };

    // Image input (image_url takes precedence)
    if (params.image_url) {
        payload.image_url = params.image_url;
    } else if (params.image) {
        payload.image_url = params.image; // viduq uses image_url for both
    } else if (params.frames?.first) {
        payload.image_url = params.frames.first.url || params.frames.first.base64;
    }

    // viduq specific fields
    if (params.seed !== undefined) payload.seed = params.seed;
    if (params.duration !== undefined) payload.duration = typeof params.duration === 'string' ? parseInt(params.duration, 10) : params.duration;
    if (params.resolution) payload.resolution = params.resolution;
    if (params.movement_amplitude) payload.movement_amplitude = params.movement_amplitude;
    if (params.audio !== undefined) payload.audio = params.audio;
    if (params.voice_id) payload.voice_id = params.voice_id;
    if (params.is_rec !== undefined) payload.is_rec = params.is_rec;

    return payload;
}

/**
 * Infer MIME type from URL, data URL, or base64 content.
 */
function inferMimeType(input?: string): FrameInput['mimeType'] | undefined {
    if (!input) return undefined;

    const lower = input.toLowerCase();
    if (lower.startsWith('data:image/')) {
        const match = lower.match(/^data:(image\/[a-z0-9.+-]+);/);
        if (match) {
            return match[1] as FrameInput['mimeType'];
        }
    }

    const urlPart = lower.split('?')[0];
    if (urlPart.endsWith('.jpg') || urlPart.endsWith('.jpeg')) return 'image/jpeg';
    if (urlPart.endsWith('.png')) return 'image/png';
    if (urlPart.endsWith('.webp')) return 'image/webp';

    const raw = lower.includes('base64,') ? input.split('base64,').pop() || '' : input;
    try {
        let bytes: Uint8Array | null = null;
        if (typeof Buffer !== 'undefined') {
            bytes = new Uint8Array(Buffer.from(raw, 'base64').subarray(0, 16));
        } else if (typeof atob !== 'undefined') {
            const decoded = atob(raw.slice(0, 32));
            bytes = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) {
                bytes[i] = decoded.charCodeAt(i);
            }
        }
        if (bytes) {
            if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
                return 'image/png';
            }
            if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
                return 'image/jpeg';
            }
            if (
                bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
            ) {
                return 'image/webp';
            }
        }
    } catch {
        return undefined;
    }

    return undefined;
}

function withFallbackMimeType(input?: string, mimeType?: FrameInput['mimeType']): FrameInput['mimeType'] | undefined {
    if (mimeType) return mimeType;
    if (!input) return undefined;
    return inferMimeType(input) || 'image/png';
}

/**
 * Infer task type from task ID prefix
 */
function inferTaskType(id: string): 'veo' | 'kling' | 'generic' {
    if (id.startsWith('videos-')) {
        return 'veo';
    }
    if (id.startsWith('chatvideo-')) {
        return 'veo';
    }
    if (id.startsWith('qvideo-')) {
        return 'kling';
    }
    return 'generic';
}

/**
 * Convert FrameInput to Veo image structure
 */
function frameInputToVeoImage(frame: FrameInput): { uri?: string; bytesBase64Encoded?: string; mimeType?: string } | undefined {
    if (frame.gcsUri) {
        return { uri: frame.gcsUri, mimeType: withFallbackMimeType(frame.gcsUri, frame.mimeType) };
    }
    if (frame.url) {
        return { uri: frame.url, mimeType: withFallbackMimeType(frame.url, frame.mimeType) };
    }
    if (frame.base64) {
        return { bytesBase64Encoded: frame.base64, mimeType: withFallbackMimeType(frame.base64, frame.mimeType) };
    }
    return undefined;
}

/**
 * Transform VideoGenerationRequest to Veo API payload
 */
function transformToVeoPayload(params: VideoGenerationRequest): VeoPayload {
    const instance: VeoPayload['instances'][0] = {
        prompt: params.prompt,
    };

    // Handle first frame
    if (params.frames?.first) {
        instance.image = frameInputToVeoImage(params.frames.first);
    } else if (params.image_url) {
        instance.image = {
            uri: params.image_url,
            mimeType: withFallbackMimeType(params.image_url),
        };
    } else if (params.image) {
        instance.image = {
            bytesBase64Encoded: params.image,
            mimeType: withFallbackMimeType(params.image),
        };
    }

    // Handle last frame
    if (params.frames?.last) {
        instance.lastFrame = frameInputToVeoImage(params.frames.last);
    }

    // Build parameters
    const parameters: VeoPayload['parameters'] = {};

    if (params.generate_audio !== undefined) {
        parameters.generateAudio = params.generate_audio;
    }
    if (params.duration !== undefined) {
        parameters.durationSeconds = typeof params.duration === 'string'
            ? parseInt(params.duration, 10)
            : params.duration;
    }
    if (params.aspect_ratio) {
        parameters.aspectRatio = params.aspect_ratio;
    }
    if (params.resolution) {
        parameters.resolution = params.resolution;
    }
    if (params.seed !== undefined) {
        parameters.seed = params.seed;
    }
    if (params.sample_count !== undefined) {
        parameters.sampleCount = params.sample_count;
    }
    if (params.negative_prompt) {
        parameters.negativePrompt = params.negative_prompt;
    }
    if (params.person_generation) {
        parameters.personGeneration = params.person_generation;
    }

    return {
        model: params.model,
        instances: [instance],
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    };
}

/**
 * Transform VideoGenerationRequest to Kling API payload
 * Handles frames -> image_list conversion if needed
 */
function transformToKlingPayload(params: VideoGenerationRequest): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        model: params.model,
        prompt: params.prompt,
    };

    // Handle frames -> image_list conversion for kling-video-o1
    if (params.frames && !params.image_list) {
        const imageList: KlingImageListItem[] = [];
        if (params.frames.first) {
            const imageUrl = params.frames.first.url || params.frames.first.base64 || '';
            imageList.push({ image: imageUrl, type: 'first_frame' });
        }
        if (params.frames.last) {
            const imageUrl = params.frames.last.url || params.frames.last.base64 || '';
            imageList.push({ image: imageUrl, type: 'end_frame' });
        }
        if (imageList.length > 0) {
            payload.image_list = imageList;
        }
    }

    // Handle frames.last -> image_tail for kling-v2-5-turbo
    if (params.frames?.last && !params.image_tail && params.model.includes('v2-5')) {
        payload.image_tail = params.frames.last.url || params.frames.last.base64;
        // Also set first frame as input_reference if provided
        if (params.frames.first) {
            payload.input_reference = params.frames.first.url || params.frames.first.base64;
        }
    }

    // Copy through native Kling parameters
    if (params.image) payload.image = params.image;
    if (params.image_url) payload.image_url = params.image_url;
    if (params.image_list) payload.image_list = params.image_list;
    if (params.image_tail) payload.image_tail = params.image_tail;
    if (params.input_reference) payload.input_reference = params.input_reference;
    if (params.video_list) payload.video_list = params.video_list;
    if (params.duration) payload.duration = params.duration;
    if (params.size) payload.size = params.size;
    if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
    if (params.mode) payload.mode = params.mode;
    if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
    if (params.cfg_scale) payload.cfg_scale = params.cfg_scale;

    return payload;
}

/**
 * Normalize Veo response to standard VideoTaskResponse
 */
function normalizeVeoResponse(raw: VeoRawResponse): VideoTaskResponse {
    const normalized: VideoTaskResponse = {
        id: raw.id,
        model: raw.model,
        status: raw.status.toLowerCase(), // Normalize to lowercase
        message: raw.message,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        data: raw.data,
    };

    // Normalize video results
    if (raw.data?.videos && raw.data.videos.length > 0) {
        normalized.task_result = {
            videos: raw.data.videos.map(v => ({
                url: v.url,
                mimeType: v.mimeType,
            })),
        };
    }

    return normalized;
}

// ============================================================================
// Video Class
// ============================================================================

/**
 * Video task handle returned by create().
 * Backward compatible: { id } still works, with optional statusUrl/responseUrl for fal-ai models.
 */
export interface VideoTaskHandle {
    /** Task ID (universal) */
    id: string;
    /** fal-ai status query URL (viduq only) */
    statusUrl?: string;
    /** fal-ai result query URL (viduq only) */
    responseUrl?: string;
}

/** Normalize fal-ai queue create response to VideoTaskHandle */
function normalizeViduqCreateResponse(raw: Record<string, unknown>): VideoTaskHandle {
    return {
        id: raw.request_id as string,
        statusUrl: raw.status_url as string | undefined,
        responseUrl: raw.response_url as string | undefined,
    };
}

/** Normalize fal-ai queue status response to VideoTaskResponse */
function normalizeViduqStatusResponse(raw: Record<string, unknown>): VideoTaskResponse {
    const result = raw.result as { video?: { url: string; content_type: string } } | undefined;
    const normalized: VideoTaskResponse = {
        id: raw.request_id as string,
        status: (raw.status as string || '').toLowerCase(),
    };
    if (result?.video) {
        normalized.task_result = {
            videos: [{ url: result.video.url, mimeType: result.video.content_type }],
        };
    }
    return normalized;
}

export class Video {
    private client: IQiniuClient;
    /** Internal cache: id → statusUrl for viduq tasks created in this process */
    private viduqStatusUrls = new Map<string, string>();

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Create a video generation task.
     * Returns a VideoTaskHandle. For viduq models, the handle includes
     * statusUrl/responseUrl for fal-ai queue polling.
     */
    async create(params: VideoGenerationRequest): Promise<VideoTaskHandle> {
        const logger = this.client.getLogger();

        if (isViduqModel(params.model)) {
            // viduq: validate input for pro/turbo
            const inputType = inferViduqInputType(params);
            if ((params.model === 'viduq2-pro' || params.model === 'viduq2-turbo') && inputType === 'text-to-video') {
                throw new Error(`${params.model} requires image input (image_url, image, or frames.first)`);
            }

            const absoluteUrl = buildViduqEndpoint(params.model, inputType, this.client.getBaseUrl());
            const payload = transformToViduqPayload(params);

            logger.debug('Video create (viduq adapter)', {
                model: params.model,
                endpoint: absoluteUrl,
                inputType,
            });

            const raw = await this.client.postAbsolute<Record<string, unknown>>(absoluteUrl, payload);
            const handle = normalizeViduqCreateResponse(raw);

            // Cache statusUrl for string-based lookups
            if (handle.statusUrl) {
                this.viduqStatusUrls.set(handle.id, handle.statusUrl);
            }

            return handle;
        }

        if (isVeoModel(params.model)) {
            const veoPayload = transformToVeoPayload(params);

            logger.debug('Video create (Veo adapter)', {
                model: params.model,
                endpoint: '/videos/generations',
                hasFirstFrame: !!veoPayload.instances[0].image,
                hasLastFrame: !!veoPayload.instances[0].lastFrame,
            });

            return this.client.post<{ id: string }>('/videos/generations', veoPayload);
        }

        // Kling and other models use standard endpoint
        const klingPayload = transformToKlingPayload(params);

        logger.debug('Video create (Kling/Generic adapter)', {
            model: params.model,
            endpoint: '/videos',
            hasImageList: !!(klingPayload.image_list as unknown[])?.length,
            hasVideoList: !!(klingPayload.video_list as unknown[])?.length,
        });

        return this.client.post<{ id: string }>('/videos', klingPayload);
    }

    /**
     * Get video generation task status.
     * Accepts a string ID (Kling/Veo) or a VideoTaskHandle (viduq).
     */
    async get(idOrHandle: string | VideoTaskHandle): Promise<VideoTaskResponse> {
        const logger = this.client.getLogger();

        // If handle with statusUrl, use absolute URL
        if (typeof idOrHandle !== 'string' && idOrHandle.statusUrl) {
            logger.debug('Video get (viduq fal-ai endpoint)', { statusUrl: idOrHandle.statusUrl });
            const raw = await this.client.getAbsolute<Record<string, unknown>>(idOrHandle.statusUrl);
            return normalizeViduqStatusResponse(raw);
        }

        const id = typeof idOrHandle === 'string' ? idOrHandle : idOrHandle.id;

        // Check internal cache for viduq tasks created in this process
        const cachedStatusUrl = this.viduqStatusUrls.get(id);
        if (cachedStatusUrl) {
            logger.debug('Video get (viduq fal-ai via cache)', { id, statusUrl: cachedStatusUrl });
            const raw = await this.client.getAbsolute<Record<string, unknown>>(cachedStatusUrl);
            return normalizeViduqStatusResponse(raw);
        }

        const taskType = inferTaskType(id);

        if (taskType === 'veo') {
            logger.debug('Video get (Veo endpoint)', { id, endpoint: `/videos/generations/${id}` });
            const raw = await this.client.get<VeoRawResponse>(`/videos/generations/${id}`);
            return normalizeVeoResponse(raw);
        }

        // Kling and generic models
        logger.debug('Video get (Standard endpoint)', { id, endpoint: `/videos/${id}` });
        return this.client.get<VideoTaskResponse>(`/videos/${id}`);
    }

    /**
     * Remix an existing video task.
     */
    async remix(id: string, params: VideoRemixRequest): Promise<{ id: string }> {
        if (!id || !id.trim()) {
            throw new Error('Video id is required');
        }
        return this.client.post<{ id: string }>(`/videos/${encodeURIComponent(id)}/remix`, params);
    }

    /**
     * Poll for completion with retry and cancellation support.
     * Accepts a string ID (Kling/Veo) or VideoTaskHandle (viduq).
     */
    async waitForCompletion(idOrHandle: string | VideoTaskHandle, options: WaitOptions = {}): Promise<VideoTaskResponse> {
        const {
            intervalMs = 3000,
            timeoutMs = 600000, // 10 minutes default for video
            signal,
            maxRetries = 3,
        } = options;

        const logger = this.client.getLogger();
        const displayId = typeof idOrHandle === 'string' ? idOrHandle : idOrHandle.id;

        const { result } = await pollUntilComplete<VideoTaskResponse>(displayId, {
            intervalMs,
            timeoutMs,
            maxRetries,
            signal,
            logger,
            isTerminal: (r) => {
                if (r.status === undefined || r.status === null) {
                    logger.warn('Video task response missing status field', { id: displayId, result: r });
                    return false;
                }
                // Check both original and lowercase status for cross-model compatibility
                return TERMINAL_STATUSES.includes(r.status) ||
                    TERMINAL_STATUSES.includes(r.status.toLowerCase());
            },
            getStatus: (_taskId) => this.get(idOrHandle),
        });

        return result;
    }
}
