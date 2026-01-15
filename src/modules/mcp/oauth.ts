/**
 * OAuth 2.0 flows for MCP HTTP transport.
 * Implements PKCE (browser) and Device Code (headless) flows.
 *
 * @see https://modelcontextprotocol.io/docs/concepts/authorization
 */

import * as crypto from 'node:crypto';
import * as http from 'node:http';
import type { MCPOAuthConfig } from './types';

/** OAuth token response */
export interface OAuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    tokenType: string;
    scope?: string;
}

/** OAuth error */
export class OAuthError extends Error {
    constructor(
        message: string,
        public readonly code?: string,
        public readonly description?: string
    ) {
        super(message);
        this.name = 'OAuthError';
    }
}

/**
 * Generate PKCE code verifier (43-128 chars).
 */
export function generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate PKCE code challenge (S256).
 */
export function generateCodeChallenge(verifier: string): string {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash.toString('base64url');
}

/**
 * Generate random state parameter.
 */
export function generateState(): string {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * PKCE Authorization Code Flow.
 * Opens a browser for user authentication and starts a local callback server.
 */
export class PKCEFlow {
    private readonly config: MCPOAuthConfig;
    private server: http.Server | null = null;
    private codeVerifier: string = '';

    constructor(config: MCPOAuthConfig) {
        this.config = config;
    }

    /**
     * Build authorization URL.
     */
    buildAuthorizationUrl(redirectUri: string, state: string): string {
        this.codeVerifier = generateCodeVerifier();
        const codeChallenge = generateCodeChallenge(this.codeVerifier);

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.config.clientId,
            redirect_uri: redirectUri,
            scope: this.config.scopes.join(' '),
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
        });

        const authUrl = this.config.authorizationUrl;
        if (!authUrl) {
            throw new OAuthError('Authorization URL not configured');
        }

        return `${authUrl}?${params.toString()}`;
    }

    /**
     * Start local callback server and wait for authorization code.
     * Returns the authorization code.
     */
    async waitForCallback(port: number = 0): Promise<{ code: string; state: string }> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                const url = new URL(req.url || '', `http://localhost:${port}`);
                const code = url.searchParams.get('code');
                const state = url.searchParams.get('state');
                const error = url.searchParams.get('error');
                const errorDescription = url.searchParams.get('error_description');

                if (error) {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end(`<h1>Authorization Failed</h1><p>${errorDescription || error}</p>`);
                    this.stopServer();
                    reject(new OAuthError(`Authorization failed: ${error}`, error, errorDescription || undefined));
                    return;
                }

                if (!code || !state) {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end('<h1>Missing code or state</h1>');
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<h1>Authorization Successful</h1><p>You can close this window.</p>');
                this.stopServer();
                resolve({ code, state });
            });

            this.server.listen(port, '127.0.0.1', () => {
                const addr = this.server?.address();
                if (typeof addr === 'object' && addr) {
                    // Server started on addr.port
                }
            });

            this.server.on('error', (err) => {
                reject(new OAuthError(`Callback server error: ${err.message}`));
            });
        });
    }

    /**
     * Exchange authorization code for tokens.
     */
    async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
        const tokenUrl = this.config.tokenUrl;
        if (!tokenUrl) {
            throw new OAuthError('Token URL not configured');
        }

        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: this.config.clientId,
            code_verifier: this.codeVerifier,
        });

        if (this.config.clientSecret) {
            body.set('client_secret', this.config.clientSecret);
        }

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new OAuthError(
                `Token exchange failed: ${response.status}`,
                (error as { error?: string }).error,
                (error as { error_description?: string }).error_description
            );
        }

        const data = await response.json() as {
            access_token: string;
            refresh_token?: string;
            expires_in?: number;
            token_type: string;
            scope?: string;
        };

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
            tokenType: data.token_type,
            scope: data.scope,
        };
    }

    /**
     * Get the local callback server port.
     */
    getCallbackPort(): number | null {
        const addr = this.server?.address();
        if (typeof addr === 'object' && addr) {
            return addr.port;
        }
        return null;
    }

    /**
     * Stop the callback server.
     */
    stopServer(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}

/**
 * Device Code Flow for headless environments.
 */
export class DeviceCodeFlow {
    private readonly config: MCPOAuthConfig;

    constructor(config: MCPOAuthConfig) {
        this.config = config;
    }

    /**
     * Request device code from authorization server.
     */
    async requestDeviceCode(): Promise<{
        deviceCode: string;
        userCode: string;
        verificationUri: string;
        verificationUriComplete?: string;
        expiresIn: number;
        interval: number;
    }> {
        const deviceCodeUrl = this.config.deviceCodeUrl;
        if (!deviceCodeUrl) {
            throw new OAuthError('Device code URL not configured');
        }

        const body = new URLSearchParams({
            client_id: this.config.clientId,
            scope: this.config.scopes.join(' '),
        });

        const response = await fetch(deviceCodeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new OAuthError(
                `Device code request failed: ${response.status}`,
                (error as { error?: string }).error,
                (error as { error_description?: string }).error_description
            );
        }

        const data = await response.json() as {
            device_code: string;
            user_code: string;
            verification_uri: string;
            verification_uri_complete?: string;
            expires_in: number;
            interval?: number;
        };

        return {
            deviceCode: data.device_code,
            userCode: data.user_code,
            verificationUri: data.verification_uri,
            verificationUriComplete: data.verification_uri_complete,
            expiresIn: data.expires_in,
            interval: data.interval || 5,
        };
    }

    /**
     * Poll for token after user completes authentication.
     */
    async pollForToken(
        deviceCode: string,
        interval: number,
        expiresIn: number,
        onPending?: () => void
    ): Promise<OAuthTokens> {
        const tokenUrl = this.config.tokenUrl;
        if (!tokenUrl) {
            throw new OAuthError('Token URL not configured');
        }

        const deadline = Date.now() + expiresIn * 1000;
        let currentInterval = interval * 1000;

        while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, currentInterval));

            const body = new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                device_code: deviceCode,
                client_id: this.config.clientId,
            });

            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            });

            const data = await response.json() as {
                access_token?: string;
                refresh_token?: string;
                expires_in?: number;
                token_type?: string;
                scope?: string;
                error?: string;
                error_description?: string;
            };

            if (data.access_token) {
                return {
                    accessToken: data.access_token,
                    refreshToken: data.refresh_token,
                    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
                    tokenType: data.token_type || 'Bearer',
                    scope: data.scope,
                };
            }

            if (data.error === 'authorization_pending') {
                onPending?.();
                continue;
            }

            if (data.error === 'slow_down') {
                currentInterval += 5000; // Add 5 seconds
                continue;
            }

            if (data.error) {
                throw new OAuthError(
                    `Device code polling failed: ${data.error}`,
                    data.error,
                    data.error_description
                );
            }
        }

        throw new OAuthError('Device code expired');
    }
}

/**
 * Refresh an access token using refresh token.
 */
export async function refreshAccessToken(
    config: MCPOAuthConfig,
    refreshToken: string
): Promise<OAuthTokens> {
    const tokenUrl = config.tokenUrl;
    if (!tokenUrl) {
        throw new OAuthError('Token URL not configured');
    }

    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
    });

    if (config.clientSecret) {
        body.set('client_secret', config.clientSecret);
    }

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new OAuthError(
            `Token refresh failed: ${response.status}`,
            (error as { error?: string }).error,
            (error as { error_description?: string }).error_description
        );
    }

    const data = await response.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        token_type: string;
        scope?: string;
    };

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
        tokenType: data.token_type,
        scope: data.scope,
    };
}
