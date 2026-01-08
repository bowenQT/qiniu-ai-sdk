import { IQiniuClient } from '../../lib/types';

/**
 * Usage query parameters
 */
export interface UsageQuery {
    /**
     * Start date (YYYY-MM-DD format)
     */
    start_date: string;
    /**
     * End date (YYYY-MM-DD format)
     */
    end_date: string;
    /**
     * Filter by specific model (optional)
     */
    model?: string;
}

/**
 * Usage breakdown by model
 */
export interface UsageByModel {
    /**
     * Model identifier
     */
    model: string;
    /**
     * Total tokens used
     */
    total_tokens: number;
    /**
     * Prompt/input tokens
     */
    prompt_tokens: number;
    /**
     * Completion/output tokens
     */
    completion_tokens: number;
    /**
     * Cost in CNY
     */
    cost: number;
    /**
     * Number of requests
     */
    requests?: number;
}

/**
 * Usage response
 */
export interface UsageResponse {
    /**
     * Total tokens used across all models
     */
    total_tokens: number;
    /**
     * Total prompt/input tokens
     */
    prompt_tokens: number;
    /**
     * Total completion/output tokens
     */
    completion_tokens: number;
    /**
     * Total cost in CNY
     */
    cost: number;
    /**
     * Breakdown by model (if available)
     */
    breakdown?: UsageByModel[];
    /**
     * Query period start
     */
    start_date?: string;
    /**
     * Query period end
     */
    end_date?: string;
}

/**
 * Raw API response format
 */
interface UsageApiResponse {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
    breakdown?: UsageByModel[];
    data?: {
        total_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
        cost?: number;
        breakdown?: UsageByModel[];
    };
    usage?: {
        total_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
        cost?: number;
        breakdown?: UsageByModel[];
    };
}

export class Account {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Get usage statistics for a date range.
     *
     * @example
     * ```typescript
     * const usage = await client.account.usage({
     *   start_date: '2024-01-01',
     *   end_date: '2024-01-31',
     * });
     *
     * console.log(`Total tokens: ${usage.total_tokens}`);
     * console.log(`Total cost: ¥${usage.cost}`);
     *
     * if (usage.breakdown) {
     *   for (const model of usage.breakdown) {
     *     console.log(`${model.model}: ${model.total_tokens} tokens, ¥${model.cost}`);
     *   }
     * }
     * ```
     */
    async usage(query: UsageQuery): Promise<UsageResponse> {
        const logger = this.client.getLogger();

        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(query.start_date)) {
            throw new Error('start_date must be in YYYY-MM-DD format');
        }
        if (!dateRegex.test(query.end_date)) {
            throw new Error('end_date must be in YYYY-MM-DD format');
        }

        // Validate date values are actually valid dates (e.g., reject 2024-13-40)
        const startDate = new Date(query.start_date);
        const endDate = new Date(query.end_date);

        if (isNaN(startDate.getTime())) {
            throw new Error(`start_date "${query.start_date}" is not a valid date`);
        }
        if (isNaN(endDate.getTime())) {
            throw new Error(`end_date "${query.end_date}" is not a valid date`);
        }

        // Validate date range
        if (startDate > endDate) {
            throw new Error('start_date must be before or equal to end_date');
        }

        const params: Record<string, string> = {
            start_date: query.start_date,
            end_date: query.end_date,
        };
        if (query.model) {
            params.model = query.model;
        }

        logger.debug('Fetching usage statistics', { ...params });

        const response = await this.client.get<UsageApiResponse>('/usage', params);

        // Normalize response
        return this.normalizeResponse(response, query, logger);
    }

    /**
     * Normalize various API response formats to a consistent UsageResponse
     */
    private normalizeResponse(
        response: UsageApiResponse,
        query: UsageQuery,
        logger: ReturnType<IQiniuClient['getLogger']>
    ): UsageResponse {
        const data = response.data || response.usage || response;

        return {
            total_tokens: data.total_tokens ?? 0,
            prompt_tokens: data.prompt_tokens ?? 0,
            completion_tokens: data.completion_tokens ?? 0,
            cost: data.cost ?? 0,
            breakdown: data.breakdown,
            start_date: query.start_date,
            end_date: query.end_date,
        };
    }
}
