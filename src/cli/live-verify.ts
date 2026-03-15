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

export interface LiveVerifyOptions {
    lane: WorktreeLane;
    env?: NodeJS.ProcessEnv;
    createQiniuClient?: (apiKey: string) => Pick<QiniuAI, 'chat' | 'file' | 'response'>;
    createNodeClient?: (apiKey: string) => ReturnType<typeof createNodeQiniuAI>;
    createMcpTransport?: (config: MCPHttpServerConfig) => LiveVerifyMcpTransport;
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
    'cloud-surface': ['chat', 'file', 'ResponseAPI'],
    runtime: ['generateText', 'createAgent', 'memory', 'guardrails'],
    'node-integrations': ['NodeMCPHost', 'sandbox', 'skills', 'auditLogger'],
    'dx-validation': ['chat', 'file', 'generateText'],
};

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
