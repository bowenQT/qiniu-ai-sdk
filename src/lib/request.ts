interface RequestOptions extends RequestInit {
    timeout?: number;
}

export class APIError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.code = code;
    }
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const { timeout = 60000, ...fetchOptions } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...fetchOptions,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...fetchOptions.headers,
            },
        });

        if (!response.ok) {
            let errorMessage = `Request failed with status ${response.status}`;
            let errorCode: string | undefined;
            try {
                const errorBody = await response.json() as {
                    error?: { message?: string; code?: string };
                    message?: string;
                    code?: string;
                };
                // Support both OpenAI format and potential Qiniu format
                errorMessage = errorBody.error?.message || errorBody.message || errorMessage;
                errorCode = errorBody.error?.code || errorBody.code;
            } catch {
                // ignore json parse error
            }
            throw new APIError(errorMessage, response.status, errorCode);
        }

        // Handle 204 No Content
        if (response.status === 204) {
            return {} as T;
        }

        return await response.json() as T;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            throw new APIError('Request timed out', 408);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}
