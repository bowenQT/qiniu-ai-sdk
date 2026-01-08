import { request, RequestContext } from './lib/request';
import { IQiniuClient } from './lib/types';
import { Logger, noopLogger, consoleLogger, LogLevel, createFilteredLogger } from './lib/logger';
import { Chat } from './modules/chat';
import { Image } from './modules/image';
import { Video } from './modules/video';
import { Tools } from './modules/tools';

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
}

export class QiniuAI implements IQiniuClient {
    public chat: Chat;
    public image: Image;
    public video: Video;
    public sys: Tools;

    private apiKey: string;
    private baseUrl: string;
    private timeout: number;
    private logger: Logger;

    constructor(options: QiniuAIOptions) {
        // Enhanced validation
        if (!options.apiKey || typeof options.apiKey !== 'string' || !options.apiKey.trim()) {
            throw new Error('API Key is required and must be a non-empty string');
        }

        this.apiKey = options.apiKey.trim();

        // Normalize baseUrl: remove trailing slashes
        let baseUrl = options.baseUrl || 'https://api.qnaigc.com/v1';
        this.baseUrl = baseUrl.replace(/\/+$/, '');

        this.timeout = options.timeout || 60000;
        if (this.timeout <= 0) {
            throw new Error('Timeout must be a positive number');
        }

        // Setup logger with level filtering
        const baseLogger = options.logger || noopLogger;
        const logLevel = options.logLevel || 'info';
        this.logger = createFilteredLogger(baseLogger, logLevel);

        this.logger.info('QiniuAI client initialized', {
            baseUrl: this.baseUrl,
            timeout: this.timeout,
        });

        // Initialize modules
        this.chat = new Chat(this);
        this.image = new Image(this);
        this.video = new Video(this);
        this.sys = new Tools(this);
    }

    /**
     * Get the logger instance (for modules to use)
     */
    getLogger(): Logger {
        return this.logger;
    }

    /**
     * Create a request context with logger
     */
    private createContext(requestId?: string): RequestContext {
        return {
            logger: this.logger,
            requestId,
        };
    }

    /**
     * Generic POST request wrapper
     */
    async post<T>(endpoint: string, body: unknown, requestId?: string): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        return request<T>(
            url,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(body),
                timeout: this.timeout,
            },
            this.createContext(requestId)
        );
    }

    /**
     * Generic GET request wrapper
     */
    async get<T>(endpoint: string, params?: Record<string, string>, requestId?: string): Promise<T> {
        const url = new URL(`${this.baseUrl}${endpoint}`);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                url.searchParams.append(key, value);
            });
        }

        return request<T>(
            url.toString(),
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                timeout: this.timeout,
            },
            this.createContext(requestId)
        );
    }
}

// Re-export logger utilities for users
export { consoleLogger, noopLogger, createFilteredLogger };
export type { Logger, LogLevel };
