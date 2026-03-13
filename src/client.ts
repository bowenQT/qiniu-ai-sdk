import { QiniuAI as BaseQiniuAI } from './qiniu/client';
import type { QiniuAIOptions as BaseQiniuAIOptions } from './qiniu/client';
import { Sandbox } from './modules/sandbox';
import type { SandboxConfig } from './modules/sandbox';

export interface QiniuAIOptions extends BaseQiniuAIOptions {
    /**
     * @deprecated Root-entry sandbox access is a compatibility path.
     * Use `createNodeQiniuAI()` from `@bowenqt/qiniu-ai-sdk/node` instead.
     */
    sandbox?: SandboxConfig;
}

/**
 * Root-entry compatibility client.
 * Prefer importing `QiniuAI` from `@bowenqt/qiniu-ai-sdk/qiniu` for browser-safe usage.
 */
export class QiniuAI extends BaseQiniuAI {
    /**
     * @deprecated Root-entry sandbox access is a compatibility path.
     * Use `createNodeQiniuAI()` from `@bowenqt/qiniu-ai-sdk/node` instead.
     */
    public sandbox: Sandbox;

    constructor(options: QiniuAIOptions) {
        const { sandbox, ...clientOptions } = options;
        super(clientOptions);
        this.sandbox = new Sandbox(this, sandbox);
    }
}

export {
    consoleLogger,
    noopLogger,
    createFilteredLogger,
    defaultFetchAdapter,
    composeMiddleware,
    retryMiddleware,
    headersMiddleware,
    timingMiddleware,
} from './qiniu/client';

export type {
    Logger,
    LogLevel,
    FetchAdapter,
    Middleware,
    MiddlewareRequest,
    MiddlewareResponse,
    RequestOptions,
} from './qiniu/client';
