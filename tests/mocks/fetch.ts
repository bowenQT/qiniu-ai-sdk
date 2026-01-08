/**
 * Mock fetch adapter for testing
 */
import type { FetchAdapter } from '../../src/lib/middleware';

export interface MockResponse {
    status: number;
    statusText?: string;
    body?: unknown;
    headers?: Record<string, string>;
}

export interface MockFetchCall {
    url: string;
    init?: RequestInit;
    timestamp: number;
}

/**
 * Creates a mock fetch adapter that records all calls and returns predefined responses.
 */
export function createMockFetch(responses: MockResponse[]): {
    adapter: FetchAdapter;
    calls: MockFetchCall[];
    reset: () => void;
} {
    const calls: MockFetchCall[] = [];
    let responseIndex = 0;

    const adapter: FetchAdapter = {
        fetch: async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
            const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

            calls.push({
                url: urlString,
                init,
                timestamp: Date.now(),
            });

            const mockResponse = responses[responseIndex] || responses[responses.length - 1];
            responseIndex++;

            const responseBody = mockResponse.body !== undefined
                ? JSON.stringify(mockResponse.body)
                : '';

            return new Response(responseBody, {
                status: mockResponse.status,
                statusText: mockResponse.statusText || 'OK',
                headers: new Headers({
                    'Content-Type': 'application/json',
                    ...mockResponse.headers,
                }),
            });
        },
    };

    return {
        adapter,
        calls,
        reset: () => {
            calls.length = 0;
            responseIndex = 0;
        },
    };
}

/**
 * Creates a mock fetch that always returns the same response
 */
export function createStaticMockFetch(response: MockResponse): {
    adapter: FetchAdapter;
    calls: MockFetchCall[];
} {
    return createMockFetch([response]);
}

/**
 * Creates a mock fetch that fails with an error
 */
export function createFailingMockFetch(error: Error): FetchAdapter {
    return {
        fetch: async () => {
            throw error;
        },
    };
}

/**
 * Creates a mock SSE stream response
 */
export function createSSEResponse(chunks: unknown[], done = true): Response {
    const encoder = new TextEncoder();
    const lines = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`);
    if (done) {
        lines.push('data: [DONE]\n\n');
    }

    const stream = new ReadableStream({
        start(controller) {
            for (const line of lines) {
                controller.enqueue(encoder.encode(line));
            }
            controller.close();
        },
    });

    return new Response(stream, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
        },
    });
}
