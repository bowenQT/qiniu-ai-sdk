/**
 * Token Limiter - Rate limiting by token count.
 */

import type {
    Guardrail,
    GuardrailContext,
    GuardrailResult,
    TokenLimiterConfig,
    GuardrailTokenStore,
} from './types';

// ============================================================================
// Memory Store
// ============================================================================

interface MemoryEntry {
    count: number;
    expiresAt: number;
}

/**
 * In-memory token store.
 */
class MemoryTokenStore implements GuardrailTokenStore {
    private entries = new Map<string, MemoryEntry>();

    async get(key: string): Promise<number> {
        const entry = this.entries.get(key);
        if (!entry) return 0;
        if (Date.now() > entry.expiresAt) {
            this.entries.delete(key);
            return 0;
        }
        return entry.count;
    }

    async set(key: string, value: number, ttlMs: number): Promise<void> {
        this.entries.set(key, {
            count: value,
            expiresAt: Date.now() + ttlMs,
        });
    }

    async increment(key: string, amount: number, ttlMs: number): Promise<number> {
        const current = await this.get(key);
        const newValue = current + amount;
        await this.set(key, newValue, ttlMs);
        return newValue;
    }
}

// ============================================================================
// Token Limiter
// ============================================================================

/**
 * Create a token limiter guardrail.
 */
export function tokenLimiter(config: TokenLimiterConfig): Guardrail {
    const { maxTokens, windowMs } = config;
    const store: GuardrailTokenStore = config.store === 'memory' || !config.store
        ? new MemoryTokenStore()
        : config.store;

    return {
        name: 'tokenLimiter',
        phase: ['pre-request', 'post-response'],

        async process(context: GuardrailContext): Promise<GuardrailResult> {
            const key = `tokens:${context.agentId}`;
            const estimatedTokens = estimateTokens(context.content);

            // Check current usage
            const currentUsage = await store.get(key);

            if (currentUsage + estimatedTokens > maxTokens) {
                return {
                    action: 'block',
                    reason: `Token limit exceeded: ${currentUsage}/${maxTokens} (need ${estimatedTokens} more)`,
                };
            }

            // Track usage
            await store.increment(key, estimatedTokens, windowMs);

            return { action: 'pass' };
        },
    };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Estimate token count from text.
 * Rough approximation: ~4 chars per token for English, ~2 for Chinese.
 */
function estimateTokens(text: string): number {
    // Count Chinese characters
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    // Count other characters
    const otherChars = text.length - chineseChars;

    // Estimate: 2 chars per token for Chinese, 4 for other
    return Math.ceil(chineseChars / 2 + otherChars / 4);
}
