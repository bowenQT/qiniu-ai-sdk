/**
 * ChildTransport — A scoped HTTP transport that inherits parent client
 * infrastructure (adapter, middleware, logger, timeout) while using
 * a different baseUrl and auth headers.
 *
 * Created via QiniuAI.createChildTransport() for modules that talk
 * to endpoints other than the main API (e.g. Sandbox service).
 *
 * Note on raw methods (postRaw/getRaw):
 * These bypass the JSON middleware pipeline and retry logic, which is
 * intentional for streaming/binary responses. They still inherit:
 * - Auth headers from parent context
 * - Timeout / AbortController semantics
 * - Request-ID injection for traceability
 * - Unified APIError for non-OK responses
 */
import { request, RequestContext, RequestOptions, APIError } from './request';
import { Logger, noopLogger } from './logger';
import type { FetchAdapter, Middleware } from './middleware';

/**
 * Generate a unique request ID for tracking (mirrors request.ts logic).
 */
function generateRawRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class ChildTransport {
    private baseUrl: string;
    private context: RequestContext;

    constructor(
        baseUrl: string,
        parentContext: RequestContext,
        extraHeaders?: Record<string, string>
    ) {
        // Normalize: remove trailing slashes
        this.baseUrl = baseUrl.replace(/\/+$/, '');

        // Create a child context that inherits adapter/middleware/logger/timeout
        // but overrides baseHeaders with the extra headers
        this.context = {
            logger: parentContext.logger,
            adapter: parentContext.adapter,
            middleware: parentContext.middleware,
            defaultTimeout: parentContext.defaultTimeout,
            baseHeaders: {
                ...extraHeaders,
            },
        };
    }

    /**
     * JSON POST — parses response as JSON and returns typed data.
     */
    async post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        return request<T>(url, 'POST', body, this.context, options);
    }

    /**
     * JSON GET — parses response as JSON and returns typed data.
     */
    async get<T>(path: string, params?: Record<string, string>, options?: RequestOptions): Promise<T> {
        const url = new URL(`${this.baseUrl}${path}`);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                url.searchParams.append(key, value);
            });
        }
        return request<T>(url.toString(), 'GET', undefined, this.context, options);
    }

    /**
     * DELETE — returns void.
     */
    async delete(path: string, options?: RequestOptions): Promise<void> {
        const url = `${this.baseUrl}${path}`;
        await request<unknown>(url, 'DELETE', undefined, this.context, options);
    }

    /**
     * Raw POST — returns raw Response for streaming/binary data.
     * Bypasses JSON middleware and retry, but preserves auth, timeout,
     * request-id, and APIError semantics.
     */
    async postRaw(path: string, body: unknown, options?: RequestOptions): Promise<Response> {
        const url = `${this.baseUrl}${path}`;
        const timeout = options?.timeout ?? this.context.defaultTimeout;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const requestId = generateRawRequestId();

        const headers: Record<string, string> = {
            'X-Request-ID': requestId,
            ...this.context.baseHeaders,
            ...options?.headers,
        };

        // Only set Content-Type for non-FormData bodies
        // FormData needs fetch to auto-set Content-Type with boundary
        const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
        if (!isFormData) {
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        }

        try {
            // Support raw binary body (Uint8Array/ArrayBuffer), FormData, or JSON objects
            let serializedBody: string | Uint8Array | ArrayBuffer | FormData | undefined;
            if (isFormData || body instanceof Uint8Array || body instanceof ArrayBuffer) {
                serializedBody = body as FormData | Uint8Array | ArrayBuffer;
            } else if (body !== undefined) {
                serializedBody = JSON.stringify(body);
            }

            const response = await this.context.adapter.fetch(url, {
                method: 'POST',
                headers,
                body: serializedBody,
                signal: controller.signal,
            });

            if (!response.ok) {
                let errorMessage = `Request failed with status ${response.status}`;
                let errorCode: string | undefined;
                try {
                    const errorBody = await response.json() as { error?: { message?: string; code?: string }; message?: string; code?: string };
                    errorMessage = errorBody.error?.message || errorBody.message || errorMessage;
                    errorCode = errorBody.error?.code || errorBody.code;
                } catch { /* ignore parse failure */ }
                throw new APIError(errorMessage, response.status, errorCode, requestId);
            }

            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Raw GET — returns raw Response for binary downloads or health probes.
     * Bypasses JSON middleware and retry, but preserves auth, timeout,
     * request-id, and APIError semantics.
     */
    async getRaw(path: string, options?: RequestOptions): Promise<Response> {
        const url = `${this.baseUrl}${path}`;
        const timeout = options?.timeout ?? this.context.defaultTimeout;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const requestId = generateRawRequestId();

        const headers: Record<string, string> = {
            'X-Request-ID': requestId,
            ...this.context.baseHeaders,
            ...options?.headers,
        };

        try {
            const response = await this.context.adapter.fetch(url, {
                method: 'GET',
                headers,
                signal: controller.signal,
            });

            if (!response.ok) {
                let errorMessage = `Request failed with status ${response.status}`;
                let errorCode: string | undefined;
                try {
                    const errorBody = await response.json() as { error?: { message?: string; code?: string }; message?: string; code?: string };
                    errorMessage = errorBody.error?.message || errorBody.message || errorMessage;
                    errorCode = errorBody.error?.code || errorBody.code;
                } catch { /* ignore parse failure */ }
                throw new APIError(errorMessage, response.status, errorCode, requestId);
            }

            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Get the logger from the parent context.
     */
    getLogger(): Logger {
        return this.context.logger;
    }

    /**
     * Get base URL (for modules that need to construct URLs).
     */
    getBaseUrl(): string {
        return this.baseUrl;
    }
}
