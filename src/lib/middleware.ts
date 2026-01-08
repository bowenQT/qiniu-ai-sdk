/**
 * FetchAdapter interface for custom HTTP implementations.
 * Allows users to replace the default fetch with axios, got, undici, etc.
 */
export interface FetchAdapter {
    fetch(url: string, init: RequestInit): Promise<Response>;
}

/**
 * Default adapter using native fetch
 */
export const defaultFetchAdapter: FetchAdapter = {
    fetch: (url, init) => fetch(url, init),
};

/**
 * Request object passed through middleware chain
 */
export interface MiddlewareRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeout: number;
    endpoint: string;
    requestId: string;
}

/**
 * Response object from middleware chain
 */
export interface MiddlewareResponse {
    status: number;
    headers: Record<string, string>;
    data: unknown;
    requestId: string;
    duration: number;
}

/**
 * Middleware function type.
 * Can modify request before sending, and response after receiving.
 */
export type Middleware = (
    request: MiddlewareRequest,
    next: (request: MiddlewareRequest) => Promise<MiddlewareResponse>
) => Promise<MiddlewareResponse>;

/**
 * Compose multiple middlewares into a single middleware chain
 */
export function composeMiddleware(middlewares: Middleware[]): Middleware {
    return (request, next) => {
        let index = -1;

        const dispatch = (i: number, req: MiddlewareRequest): Promise<MiddlewareResponse> => {
            if (i <= index) {
                return Promise.reject(new Error('next() called multiple times'));
            }
            index = i;

            const middleware = middlewares[i];
            if (!middleware) {
                return next(req);
            }

            return middleware(req, (nextReq) => dispatch(i + 1, nextReq));
        };

        return dispatch(0, request);
    };
}

/**
 * Built-in middleware: Retry on 5xx errors and 429 (rate limit)
 *
 * Note: This middleware checks APIError.status to determine retryability.
 * Only 5xx server errors and 429 rate limit errors are retried.
 * 4xx client errors (except 429) are NOT retried.
 */
export function retryMiddleware(options: { maxRetries?: number; retryDelay?: number } = {}): Middleware {
    const { maxRetries = 3, retryDelay = 1000 } = options;

    // Helper to check if an error should be retried
    const isRetryable = (error: Error): boolean => {
        // Check if it's an APIError with retryable status
        if ('status' in error && typeof (error as any).status === 'number') {
            const status = (error as any).status;
            // Retry on 5xx server errors and 429 rate limit
            return status >= 500 || status === 429;
        }
        // Network errors (no status) are retryable
        return true;
    };

    return async (request, next) => {
        let lastError: Error | undefined;
        let first5xxStatus: number | undefined;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await next(request);

                // Retry on 5xx errors (this branch is kept for completeness,
                // but typically 5xx will throw APIError before reaching here)
                if (response.status >= 500 && attempt < maxRetries) {
                    if (first5xxStatus === undefined) {
                        first5xxStatus = response.status;
                    }
                    await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
                    continue;
                }

                return response;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                // Check if this error is retryable
                if (!isRetryable(lastError)) {
                    // Non-retryable error (4xx except 429), throw immediately
                    throw lastError;
                }

                // Track first 5xx status for error message
                if ('status' in lastError && typeof (lastError as any).status === 'number') {
                    const status = (lastError as any).status;
                    if (status >= 500 && first5xxStatus === undefined) {
                        first5xxStatus = status;
                    }
                }

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
                }
            }
        }

        // Include first 5xx status in error message if available
        if (first5xxStatus !== undefined) {
            throw new Error(`Request failed after ${maxRetries + 1} attempts. First error: HTTP ${first5xxStatus}`);
        }

        throw lastError ?? new Error(`Request failed after ${maxRetries + 1} attempts`);
    };
}

/**
 * Built-in middleware: Add custom headers to all requests
 */
export function headersMiddleware(headers: Record<string, string>): Middleware {
    return async (request, next) => {
        return next({
            ...request,
            headers: {
                ...request.headers,
                ...headers,
            },
        });
    };
}

/**
 * Built-in middleware: Request/response timing
 */
export function timingMiddleware(
    onTiming: (endpoint: string, duration: number, status: number) => void
): Middleware {
    return async (request, next) => {
        const response = await next(request);
        onTiming(request.endpoint, response.duration, response.status);
        return response;
    };
}
