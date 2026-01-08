import { IQiniuClient } from '../../lib/types';

export interface WebSearchRequest {
    query: string;
    max_results?: number;
    search_type?: 'web' | 'news';
    time_filter?: 'day' | 'week' | 'month' | 'year';
    site_filter?: string[];
}

export interface WebSearchResult {
    title: string;
    link: string;
    snippet: string;
    source?: string;
}

// API might return a wrapper object; we handle both cases
export interface WebSearchResponse {
    results?: WebSearchResult[];
    // Direct array is also possible
    [index: number]: WebSearchResult;
}

export class Tools {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Perform a web search
     * @returns Array of search results
     */
    async search(params: WebSearchRequest): Promise<WebSearchResult[]> {
        if (!params.query || !params.query.trim()) {
            throw new Error('Search query is required and must be a non-empty string');
        }

        const logger = this.client.getLogger();

        // Call API and handle potential response formats
        const response = await this.client.post<WebSearchResult[] | { results: WebSearchResult[] }>('/search/web', params);

        // Normalize response: handle both array and wrapper formats
        if (Array.isArray(response)) {
            return response;
        }
        if (response && 'results' in response && Array.isArray(response.results)) {
            return response.results;
        }

        // If neither, return empty array with warning
        logger.warn('Unexpected search response format', { response });
        return [];
    }
}
