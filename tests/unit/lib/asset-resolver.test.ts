/**
 * Tests for Asset Resolution, vframe, and cost estimation.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    parseQiniuUri,
    resolveAsset,
    AssetResolutionError,
    type QiniuAsset,
} from '../../../src/lib/asset-resolver';
import {
    buildVframeFop,
    buildVframeUrl,
    extractFrames,
    VframeError,
} from '../../../src/lib/vframe';
import {
    estimateAssetCost,
    detectAssetType,
} from '../../../src/lib/asset-cost';
import type { QiniuSigner, SignedUrl } from '../../../src/lib/signer';

// ============================================================================
// parseQiniuUri Tests
// ============================================================================

describe('parseQiniuUri', () => {
    it('should parse valid qiniu:// URI', () => {
        const result = parseQiniuUri('qiniu://my-bucket/path/to/video.mp4');
        expect(result).toEqual({
            bucket: 'my-bucket',
            key: 'path/to/video.mp4',
        });
    });

    it('should handle bucket only (no key)', () => {
        const result = parseQiniuUri('qiniu://my-bucket');
        expect(result).toEqual({ bucket: 'my-bucket', key: '' });
    });

    it('should handle leading slash in path', () => {
        const result = parseQiniuUri('qiniu:///bucket/key');
        expect(result).toEqual({ bucket: 'bucket', key: 'key' });
    });

    it('should strip query string and fragment', () => {
        const result = parseQiniuUri('qiniu://bucket/key?foo=bar#section');
        expect(result).toEqual({ bucket: 'bucket', key: 'key' });
    });

    it('should return null for non-qiniu URI', () => {
        expect(parseQiniuUri('https://example.com/file')).toBeNull();
        expect(parseQiniuUri('s3://bucket/key')).toBeNull();
        expect(parseQiniuUri('')).toBeNull();
    });

    it('should throw on path traversal attack (/../)', () => {
        expect(() => parseQiniuUri('qiniu://bucket/../secret'))
            .toThrow(AssetResolutionError);
    });

    it('should throw on path traversal at start (../) ', () => {
        expect(() => parseQiniuUri('qiniu://bucket/..%2fsecret'))
            .toThrow(AssetResolutionError);
    });

    it('should allow benign filenames containing dots', () => {
        // file..name.mp4 is valid, not path traversal
        const result = parseQiniuUri('qiniu://bucket/file..name.mp4');
        expect(result).toEqual({ bucket: 'bucket', key: 'file..name.mp4' });
    });

    it('should throw on URL-encoded path traversal', () => {
        expect(() => parseQiniuUri('qiniu://bucket/%2e%2e/secret'))
            .toThrow(AssetResolutionError);
    });

    it('should throw on backslash injection', () => {
        expect(() => parseQiniuUri('qiniu://bucket/path\\file'))
            .toThrow(AssetResolutionError);
    });
});

// ============================================================================
// resolveAsset Tests
// ============================================================================

describe('resolveAsset', () => {
    const mockSigner: QiniuSigner = {
        sign: vi.fn().mockResolvedValue({
            url: 'https://cdn.example.com/file?sign=xxx',
            expiresAt: Date.now() + 3600000,
        }),
    };

    it('should resolve asset with signed URL', async () => {
        const asset: QiniuAsset = { bucket: 'test', key: 'file.mp4' };
        const result = await resolveAsset(asset, mockSigner);

        expect(result.url).toContain('https://cdn.example.com');
        expect(result.bucket).toBe('test');
        expect(result.key).toBe('file.mp4');
        expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should validate against bucket whitelist', async () => {
        const asset: QiniuAsset = { bucket: 'forbidden', key: 'file.mp4' };

        await expect(resolveAsset(asset, mockSigner, {
            allowedBuckets: ['allowed-bucket'],
        })).rejects.toThrow('not in allowed list');
    });

    it('should pass allowed bucket', async () => {
        const asset: QiniuAsset = { bucket: 'allowed', key: 'file.mp4' };

        const result = await resolveAsset(asset, mockSigner, {
            allowedBuckets: ['allowed'],
        });
        expect(result.bucket).toBe('allowed');
    });

    it('should reject empty key', async () => {
        const asset: QiniuAsset = { bucket: 'test', key: '' };

        await expect(resolveAsset(asset, mockSigner))
            .rejects.toThrow('Asset key cannot be empty');
    });
});

// ============================================================================
// buildVframeFop Tests
// ============================================================================

describe('buildVframeFop', () => {
    it('should build basic vframe fop', () => {
        const fop = buildVframeFop(5);
        expect(fop).toBe('vframe/jpg/offset/5');
    });

    it('should include width and height', () => {
        const fop = buildVframeFop(10, { width: 640, height: 360 });
        expect(fop).toBe('vframe/jpg/offset/10/w/640/h/360');
    });

    it('should use png format', () => {
        const fop = buildVframeFop(0, { format: 'png' });
        expect(fop).toBe('vframe/png/offset/0');
    });

    it('should include rotation', () => {
        const fop = buildVframeFop(5, { rotate: 90 });
        expect(fop).toBe('vframe/jpg/offset/5/rotate/90');
    });

    it('should throw on negative offset', () => {
        expect(() => buildVframeFop(-1)).toThrow(VframeError);
    });

    it('should throw on invalid width', () => {
        expect(() => buildVframeFop(0, { width: 10 })).toThrow(VframeError);
        expect(() => buildVframeFop(0, { width: 5000 })).toThrow(VframeError);
    });
});

// ============================================================================
// buildVframeUrl Tests
// ============================================================================

describe('buildVframeUrl', () => {
    it('should append vframe to URL', () => {
        const url = buildVframeUrl('https://cdn.example.com/video.mp4', 5);
        expect(url).toBe('https://cdn.example.com/video.mp4?vframe/jpg/offset/5');
    });

    it('should use pipe separator for existing query', () => {
        const url = buildVframeUrl('https://cdn.example.com/video.mp4?token=abc', 5);
        expect(url).toBe('https://cdn.example.com/video.mp4?token=abc|vframe/jpg/offset/5');
    });
});

// ============================================================================
// extractFrames Tests
// ============================================================================

describe('extractFrames', () => {
    const mockSigner: QiniuSigner = {
        sign: vi.fn().mockImplementation(async (bucket, key, opts) => ({
            url: `https://cdn.example.com/${key}?${opts?.fop ?? ''}`,
            expiresAt: Date.now() + 3600000,
        })),
    };

    it('should extract uniform frames', async () => {
        const asset: QiniuAsset = { bucket: 'test', key: 'video.mp4' };
        const result = await extractFrames(asset, mockSigner, {
            count: 5,
            duration: 100,
        });

        expect(result.count).toBe(5);
        expect(result.frames).toHaveLength(5);
        // Uniform distribution: ~16.6, 33.3, 50, 66.6, 83.3
        expect(result.frames.map(f => Math.round(f.offset))).toEqual([17, 33, 50, 67, 83]);
    });

    it('should extract explicit offsets', async () => {
        const asset: QiniuAsset = { bucket: 'test', key: 'video.mp4' };
        const result = await extractFrames(asset, mockSigner, {
            offsets: [0, 30, 60],
        });

        expect(result.count).toBe(3);
        expect(result.frames.map(f => f.offset)).toEqual([0, 30, 60]);
    });

    it('should throw if both count and offsets provided', async () => {
        const asset: QiniuAsset = { bucket: 'test', key: 'video.mp4' };

        await expect(extractFrames(asset, mockSigner, {
            count: 5,
            offsets: [0, 30],
            duration: 60,
        })).rejects.toThrow('Cannot specify both');
    });

    it('should throw if count without duration', async () => {
        const asset: QiniuAsset = { bucket: 'test', key: 'video.mp4' };

        await expect(extractFrames(asset, mockSigner, {
            count: 5,
        })).rejects.toThrow('Duration is required');
    });
});

// ============================================================================
// estimateAssetCost Tests
// ============================================================================

describe('estimateAssetCost', () => {
    it('should estimate video cost with frame count', () => {
        const cost = estimateAssetCost({
            type: 'video',
            frameCount: 5,
        });

        expect(cost.tokensEstimate).toBe(3500);
        expect(cost.level).toBe('medium');
        expect(cost.confidence).toBe('calculated');
    });

    it('should estimate image cost with resolution', () => {
        const cost = estimateAssetCost({
            type: 'image',
            resolution: { width: 1920, height: 1080 },
        });

        expect(cost.tokensEstimate).toBeGreaterThanOrEqual(910); // ~500 + 2.07MP * 200
        expect(cost.level).toBe('low');
        expect(cost.confidence).toBe('calculated');
    });

    it('should provide recommendations for missing info', () => {
        const cost = estimateAssetCost({ type: 'video' });

        expect(cost.confidence).toBe('estimate');
        expect(cost.recommendations.length).toBeGreaterThan(0);
    });
});

// ============================================================================
// detectAssetType Tests
// ============================================================================

describe('detectAssetType', () => {
    it('should detect video types', () => {
        expect(detectAssetType('video.mp4')).toBe('video');
        expect(detectAssetType('video.webm')).toBe('video');
        expect(detectAssetType('video.mov')).toBe('video');
    });

    it('should detect image types', () => {
        expect(detectAssetType('photo.jpg')).toBe('image');
        expect(detectAssetType('photo.png')).toBe('image');
        expect(detectAssetType('photo.webp')).toBe('image');
    });

    it('should detect audio types', () => {
        expect(detectAssetType('audio.mp3')).toBe('audio');
        expect(detectAssetType('audio.wav')).toBe('audio');
    });

    it('should detect document types', () => {
        expect(detectAssetType('doc.pdf')).toBe('document');
        expect(detectAssetType('doc.docx')).toBe('document');
    });

    it('should return unknown for unrecognized', () => {
        expect(detectAssetType('file.xyz')).toBe('unknown');
    });
});
