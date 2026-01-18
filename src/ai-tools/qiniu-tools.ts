/**
 * Qiniu Native Cloud Tools.
 * Pre-built tools for Agent use, compatible with OpenAI Function Calling.
 */

import { z } from 'zod';
import type { QiniuAI } from '../client';
import type { QiniuSigner } from '../lib/signer';
import { parseQiniuUri, resolveAsset } from '../lib/asset-resolver';
import { extractFrames, type VframeOptions } from '../lib/vframe';
import { ToolDefinition, zodToJsonSchema } from './index';

// ============================================================================
// Tool Context
// ============================================================================

/** Context for tool execution */
export interface QiniuToolContext {
    /** QiniuAI client for API calls */
    client: QiniuAI;
    /** Signer for asset resolution (optional) */
    signer?: QiniuSigner;
    /** Allowed buckets whitelist for security (optional) */
    allowedBuckets?: string[];
}

// ============================================================================
// OCR Tool
// ============================================================================

const ocrParamsSchema = z.object({
    image_url: z.string().describe('图片 URL 或 qiniu:// URI'),
});

export type OcrToolParams = z.infer<typeof ocrParamsSchema>;

export interface OcrToolResult {
    text: string;
    confidence?: number;
}

export const qiniuOcrTool: ToolDefinition<OcrToolParams, OcrToolResult> = {
    description: '识别图片中的文字内容 (OCR)',
    parameters: ocrParamsSchema,
    execute: async (args: OcrToolParams, context?: QiniuToolContext): Promise<OcrToolResult> => {
        if (!context?.client) {
            throw new Error('qiniu_ocr requires QiniuAI client in context');
        }

        let url = args.image_url;

        // Resolve qiniu:// URI if needed
        if (url.startsWith('qiniu://') && context.signer) {
            const asset = parseQiniuUri(url);
            if (asset) {
                const resolved = await resolveAsset(asset, context.signer);
                url = resolved.url;
            }
        }

        const result = await context.client.ocr.detect({ url });
        return {
            text: result.text,
            confidence: result.confidence,
        };
    },
};

// ============================================================================
// Image Censor Tool
// ============================================================================

const imageCensorParamsSchema = z.object({
    image_url: z.string().describe('图片 URL 或 qiniu:// URI'),
    scenes: z.array(z.enum(['pulp', 'terror', 'politician'])).optional()
        .describe('检测场景: pulp(鉴黄), terror(暴恐), politician(敏感人物)'),
});

export type ImageCensorToolParams = z.infer<typeof imageCensorParamsSchema>;

export interface ImageCensorToolResult {
    suggestion: 'pass' | 'review' | 'block';
    scenes: Array<{
        scene: string;
        suggestion: string;
        label?: string;
    }>;
}

export const qiniuImageCensorTool: ToolDefinition<ImageCensorToolParams, ImageCensorToolResult> = {
    description: '检测图片是否包含不安全内容 (鉴黄/暴恐/敏感人物)',
    parameters: imageCensorParamsSchema,
    execute: async (args: ImageCensorToolParams, context?: QiniuToolContext): Promise<ImageCensorToolResult> => {
        if (!context?.client) {
            throw new Error('qiniu_image_censor requires QiniuAI client in context');
        }

        let uri = args.image_url;

        // Resolve qiniu:// URI if needed
        if (uri.startsWith('qiniu://') && context.signer) {
            const asset = parseQiniuUri(uri);
            if (asset) {
                const resolved = await resolveAsset(asset, context.signer);
                uri = resolved.url;
            }
        }

        const result = await context.client.censor.image({
            uri,
            scenes: args.scenes,
        });

        return {
            suggestion: result.suggestion,
            scenes: result.scenes.map(s => ({
                scene: s.scene,
                suggestion: s.suggestion,
                label: s.label,
            })),
        };
    },
};

// ============================================================================
// Video Censor Tool
// ============================================================================

const videoCensorParamsSchema = z.object({
    video_url: z.string().describe('视频 URL 或 qiniu:// URI'),
    scenes: z.array(z.enum(['pulp', 'terror', 'politician'])).optional()
        .describe('检测场景: pulp(鉴黄), terror(暴恐), politician(敏感人物)'),
});

export type VideoCensorToolParams = z.infer<typeof videoCensorParamsSchema>;

export interface VideoCensorToolResult {
    job_id: string;
    message: string;
}

export const qiniuVideoCensorTool: ToolDefinition<VideoCensorToolParams, VideoCensorToolResult> = {
    description: '提交视频内容安全检测任务 (异步, 返回 job_id)',
    parameters: videoCensorParamsSchema,
    execute: async (args: VideoCensorToolParams, context?: QiniuToolContext): Promise<VideoCensorToolResult> => {
        if (!context?.client) {
            throw new Error('qiniu_video_censor requires QiniuAI client in context');
        }

        let uri = args.video_url;

        // Resolve qiniu:// URI if needed
        if (uri.startsWith('qiniu://') && context.signer) {
            const asset = parseQiniuUri(uri);
            if (asset) {
                const resolved = await resolveAsset(asset, context.signer);
                uri = resolved.url;
            }
        }

        const result = await context.client.censor.video({
            uri,
            scenes: args.scenes,
        });

        return {
            job_id: result.jobId,
            message: '视频审核任务已提交，请使用 job_id 查询结果',
        };
    },
};

// ============================================================================
// Vframe Tool
// ============================================================================

const vframeParamsSchema = z.object({
    video_url: z.string().describe('qiniu:// 格式的视频 URI (如: qiniu://bucket/video.mp4)'),
    count: z.number().optional().describe('抽帧数量 (默认: 5)'),
    duration: z.number().optional().describe('视频时长 (秒), 均匀抽帧时必须'),
    offset: z.number().optional().describe('单帧偏移 (秒)'),
    width: z.number().optional().describe('帧宽度 (默认: 640)'),
});

export type VframeToolParams = z.infer<typeof vframeParamsSchema>;

export interface VframeToolResult {
    frames: Array<{
        url: string;
        offset: number;
    }>;
    count: number;
}

export const qiniuVframeTool: ToolDefinition<VframeToolParams, VframeToolResult> = {
    description: '从视频中提取帧 (抽帧)',
    parameters: vframeParamsSchema,
    execute: async (args: VframeToolParams, context?: QiniuToolContext): Promise<VframeToolResult> => {
        if (!context?.signer) {
            throw new Error('qiniu_vframe requires signer in context');
        }

        const asset = parseQiniuUri(args.video_url);
        if (!asset) {
            throw new Error('Invalid video URL: must be qiniu:// URI');
        }

        const options: VframeOptions = {
            count: args.count ?? 5,
            duration: args.duration,
            width: args.width ?? 640,
        };

        // Single frame mode
        if (args.offset !== undefined) {
            options.offsets = [args.offset];
            delete options.count;
            delete options.duration;
        } else if (!args.duration) {
            throw new Error('duration is required for uniform frame extraction');
        }

        const result = await extractFrames(asset, context.signer, options, {
            allowedBuckets: context.allowedBuckets,
        });

        return {
            frames: result.frames.map(f => ({
                url: f.url,
                offset: f.offset,
            })),
            count: result.count,
        };
    },
};

// ============================================================================
// Tool Collection
// ============================================================================

/** All Qiniu native tools */
export const QINIU_TOOLS = {
    qiniu_ocr: qiniuOcrTool,
    qiniu_image_censor: qiniuImageCensorTool,
    qiniu_video_censor: qiniuVideoCensorTool,
    qiniu_vframe: qiniuVframeTool,
};

/** Get all Qiniu tools as an array */
export function getQiniuToolsArray() {
    return Object.entries(QINIU_TOOLS).map(([name, tool]) => ({
        name,
        ...tool,
    }));
}

/** Get tool schemas for OpenAI function calling format */
export function getQiniuToolSchemas() {
    return Object.entries(QINIU_TOOLS).map(([name, tool]) => ({
        type: 'function' as const,
        function: {
            name,
            description: tool.description,
            parameters: '_def' in tool.parameters
                ? zodToJsonSchema(tool.parameters as z.ZodTypeAny)
                : tool.parameters,
        },
    }));
}
