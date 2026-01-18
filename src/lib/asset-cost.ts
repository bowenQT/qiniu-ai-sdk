/**
 * Asset Cost Estimation for Qiniu Cloud resources.
 * Helps agents understand processing costs before committing.
 */

// ============================================================================
// Types
// ============================================================================

/** Asset type */
export type AssetType = 'video' | 'image' | 'audio' | 'document' | 'unknown';

/** Asset information for cost estimation */
export interface AssetInfo {
    /** Asset type */
    type: AssetType;
    /** Video/audio duration in seconds */
    duration?: number;
    /** Number of frames to extract (video) */
    frameCount?: number;
    /** Resolution (video/image) */
    resolution?: {
        width: number;
        height: number;
    };
    /** File size in bytes */
    sizeBytes?: number;
}

/** Cost level */
export type CostLevel = 'low' | 'medium' | 'high';

/** Confidence level */
export type CostConfidence = 'calculated' | 'estimate';

/** Cost estimation result */
export interface AssetCost {
    /** Estimated token consumption for LLM processing */
    tokensEstimate: number;
    /** Cost level */
    level: CostLevel;
    /** Confidence in the estimate */
    confidence: CostConfidence;
    /** Processing recommendations */
    recommendations: string[];
}

// ============================================================================
// Token Estimation Constants
// ============================================================================

// Approximate token costs per asset type
const TOKENS_PER_IMAGE_BASE = 500;      // Base tokens for an image
const TOKENS_PER_IMAGE_MEGAPIXEL = 200; // Additional tokens per megapixel
const TOKENS_PER_AUDIO_MINUTE = 100;    // Tokens per minute of audio transcript
const TOKENS_PER_VIDEO_FRAME = 700;     // Tokens per video frame (image + context)
const TOKENS_PER_DOCUMENT_PAGE = 500;   // Tokens per document page

// Thresholds for cost levels
const HIGH_COST_THRESHOLD = 5000;
const MEDIUM_COST_THRESHOLD = 2000;

// ============================================================================
// Cost Estimation
// ============================================================================

/**
 * Estimate the cost of processing an asset.
 * 
 * @example
 * ```typescript
 * const cost = estimateAssetCost({
 *     type: 'video',
 *     duration: 120,
 *     frameCount: 5,
 * });
 * // { tokensEstimate: 3500, level: 'medium', confidence: 'calculated', ... }
 * ```
 */
export function estimateAssetCost(info: AssetInfo): AssetCost {
    let tokens = 0;
    let confidence: CostConfidence = 'estimate';
    const recommendations: string[] = [];

    switch (info.type) {
        case 'video': {
            if (info.frameCount !== undefined) {
                tokens = info.frameCount * TOKENS_PER_VIDEO_FRAME;
                confidence = 'calculated';
            } else if (info.duration !== undefined) {
                // Assume 5 frames default
                const estimatedFrames = 5;
                tokens = estimatedFrames * TOKENS_PER_VIDEO_FRAME;
                recommendations.push(`Consider extracting ${estimatedFrames} frames for ${info.duration}s video`);
            } else {
                tokens = 5 * TOKENS_PER_VIDEO_FRAME;
                recommendations.push('Provide duration or frameCount for accurate estimate');
            }

            if (info.duration && info.duration > 300) {
                recommendations.push('Long video: consider smart sampling or key-frame extraction');
            }
            break;
        }

        case 'image': {
            tokens = TOKENS_PER_IMAGE_BASE;
            if (info.resolution) {
                const megapixels = (info.resolution.width * info.resolution.height) / 1_000_000;
                tokens += Math.round(megapixels * TOKENS_PER_IMAGE_MEGAPIXEL);
                confidence = 'calculated';
            }
            break;
        }

        case 'audio': {
            if (info.duration !== undefined) {
                const minutes = info.duration / 60;
                tokens = Math.round(minutes * TOKENS_PER_AUDIO_MINUTE);
                confidence = 'calculated';
            } else {
                tokens = TOKENS_PER_AUDIO_MINUTE * 5; // Assume 5 minutes
                recommendations.push('Provide duration for accurate estimate');
            }
            break;
        }

        case 'document': {
            if (info.sizeBytes) {
                // Rough estimate: 10KB per page
                const pages = Math.ceil(info.sizeBytes / 10_000);
                tokens = pages * TOKENS_PER_DOCUMENT_PAGE;
                confidence = 'calculated';
            } else {
                tokens = TOKENS_PER_DOCUMENT_PAGE * 5; // Assume 5 pages
                recommendations.push('Provide file size for accurate estimate');
            }
            break;
        }

        default:
            tokens = 1000; // Unknown type
            recommendations.push('Unknown asset type: estimate may be inaccurate');
    }

    // Determine cost level
    let level: CostLevel;
    if (tokens >= HIGH_COST_THRESHOLD) {
        level = 'high';
        recommendations.push('High token cost: consider chunking or summarization');
    } else if (tokens >= MEDIUM_COST_THRESHOLD) {
        level = 'medium';
    } else {
        level = 'low';
    }

    return {
        tokensEstimate: tokens,
        level,
        confidence,
        recommendations,
    };
}

/**
 * Detect asset type from file extension.
 */
export function detectAssetType(key: string): AssetType {
    const ext = key.split('.').pop()?.toLowerCase() ?? '';

    const videoExts = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'm4v'];
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
    const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'];
    const documentExts = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt'];

    if (videoExts.includes(ext)) return 'video';
    if (imageExts.includes(ext)) return 'image';
    if (audioExts.includes(ext)) return 'audio';
    if (documentExts.includes(ext)) return 'document';
    return 'unknown';
}
