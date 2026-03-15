import { IQiniuClient } from '../../lib/types';
import { APIError } from '../../lib/request';

/**
 * API key creation request
 */
export interface CreateKeysRequest {
    /**
     * Number of keys to create (1-100)
     */
    count: number;
    /**
     * Explicit key names. Preferred by the current API contract.
     * When provided, must match `count`.
     */
    names?: string[];
    /**
     * Prefix for key names (e.g., 'dev-', 'prod-')
     * Legacy fallback for older API variants.
     */
    name_prefix?: string;
    /**
     * Expiration date (ISO 8601 format)
     */
    expires_at?: string;
    /**
     * Optional description or metadata
     */
    description?: string;
}

/**
 * API key information
 */
export interface ApiKey {
    /**
     * The API key value (sk-...)
     */
    key: string;
    /**
     * Key name/label
     */
    name: string;
    /**
     * Creation timestamp (ISO 8601)
     */
    created_at: string;
    /**
     * Current API variants may return camelCase timestamps.
     */
    createdAt?: string;
    /**
     * Expiration timestamp (ISO 8601), if set
     */
    expires_at?: string;
    expiresAt?: string;
    /**
     * Key status
     */
    status?: 'active' | 'revoked' | 'expired';
    /**
     * Current API variants may expose enabled directly.
     */
    enabled?: boolean;
    /**
     * Last used timestamp (ISO 8601)
     */
    last_used_at?: string;
    lastUsedAt?: string;
    /**
     * Description or metadata
     */
    description?: string;
}

/**
 * Raw API response formats
 */
interface CreateKeysApiResponse {
    status?: boolean;
    data?: ApiKey[] | { keys?: ApiKey[] };
    keys?: ApiKey[];
    result?: ApiKey[];
}

interface ListKeysApiResponse {
    status?: boolean;
    data?: ApiKey[] | { keys?: ApiKey[] };
    keys?: ApiKey[];
    result?: ApiKey[];
}

function normalizeApiKey(key: ApiKey): ApiKey {
    const created_at = key.created_at ?? key.createdAt ?? '';
    const expires_at = key.expires_at ?? key.expiresAt;
    const last_used_at = key.last_used_at ?? key.lastUsedAt;
    const status = key.status
        ?? (key.enabled === true ? 'active' : key.enabled === false ? 'revoked' : undefined);

    return {
        ...key,
        created_at,
        ...(expires_at ? { expires_at } : {}),
        ...(last_used_at ? { last_used_at } : {}),
        ...(status ? { status } : {}),
    };
}

function extractKeys(response: CreateKeysApiResponse | ListKeysApiResponse): ApiKey[] {
    const nestedData = response.data && !Array.isArray(response.data) ? response.data.keys : undefined;
    const keys = response.keys
        || nestedData
        || (Array.isArray(response.data) ? response.data : undefined)
        || response.result
        || [];

    return Array.isArray(keys) ? keys.map(normalizeApiKey) : [];
}

function hasKeyPayload(response: CreateKeysApiResponse | ListKeysApiResponse): boolean {
    return 'keys' in response || 'data' in response || 'result' in response;
}

export class Admin {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Create new API keys.
     *
     * @example
     * ```typescript
     * const keys = await client.admin.createKeys({
     *   count: 5,
     *   names: ['prod-key-1', 'prod-key-2'],
     *   expires_at: '2025-12-31T23:59:59Z',
     * });
     *
     * for (const key of keys) {
     *   console.log(`Created: ${key.name} -> ${key.key}`);
     * }
     * ```
     */
    async createKeys(params: CreateKeysRequest): Promise<ApiKey[]> {
        const logger = this.client.getLogger();

        // Validate input
        if (!params.count || params.count < 1) {
            throw new Error('count must be at least 1');
        }
        if (params.count > 100) {
            throw new Error('count cannot exceed 100');
        }
        if (params.names) {
            if (params.names.length !== params.count) {
                throw new Error('names length must match count');
            }
            if (params.names.some((name) => !name || !name.trim())) {
                throw new Error('names must contain non-empty strings');
            }
        }

        // Validate expiration date if provided
        if (params.expires_at) {
            const expirationDate = new Date(params.expires_at);
            if (isNaN(expirationDate.getTime())) {
                throw new Error('expires_at must be a valid ISO 8601 date');
            }
            if (expirationDate <= new Date()) {
                throw new Error('expires_at must be in the future');
            }
        }

        const requestBody = {
            count: params.count,
            ...(params.names ? { names: params.names } : {}),
            ...(params.name_prefix ? { name_prefix: params.name_prefix } : {}),
            ...(params.expires_at ? { expires_at: params.expires_at } : {}),
            ...(params.description ? { description: params.description } : {}),
        };

        logger.debug('Creating API keys', {
            count: params.count,
            names: params.names,
            name_prefix: params.name_prefix,
        });

        let response: CreateKeysApiResponse;
        try {
            response = await this.client.post<CreateKeysApiResponse>('/apikeys', requestBody);
        } catch (error) {
            if (!(error instanceof APIError) || error.status !== 404) {
                throw error;
            }
            logger.warn('Falling back to legacy admin key creation endpoint', { status: error.status });
            response = await this.client.post<CreateKeysApiResponse>('/admin/keys', requestBody);
        }

        const keys = extractKeys(response);
        if (!keys.length && hasKeyPayload(response) === false) {
            logger.warn('Unexpected createKeys response format', { response });
        }
        return keys;
    }

    /**
     * List all API keys for the account.
     *
     * @example
     * ```typescript
     * const keys = await client.admin.listKeys();
     *
     * for (const key of keys) {
     *   console.log(`${key.name}: ${key.status} (created: ${key.created_at})`);
     * }
     * ```
     */
    async listKeys(): Promise<ApiKey[]> {
        const logger = this.client.getLogger();

        logger.debug('Listing API keys');

        const response = await this.client.get<ListKeysApiResponse>('/admin/keys');

        // Normalize response
        const keys = extractKeys(response);
        if (!keys.length && hasKeyPayload(response) === false) {
            logger.warn('Unexpected listKeys response format', { response });
            return [];
        }

        return keys;
    }

    /**
     * Revoke an API key.
     *
     * @example
     * ```typescript
     * await client.admin.revokeKey('sk-abc123...');
     * console.log('Key revoked successfully');
     * ```
     */
    async revokeKey(key: string): Promise<void> {
        const logger = this.client.getLogger();

        if (!key || !key.trim()) {
            throw new Error('API key is required');
        }

        logger.debug('Revoking API key', { keyPrefix: key.substring(0, 10) + '...' });

        await this.client.post('/admin/keys/revoke', { key });

        logger.info('API key revoked', { keyPrefix: key.substring(0, 10) + '...' });
    }

    /**
     * Get details for a specific API key.
     *
     * @example
     * ```typescript
     * const keyInfo = await client.admin.getKey('sk-abc123...');
     * console.log(`Status: ${keyInfo.status}`);
     * console.log(`Last used: ${keyInfo.last_used_at}`);
     * ```
     */
    async getKey(key: string): Promise<ApiKey | null> {
        const logger = this.client.getLogger();

        if (!key || !key.trim()) {
            throw new Error('API key is required');
        }

        logger.debug('Getting API key details', { keyPrefix: key.substring(0, 10) + '...' });

        try {
            const response = await this.client.get<ApiKey | { data: ApiKey }>(`/admin/keys/${encodeURIComponent(key)}`);

            // Normalize response
            if ('data' in response && response.data) {
                return normalizeApiKey(response.data);
            }
            return normalizeApiKey(response as ApiKey);
        } catch (error) {
            // Only treat 404 as "not found", re-throw other errors
            if (error instanceof APIError && error.status === 404) {
                logger.warn('API key not found', { keyPrefix: key.substring(0, 10) + '...' });
                return null;
            }
            // Re-throw network errors, 5xx errors, and other unexpected errors
            throw error;
        }
    }
}
