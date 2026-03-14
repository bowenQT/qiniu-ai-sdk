import { createHmac } from 'node:crypto';

/** Kodo region codes */
export type KodoRegion = 'z0' | 'z1' | 'z2' | 'na0' | 'cn-east-2' | 'ap-southeast-1';

interface RegionHosts {
    up: string;
    rs: string;
    rsf: string;
    io: string;
}

const REGION_HOSTS: Record<KodoRegion, RegionHosts> = {
    'z0': { up: 'up.qiniup.com', rs: 'rs.qiniuapi.com', rsf: 'rsf.qiniuapi.com', io: 'iovip.qiniuio.com' },
    'z1': { up: 'up-z1.qiniup.com', rs: 'rs-z1.qiniuapi.com', rsf: 'rsf-z1.qiniuapi.com', io: 'iovip-z1.qiniuio.com' },
    'z2': { up: 'up-z2.qiniup.com', rs: 'rs-z2.qiniuapi.com', rsf: 'rsf-z2.qiniuapi.com', io: 'iovip-z2.qiniuio.com' },
    'na0': { up: 'up-na0.qiniup.com', rs: 'rs-na0.qiniuapi.com', rsf: 'rsf-na0.qiniuapi.com', io: 'iovip-na0.qiniuio.com' },
    'cn-east-2': { up: 'up-cn-east-2.qiniup.com', rs: 'rs-cn-east-2.qiniuapi.com', rsf: 'rsf-cn-east-2.qiniuapi.com', io: 'iovip-cn-east-2.qiniuio.com' },
    'ap-southeast-1': { up: 'up-ap-southeast-1.qiniup.com', rs: 'rs-ap-southeast-1.qiniuapi.com', rsf: 'rsf-ap-southeast-1.qiniuapi.com', io: 'iovip-ap-southeast-1.qiniuio.com' },
};

export interface KodoStorageConfig {
    bucket: string;
    accessKey: string;
    secretKey: string;
    region?: KodoRegion;
    prefix?: string;
    tokenExpiry?: number;
    maxRetries?: number;
    downloadDomain?: string;
}

type NormalizedKodoStorageConfig = Required<Omit<KodoStorageConfig, 'region' | 'downloadDomain'>> & {
    region: KodoRegion;
    downloadDomain?: string;
};

export class KodoClient {
    private readonly config: NormalizedKodoStorageConfig;
    private readonly hosts: RegionHosts;
    private cachedToken: { token: string; expiresAt: number } | null = null;

    constructor(config: KodoStorageConfig) {
        if (!config.bucket?.trim()) {
            throw new Error('KodoClient: bucket is required');
        }
        if (!config.accessKey?.trim()) {
            throw new Error('KodoClient: accessKey is required');
        }
        if (!config.secretKey?.trim()) {
            throw new Error('KodoClient: secretKey is required');
        }

        this.config = {
            bucket: config.bucket.trim(),
            accessKey: config.accessKey.trim(),
            secretKey: config.secretKey.trim(),
            region: config.region ?? 'z0',
            prefix: normalizePrefix(config.prefix),
            tokenExpiry: config.tokenExpiry ?? 3600,
            maxRetries: config.maxRetries ?? 3,
            downloadDomain: config.downloadDomain?.trim() || undefined,
        };
        this.hosts = REGION_HOSTS[this.config.region];
    }

    getObjectKey(name: string): string {
        const trimmedName = name.replace(/^\/+/, '');
        return this.config.prefix ? `${this.config.prefix}${trimmedName}` : trimmedName;
    }

    async uploadJson(key: string, data: unknown): Promise<void> {
        await this.uploadBlob(
            key,
            new Blob([JSON.stringify(data)], { type: 'application/json' }),
        );
    }

    async uploadText(key: string, content: string, contentType = 'text/plain'): Promise<void> {
        await this.uploadBlob(key, new Blob([content], { type: contentType }));
    }

    async downloadJson<T>(key: string): Promise<T | null> {
        return this.withRetry(async () => {
            const domain = this.config.downloadDomain
                ?? `${this.config.bucket}.${this.hosts.io.replace('iovip', 'kodo')}`;

            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const baseUrl = `https://${domain}/${encodeURIComponent(key)}`;
            const toSign = `${baseUrl}?e=${deadline}`;
            const sign = this.hmacSha1(toSign);
            const signedUrl = `${baseUrl}?e=${deadline}&token=${this.config.accessKey}:${this.base64UrlSafe(sign)}`;

            const response = await fetch(signedUrl);

            if (response.status === 404) {
                return null;
            }

            if (!response.ok) {
                throw new Error(`Download failed: ${response.status}`);
            }

            return response.json() as Promise<T>;
        });
    }

    async delete(key: string): Promise<boolean> {
        const encodedEntry = this.base64UrlSafe(`${this.config.bucket}:${key}`);
        const path = `/delete/${encodedEntry}`;
        const auth = this.generateAuth(path);

        return this.withRetry(async () => {
            const response = await fetch(`https://${this.hosts.rs}${path}`, {
                method: 'POST',
                headers: {
                    'Authorization': auth,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            if (response.status === 612) {
                return false;
            }

            if (!response.ok) {
                throw new Error(`Delete failed: ${response.status}`);
            }

            return true;
        });
    }

    async list(prefix: string): Promise<Array<{ key: string; putTime: number; fsize: number }>> {
        const items: Array<{ key: string; putTime: number; fsize: number }> = [];
        let marker: string | undefined;

        do {
            const params = new URLSearchParams({
                bucket: this.config.bucket,
                prefix,
                limit: '1000',
            });
            if (marker) params.set('marker', marker);

            const path = `/list?${params.toString()}`;
            const auth = this.generateAuth(path);

            const response = await this.withRetry(async () => {
                const res = await fetch(`https://${this.hosts.rsf}${path}`, {
                    headers: { 'Authorization': auth },
                });

                if (!res.ok) {
                    throw new Error(`List failed: ${res.status}`);
                }

                return res.json() as Promise<{
                    marker?: string;
                    items?: Array<{ key: string; putTime: number; fsize: number }>;
                }>;
            });

            if (response.items) {
                items.push(...response.items);
            }
            marker = response.marker;
        } while (marker);

        return items;
    }

    private async uploadBlob(key: string, blob: Blob): Promise<void> {
        const token = this.generateUploadToken();
        const formData = new FormData();
        formData.append('token', token);
        formData.append('key', key);
        formData.append('file', blob, key.split('/').pop() || 'payload');

        await this.withRetry(async () => {
            const response = await fetch(`https://${this.hosts.up}`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Upload failed: ${response.status} ${text}`);
            }
        });
    }

    private generateUploadToken(): string {
        const now = Math.floor(Date.now() / 1000);
        const deadline = now + this.config.tokenExpiry;

        if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60000) {
            return this.cachedToken.token;
        }

        const policy = {
            scope: this.config.bucket,
            deadline,
            insertOnly: 0,
        };

        const encodedPolicy = this.base64UrlSafe(JSON.stringify(policy));
        const sign = this.hmacSha1(encodedPolicy);
        const token = `${this.config.accessKey}:${this.base64UrlSafe(sign)}:${encodedPolicy}`;

        this.cachedToken = { token, expiresAt: deadline * 1000 - 60000 };
        return token;
    }

    private generateAuth(path: string, body?: string): string {
        const data = `${path}\n${body ?? ''}`;
        const sign = this.hmacSha1(data);
        return `QBox ${this.config.accessKey}:${this.base64UrlSafe(sign)}`;
    }

    private base64UrlSafe(input: string | Buffer): string {
        const b64 = Buffer.from(input).toString('base64');
        return b64.replace(/\+/g, '-').replace(/\//g, '_');
    }

    private hmacSha1(data: string): Buffer {
        return createHmac('sha1', this.config.secretKey).update(data).digest();
    }

    private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
        let lastError: Error | null = null;
        for (let i = 0; i < this.config.maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;
                if (i < this.config.maxRetries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, i)));
                }
            }
        }
        throw lastError;
    }
}

function normalizePrefix(prefix: string | undefined): string {
    if (!prefix) return '';
    const trimmed = prefix.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    return trimmed ? `${trimmed}/` : '';
}
