import { Logger, noopLogger } from './logger';
import {
    FetchAdapter,
    defaultFetchAdapter,
    Middleware,
    MiddlewareRequest,
    MiddlewareResponse,
    composeMiddleware
} from './middleware';

/**
 * Per-request options that can override client defaults
 */
export interface RequestOptions {
    timeout?: number;
    headers?: Record<string, string>;
    requestId?: string;
}

export interface RequestContext {
    logger: Logger;
    adapter: FetchAdapter;
    middleware?: Middleware;
    baseHeaders: Record<string, string>;
    defaultTimeout: number;
}

export class APIError extends Error {
    status: number;
    code?: string;
    requestId?: string;

    constructor(message: string, status: number, code?: string, requestId?: string) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.code = code;
        this.requestId = requestId;
    }
}

/**
 * Generate a unique request ID for tracking
 */
function generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Convert Headers object to plain object
 */
function headersToObject(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}

/**
 * Core request function with middleware support
 */
export async function request<T>(
    url: string,
    method: string,
    body: unknown | undefined,
    context: RequestContext,
    options: RequestOptions = {}
): Promise<T> {
    const { logger, adapter, middleware, baseHeaders, defaultTimeout } = context;
    const timeout = options.timeout ?? defaultTimeout;
    const requestId = options.requestId || generateRequestId();

    // Build the middleware request object
    const middlewareRequest: MiddlewareRequest = {
        url,
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
            ...baseHeaders,
            ...options.headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        timeout,
        endpoint: new URL(url).pathname,
        requestId,
    };

    // Log request
    logger.debug('HTTP Request', {
        requestId,
        method,
        url,
        timeout,
    });

    const startTime = Date.now();

    // Core request execution function
    const executeRequest = async (req: MiddlewareRequest): Promise<MiddlewareResponse> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), req.timeout);

        try {
            const response = await adapter.fetch(req.url, {
                method: req.method,
                headers: req.headers,
                body: req.body,
                signal: controller.signal,
            });

            const duration = Date.now() - startTime;
            const serverRequestId = response.headers.get('X-Request-ID') ||
                response.headers.get('X-Qiniu-Request-Id') ||
                req.requestId;

            if (!response.ok) {
                let errorMessage = `Request failed with status ${response.status}`;
                let errorCode: string | undefined;
                try {
                    const errorBody = await response.json() as {
                        error?: { message?: string; code?: string };
                        message?: string;
                        code?: string;
                    };
                    errorMessage = errorBody.error?.message || errorBody.message || errorMessage;
                    errorCode = errorBody.error?.code || errorBody.code;
                } catch {
                    // ignore json parse error
                }

                logger.error('HTTP Error', {
                    requestId: serverRequestId,
                    status: response.status,
                    errorCode,
                    errorMessage,
                    duration,
                });

                throw new APIError(errorMessage, response.status, errorCode, serverRequestId);
            }

            // Handle 204 No Content
            if (response.status === 204) {
                logger.debug('HTTP Response (No Content)', {
                    requestId: serverRequestId,
                    status: 204,
                    duration,
                });
                return {
                    status: 204,
                    headers: headersToObject(response.headers),
                    data: {},
                    requestId: serverRequestId,
                    duration,
                };
            }

            const data = await response.json();

            logger.debug('HTTP Response', {
                requestId: serverRequestId,
                status: response.status,
                duration,
            });

            return {
                status: response.status,
                headers: headersToObject(response.headers),
                data,
                requestId: serverRequestId,
                duration,
            };
        } catch (error: unknown) {
            const duration = Date.now() - startTime;

            if (error instanceof APIError) {
                throw error;
            }

            if (error instanceof Error && error.name === 'AbortError') {
                logger.error('HTTP Timeout', {
                    requestId: req.requestId,
                    timeout: req.timeout,
                    duration,
                });
                throw new APIError('Request timed out', 408, 'TIMEOUT', req.requestId);
            }

            logger.error('HTTP Error (Network)', {
                requestId: req.requestId,
                error: error instanceof Error ? error.message : String(error),
                duration,
            });

            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    };

    // Execute with or without middleware
    let response: MiddlewareResponse;
    if (middleware) {
        response = await middleware(middlewareRequest, executeRequest);
    } else {
        response = await executeRequest(middlewareRequest);
    }

    return response.data as T;
}
