import type { AuditLogEntry, AuditSinkLike } from '../ai/guardrails/types';
import { KodoClient, type KodoStorageConfig } from './internal/kodo-client';

export interface KodoAuditSinkConfig extends Omit<KodoStorageConfig, 'downloadDomain'> {
    prefix?: string;
}

class KodoAuditSink implements AuditSinkLike {
    public readonly kind = 'kodo';
    private readonly client: KodoClient;

    constructor(config: KodoAuditSinkConfig) {
        this.client = new KodoClient({
            ...config,
            prefix: config.prefix ?? 'audit',
        });
    }

    async write(entries: AuditLogEntry[]): Promise<void> {
        if (entries.length === 0) return;

        const key = this.client.getObjectKey(buildAuditObjectName(new Date()));
        const payload = entries
            .map((entry) => JSON.stringify(entry))
            .join('\n')
            .concat('\n');

        await this.client.uploadText(key, payload, 'application/x-ndjson');
    }
}

export function createKodoAuditSink(config: KodoAuditSinkConfig): AuditSinkLike {
    return new KodoAuditSink(config);
}

function buildAuditObjectName(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const timestamp = date.getTime();
    const random = Math.random().toString(36).slice(2, 10);
    return `${year}/${month}/${day}/${timestamp}-${random}.ndjson`;
}
