/**
 * Qiniu MCP Server - Exposes Qiniu AI capabilities to IDEs like Cursor/Windsurf.
 * 
 * Usage:
 *   npx qiniu-mcp-server
 * 
 * Environment Variables:
 *   QINIU_API_KEY - Required for AI services
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { QiniuAI } from '../../client';
import { z } from 'zod';

// ============================================================================
// Configuration
// ============================================================================

export interface QiniuMCPServerConfig {
    /** Qiniu AI API Key (sk-xxx) */
    apiKey: string;
    /** Server name */
    name?: string;
    /** Server version */
    version?: string;
}

/**
 * Options for registering a dynamic tool.
 */
export interface RegisterToolOptions {
    /**
     * Conflict handling strategy.
     * - 'error': Throw error if tool name already exists (default)
     * - 'replace': Replace existing tool silently
     */
    onConflict?: 'error' | 'replace';
}

/**
 * Dynamic tool definition for MCP Server.
 */
export interface DynamicTool {
    /** Tool name (must be unique) */
    name: string;
    /** Tool description */
    description: string;
    /** JSON Schema for input */
    inputSchema: Record<string, unknown>;
    /** Tool executor function */
    execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// ============================================================================
// Tool Definitions
// ============================================================================

const TOOLS: Tool[] = [
    // AI Tools
    {
        name: 'qiniu_chat',
        description: '使用七牛 AI 进行对话补全',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: '用户提示' },
                model: { type: 'string', description: '模型名称 (默认: deepseek-v3)' },
                system: { type: 'string', description: '系统提示' },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'qiniu_ocr',
        description: '识别图片中的文字内容',
        inputSchema: {
            type: 'object',
            properties: {
                image_url: { type: 'string', description: '图片 URL' },
            },
            required: ['image_url'],
        },
    },
    {
        name: 'qiniu_image_censor',
        description: '检测图片是否包含不安全内容 (鉴黄/暴恐/敏感人物)',
        inputSchema: {
            type: 'object',
            properties: {
                image_url: { type: 'string', description: '图片 URL' },
                scenes: {
                    type: 'array',
                    items: { type: 'string', enum: ['pulp', 'terror', 'politician'] },
                    description: '检测场景',
                },
            },
            required: ['image_url'],
        },
    },
    {
        name: 'qiniu_video_censor',
        description: '提交视频内容安全检测任务 (异步)',
        inputSchema: {
            type: 'object',
            properties: {
                video_url: { type: 'string', description: '视频 URL' },
                scenes: {
                    type: 'array',
                    items: { type: 'string', enum: ['pulp', 'terror', 'politician'] },
                    description: '检测场景',
                },
            },
            required: ['video_url'],
        },
    },
    {
        name: 'qiniu_image_generate',
        description: '使用 AI 生成图片',
        inputSchema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: '图片描述提示' },
                model: { type: 'string', description: '模型名称 (默认: kling-v2)' },
                aspect_ratio: {
                    type: 'string',
                    enum: ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9'],
                    description: '图片宽高比 (默认: 1:1)'
                },
            },
            required: ['prompt'],
        },
    },
];

// ============================================================================
// Server Implementation
// ============================================================================

export class QiniuMCPServer {
    private server: Server;
    private client: QiniuAI;
    private config: QiniuMCPServerConfig;
    /** Dynamically registered tools */
    private dynamicTools = new Map<string, DynamicTool>();

    constructor(config: QiniuMCPServerConfig) {
        this.config = config;

        // Initialize QiniuAI client
        this.client = new QiniuAI({
            apiKey: config.apiKey,
        });

        // Initialize MCP Server
        this.server = new Server(
            {
                name: config.name ?? 'qiniu-ai-server',
                version: config.version ?? '0.22.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.registerHandlers();
    }

    private registerHandlers(): void {
        // List available tools (built-in + dynamic)
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                ...TOOLS,
                ...Array.from(this.dynamicTools.values()).map(t => ({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema,
                })),
            ],
        }));

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                const result = await this.executeTool(name, args ?? {});
                return {
                    content: [
                        {
                            type: 'text',
                            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    content: [{ type: 'text', text: `Error: ${message}` }],
                    isError: true,
                };
            }
        });
    }

    private async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        // Check dynamic tools first
        const dynamicTool = this.dynamicTools.get(name);
        if (dynamicTool) {
            return dynamicTool.execute(args);
        }

        // Built-in tools
        switch (name) {
            case 'qiniu_chat':
                return this.executeChat(args);
            case 'qiniu_ocr':
                return this.executeOcr(args);
            case 'qiniu_image_censor':
                return this.executeImageCensor(args);
            case 'qiniu_video_censor':
                return this.executeVideoCensor(args);
            case 'qiniu_image_generate':
                return this.executeImageGenerate(args);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    private async executeChat(args: Record<string, unknown>): Promise<string> {
        const prompt = z.string().parse(args.prompt);
        const model = z.string().optional().parse(args.model) ?? 'deepseek-v3';
        const system = z.string().optional().parse(args.system);

        const messages = [];
        if (system) {
            messages.push({ role: 'system' as const, content: system });
        }
        messages.push({ role: 'user' as const, content: prompt });

        const response = await this.client.chat.create({
            model,
            messages,
        });

        const content = response.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content.map(p => 'text' in p ? p.text : '').join('');
        }
        return '';
    }

    private async executeOcr(args: Record<string, unknown>): Promise<{ text: string; confidence?: number }> {
        const url = z.string().parse(args.image_url);

        const result = await this.client.ocr.detect({ url });
        return {
            text: result.text,
            confidence: result.confidence,
        };
    }

    private async executeImageCensor(args: Record<string, unknown>): Promise<unknown> {
        const uri = z.string().parse(args.image_url);
        const scenes = z.array(z.enum(['pulp', 'terror', 'politician'])).optional().parse(args.scenes);

        const result = await this.client.censor.image({ uri, scenes });
        return {
            suggestion: result.suggestion,
            scenes: result.scenes,
        };
    }

    private async executeVideoCensor(args: Record<string, unknown>): Promise<{ job_id: string }> {
        const uri = z.string().parse(args.video_url);
        const scenes = z.array(z.enum(['pulp', 'terror', 'politician'])).optional().parse(args.scenes);

        const result = await this.client.censor.video({ uri, scenes });
        return {
            job_id: result.jobId,
        };
    }

    private async executeImageGenerate(args: Record<string, unknown>): Promise<{ url: string }> {
        const prompt = z.string().parse(args.prompt);
        const model = z.string().optional().parse(args.model) ?? 'kling-v2';
        const aspectRatio = z.enum(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9']).optional().parse(args.aspect_ratio);

        const result = await this.client.image.generate({
            model,
            prompt,
            ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
        });

        // Wait for image generation to complete
        const finalResult = await this.client.image.waitForResult(result);

        const url = finalResult.data?.[0]?.url;
        if (!url) {
            throw new Error('Image generation completed but no URL returned');
        }

        return { url };
    }

    /**
     * Start the MCP server with stdio transport.
     */
    async start(): Promise<void> {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Qiniu MCP Server started');
    }

    /**
     * Close the server.
     */
    async close(): Promise<void> {
        await this.server.close();
    }

    // ========================================================================
    // Dynamic Tool Registration
    // ========================================================================

    /**
     * Register a dynamic tool.
     * 
     * @param tool - Tool definition with name, description, inputSchema, and execute function
     * @param options - Registration options (default: error on conflict)
     * @throws Error if tool name conflicts with existing tool and onConflict is 'error'
     * 
     * @example
     * ```typescript
     * server.registerTool({
     *     name: 'my_custom_tool',
     *     description: 'Does something custom',
     *     inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
     *     execute: async (args) => ({ result: 'success' }),
     * });
     * ```
     * 
     * @note Built-in tools (qiniu_chat, qiniu_ocr, etc.) cannot be replaced.
     *       If onConflict is 'replace' and the name conflicts with a built-in,
     *       the registration is silently ignored with a console warning.
     */
    registerTool(tool: DynamicTool, options?: RegisterToolOptions): void {
        const onConflict = options?.onConflict ?? 'error';

        // Check for conflicts with built-in tools
        const builtinNames = TOOLS.map(t => t.name);
        if (builtinNames.includes(tool.name)) {
            if (onConflict === 'error') {
                throw new Error(`Tool "${tool.name}" conflicts with built-in tool (built-ins cannot be replaced)`);
            }
            // 'replace' - can't replace built-ins, just warn
            console.warn(`Cannot replace built-in tool "${tool.name}", ignoring`);
            return;
        }

        // Check for conflicts with existing dynamic tools
        if (this.dynamicTools.has(tool.name)) {
            if (onConflict === 'error') {
                throw new Error(`Tool "${tool.name}" already registered. Use unregisterTool first or set onConflict: 'replace'`);
            }
        }

        this.dynamicTools.set(tool.name, tool);
    }

    /**
     * Unregister a dynamic tool.
     * 
     * @param name - Tool name to unregister
     * @returns true if tool was unregistered, false if not found
     */
    unregisterTool(name: string): boolean {
        return this.dynamicTools.delete(name);
    }

    /**
     * Get list of registered dynamic tool names.
     */
    getDynamicToolNames(): string[] {
        return Array.from(this.dynamicTools.keys());
    }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

/**
 * Create and start MCP server from environment variables.
 */
export async function startFromEnv(): Promise<QiniuMCPServer> {
    const apiKey = process.env.QINIU_API_KEY;
    if (!apiKey) {
        throw new Error('QINIU_API_KEY environment variable is required');
    }

    const server = new QiniuMCPServer({ apiKey });

    await server.start();
    return server;
}
