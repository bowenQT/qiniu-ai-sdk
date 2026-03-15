import { request, RequestContext, RequestOptions } from '../lib/request';
import { IQiniuClient } from '../lib/types';
import { ChildTransport } from '../lib/child-transport';
import { Logger, noopLogger, consoleLogger, LogLevel, createFilteredLogger } from '../lib/logger';
import {
    FetchAdapter,
    defaultFetchAdapter,
    Middleware,
    composeMiddleware,
    retryMiddleware,
    headersMiddleware,
    timingMiddleware,
} from '../lib/middleware';
import { Chat } from '../modules/chat/index';
import { Image } from '../modules/image/index';
import { Video } from '../modules/video/index';
import { Tools } from '../modules/tools/index';
import { Ocr } from '../modules/ocr/index';
import { Asr } from '../modules/asr/index';
import { Tts } from '../modules/tts/index';
import { Account } from '../modules/account/index';
import { Admin } from '../modules/admin/index';
import { Censor } from '../modules/censor/index';
import { File as QiniuFile } from '../modules/file/index';
import { Anthropic } from '../modules/anthropic/index';
import { ResponseAPI } from '../modules/response/index';
import { Log } from '../modules/log/index';
import { Batch } from '../modules/batch/index';

export interface QiniuAIOptions {
    apiKey: string; // The Sk-xxxx key
    baseUrl?: string;
    timeout?: number;
    /**
     * Custom logger instance. Use `consoleLogger` for debug output.
     * Default: silent (no logging)
     */
    logger?: Logger;
    /**
     * Log level filter. Only applies if using a logger.
     * Default: 'info'
     */
    logLevel?: LogLevel;
    /**
     * Custom HTTP adapter. Allows replacing fetch with axios, got, etc.
     * Default: native fetch
     */
    adapter?: FetchAdapter;
    /**
     * Middleware functions to process requests/responses.
     * Executed in order, wrapping the core request.
     */
    middleware?: Middleware[];
}

/**
 * Browser-safe Qiniu provider client.
 * Node-only integrations such as Sandbox are exposed from `@bowenqt/qiniu-ai-sdk/node`.
 */
export class QiniuAI implements IQiniuClient {
    public chat: Chat;
    public image: Image;
    public video: Video;
    public sys: Tools;
    public ocr: Ocr;
    public asr: Asr;
    public tts: Tts;
    public account: Account;
    public admin: Admin;
    public censor: Censor;
    public file: QiniuFile;
    public anthropic: Anthropic;
    /** @experimental Response API — invite-only, subject to change. */
    public response: ResponseAPI;
    public log: Log;
    public batch: Batch;

    private apiKey: string;
    private baseUrl: string;
    private timeout: number;
    private logger: Logger;
    private requestContext: RequestContext;

    constructor(options: QiniuAIOptions) {
        if (!options.apiKey || typeof options.apiKey !== 'string' || !options.apiKey.trim()) {
            throw new Error('API Key is required and must be a non-empty string');
        }

        this.apiKey = options.apiKey.trim();

        const baseUrl = options.baseUrl || 'https://api.qnaigc.com/v1';
        this.baseUrl = baseUrl.replace(/\/+$/, '');

        this.timeout = options.timeout ?? 60000;
        if (this.timeout <= 0) {
            throw new Error('Timeout must be a positive number');
        }

        const baseLogger = options.logger || noopLogger;
        const logLevel = options.logLevel || 'info';
        this.logger = createFilteredLogger(baseLogger, logLevel);

        const adapter = options.adapter || defaultFetchAdapter;
        const middleware = options.middleware?.length
            ? composeMiddleware(options.middleware)
            : undefined;

        this.requestContext = {
            logger: this.logger,
            adapter,
            middleware,
            baseHeaders: {
                'Authorization': `Bearer ${this.apiKey}`,
            },
            defaultTimeout: this.timeout,
        };

        this.logger.info('QiniuAI client initialized', {
            baseUrl: this.baseUrl,
            timeout: this.timeout,
            hasMiddleware: !!middleware,
            hasCustomAdapter: !!options.adapter,
        });

        this.chat = new Chat(this);
        this.image = new Image(this);
        this.video = new Video(this);
        this.sys = new Tools(this);
        this.ocr = new Ocr(this);
        this.asr = new Asr(this);
        this.tts = new Tts(this);
        this.account = new Account(this);
        this.admin = new Admin(this);
        this.censor = new Censor(this);
        this.file = new QiniuFile(this);
        this.anthropic = new Anthropic(this);
        this.response = new ResponseAPI(this);
        this.log = new Log(this);
        this.batch = new Batch(this);
    }

    getLogger(): Logger {
        return this.logger;
    }

    async post<T>(endpoint: string, body: unknown, requestId?: string, options?: RequestOptions): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        return request<T>(
            url,
            'POST',
            body,
            this.requestContext,
            { ...options, requestId }
        );
    }

    async get<T>(endpoint: string, params?: Record<string, string>, requestId?: string, options?: RequestOptions): Promise<T> {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                url.searchParams.append(key, value);
            });
        }

        return request<T>(
            url.toString(),
            'GET',
            undefined,
            this.requestContext,
            { ...options, requestId }
        );
    }

    async delete<T>(endpoint: string, requestId?: string, options?: RequestOptions): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        return request<T>(
            url,
            'DELETE',
            undefined,
            this.requestContext,
            { ...options, requestId }
        );
    }

    async postStream(endpoint: string, body: unknown, requestId?: string, options?: RequestOptions & { signal?: AbortSignal }): Promise<Response> {
        const url = `${this.baseUrl}${endpoint}`;
        const timeout = options?.timeout ?? this.timeout;
        const reqId = requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const onAbort = () => controller.abort();
        if (options?.signal) {
            if (options.signal.aborted) {
                controller.abort();
            } else {
                options.signal.addEventListener('abort', onAbort, { once: true });
            }
        }

        const headers: Record<string, string> = {
            ...this.requestContext.baseHeaders,
            'Content-Type': 'application/json',
            'X-Request-ID': reqId,
            ...options?.headers,
        };

        this.logger.debug('HTTP Stream Request', {
            requestId: reqId,
            method: 'POST',
            url,
            timeout,
        });

        try {
            const response = await this.requestContext.adapter.fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            if (!response.ok) {
                let errorMessage = `Request failed with status ${response.status}`;
                try {
                    const errorBody = await response.json() as { error?: { message?: string }; message?: string };
                    errorMessage = errorBody.error?.message || errorBody.message || errorMessage;
                } catch { /* ignore */ }
                throw new Error(errorMessage);
            }

            return response;
        } finally {
            clearTimeout(timeoutId);
            if (options?.signal) {
                options.signal.removeEventListener('abort', onAbort);
            }
        }
    }

    async getAbsolute<T>(absoluteUrl: string, params?: Record<string, string>, requestId?: string, options?: RequestOptions): Promise<T> {
        const url = new URL(absoluteUrl);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                url.searchParams.append(key, value);
            });
        }

        return request<T>(
            url.toString(),
            'GET',
            undefined,
            this.requestContext,
            { ...options, requestId }
        );
    }

    async postAbsolute<T>(absoluteUrl: string, body: unknown, requestId?: string, options?: RequestOptions): Promise<T> {
        return request<T>(
            absoluteUrl,
            'POST',
            body,
            this.requestContext,
            { ...options, requestId }
        );
    }

    getBaseUrl(): string {
        return this.baseUrl;
    }

    getApiKey(): string {
        return this.apiKey;
    }

    createChildTransport(baseUrl: string, extraHeaders?: Record<string, string>): ChildTransport {
        return new ChildTransport(baseUrl, this.requestContext, extraHeaders);
    }
}

export { consoleLogger, noopLogger, createFilteredLogger };
export type { Logger, LogLevel };

export {
    defaultFetchAdapter,
    composeMiddleware,
    retryMiddleware,
    headersMiddleware,
    timingMiddleware,
};
export type { FetchAdapter, Middleware, MiddlewareRequest, MiddlewareResponse } from '../lib/middleware';
export type { RequestOptions } from '../lib/request';
