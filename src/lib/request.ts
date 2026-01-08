import { Logger, noopLogger } from './logger';

interface RequestOptions extends RequestInit {
    timeout?: number;
}

export interface RequestContext {
    logger: Logger;
    requestId?: string;
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

export async function request<T>(
    url: string,
    options: RequestOptions = {},
    context: RequestContext = { logger: noopLogger }
): Promise<T> {
    const { timeout = 60000, ...fetchOptions } = options;
    const { logger } = context;
    const requestId = context.requestId || generateRequestId();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Log request
    logger.debug('HTTP Request', {
        requestId,
        method: fetchOptions.method || 'GET',
        url,
        timeout,
    });

    const startTime = Date.now();

    try {
        const response = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'X-Request-ID': requestId,
                ...fetchOptions.headers,
            },
        });

        const duration = Date.now() - startTime;

        // Try to get server-side request ID from response headers
        const serverRequestId = response.headers.get('X-Request-ID') ||
            response.headers.get('X-Qiniu-Request-Id') ||
            requestId;

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
            return {} as T;
        }

        const data = await response.json() as T;

        logger.debug('HTTP Response', {
            requestId: serverRequestId,
            status: response.status,
            duration,
        });

        return data;
    } catch (error: unknown) {
        const duration = Date.now() - startTime;

        if (error instanceof APIError) {
            throw error;
        }

        if (error instanceof Error && error.name === 'AbortError') {
            logger.error('HTTP Timeout', {
                requestId,
                timeout,
                duration,
            });
            throw new APIError('Request timed out', 408, 'TIMEOUT', requestId);
        }

        logger.error('HTTP Error (Network)', {
            requestId,
            error: error instanceof Error ? error.message : String(error),
            duration,
        });

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}
