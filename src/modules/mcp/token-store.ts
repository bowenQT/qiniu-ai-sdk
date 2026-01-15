/**
 * Token storage for OAuth tokens.
 * Provides memory and file-based implementations.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { OAuthTokens } from './oauth';

/**
 * Token store interface.
 */
export interface TokenStore {
    /** Get stored tokens for a server */
    get(serverName: string): Promise<OAuthTokens | undefined>;
    /** Store tokens for a server */
    set(serverName: string, tokens: OAuthTokens): Promise<void>;
    /** Delete tokens for a server */
    delete(serverName: string): Promise<void>;
    /** Check if token is expired */
    isExpired(tokens: OAuthTokens): boolean;
}

/**
 * In-memory token store.
 * Tokens are lost when process exits.
 */
export class MemoryTokenStore implements TokenStore {
    private readonly tokens = new Map<string, OAuthTokens>();

    async get(serverName: string): Promise<OAuthTokens | undefined> {
        return this.tokens.get(serverName);
    }

    async set(serverName: string, tokens: OAuthTokens): Promise<void> {
        this.tokens.set(serverName, tokens);
    }

    async delete(serverName: string): Promise<void> {
        this.tokens.delete(serverName);
    }

    isExpired(tokens: OAuthTokens): boolean {
        if (!tokens.expiresAt) return false;
        // Consider expired 60 seconds before actual expiry
        return Date.now() > tokens.expiresAt - 60000;
    }
}

/** File token store configuration */
export interface FileTokenStoreConfig {
    /** Directory to store token files */
    directory: string;
    /** File permissions (default: 0o600) */
    fileMode?: number;
}

/**
 * File-based token store.
 * Stores tokens as JSON files with restrictive permissions.
 */
export class FileTokenStore implements TokenStore {
    private readonly config: Required<FileTokenStoreConfig>;

    constructor(config: FileTokenStoreConfig) {
        this.config = {
            directory: config.directory,
            fileMode: config.fileMode ?? 0o600,
        };
    }

    private getFilePath(serverName: string): string {
        // Sanitize server name for filename
        const safeName = serverName.replace(/[^a-zA-Z0-9_-]/g, '_');
        return path.join(this.config.directory, `${safeName}_tokens.json`);
    }

    async get(serverName: string): Promise<OAuthTokens | undefined> {
        const filePath = this.getFilePath(serverName);

        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(content) as OAuthTokens;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined;
            }
            throw error;
        }
    }

    async set(serverName: string, tokens: OAuthTokens): Promise<void> {
        const filePath = this.getFilePath(serverName);

        // Ensure directory exists
        await fs.mkdir(this.config.directory, { recursive: true, mode: 0o700 });

        // Write file with restrictive permissions
        await fs.writeFile(filePath, JSON.stringify(tokens, null, 2), {
            mode: this.config.fileMode,
        });
    }

    async delete(serverName: string): Promise<void> {
        const filePath = this.getFilePath(serverName);

        try {
            await fs.unlink(filePath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    isExpired(tokens: OAuthTokens): boolean {
        if (!tokens.expiresAt) return false;
        // Consider expired 60 seconds before actual expiry
        return Date.now() > tokens.expiresAt - 60000;
    }
}

/**
 * Token manager combines store with refresh logic.
 */
export class TokenManager {
    private readonly store: TokenStore;

    constructor(store: TokenStore) {
        this.store = store;
    }

    /**
     * Get valid access token, refreshing if needed.
     */
    async getAccessToken(
        serverName: string,
        refresh?: (refreshToken: string) => Promise<OAuthTokens>
    ): Promise<string | undefined> {
        const tokens = await this.store.get(serverName);
        if (!tokens) return undefined;

        // Token is still valid
        if (!this.store.isExpired(tokens)) {
            return tokens.accessToken;
        }

        // Try to refresh
        if (tokens.refreshToken && refresh) {
            try {
                const newTokens = await refresh(tokens.refreshToken);
                await this.store.set(serverName, newTokens);
                return newTokens.accessToken;
            } catch {
                // Refresh failed, delete tokens
                await this.store.delete(serverName);
                return undefined;
            }
        }

        // Token expired and can't refresh
        await this.store.delete(serverName);
        return undefined;
    }

    /**
     * Store new tokens.
     */
    async setTokens(serverName: string, tokens: OAuthTokens): Promise<void> {
        await this.store.set(serverName, tokens);
    }

    /**
     * Clear tokens.
     */
    async clearTokens(serverName: string): Promise<void> {
        await this.store.delete(serverName);
    }
}
