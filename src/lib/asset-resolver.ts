/**
 * Asset Resolution for Qiniu Cloud resources.
 * Provides parsing and resolution of qiniu:// URIs with security validation.
 */

import type { QiniuSigner, SignedUrl, SignOptions } from './signer';
import { CachedSigner } from './signer';

// ============================================================================
// Types
// ============================================================================

/** Parsed Qiniu asset */
export interface QiniuAsset {
    /** Bucket name */
    bucket: string;
    /** Object key (path) */
    key: string;
}

/** Asset resolution options */
export interface ResolveOptions {
    /** Processing fop command (e.g., 'vframe/jpg/offset/1') */
    fop?: string;
    /** Allowed buckets whitelist (if empty, all buckets allowed) */
    allowedBuckets?: string[];
    /** URL expiry in seconds (default: 3600) */
    expiry?: number;
}

/** Resolved asset with signed URL */
export interface ResolvedAsset {
    /** Signed URL */
    url: string;
    /** URL expiration timestamp (ms) */
    expiresAt: number;
    /** Bucket name */
    bucket: string;
    /** Object key */
    key: string;
}

// ============================================================================
// Constants
// ============================================================================

const QINIU_URI_SCHEME = 'qiniu://';

// Characters not allowed in bucket/key names (security)
const DANGEROUS_PATTERNS = [
    /\.\./,          // Path traversal
    /\\/,            // Backslash
    /[\x00-\x1f]/,   // Control characters
    /%2e%2e/i,       // URL-encoded ../
    /%5c/i,          // URL-encoded \
];

// ============================================================================
// Errors
// ============================================================================

/** Asset resolution error */
export class AssetResolutionError extends Error {
    constructor(
        message: string,
        public readonly code: 'INVALID_URI' | 'SECURITY_VIOLATION' | 'BUCKET_NOT_ALLOWED'
    ) {
        super(message);
        this.name = 'AssetResolutionError';
    }
}

// ============================================================================
// URI Parsing
// ============================================================================

/**
 * Parse a qiniu:// URI into bucket and key.
 * 
 * @example
 * ```typescript
 * const asset = parseQiniuUri('qiniu://my-bucket/path/to/video.mp4');
 * // { bucket: 'my-bucket', key: 'path/to/video.mp4' }
 * ```
 * 
 * @returns Parsed asset or null if invalid URI
 * @throws AssetResolutionError for security violations
 */
export function parseQiniuUri(uri: string): QiniuAsset | null {
    if (!uri || typeof uri !== 'string') {
        return null;
    }

    // Normalize: trim and check scheme
    const normalized = uri.trim();
    if (!normalized.startsWith(QINIU_URI_SCHEME)) {
        return null;
    }

    // Extract path after scheme
    const path = normalized.slice(QINIU_URI_SCHEME.length);

    // Remove fragment (#...) and query string (?...)
    const cleanPath = path.split('#')[0].split('?')[0];

    // Security check before decoding
    for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(cleanPath)) {
            throw new AssetResolutionError(
                `Security violation: dangerous pattern in URI`,
                'SECURITY_VIOLATION'
            );
        }
    }

    // URL decode
    let decodedPath: string;
    try {
        decodedPath = decodeURIComponent(cleanPath);
    } catch {
        throw new AssetResolutionError(
            `Invalid URI encoding`,
            'INVALID_URI'
        );
    }

    // Security check after decoding
    for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(decodedPath)) {
            throw new AssetResolutionError(
                `Security violation: dangerous pattern in decoded URI`,
                'SECURITY_VIOLATION'
            );
        }
    }

    // Remove leading slash
    const trimmedPath = decodedPath.startsWith('/') ? decodedPath.slice(1) : decodedPath;

    // Split into bucket/key
    const slashIndex = trimmedPath.indexOf('/');
    if (slashIndex === -1) {
        // Only bucket, no key
        if (!trimmedPath) return null;
        return { bucket: trimmedPath, key: '' };
    }

    const bucket = trimmedPath.slice(0, slashIndex);
    const key = trimmedPath.slice(slashIndex + 1);

    if (!bucket) return null;

    return { bucket, key };
}

// ============================================================================
// Asset Resolution
// ============================================================================

/**
 * Resolve a Qiniu asset to a signed URL.
 * 
 * @example
 * ```typescript
 * const asset = parseQiniuUri('qiniu://my-bucket/video.mp4');
 * const resolved = await resolveAsset(asset, signer, {
 *     allowedBuckets: ['my-bucket'],
 * });
 * console.log(resolved.url); // Signed URL
 * ```
 */
export async function resolveAsset(
    asset: QiniuAsset,
    signer: QiniuSigner | CachedSigner,
    options: ResolveOptions = {}
): Promise<ResolvedAsset> {
    // Bucket whitelist validation
    if (options.allowedBuckets?.length) {
        if (!options.allowedBuckets.includes(asset.bucket)) {
            throw new AssetResolutionError(
                `Bucket '${asset.bucket}' not in allowed list`,
                'BUCKET_NOT_ALLOWED'
            );
        }
    }

    // Build sign options
    const signOptions: SignOptions = {
        fop: options.fop,
        expiry: options.expiry,
    };

    // Sign the URL
    const signed = await signer.sign(asset.bucket, asset.key, signOptions);

    return {
        url: signed.url,
        expiresAt: signed.expiresAt,
        bucket: asset.bucket,
        key: asset.key,
    };
}

// ============================================================================
// Batch Resolution
// ============================================================================

/**
 * Resolve multiple assets in parallel.
 * Uses CachedSigner for efficiency.
 */
export async function resolveAssets(
    assets: QiniuAsset[],
    signer: QiniuSigner | CachedSigner,
    options: ResolveOptions = {}
): Promise<ResolvedAsset[]> {
    return Promise.all(
        assets.map(asset => resolveAsset(asset, signer, options))
    );
}
