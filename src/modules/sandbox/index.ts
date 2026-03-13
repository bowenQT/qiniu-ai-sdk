/**
 * Sandbox Module — Manage secure isolated sandbox environments.
 *
 * Usage:
 *   const ai = createNodeQiniuAI({ apiKey: 'sk-xxx' });
 *   const sandbox = await ai.sandbox.createAndWait({ templateId: 'base' });
 *   const result = await sandbox.commands.run('echo hello');
 */
import type { IQiniuClient } from '../../lib/types';
import type { ChildTransport } from '../../lib/child-transport';
import {
    SandboxConfig,
    CreateSandboxParams,
    ListSandboxParams,
    SandboxInfo,
    ListedSandbox,
    RawSandboxInfo,
    RawListedSandbox,
    normalizeSandboxInfo,
    normalizeListedSandbox,
} from './types';
import { SandboxInstance } from './sandbox';
import { Templates, TemplateCreateResponse } from './templates';

const DEFAULT_ENDPOINT = 'https://cn-yangzhou-1-sandbox.qiniuapi.com';
const ENVD_PORT = 49983;

/**
 * Sandbox client — creates, connects, and lists sandbox instances.
 * Available on clients created via `createNodeQiniuAI()` and the deprecated root-entry compatibility client.
 */
export class Sandbox {
    private transport: ChildTransport;
    private client: IQiniuClient;
    private endpoint: string;
    /** Resolved API key (sandbox override or parent client key) */
    private apiKey: string;
    /** Template management */
    readonly templates: Templates;

    constructor(client: IQiniuClient, config?: SandboxConfig) {
        this.client = client;
        this.endpoint = config?.endpoint?.replace(/\/+$/, '') ?? DEFAULT_ENDPOINT;

        this.apiKey = config?.apiKey ?? client.getApiKey();

        this.transport = client.createChildTransport(this.endpoint, {
            'X-API-Key': this.apiKey,
        });

        this.templates = new Templates(this.transport, this.transport.getLogger());
    }

    /**
     * Create a new sandbox.
     * Note: The sandbox may not be immediately ready.
     * Use createAndWait() for most use cases.
     */
    async create(params: CreateSandboxParams): Promise<SandboxInstance> {
        const body = {
            templateID: params.templateId,
            timeout: params.timeoutMs ? Math.ceil(params.timeoutMs / 1000) : undefined,
            autoPause: params.autoPause,
            allowInternetAccess: params.allowInternetAccess,
            secure: params.secure,
            envVars: params.envVars,
            metadata: params.metadata,
        };

        const raw = await this.transport.post<RawSandboxInfo>('/sandboxes', body);
        const info = normalizeSandboxInfo(raw);
        return this.createInstance(info);
    }

    /**
     * Create a new sandbox and wait until it is ready.
     * This is the recommended way to create sandboxes.
     */
    async createAndWait(
        params: CreateSandboxParams,
        opts?: { timeoutMs?: number; intervalMs?: number }
    ): Promise<SandboxInstance> {
        const instance = await this.create(params);
        await instance.waitUntilReady({
            timeoutMs: opts?.timeoutMs ?? 30_000,
            intervalMs: opts?.intervalMs ?? 500,
        });
        return instance;
    }

    /**
     * Connect to an existing sandbox by ID.
     * If the sandbox is paused, it will be automatically resumed.
     */
    async connect(sandboxId: string, opts?: { timeoutMs?: number }): Promise<SandboxInstance> {
        const body = {
            timeout: opts?.timeoutMs ? Math.ceil(opts.timeoutMs / 1000) : undefined,
        };

        const raw = await this.transport.post<RawSandboxInfo>(`/sandboxes/${sandboxId}/refreshes`, body);
        const info = normalizeSandboxInfo(raw);
        return this.createInstance(info);
    }

    /**
     * List all sandboxes.
     */
    async list(params?: ListSandboxParams): Promise<ListedSandbox[]> {
        const queryParams: Record<string, string> = {};
        if (params?.state) {
            queryParams.state = params.state;
        }

        const raw = await this.transport.get<RawListedSandbox[]>('/sandboxes', queryParams);
        return (raw || []).map(normalizeListedSandbox);
    }

    /**
     * Create a SandboxInstance with envd transport.
     * envd URL format: https://{port}-{sandboxId}.{domain} (Go SDK convention)
     * envd auth: Authorization: Basic base64(user:) + X-Access-Token: envdAccessToken
     */
    private createInstance(info: SandboxInfo): SandboxInstance {
        // URL format matches Go SDK: {port}-{sandboxID}.{domain}
        const envdBaseUrl = info.domain
            ? `https://${ENVD_PORT}-${info.sandboxId}.${info.domain}`
            : `https://${ENVD_PORT}-${info.sandboxId}.sandbox.qiniuapi.com`;

        // Auth: envdAccessToken from API response, fallback to sandbox apiKey
        const accessToken = info.envdAccessToken || this.apiKey;
        // Basic auth header: base64(user:) for OS user identity (Go SDK convention)
        const basicAuth = 'Basic ' + Buffer.from('user:').toString('base64');

        const envdTransport = this.client.createChildTransport(envdBaseUrl, {
            'Authorization': basicAuth,
            'X-Access-Token': accessToken,
        });

        return new SandboxInstance(
            info,
            this.transport,
            envdTransport,
            this.transport.getLogger()
        );
    }
}

// Re-export types and classes
export * from './types';
export { SandboxInstance, CommandHandle, SandboxPty } from './sandbox';
export { Templates, TemplateCreateResponse } from './templates';
