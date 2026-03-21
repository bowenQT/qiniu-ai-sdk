import { IQiniuClient } from '../../lib/types';
import { resolveQiniuAuthorizationHeader } from '../../lib/qiniu-auth';

/**
 * Usage query parameters
 */
export interface UsageQuery {
    /**
     * Time granularity: day or hour.
     */
    granularity: 'day' | 'hour';
    /**
     * Start time (RFC3339). AK/SK auth also accepts YYYY-MM-DD.
     */
    start: string;
    /**
     * End time (RFC3339). AK/SK auth also accepts YYYY-MM-DD.
     */
    end: string;
    /**
     * API Key (optional, only required for some auth modes).
     */
    api_key?: string;
    /**
     * Override Authorization header (optional).
     */
    authorization?: string;
    /**
     * AK/SK auth (optional). When provided, SDK signs the request.
     */
    auth?: {
        accessKey: string;
        secretKey: string;
    };
}

export interface UsageValue {
    time: string;
    value: number;
}

export interface UsageCategory {
    name: string;
    values: UsageValue[];
}

export interface UsageItem {
    name: string;
    unit: string;
    total: number;
    categories: UsageCategory[];
}

export interface UsageModelStat {
    id: string;
    name: string;
    items: UsageItem[];
}

/**
 * Usage response
 */
export interface UsageResponse {
    status: boolean;
    data: UsageModelStat[];
    error?: string;
}

/**
 * Raw API response format
 */
interface UsageApiResponse {
    status?: boolean;
    data?: UsageModelStat[];
    error?: string;
}

function buildQueryString(params: Record<string, string>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        search.append(key, value);
    }
    return search.toString();
}

export class Account {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Get usage statistics for a time range.
     *
     * @example
     * ```typescript
     * const usage = await client.account.usage({
     *   granularity: 'day',
     *   start: '2024-01-01T00:00:00+08:00',
     *   end: '2024-01-31T23:59:59+08:00',
     * });
     *
     * for (const model of usage.data) {
     *   console.log(model.name, model.items?.[0]?.total);
     * }
     *
     * // AK/SK auth
     * const adminUsage = await client.account.usage({
     *   granularity: 'day',
     *   start: '2024-01-01T00:00:00+08:00',
     *   end: '2024-01-31T23:59:59+08:00',
     *   auth: {
     *     accessKey: 'your-ak',
     *     secretKey: 'your-sk',
     *   },
     * });
     * ```
     */
    async usage(query: UsageQuery): Promise<UsageResponse> {
        const logger = this.client.getLogger();

        if (!query.granularity || (query.granularity !== 'day' && query.granularity !== 'hour')) {
            throw new Error('granularity must be "day" or "hour"');
        }
        if (!query.start || !query.end) {
            throw new Error('start and end are required');
        }

        const startDate = new Date(query.start);
        const endDate = new Date(query.end);

        if (isNaN(startDate.getTime())) {
            throw new Error(`start "${query.start}" is not a valid date`);
        }
        if (isNaN(endDate.getTime())) {
            throw new Error(`end "${query.end}" is not a valid date`);
        }
        if (startDate > endDate) {
            throw new Error('end must be after start');
        }

        const diffMs = endDate.getTime() - startDate.getTime();
        const diffDays = diffMs / (24 * 60 * 60 * 1000);

        if (query.granularity === 'day' && diffDays > 31) {
            throw new Error('time range cannot exceed 31 days for granularity=day');
        }
        if (query.granularity === 'hour' && diffDays > 7) {
            throw new Error('time range cannot exceed 7 days for granularity=hour');
        }

        const params: Record<string, string> = {
            granularity: query.granularity,
            start: query.start,
            end: query.end,
        };
        if (query.api_key) {
            params.api_key = query.api_key;
        }

        logger.debug('Fetching usage statistics', { ...params });

        const baseUrl = this.client.getBaseUrl();
        const absoluteUrl = baseUrl.replace(/\/v1$/, '') + '/v2/stat/usage';

        let options: Parameters<IQiniuClient['getAbsolute']>[3] | undefined;
        if (query.authorization) {
            options = { headers: { Authorization: query.authorization } };
        } else if (query.auth) {
            const queryString = buildQueryString(params);
            const authorization = await resolveQiniuAuthorizationHeader({
                auth: query.auth,
                method: 'GET',
                absoluteUrl: `${absoluteUrl}?${queryString}`,
                headers: { 'Content-Type': 'application/json' },
            });
            options = authorization ? { headers: { Authorization: authorization } } : undefined;
        }

        const response = await this.client.getAbsolute<UsageApiResponse>(absoluteUrl, params, undefined, options);

        if (response.status === false) {
            return {
                status: false,
                data: [],
                error: response.error || 'Unknown error',
            };
        }

        return {
            status: response.status ?? true,
            data: response.data || [],
        };
    }
}
