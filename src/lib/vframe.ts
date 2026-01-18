/**
 * Video Frame Extraction using Qiniu vframe API.
 * 
 * @see https://developer.qiniu.com/dora/1313/video-frame-thumbnails-vframe
 */

import type { QiniuSigner, SignedUrl } from './signer';
import type { QiniuAsset, ResolveOptions } from './asset-resolver';
import { resolveAsset, AssetResolutionError } from './asset-resolver';

// ============================================================================
// Types
// ============================================================================

/** Vframe extraction options */
export interface VframeOptions {
    // === Mode 1: Explicit offsets ===
    /** Specific second offsets to extract frames */
    offsets?: number[];

    // === Mode 2: Uniform extraction (requires duration) ===
    /** Number of frames to extract (uniformly distributed) */
    count?: number;
    /** Video duration in seconds (required for count mode) */
    duration?: number;

    // === Common parameters ===
    /** Frame width (default: 640, range: 20-3840) */
    width?: number;
    /** Frame height (default: auto, range: 20-2160) */
    height?: number;
    /** Output format (default: 'jpg') */
    format?: 'jpg' | 'png';
    /** Rotation in degrees */
    rotate?: 90 | 180 | 270 | 'auto';
}

/** Extracted video frame */
export interface VideoFrame {
    /** Signed frame URL */
    url: string;
    /** URL expiration timestamp (ms) */
    expiresAt: number;
    /** Frame offset in seconds */
    offset: number;
    /** Frame index (0-based) */
    index: number;
}

/** Frame extraction result */
export interface VframeResult {
    /** Extracted frames */
    frames: VideoFrame[];
    /** Total frame count */
    count: number;
    /** Video duration (if provided) */
    duration?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_COUNT = 5;
const DEFAULT_WIDTH = 640;
const DEFAULT_FORMAT = 'jpg';
const MIN_DIMENSION = 20;
const MAX_LONG_EDGE = 3840;
const MAX_SHORT_EDGE = 2160;

// ============================================================================
// Errors
// ============================================================================

export class VframeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'VframeError';
    }
}

// ============================================================================
// URL Building
// ============================================================================

/**
 * Build a vframe fop command.
 * 
 * @example
 * ```typescript
 * buildVframeFop(5, { width: 320, format: 'jpg' });
 * // 'vframe/jpg/offset/5/w/320'
 * ```
 */
export function buildVframeFop(offset: number, options: Omit<VframeOptions, 'offsets' | 'count' | 'duration'> = {}): string {
    if (offset < 0) {
        throw new VframeError('Offset must be non-negative');
    }

    const format = options.format ?? DEFAULT_FORMAT;
    const parts = [`vframe/${format}/offset/${offset}`];

    // Width
    if (options.width !== undefined) {
        if (options.width < MIN_DIMENSION || options.width > MAX_LONG_EDGE) {
            throw new VframeError(`Width must be between ${MIN_DIMENSION} and ${MAX_LONG_EDGE}`);
        }
        parts.push(`w/${options.width}`);
    }

    // Height
    if (options.height !== undefined) {
        if (options.height < MIN_DIMENSION || options.height > MAX_SHORT_EDGE) {
            throw new VframeError(`Height must be between ${MIN_DIMENSION} and ${MAX_SHORT_EDGE}`);
        }
        parts.push(`h/${options.height}`);
    }

    // Rotate
    if (options.rotate !== undefined) {
        parts.push(`rotate/${options.rotate}`);
    }

    return parts.join('/');
}

/**
 * Build a complete vframe URL from a base URL.
 * 
 * @example
 * ```typescript
 * buildVframeUrl('https://cdn.example.com/video.mp4', 5, { width: 320 });
 * // 'https://cdn.example.com/video.mp4?vframe/jpg/offset/5/w/320'
 * ```
 */
export function buildVframeUrl(
    baseUrl: string,
    offset: number,
    options: Omit<VframeOptions, 'offsets' | 'count' | 'duration'> = {}
): string {
    const fop = buildVframeFop(offset, options);
    const separator = baseUrl.includes('?') ? '|' : '?';
    return `${baseUrl}${separator}${fop}`;
}

// ============================================================================
// Frame Extraction
// ============================================================================

/**
 * Calculate uniform offsets for frame extraction.
 */
function calculateUniformOffsets(count: number, duration: number): number[] {
    if (count <= 0) {
        throw new VframeError('Count must be positive');
    }
    if (duration <= 0) {
        throw new VframeError('Duration must be positive');
    }

    if (count === 1) {
        return [duration / 2];
    }

    const offsets: number[] = [];
    const step = duration / (count + 1);
    for (let i = 1; i <= count; i++) {
        offsets.push(Math.round(step * i * 100) / 100);
    }
    return offsets;
}

/**
 * Extract frames from a video.
 * 
 * @example Uniform extraction
 * ```typescript
 * const result = await extractFrames(asset, signer, {
 *     count: 5,
 *     duration: 120,  // 2 minute video
 *     width: 640,
 * });
 * // Frames at: 20s, 40s, 60s, 80s, 100s
 * ```
 * 
 * @example Explicit offsets
 * ```typescript
 * const result = await extractFrames(asset, signer, {
 *     offsets: [0, 30, 60, 90],
 *     width: 640,
 * });
 * ```
 */
export async function extractFrames(
    asset: QiniuAsset,
    signer: QiniuSigner,
    options: VframeOptions,
    resolveOptions?: ResolveOptions
): Promise<VframeResult> {
    // Validate options
    if (options.offsets && options.count) {
        throw new VframeError('Cannot specify both offsets and count');
    }

    let offsets: number[];

    if (options.offsets) {
        // Explicit offsets mode
        offsets = options.offsets;
        for (const offset of offsets) {
            if (offset < 0) {
                throw new VframeError('All offsets must be non-negative');
            }
        }
    } else {
        // Uniform extraction mode
        const count = options.count ?? DEFAULT_COUNT;
        if (!options.duration) {
            throw new VframeError('Duration is required for uniform extraction');
        }
        offsets = calculateUniformOffsets(count, options.duration);
    }

    // Build frame extraction options
    const frameOpts = {
        width: options.width ?? DEFAULT_WIDTH,
        height: options.height,
        format: options.format ?? DEFAULT_FORMAT,
        rotate: options.rotate,
    };

    // Extract frames in parallel
    const frames = await Promise.all(
        offsets.map(async (offset, index) => {
            const fop = buildVframeFop(offset, frameOpts);
            const resolved = await resolveAsset(asset, signer, {
                ...resolveOptions,
                fop,
            });
            return {
                url: resolved.url,
                expiresAt: resolved.expiresAt,
                offset,
                index,
            };
        })
    );

    return {
        frames,
        count: frames.length,
        duration: options.duration,
    };
}

/**
 * Extract a single frame at a specific offset.
 */
export async function extractFrame(
    asset: QiniuAsset,
    signer: QiniuSigner,
    offset: number,
    options: Omit<VframeOptions, 'offsets' | 'count' | 'duration'> = {},
    resolveOptions?: ResolveOptions
): Promise<VideoFrame> {
    const result = await extractFrames(asset, signer, {
        offsets: [offset],
        ...options,
    }, resolveOptions);
    return result.frames[0];
}
