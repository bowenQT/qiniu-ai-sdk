import { request, RequestContext, RequestOptions } from './lib/request';
import { IQiniuClient } from './lib/types';
import { Logger, noopLogger, consoleLogger, LogLevel, createFilteredLogger } from './lib/logger';
import {
    FetchAdapter,
    defaultFetchAdapter,
    Middleware,
    composeMiddleware,
    retryMiddleware,
    headersMiddleware,
    timingMiddleware,
} from './lib/middleware';
import { Chat } from './modules/chat/index';
import { Image } from './modules/image/index';
import { Video } from './modules/video/index';
import { Tools } from './modules/tools/index';
import { Ocr } from './modules/ocr/index';
import { Asr } from './modules/asr/index';
import { Tts } from './modules/tts/index';
import { Account } from './modules/account/index';
import { Admin } from './modules/admin/index';
import { Censor } from './modules/censor/index';

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

    private apiKey: string;
    private baseUrl: string;
    private timeout: number;
    private logger: Logger;
    private requestContext: RequestContext;

    constructor(options: QiniuAIOptions) {
        // Enhanced validation
        if (!options.apiKey || typeof options.apiKey !== 'string' || !options.apiKey.trim()) {
            throw new Error('API Key is required and must be a non-empty string');
        }

        this.apiKey = options.apiKey.trim();

        // Normalize baseUrl: remove trailing slashes
        let baseUrl = options.baseUrl || 'https://api.qnaigc.com/v1';
        this.baseUrl = baseUrl.replace(/\/+$/, '');

        this.timeout = options.timeout ?? 60000;
        if (this.timeout <= 0) {
            throw new Error('Timeout must be a positive number');
        }

        // Setup logger with level filtering
        const baseLogger = options.logger || noopLogger;
        const logLevel = options.logLevel || 'info';
        this.logger = createFilteredLogger(baseLogger, logLevel);

        // Setup request context
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

        // Initialize modules
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
    }

    /**
     * Get the logger instance (for modules to use)
     */
    getLogger(): Logger {
        return this.logger;
    }

    /**
     * Generic POST request wrapper with optional per-request options
     */
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

    /**
     * Generic GET request wrapper with optional per-request options
     */
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

    /**
     * POST request that returns raw Response for streaming.
     * Used by chat.createStream() for SSE parsing.
     *
     * Note: This method supports AbortSignal for cancellation via options.signal.
     * Headers are merged from baseHeaders (including Authorization) and per-request options.
     */
    async postStream(endpoint: string, body: unknown, requestId?: string, options?: RequestOptions & { signal?: AbortSignal }): Promise<Response> {
        const url = `${this.baseUrl}${endpoint}`;
        const timeout = options?.timeout ?? this.timeout;

        // Generate request ID if not provided
        const reqId = requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Create abort controller that combines timeout and external signal
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // If external signal provided, abort when it aborts
        if (options?.signal) {
            if (options.signal.aborted) {
                controller.abort();
            } else {
                options.signal.addEventListener('abort', () => controller.abort(), { once: true });
            }
        }

        // Merge headers: baseHeaders (contains Authorization) + Content-Type + X-Request-ID + per-request headers
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
        }
    }

    /**
     * Get the base URL (for modules that need it)
     */
    getBaseUrl(): string {
        return this.baseUrl;
    }
}

// Re-export logger utilities
export { consoleLogger, noopLogger, createFilteredLogger };
export type { Logger, LogLevel };

// Re-export middleware utilities
export {
    defaultFetchAdapter,
    composeMiddleware,
    retryMiddleware,
    headersMiddleware,
    timingMiddleware
};
export type { FetchAdapter, Middleware, MiddlewareRequest, MiddlewareResponse } from './lib/middleware';
export type { RequestOptions } from './lib/request';
