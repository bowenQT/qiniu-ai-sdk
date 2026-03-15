import { generateText } from '../core';
import { createNodeQiniuAI } from '../node';
import type { MCPHttpServerConfig } from '../node';
import { QiniuAI } from '../qiniu';
import type { WorktreeLane } from './doctor';
import { getModuleMaturity } from '../lib/capability-registry';

export type LiveVerifyStatus = 'ok' | 'warn' | 'fail';

export interface LiveVerifyCheck {
    level: LiveVerifyStatus;
    message: string;
}

export interface LiveVerifyResult {
    status: LiveVerifyStatus;
    exitCode: 0 | 1 | 2;
    checks: LiveVerifyCheck[];
}

export interface LiveVerifyGateLaneResult {
    lane: WorktreeLane;
    result: LiveVerifyResult;
}

export interface LiveVerifyGateResult extends LiveVerifyResult {
    generatedAt: string;
    lanes: LiveVerifyGateLaneResult[];
}

export interface LiveVerifyOptions {
    lane: WorktreeLane;
    env?: NodeJS.ProcessEnv;
    createQiniuClient?: (apiKey: string) => Pick<QiniuAI, 'chat' | 'image' | 'video' | 'file' | 'response' | 'batch' | 'censor' | 'account' | 'admin' | 'log' | 'ocr' | 'asr' | 'tts'>;
    createNodeClient?: (apiKey: string) => ReturnType<typeof createNodeQiniuAI>;
    createMcpTransport?: (config: MCPHttpServerConfig) => LiveVerifyMcpTransport;
}

export interface LiveVerifyGateOptions {
    lanes: WorktreeLane[];
    env?: NodeJS.ProcessEnv;
    strict?: boolean;
    createQiniuClient?: LiveVerifyOptions['createQiniuClient'];
    createNodeClient?: LiveVerifyOptions['createNodeClient'];
    createMcpTransport?: LiveVerifyOptions['createMcpTransport'];
}

interface LiveVerifyMcpTransport {
    connect?(): Promise<void>;
    listTools?(): Promise<Array<{ name: string }>>;
    listResources?(): Promise<Array<{ uri: string }>>;
    listPrompts?(): Promise<Array<{ name: string }>>;
    readResourceContents?(uri: string): Promise<Array<{ text?: string; mimeType?: string }>>;
    readResource?(uri: string): Promise<string>;
    getPromptMessages?(name: string, args?: Record<string, string>): Promise<Array<{ role?: string; content: unknown }>>;
    getPrompt?(name: string, args?: Record<string, string>): Promise<string>;
    executeTool?(toolName: string, args: Record<string, unknown>): Promise<{
        content?: Array<{ type: string; text?: string }>;
    }>;
    probe?(options: {
        listTools?: boolean;
        listResources?: boolean;
        listPrompts?: boolean;
        readResource?: { uri: string };
        getPrompt?: { name: string; args?: Record<string, string> };
        executeTool?: { name: string; args?: Record<string, unknown> };
        eventStream?: boolean;
        oauthMetadata?: { challengeHeader?: string } | boolean;
        terminateSession?: boolean;
    }): Promise<{
        tools?: Array<{ name: string }>;
        resources?: Array<{ uri: string }>;
        prompts?: Array<{ name: string }>;
        resourceContents?: Array<{ text?: string; mimeType?: string }>;
        resourceText?: string;
        promptMessages?: Array<{ role?: string; content: unknown }>;
        promptText?: string;
        toolResult?: { content?: Array<{ type: string; text?: string }> };
        eventStream?: { status: number; contentType: string | null };
        oauthMetadata?: {
            protectedResource: { authorization_servers?: string[] };
            authorizationServer: { issuer?: string } | null;
        };
        terminated?: boolean;
    }>;
    openEventStream(lastEventId?: string): Promise<Pick<Response, 'status' | 'headers'>>;
    discoverOAuthMetadata(challengeHeader?: string): Promise<{
        protectedResource: {
            authorization_servers?: string[];
        };
        authorizationServer: {
            issuer?: string;
        } | null;
    }>;
    terminateSession(): Promise<boolean>;
    disconnect?(): Promise<void>;
}

function addCheck(checks: LiveVerifyCheck[], level: LiveVerifyStatus, message: string): void {
    checks.push({ level, message });
}

function summarize(checks: LiveVerifyCheck[]): LiveVerifyStatus {
    if (checks.some((check) => check.level === 'fail')) return 'fail';
    if (checks.some((check) => check.level === 'warn')) return 'warn';
    return 'ok';
}

function parseOptionalTimeout(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseOptionalJsonObject(value: string | undefined): Record<string, unknown> | undefined {
    if (!value) return undefined;
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('QINIU_LIVE_VERIFY_MCP_TOOL_ARGS_JSON must be a JSON object');
    }
    return parsed as Record<string, unknown>;
}

function parseOptionalJsonStringRecord(value: string | undefined, envName: string): Record<string, string> | undefined {
    if (!value) return undefined;
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`${envName} must be a JSON object`);
    }
    return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([key, entry]) => [key, String(entry)]),
    );
}

const LANE_MODULES: Record<Exclude<WorktreeLane, 'integration'>, string[]> = {
    foundation: ['chat'],
    'cloud-surface': ['chat', 'image', 'video', 'file', 'ocr', 'asr', 'tts', 'batch', 'admin', 'censor', 'account', 'log', 'ResponseAPI'],
    runtime: ['generateText', 'createAgent', 'memory', 'guardrails'],
    'node-integrations': ['NodeMCPHost', 'sandbox', 'skills', 'auditLogger'],
    'dx-validation': ['chat', 'file', 'generateText'],
};

export const DEFAULT_LIVE_VERIFY_GATE_LANES: WorktreeLane[] = [
    'cloud-surface',
    'node-integrations',
    'dx-validation',
];

export function parseLiveVerifyGateLanes(value?: string): WorktreeLane[] {
    if (!value?.trim()) {
        return [...DEFAULT_LIVE_VERIFY_GATE_LANES];
    }

    const parsed = value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean) as WorktreeLane[];
    const valid = new Set<WorktreeLane>([
        'foundation',
        'cloud-surface',
        'runtime',
        'node-integrations',
        'dx-validation',
        'integration',
    ]);
    const deduped: WorktreeLane[] = [];

    for (const lane of parsed) {
        if (!valid.has(lane)) {
            throw new Error(`Unknown live verification lane: ${lane}`);
        }
        if (!deduped.includes(lane)) {
            deduped.push(lane);
        }
    }

    return deduped.length > 0 ? deduped : [...DEFAULT_LIVE_VERIFY_GATE_LANES];
}

function buildLiveTimeRange(
    startOverride: string | undefined,
    endOverride: string | undefined,
    durationMs: number,
): { start: string; end: string } {
    if (startOverride && endOverride) {
        return {
            start: startOverride,
            end: endOverride,
        };
    }

    const end = endOverride ? new Date(endOverride) : new Date();
    const start = startOverride ? new Date(startOverride) : new Date(end.getTime() - durationMs);

    return {
        start: start.toISOString(),
        end: end.toISOString(),
    };
}

function addMaturityEvidence(checks: LiveVerifyCheck[], lane: WorktreeLane): void {
    if (lane === 'integration') return;

    for (const moduleName of LANE_MODULES[lane]) {
        const maturity = getModuleMaturity(moduleName);
        if (!maturity) continue;

        addCheck(
            checks,
            'ok',
            `${moduleName}: ${maturity.maturity.toUpperCase()} (${maturity.validationLevel}${maturity.validatedAt ? `, validated ${maturity.validatedAt}` : ''})`,
        );
    }
}

export async function verifyLiveLane(options: LiveVerifyOptions): Promise<LiveVerifyResult> {
    const checks: LiveVerifyCheck[] = [];
    const env = options.env ?? process.env;
    const apiKey = env.QINIU_API_KEY;
    const createQiniuClient = options.createQiniuClient ?? ((nextApiKey: string) => new QiniuAI({ apiKey: nextApiKey }));
    const createNodeClient = options.createNodeClient ?? ((nextApiKey: string) => createNodeQiniuAI({ apiKey: nextApiKey }));
    const createMcpTransport = options.createMcpTransport ?? ((config: MCPHttpServerConfig) => {
        const { MCPHttpTransport } = require('../node');
        return new MCPHttpTransport(config);
    });

    if (options.lane === 'foundation') {
        addCheck(
            checks,
            'warn',
            'foundation lane has no direct live API probe yet. Use docs/package/template smoke plus source sync evidence.',
        );
        return {
            status: summarize(checks),
            exitCode: 2,
            checks,
        };
    }

    addMaturityEvidence(checks, options.lane);

    if (!apiKey) {
        addCheck(checks, 'fail', 'Missing QINIU_API_KEY for live lane verification.');
        return {
            status: 'fail',
            exitCode: 1,
            checks,
        };
    }

    if (options.lane === 'cloud-surface' || options.lane === 'dx-validation' || options.lane === 'integration') {
        const client = createQiniuClient(apiKey);
        const result = await client.chat.create({
            model: 'gemini-2.5-flash',
            messages: [{ role: 'user', content: 'Reply with the single word pong.' }],
            temperature: 0,
        });
        const content = result.choices[0]?.message?.content;
        addCheck(checks, 'ok', `Chat probe succeeded: ${typeof content === 'string' ? content : '[non-text]'}`);

        if (env.QINIU_LIVE_VERIFY_FILE_WORKFLOW === '1') {
            const fileClient = client.file as {
                create: (params: { file: string; filename: string; purpose: string }) => Promise<any>;
                waitForReady?: (file: any, options: { timeoutMs: number; intervalMs: number }) => Promise<any>;
                toContentPart?: (file: any) => { file: { file_id?: string; format?: string } };
                delete?: (fileId: string) => Promise<unknown>;
            };
            let cleanupFileId: string | undefined;

            try {
                const created = await fileClient.create({
                    file: 'SGVsbG8=',
                    filename: 'verify.txt',
                    purpose: 'assistants',
                });
                cleanupFileId = created?.id;
                const ready = created.status === 'ready' || !fileClient.waitForReady
                    ? created
                    : await fileClient.waitForReady(created, {
                        timeoutMs: 120_000,
                        intervalMs: 1000,
                    });
                cleanupFileId = ready?.id ?? cleanupFileId;
                if (!fileClient.toContentPart) {
                    throw new Error('File live probe requires toContentPart() support in the current SDK build');
                }
                const part = fileClient.toContentPart(ready);
                addCheck(
                    checks,
                    'ok',
                    `File workflow probe succeeded: ${part.file.file_id}${part.file.format ? ` (${part.file.format})` : ''}`,
                );
            } finally {
                if (cleanupFileId && fileClient.delete) {
                    try {
                        await fileClient.delete(cleanupFileId);
                        addCheck(checks, 'ok', `File cleanup succeeded: ${cleanupFileId}`);
                    } catch (error) {
                        addCheck(
                            checks,
                            'warn',
                            `File cleanup failed: ${cleanupFileId} (${error instanceof Error ? error.message : String(error)})`,
                        );
                    }
                } else if (cleanupFileId) {
                    addCheck(
                        checks,
                        'warn',
                        `File cleanup was skipped: delete() is not available for ${cleanupFileId}`,
                    );
                }
            }
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_FILE_WORKFLOW not set. File/qfile live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_IMAGE === '1') {
            const imageClient = client.image as {
                generate?: (params: {
                    model: string;
                    prompt: string;
                    aspect_ratio?: string;
                    n?: number;
                }) => Promise<{
                    isSync: boolean;
                    task_id?: string;
                    status?: string;
                    data?: Array<{ url?: string; b64_json?: string }>;
                    wait?: (options?: { timeoutMs?: number; intervalMs?: number }) => Promise<{
                        status?: string;
                        data?: Array<{ url?: string; b64_json?: string }>;
                    }>;
                }>;
            };
            if (!imageClient.generate) {
                throw new Error('Image live probe requires image.generate() support in the current SDK build');
            }

            const imageResult = await imageClient.generate({
                model: env.QINIU_LIVE_VERIFY_IMAGE_MODEL?.trim() || 'gemini-2.5-flash-image',
                prompt: env.QINIU_LIVE_VERIFY_IMAGE_PROMPT?.trim() || 'A minimal blue square on a white background.',
                aspect_ratio: env.QINIU_LIVE_VERIFY_IMAGE_ASPECT_RATIO?.trim() || undefined,
                n: 1,
            });

            if (imageResult.isSync) {
                addCheck(
                    checks,
                    'ok',
                    `Image probe succeeded: sync${imageResult.data?.length ? ` (${imageResult.data.length} image${imageResult.data.length === 1 ? '' : 's'})` : ''}`,
                );
            } else {
                addCheck(
                    checks,
                    'ok',
                    `Image create probe succeeded: ${imageResult.task_id ?? '[unknown-task]'}${imageResult.status ? ` (${imageResult.status})` : ''}`,
                );

                if (env.QINIU_LIVE_VERIFY_IMAGE_WAIT === '1') {
                    if (!imageResult.wait) {
                        throw new Error('Image wait live probe requires ImageTaskHandle.wait() support in the current SDK build');
                    }
                    const waited = await imageResult.wait({
                        timeoutMs: parseOptionalTimeout(env.QINIU_LIVE_VERIFY_IMAGE_TIMEOUT_MS) ?? 120_000,
                        intervalMs: parseOptionalTimeout(env.QINIU_LIVE_VERIFY_IMAGE_INTERVAL_MS) ?? 2_000,
                    });
                    addCheck(
                        checks,
                        'ok',
                        `Image wait probe succeeded: ${imageResult.task_id ?? '[unknown-task]'}${waited.status ? ` -> ${waited.status}` : ''}${
                            waited.data?.length ? ` (${waited.data.length} image${waited.data.length === 1 ? '' : 's'})` : ''
                        }`,
                    );
                } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
                    addCheck(
                        checks,
                        'warn',
                        'QINIU_LIVE_VERIFY_IMAGE_WAIT not set. Image wait live probe was skipped.',
                    );
                }
            }
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_IMAGE not set. Image live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_VIDEO === '1') {
            const videoClient = client.video as {
                create?: (params: {
                    model: string;
                    prompt: string;
                    image_url?: string;
                }) => Promise<{
                    id: string;
                    wait?: (options?: { timeoutMs?: number; intervalMs?: number }) => Promise<{
                        id?: string;
                        status?: string;
                        task_result?: { videos?: Array<{ url: string }> };
                    }>;
                }>;
            };
            if (!videoClient.create) {
                throw new Error('Video live probe requires video.create() support in the current SDK build');
            }

            const videoParams: {
                model: string;
                prompt: string;
                image_url?: string;
            } = {
                model: env.QINIU_LIVE_VERIFY_VIDEO_MODEL?.trim() || 'kling-v2',
                prompt: env.QINIU_LIVE_VERIFY_VIDEO_PROMPT?.trim() || 'A calm camera pan across a blue square.',
            };
            const videoImageUrl = env.QINIU_LIVE_VERIFY_VIDEO_IMAGE_URL?.trim();
            if (videoImageUrl) {
                videoParams.image_url = videoImageUrl;
            }

            const videoHandle = await videoClient.create(videoParams);
            addCheck(
                checks,
                'ok',
                `Video create probe succeeded: ${videoHandle.id}`,
            );

            if (env.QINIU_LIVE_VERIFY_VIDEO_WAIT === '1') {
                if (!videoHandle.wait) {
                    throw new Error('Video wait live probe requires VideoTaskHandle.wait() support in the current SDK build');
                }
                const waited = await videoHandle.wait({
                    timeoutMs: parseOptionalTimeout(env.QINIU_LIVE_VERIFY_VIDEO_TIMEOUT_MS) ?? 300_000,
                    intervalMs: parseOptionalTimeout(env.QINIU_LIVE_VERIFY_VIDEO_INTERVAL_MS) ?? 3_000,
                });
                addCheck(
                    checks,
                    'ok',
                    `Video wait probe succeeded: ${waited.id ?? videoHandle.id}${waited.status ? ` -> ${waited.status}` : ''}${
                        waited.task_result?.videos?.length ? ` (${waited.task_result.videos.length} video${waited.task_result.videos.length === 1 ? '' : 's'})` : ''
                    }`,
                );
            } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
                addCheck(
                    checks,
                    'warn',
                    'QINIU_LIVE_VERIFY_VIDEO_WAIT not set. Video wait live probe was skipped.',
                );
            }
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_VIDEO not set. Video live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_RESPONSE_API === '1') {
            const responseClient = client.response as {
                createText?: (params: { model: string; input: string; include?: string[] }) => Promise<string | undefined>;
                create?: (params: { model: string; input: string; include?: string[] }) => Promise<{ output_text?: string }>;
                createTextStream?: (params: { model: string; input: string; include?: string[] }) => AsyncGenerator<string, { outputText: string }, unknown>;
            };

            const responseText = responseClient.createText
                ? await responseClient.createText({
                    model: env.QINIU_LIVE_VERIFY_RESPONSE_MODEL || 'gpt-5.2',
                    input: 'Reply with the single word response.',
                    include: ['reasoning.encrypted_content'],
                })
                : (await responseClient.create?.({
                    model: env.QINIU_LIVE_VERIFY_RESPONSE_MODEL || 'gpt-5.2',
                    input: 'Reply with the single word response.',
                    include: ['reasoning.encrypted_content'],
                }))?.output_text;

            addCheck(
                checks,
                'ok',
                `Response API probe succeeded: ${responseText ?? '[non-text]'}`,
            );

            if (env.QINIU_LIVE_VERIFY_RESPONSE_STREAM === '1') {
                if (!responseClient.createTextStream) {
                    throw new Error('Response API stream probe requires createTextStream() support in the current SDK build');
                }
                const stream = responseClient.createTextStream({
                    model: env.QINIU_LIVE_VERIFY_RESPONSE_MODEL || 'gpt-5.2',
                    input: 'Reply with the single word stream.',
                    include: ['reasoning.encrypted_content'],
                });
                let streamedText = '';

                while (true) {
                    const next = await stream.next();
                    if (next.done) {
                        streamedText = next.value.outputText || streamedText;
                        break;
                    }
                    streamedText += next.value;
                }

                addCheck(
                    checks,
                    'ok',
                    `Response API stream probe succeeded: ${streamedText || '[non-text]'}`,
                );
            } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
                addCheck(
                    checks,
                    'warn',
                    'QINIU_LIVE_VERIFY_RESPONSE_STREAM not set. Response API stream live probe was skipped.',
                );
            }
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_RESPONSE_API not set. Response API live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_BATCH === '1') {
            const batchClient = client.batch as {
                create?: (params: {
                    input_files_url: string;
                    endpoint: string;
                    completion_window?: string;
                    metadata?: Record<string, string>;
                }) => Promise<{
                    id: string;
                    status?: string;
                    wait?: (options?: { timeoutMs?: number; intervalMs?: number }) => Promise<{ status?: string }>;
                        cancel?: () => Promise<void>;
                    }>;
                list?: (options?: { page_size?: number; status?: string }) => Promise<{
                    data: Array<{
                        id: string;
                        status?: string;
                        get?: () => Promise<{ status?: string }>;
                        wait?: (options?: { timeoutMs?: number; intervalMs?: number }) => Promise<{ status?: string }>;
                        cancel?: () => Promise<void>;
                    }>;
                }>;
                get?: (batchId: string) => Promise<{ status?: string }>;
                cancel?: (batchId: string) => Promise<{ status?: string }>;
                delete?: (batchId: string) => Promise<void>;
            };

            if (!batchClient.create) {
                throw new Error('Batch live probe requires batch.create() support in the current SDK build');
            }

            const inputFilesUrl = env.QINIU_LIVE_VERIFY_BATCH_INPUT_FILES_URL?.trim();
            if (!inputFilesUrl) {
                throw new Error('QINIU_LIVE_VERIFY_BATCH_INPUT_FILES_URL is required when QINIU_LIVE_VERIFY_BATCH=1');
            }

            const batchHandle = await batchClient.create({
                input_files_url: inputFilesUrl,
                endpoint: env.QINIU_LIVE_VERIFY_BATCH_ENDPOINT?.trim() || '/v1/chat/completions',
                completion_window: env.QINIU_LIVE_VERIFY_BATCH_COMPLETION_WINDOW?.trim() || '24h',
                metadata: {
                    source: 'qiniu-ai-sdk-live-verify',
                    lane: options.lane,
                },
            });
            const batchId = batchHandle.id;

            try {
                addCheck(
                    checks,
                    'ok',
                    `Batch create probe succeeded: ${batchId}${batchHandle.status ? ` (${batchHandle.status})` : ''}`,
                );

                if (env.QINIU_LIVE_VERIFY_BATCH_WAIT === '1') {
                    if (!batchHandle.wait) {
                        throw new Error('Batch wait probe requires BatchTaskHandle.wait() support');
                    }
                    const waited = await batchHandle.wait({
                        timeoutMs: parseOptionalTimeout(env.QINIU_LIVE_VERIFY_BATCH_TIMEOUT_MS) ?? 120_000,
                        intervalMs: parseOptionalTimeout(env.QINIU_LIVE_VERIFY_BATCH_INTERVAL_MS) ?? 2_000,
                    });
                    addCheck(
                        checks,
                        'ok',
                        `Batch wait probe succeeded: ${batchId}${waited.status ? ` -> ${waited.status}` : ''}`,
                    );
                }

                if (env.QINIU_LIVE_VERIFY_BATCH_CANCEL === '1') {
                    const cancelled = batchHandle.cancel
                        ? await batchHandle.cancel().then(() => ({ status: 'cancelling' }))
                        : batchClient.cancel
                            ? await batchClient.cancel(batchId)
                            : null;
                    if (!cancelled) {
                        throw new Error('Batch cancel probe requires handle.cancel() or batch.cancel() support');
                    }
                    addCheck(
                        checks,
                        'ok',
                        `Batch cancel probe succeeded: ${batchId}${cancelled.status ? ` -> ${cancelled.status}` : ''}`,
                    );
                } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
                    addCheck(
                        checks,
                        'warn',
                        'QINIU_LIVE_VERIFY_BATCH_CANCEL not set. Batch cancel live probe was skipped.',
                    );
                }
            } finally {
                if (batchClient.delete) {
                    try {
                        await batchClient.delete(batchId);
                        addCheck(checks, 'ok', `Batch cleanup succeeded: ${batchId}`);
                    } catch (error) {
                        addCheck(
                            checks,
                            'warn',
                            `Batch cleanup failed: ${batchId} (${error instanceof Error ? error.message : String(error)})`,
                        );
                    }
                } else {
                    addCheck(
                        checks,
                        'warn',
                        `Batch cleanup was skipped: delete() is not available for ${batchId}`,
                    );
                }
            }
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_BATCH not set. Batch live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_BATCH_LIST === '1') {
            const batchClient = client.batch as {
                list?: (options?: { page_size?: number; status?: string }) => Promise<{
                    data: Array<{
                        id: string;
                        status?: string;
                        get?: () => Promise<{ status?: string }>;
                        wait?: (options?: { timeoutMs?: number; intervalMs?: number }) => Promise<{ status?: string }>;
                        cancel?: () => Promise<void>;
                    }>;
                }>;
            };

            if (!batchClient.list) {
                throw new Error('Batch list live probe requires batch.list() support in the current SDK build');
            }

            const listed = await batchClient.list({
                page_size: 1,
                status: env.QINIU_LIVE_VERIFY_BATCH_LIST_STATUS?.trim() || undefined,
            });
            const first = listed.data[0];

            addCheck(
                checks,
                'ok',
                `Batch list probe succeeded: ${listed.data.length} item(s)${
                    first?.id ? ` (${first.id}${first.status ? ` ${first.status}` : ''})` : ''
                }`,
            );

            if (first) {
                const features = [
                    typeof first.get === 'function' ? 'get' : null,
                    typeof first.wait === 'function' ? 'wait' : null,
                    typeof first.cancel === 'function' ? 'cancel' : null,
                ].filter(Boolean);

                addCheck(
                    checks,
                    features.length === 3 ? 'ok' : 'warn',
                    `Batch list snapshot capabilities: ${first.id} -> ${features.length ? features.join(', ') : 'none'}`,
                );
            }
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_BATCH_LIST not set. Batch list live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_BATCH_GET_ID) {
            const batchClient = client.batch as {
                get?: (batchId: string) => Promise<{
                    id?: string;
                    status?: string;
                    get?: () => Promise<{ id?: string; status?: string }>;
                    wait?: (options?: { timeoutMs?: number; intervalMs?: number }) => Promise<{ status?: string }>;
                    cancel?: () => Promise<void>;
                }>;
            };

            if (!batchClient.get) {
                throw new Error('Batch get live probe requires batch.get() support in the current SDK build');
            }

            const targetBatchId = env.QINIU_LIVE_VERIFY_BATCH_GET_ID.trim();
            const snapshot = await batchClient.get(targetBatchId);
            addCheck(
                checks,
                'ok',
                `Batch get probe succeeded: ${snapshot.id ?? targetBatchId}${snapshot.status ? ` (${snapshot.status})` : ''}`,
            );

            if (typeof snapshot.get === 'function') {
                const refreshed = await snapshot.get();
                addCheck(
                    checks,
                    'ok',
                    `Batch snapshot refresh probe succeeded: ${refreshed.id ?? targetBatchId}${
                        refreshed.status ? ` (${refreshed.status})` : ''
                    }`,
                );
            } else {
                addCheck(
                    checks,
                    'warn',
                    `Batch get probe returned no snapshot refresh helper for ${snapshot.id ?? targetBatchId}`,
                );
            }
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_BATCH_GET_ID not set. Batch get live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_CENSOR === '1') {
            const censorClient = client.censor as {
                image?: (params: {
                    uri: string;
                    scenes?: Array<'pulp' | 'terror' | 'politician'>;
                }) => Promise<{
                    suggestion?: string;
                    scenes?: Array<{ scene: string; suggestion: string }>;
                }>;
                video?: (params: {
                    uri: string;
                    scenes?: Array<'pulp' | 'terror' | 'politician'>;
                }) => Promise<{
                    id?: string;
                    jobId: string;
                    wait?: (options?: { timeoutMs?: number; intervalMs?: number }) => Promise<{
                        jobId: string;
                        status: string;
                        suggestion?: string;
                        scenes?: Array<{ scene: string; suggestion: string }>;
                    }>;
                }>;
            };
            if (!censorClient.image) {
                throw new Error('Censor live probe requires censor.image() support in the current SDK build');
            }

            const uri = env.QINIU_LIVE_VERIFY_CENSOR_URI?.trim();
            if (!uri) {
                throw new Error('QINIU_LIVE_VERIFY_CENSOR_URI is required when QINIU_LIVE_VERIFY_CENSOR=1');
            }

            const scenes = env.QINIU_LIVE_VERIFY_CENSOR_SCENES
                ?.split(',')
                .map((scene) => scene.trim())
                .filter(Boolean) as Array<'pulp' | 'terror' | 'politician'> | undefined;

            const censorResult = await censorClient.image({
                uri,
                ...(scenes && scenes.length > 0 ? { scenes } : {}),
            });
            addCheck(
                checks,
                'ok',
                `Censor probe succeeded: ${censorResult.suggestion ?? 'unknown'}${
                    censorResult.scenes?.length
                        ? ` (${censorResult.scenes.map((scene) => `${scene.scene}:${scene.suggestion}`).join(', ')})`
                        : ''
                }`,
            );
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_CENSOR not set. Censor live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_CENSOR_VIDEO === '1') {
            const censorClient = client.censor as {
                video?: (params: {
                    uri: string;
                    scenes?: Array<'pulp' | 'terror' | 'politician'>;
                }) => Promise<{
                    id?: string;
                    jobId: string;
                    wait?: (options?: { timeoutMs?: number; intervalMs?: number }) => Promise<{
                        jobId: string;
                        status: string;
                        suggestion?: string;
                        scenes?: Array<{ scene: string; suggestion: string }>;
                    }>;
                }>;
            };
            if (!censorClient.video) {
                throw new Error('Censor video live probe requires censor.video() support in the current SDK build');
            }

            const uri = env.QINIU_LIVE_VERIFY_CENSOR_VIDEO_URI?.trim();
            if (!uri) {
                throw new Error('QINIU_LIVE_VERIFY_CENSOR_VIDEO_URI is required when QINIU_LIVE_VERIFY_CENSOR_VIDEO=1');
            }

            const scenes = env.QINIU_LIVE_VERIFY_CENSOR_VIDEO_SCENES
                ?.split(',')
                .map((scene) => scene.trim())
                .filter(Boolean) as Array<'pulp' | 'terror' | 'politician'> | undefined;

            const videoJob = await censorClient.video({
                uri,
                ...(scenes && scenes.length > 0 ? { scenes } : {}),
            });

            addCheck(
                checks,
                'ok',
                `Censor video create probe succeeded: ${videoJob.id ?? videoJob.jobId}`,
            );

            if (!videoJob.wait) {
                throw new Error('Censor video live probe requires VideoCensorTaskHandle.wait() support in the current SDK build');
            }

            const waited = await videoJob.wait({
                timeoutMs: parseOptionalTimeout(env.QINIU_LIVE_VERIFY_CENSOR_VIDEO_TIMEOUT_MS) ?? 120_000,
                intervalMs: parseOptionalTimeout(env.QINIU_LIVE_VERIFY_CENSOR_VIDEO_INTERVAL_MS) ?? 2_000,
            });

            addCheck(
                checks,
                'ok',
                `Censor video wait probe succeeded: ${waited.jobId}${waited.status ? ` -> ${waited.status}` : ''}${
                    waited.suggestion ? ` (${waited.suggestion})` : ''
                }${
                    waited.scenes?.length
                        ? ` [${waited.scenes.map((scene) => `${scene.scene}:${scene.suggestion}`).join(', ')}]`
                        : ''
                }`,
            );
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_CENSOR_VIDEO not set. Censor video live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_ACCOUNT_USAGE === '1') {
            const accountClient = client.account as {
                usage?: (params: {
                    granularity: 'day' | 'hour';
                    start: string;
                    end: string;
                }) => Promise<{
                    data?: Array<{ id?: string; name?: string }>;
                }>;
            };
            if (!accountClient.usage) {
                throw new Error('Account live probe requires account.usage() support in the current SDK build');
            }

            const granularity = env.QINIU_LIVE_VERIFY_ACCOUNT_GRANULARITY === 'hour' ? 'hour' : 'day';
            const range = buildLiveTimeRange(
                env.QINIU_LIVE_VERIFY_ACCOUNT_START,
                env.QINIU_LIVE_VERIFY_ACCOUNT_END,
                granularity === 'hour' ? 6 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
            );
            const usage = await accountClient.usage({
                granularity,
                start: range.start,
                end: range.end,
            });
            const firstModel = usage.data?.[0]?.name ?? usage.data?.[0]?.id;
            addCheck(
                checks,
                'ok',
                `Account usage probe succeeded: ${usage.data?.length ?? 0} models${firstModel ? ` (${firstModel})` : ''}`,
            );
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_ACCOUNT_USAGE not set. Account usage live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_ADMIN_LIST_KEYS === '1') {
            const adminClient = client.admin as {
                listKeys?: () => Promise<Array<{ key: string; name: string; status?: string }>>;
                getKey?: (key: string) => Promise<{ key: string; name: string; status?: string } | null>;
            };
            if (!adminClient.listKeys) {
                throw new Error('Admin live probe requires admin.listKeys() support in the current SDK build');
            }

            const keys = await adminClient.listKeys();
            addCheck(
                checks,
                'ok',
                `Admin listKeys probe succeeded: ${keys.length} keys${keys[0]?.name ? ` (${keys[0].name})` : ''}`,
            );

            const targetKey = env.QINIU_LIVE_VERIFY_ADMIN_GET_KEY?.trim();
            if (targetKey) {
                if (!adminClient.getKey) {
                    throw new Error('Admin getKey live probe requires admin.getKey() support in the current SDK build');
                }
                const keyInfo = await adminClient.getKey(targetKey);
                addCheck(
                    checks,
                    'ok',
                    `Admin getKey probe succeeded: ${keyInfo?.name ?? targetKey}${keyInfo?.status ? ` (${keyInfo.status})` : ''}`,
                );
            } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
                addCheck(
                    checks,
                    'warn',
                    'QINIU_LIVE_VERIFY_ADMIN_GET_KEY not set. Admin getKey live probe was skipped.',
                );
            }
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_ADMIN_LIST_KEYS not set. Admin live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_LOG_EXPORT === '1') {
            const logClient = client.log as {
                export?: (params: {
                    start: string;
                    end: string;
                    size?: number;
                }) => Promise<Array<{ id?: string; code?: number }>>;
            };
            if (!logClient.export) {
                throw new Error('Log live probe requires log.export() support in the current SDK build');
            }

            const range = buildLiveTimeRange(
                env.QINIU_LIVE_VERIFY_LOG_START,
                env.QINIU_LIVE_VERIFY_LOG_END,
                24 * 60 * 60 * 1000,
            );
            const size = parseOptionalTimeout(env.QINIU_LIVE_VERIFY_LOG_SIZE) ?? 1;
            const entries = await logClient.export({
                start: range.start,
                end: range.end,
                size,
            });
            addCheck(
                checks,
                'ok',
                `Log export probe succeeded: ${entries.length} entries${entries[0]?.id ? ` (${entries[0].id})` : ''}`,
            );
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_LOG_EXPORT not set. Log export live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_OCR === '1') {
            const ocrClient = client.ocr as {
                detect?: (params: {
                    url?: string;
                    image?: string;
                    model?: string;
                }) => Promise<{ text?: string; blocks?: Array<{ text: string }> }>;
            };
            if (!ocrClient.detect) {
                throw new Error('OCR live probe requires ocr.detect() support in the current SDK build');
            }

            const ocrUri = env.QINIU_LIVE_VERIFY_OCR_URI?.trim();
            if (!ocrUri) {
                throw new Error('QINIU_LIVE_VERIFY_OCR_URI is required when QINIU_LIVE_VERIFY_OCR=1');
            }

            const ocrResult = await ocrClient.detect({
                url: ocrUri,
                model: env.QINIU_LIVE_VERIFY_OCR_MODEL?.trim() || undefined,
            });

            addCheck(
                checks,
                'ok',
                `OCR probe succeeded: ${ocrResult.text ?? '[no-text]'}${ocrResult.blocks?.length ? ` (${ocrResult.blocks.length} blocks)` : ''}`,
            );
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_OCR not set. OCR live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_ASR === '1') {
            const asrClient = client.asr as {
                transcribe?: (params: {
                    model?: string;
                    language?: string;
                    audio: {
                        format: string;
                        url?: string;
                    };
                }) => Promise<{ text?: string; duration?: number; language?: string }>;
            };
            if (!asrClient.transcribe) {
                throw new Error('ASR live probe requires asr.transcribe() support in the current SDK build');
            }

            const asrUri = env.QINIU_LIVE_VERIFY_ASR_URI?.trim();
            if (!asrUri) {
                throw new Error('QINIU_LIVE_VERIFY_ASR_URI is required when QINIU_LIVE_VERIFY_ASR=1');
            }

            const asrResult = await asrClient.transcribe({
                model: env.QINIU_LIVE_VERIFY_ASR_MODEL?.trim() || undefined,
                language: env.QINIU_LIVE_VERIFY_ASR_LANGUAGE?.trim() || undefined,
                audio: {
                    format: env.QINIU_LIVE_VERIFY_ASR_FORMAT?.trim() || 'mp3',
                    url: asrUri,
                },
            });

            addCheck(
                checks,
                'ok',
                `ASR probe succeeded: ${asrResult.text ?? '[no-text]'}${asrResult.duration ? ` (${asrResult.duration}ms)` : ''}${
                    asrResult.language ? ` [${asrResult.language}]` : ''
                }`,
            );
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_ASR not set. ASR live probe was skipped.',
            );
        }

        if (env.QINIU_LIVE_VERIFY_TTS === '1') {
            const ttsClient = client.tts as {
                synthesize?: (params: {
                    text: string;
                    voice_type: string;
                    encoding?: 'mp3' | 'wav' | 'pcm';
                }) => Promise<{ audio?: string; duration?: number; format?: string }>;
            };
            if (!ttsClient.synthesize) {
                throw new Error('TTS live probe requires tts.synthesize() support in the current SDK build');
            }

            const voiceType = env.QINIU_LIVE_VERIFY_TTS_VOICE_TYPE?.trim();
            if (!voiceType) {
                throw new Error('QINIU_LIVE_VERIFY_TTS_VOICE_TYPE is required when QINIU_LIVE_VERIFY_TTS=1');
            }

            const ttsResult = await ttsClient.synthesize({
                text: env.QINIU_LIVE_VERIFY_TTS_TEXT?.trim() || '你好，世界。',
                voice_type: voiceType,
                encoding: (env.QINIU_LIVE_VERIFY_TTS_ENCODING?.trim() as 'mp3' | 'wav' | 'pcm' | undefined) || 'mp3',
            });

            addCheck(
                checks,
                'ok',
                `TTS probe succeeded: ${ttsResult.format ?? 'unknown'}${ttsResult.duration ? ` (${ttsResult.duration}ms)` : ''}${
                    ttsResult.audio ? ` [audio:${ttsResult.audio.length}]` : ''
                }`,
            );
        } else if (options.lane === 'cloud-surface' || options.lane === 'integration') {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_TTS not set. TTS live probe was skipped.',
            );
        }
    } else if (options.lane === 'runtime') {
        const client = createQiniuClient(apiKey);
        const result = await generateText({
            client,
            model: 'gemini-2.5-flash',
            prompt: 'Call the ping tool and answer with the returned word.',
            tools: {
                ping: {
                    description: 'Return pong',
                    parameters: { type: 'object', properties: {} },
                    execute: async () => ({ pong: 'pong' }),
                },
            },
            maxSteps: 2,
        });
        addCheck(checks, 'ok', `Runtime probe succeeded: ${result.text}`);
    } else if (options.lane === 'node-integrations') {
        const client = createNodeClient(apiKey);
        const result = await client.chat.create({
            model: 'gemini-2.5-flash',
            messages: [{ role: 'user', content: 'Reply with the single word node.' }],
            temperature: 0,
        });
        addCheck(checks, 'ok', `Node lane chat probe succeeded: ${result.choices[0]?.message?.content ?? ''}`);
        const mcpUrl = env.QINIU_LIVE_VERIFY_MCP_URL?.trim();
        if (mcpUrl) {
            const transport = createMcpTransport({
                name: 'live-verify-mcp',
                transport: 'http',
                url: mcpUrl,
                token: env.QINIU_LIVE_VERIFY_MCP_TOKEN,
                protocolVersion: env.QINIU_LIVE_VERIFY_MCP_PROTOCOL_VERSION,
                sessionId: env.QINIU_LIVE_VERIFY_MCP_SESSION_ID,
                lastEventId: env.QINIU_LIVE_VERIFY_MCP_LAST_EVENT_ID,
                origin: env.QINIU_LIVE_VERIFY_MCP_ORIGIN,
                timeout: parseOptionalTimeout(env.QINIU_LIVE_VERIFY_MCP_TIMEOUT_MS),
            });
            const toolName = env.QINIU_LIVE_VERIFY_MCP_TOOL_NAME?.trim();
            const toolArgs = parseOptionalJsonObject(env.QINIU_LIVE_VERIFY_MCP_TOOL_ARGS_JSON) ?? {};
            const promptName = env.QINIU_LIVE_VERIFY_MCP_GET_PROMPT_NAME?.trim();
            const promptArgs = parseOptionalJsonStringRecord(
                env.QINIU_LIVE_VERIFY_MCP_GET_PROMPT_ARGS_JSON,
                'QINIU_LIVE_VERIFY_MCP_GET_PROMPT_ARGS_JSON',
            );
            const resourceUri = env.QINIU_LIVE_VERIFY_MCP_READ_RESOURCE_URI?.trim();

            if (transport.probe) {
                const probeResult = await transport.probe({
                    listTools: env.QINIU_LIVE_VERIFY_MCP_LIST_TOOLS === '1',
                    listResources: env.QINIU_LIVE_VERIFY_MCP_LIST_RESOURCES === '1',
                    listPrompts: env.QINIU_LIVE_VERIFY_MCP_LIST_PROMPTS === '1',
                    readResource: resourceUri ? { uri: resourceUri } : undefined,
                    getPrompt: promptName ? { name: promptName, args: promptArgs } : undefined,
                    executeTool: toolName
                        ? { name: toolName, args: toolArgs }
                        : undefined,
                    eventStream: true,
                    oauthMetadata: env.QINIU_LIVE_VERIFY_MCP_OAUTH_DISCOVERY === '1'
                        ? { challengeHeader: env.QINIU_LIVE_VERIFY_MCP_CHALLENGE }
                        : undefined,
                    terminateSession: env.QINIU_LIVE_VERIFY_MCP_TERMINATE === '1',
                });

                if (probeResult.tools) {
                    addCheck(checks, 'ok', `MCP tool listing probe succeeded: ${probeResult.tools.length} tools`);
                }

                if (probeResult.resources) {
                    addCheck(checks, 'ok', `MCP resource listing probe succeeded: ${probeResult.resources.length} resources`);
                }

                if (probeResult.prompts) {
                    addCheck(checks, 'ok', `MCP prompt listing probe succeeded: ${probeResult.prompts.length} prompts`);
                }

                if (typeof probeResult.resourceText === 'string') {
                    addCheck(checks, 'ok', `MCP resource read probe succeeded: ${probeResult.resourceText}`);
                }
                if (probeResult.resourceContents) {
                    addCheck(checks, 'ok', `MCP structured resource read probe succeeded: ${probeResult.resourceContents.length} contents`);
                }

                if (typeof probeResult.promptText === 'string') {
                    addCheck(checks, 'ok', `MCP prompt get probe succeeded: ${probeResult.promptText}`);
                }
                if (probeResult.promptMessages) {
                    addCheck(checks, 'ok', `MCP structured prompt get probe succeeded: ${probeResult.promptMessages.length} messages`);
                }

                if (toolName && probeResult.toolResult) {
                    const firstText = probeResult.toolResult.content?.find(
                        (item: { type: string; text?: string }) => item.type === 'text',
                    )?.text;
                    addCheck(
                        checks,
                        'ok',
                        `MCP tool call probe succeeded: ${toolName}${firstText ? ` -> ${firstText}` : ''}`,
                    );
                }

                if (probeResult.eventStream) {
                    addCheck(
                        checks,
                        'ok',
                        `MCP event stream probe succeeded: ${probeResult.eventStream.status}${probeResult.eventStream.contentType ? ` (${probeResult.eventStream.contentType})` : ''}`,
                    );
                }

                if (probeResult.oauthMetadata) {
                    const issuer = probeResult.oauthMetadata.authorizationServer?.issuer
                        ?? probeResult.oauthMetadata.protectedResource.authorization_servers?.[0]
                        ?? 'unadvertised';
                    addCheck(checks, 'ok', `MCP OAuth metadata probe succeeded: ${issuer}`);
                }

                if (env.QINIU_LIVE_VERIFY_MCP_TERMINATE === '1') {
                    addCheck(
                        checks,
                        probeResult.terminated ? 'ok' : 'warn',
                        probeResult.terminated
                            ? 'MCP DELETE terminate probe succeeded.'
                            : 'MCP DELETE terminate probe is not supported by the server.',
                    );
                }
            } else {
                let terminated = false;

                try {
                    if (env.QINIU_LIVE_VERIFY_MCP_LIST_TOOLS === '1') {
                        if (!transport.connect || !transport.listTools) {
                            throw new Error('MCP tool listing probe requires connect() and listTools() support');
                        }
                        await transport.connect();
                    const tools = await transport.listTools();
                    addCheck(checks, 'ok', `MCP tool listing probe succeeded: ${tools.length} tools`);
                }

                    if (env.QINIU_LIVE_VERIFY_MCP_LIST_RESOURCES === '1') {
                        if (!transport.connect || !transport.listResources) {
                            throw new Error('MCP resource listing probe requires connect() and listResources() support');
                        }
                        await transport.connect();
                        const resources = await transport.listResources();
                        addCheck(checks, 'ok', `MCP resource listing probe succeeded: ${resources.length} resources`);
                    }

                    if (env.QINIU_LIVE_VERIFY_MCP_LIST_PROMPTS === '1') {
                        if (!transport.connect || !transport.listPrompts) {
                            throw new Error('MCP prompt listing probe requires connect() and listPrompts() support');
                        }
                        await transport.connect();
                        const prompts = await transport.listPrompts();
                        addCheck(checks, 'ok', `MCP prompt listing probe succeeded: ${prompts.length} prompts`);
                    }

                    if (resourceUri) {
                        if (!transport.connect || (!transport.readResource && !transport.readResourceContents)) {
                            throw new Error('MCP resource read probe requires connect() and readResource() or readResourceContents() support');
                        }
                        await transport.connect();
                        const resourceContents = transport.readResourceContents
                            ? await transport.readResourceContents(resourceUri)
                            : undefined;
                        if (resourceContents) {
                            addCheck(checks, 'ok', `MCP structured resource read probe succeeded: ${resourceContents.length} contents`);
                        }
                        const resourceText = transport.readResource
                            ? await transport.readResource(resourceUri)
                            : (resourceContents ?? []).map((content: { text?: string; mimeType?: string }) =>
                                typeof content.text === 'string' ? content.text : JSON.stringify(content),
                            ).join('\n');
                        addCheck(checks, 'ok', `MCP resource read probe succeeded: ${resourceText}`);
                    }

                    if (promptName) {
                        if (!transport.connect || (!transport.getPrompt && !transport.getPromptMessages)) {
                            throw new Error('MCP prompt get probe requires connect() and getPrompt() or getPromptMessages() support');
                        }
                        await transport.connect();
                        const promptMessages = transport.getPromptMessages
                            ? await transport.getPromptMessages(promptName, promptArgs)
                            : undefined;
                        if (promptMessages) {
                            addCheck(checks, 'ok', `MCP structured prompt get probe succeeded: ${promptMessages.length} messages`);
                        }
                        const promptText = transport.getPrompt
                            ? await transport.getPrompt(promptName, promptArgs)
                            : (promptMessages ?? []).map((message: { role?: string; content: unknown }) => {
                                const content = message.content;
                                if (typeof content === 'string') {
                                    return content;
                                }
                                if (content && typeof content === 'object' && 'text' in content && typeof content.text === 'string') {
                                    return content.text;
                                }
                                return JSON.stringify(content);
                            }).join('\n');
                        addCheck(checks, 'ok', `MCP prompt get probe succeeded: ${promptText}`);
                    }

                    if (toolName) {
                        if (!transport.connect || !transport.executeTool) {
                            throw new Error('MCP tool execution probe requires connect() and executeTool() support');
                        }
                        await transport.connect();
                        const toolResult = await transport.executeTool(toolName, toolArgs);
                        const firstText = toolResult.content?.find(
                            (item: { type: string; text?: string }) => item.type === 'text',
                        )?.text;
                        addCheck(
                            checks,
                            'ok',
                            `MCP tool call probe succeeded: ${toolName}${firstText ? ` -> ${firstText}` : ''}`,
                        );
                    }

                    const stream = await transport.openEventStream();
                    const contentType = stream.headers.get('content-type');
                    addCheck(
                        checks,
                        'ok',
                        `MCP event stream probe succeeded: ${stream.status}${contentType ? ` (${contentType})` : ''}`,
                    );

                    if (env.QINIU_LIVE_VERIFY_MCP_OAUTH_DISCOVERY === '1') {
                        const metadata = await transport.discoverOAuthMetadata(env.QINIU_LIVE_VERIFY_MCP_CHALLENGE);
                        const issuer = metadata.authorizationServer?.issuer
                            ?? metadata.protectedResource.authorization_servers?.[0]
                            ?? 'unadvertised';
                        addCheck(checks, 'ok', `MCP OAuth metadata probe succeeded: ${issuer}`);
                    }

                    if (env.QINIU_LIVE_VERIFY_MCP_TERMINATE === '1') {
                        terminated = await transport.terminateSession();
                        addCheck(
                            checks,
                            terminated ? 'ok' : 'warn',
                            terminated
                                ? 'MCP DELETE terminate probe succeeded.'
                                : 'MCP DELETE terminate probe is not supported by the server.',
                        );
                    }
                } finally {
                    if (!terminated) {
                        await transport.disconnect?.();
                    }
                }
            }
        } else {
            addCheck(
                checks,
                'warn',
                'QINIU_LIVE_VERIFY_MCP_URL not set. MCP live probe was skipped.',
            );
        }
        if (!env.QINIU_ACCESS_KEY || !env.QINIU_SECRET_KEY) {
            addCheck(
                checks,
                'warn',
                'QINIU_ACCESS_KEY / QINIU_SECRET_KEY not set. Kodo and some sandbox-adjacent live checks remain unavailable.',
            );
        }
    }

    const status = summarize(checks);
    return {
        status,
        exitCode: status === 'ok' ? 0 : status === 'warn' ? 2 : 1,
        checks,
    };
}

export async function verifyLiveGate(options: LiveVerifyGateOptions): Promise<LiveVerifyGateResult> {
    const checks: LiveVerifyCheck[] = [];
    const laneResults: LiveVerifyGateLaneResult[] = [];
    const env = options.env ?? process.env;
    const lanes = options.lanes.length > 0 ? options.lanes : [...DEFAULT_LIVE_VERIFY_GATE_LANES];
    const strict = options.strict ?? env.QINIU_REQUIRE_LIVE_VERIFY === '1';
    const generatedAt = new Date().toISOString();

    addCheck(
        checks,
        'ok',
        `Running live verification gate for lanes: ${lanes.join(', ')}${strict ? ' (strict)' : ''}`,
    );

    for (const lane of lanes) {
        const result = await verifyLiveLane({
            lane,
            env,
            createQiniuClient: options.createQiniuClient,
            createNodeClient: options.createNodeClient,
            createMcpTransport: options.createMcpTransport,
        });
        laneResults.push({ lane, result });

        for (const check of result.checks) {
            addCheck(checks, check.level, `[${lane}] ${check.message}`);
        }
    }

    if (strict) {
        const blocking = laneResults.filter((entry) => entry.result.exitCode !== 0);
        if (blocking.length > 0) {
            addCheck(
                checks,
                'fail',
                `Strict live verification gate failed for lanes: ${blocking.map((entry) => entry.lane).join(', ')}`,
            );
            return {
                status: 'fail',
                exitCode: 1,
                checks,
                generatedAt,
                lanes: laneResults,
            };
        }
    }

    const status = summarize(checks);
    return {
        status,
        exitCode: status === 'ok' ? 0 : status === 'warn' ? 2 : 1,
        checks,
        generatedAt,
        lanes: laneResults,
    };
}

export function renderLiveVerifyGateMarkdown(result: LiveVerifyGateResult): string {
    const lines: string[] = [
        '# Live Verification Gate',
        '',
        `Generated at: ${result.generatedAt}`,
        '',
        `Overall status: ${result.status.toUpperCase()} (exit ${result.exitCode})`,
        '',
        '## Lanes',
        '',
    ];

    for (const entry of result.lanes) {
        lines.push(`### ${entry.lane}`);
        lines.push('');
        lines.push(`- Status: ${entry.result.status.toUpperCase()} (exit ${entry.result.exitCode})`);
        lines.push(`- Checks: ${entry.result.checks.length}`);
        lines.push('');
        for (const check of entry.result.checks) {
            lines.push(`- [${check.level}] ${check.message}`);
        }
        lines.push('');
    }

    lines.push('## Aggregated Checks');
    lines.push('');
    for (const check of result.checks) {
        lines.push(`- [${check.level}] ${check.message}`);
    }
    lines.push('');

    return lines.join('\n');
}
