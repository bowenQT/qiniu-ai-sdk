/**
 * Token Estimator for LLM context management.
 * Supports CJK character-level weighting and ContentPart[].
 *
 * IMPORTANT: All compaction paths MUST use estimateMessageTokens,
 * NOT estimator(message.content) directly.
 */

import type { ContentPart } from './types';

/** CJK Unicode ranges */
const CJK_RANGES: [number, number][] = [
    [0x4e00, 0x9fff], // CJK Unified Ideographs
    [0x3400, 0x4dbf], // CJK Extension A
    [0xac00, 0xd7af], // Hangul Syllables
    [0x3040, 0x30ff], // Hiragana + Katakana
    [0xff00, 0xffef], // Fullwidth Forms
];

/**
 * Check if a character is CJK.
 */
function isCJK(char: string): boolean {
    const code = char.charCodeAt(0);
    return CJK_RANGES.some(([start, end]) => code >= start && code <= end);
}

/**
 * Token estimator configuration.
 */
export interface TokenEstimatorConfig {
    /** Characters per token for Latin text (default: 4) */
    charsPerToken?: number;
    /** Multiplier for CJK characters (default: 1.5) */
    cjkMultiplier?: number;
    /** Fixed overhead per message for role/metadata (default: 10) */
    messageOverhead?: number;
    /** Token cost per image (default: 85) */
    imageTokenCost?: number;
    /** Token cost per tool_call (default: 50) */
    toolCallCost?: number;
}

/**
 * Token estimator function type.
 */
export type ContentEstimator = (content: string | ContentPart[]) => number;

/**
 * Create a token estimator with the given configuration.
 */
export function createTokenEstimator(config: TokenEstimatorConfig = {}): ContentEstimator {
    const charsPerToken = config.charsPerToken ?? 4;
    const cjkMultiplier = config.cjkMultiplier ?? 1.5;
    const imageTokenCost = config.imageTokenCost ?? 85;

    return (content: string | ContentPart[]): number => {
        // Handle ContentPart[]
        if (Array.isArray(content)) {
            let total = 0;
            for (const part of content) {
                if (part.type === 'text' && 'text' in part) {
                    total += estimateText(part.text, charsPerToken, cjkMultiplier);
                } else if (part.type === 'image_url' || part.type === 'image') {
                    // Both image_url (API format) and image (SDK sugar) count as image tokens
                    total += imageTokenCost;
                }
            }
            return total;
        }

        // Handle plain string
        return estimateText(content, charsPerToken, cjkMultiplier);
    };
}

/**
 * Estimate tokens for text content.
 */
function estimateText(text: string, charsPerToken: number, cjkMultiplier: number): number {
    let weightedChars = 0;
    for (const char of text) {
        weightedChars += isCJK(char) ? cjkMultiplier : 1;
    }
    return Math.ceil(weightedChars / charsPerToken);
}

/**
 * Default content estimator.
 */
export const defaultContentEstimator = createTokenEstimator();

/**
 * Message interface for estimation.
 */
export interface EstimableMessage {
    content: string | ContentPart[];
    tool_calls?: unknown[];
    role?: string;
}

/**
 * Estimate tokens for a complete message.
 * This is the PRIMARY function for compaction - use this, not content-only estimation.
 *
 * @param message - The message to estimate
 * @param config - Optional configuration
 * @returns Estimated token count
 */
export function estimateMessageTokens(
    message: EstimableMessage,
    config: TokenEstimatorConfig = {}
): number {
    const messageOverhead = config.messageOverhead ?? 10;
    const toolCallCost = config.toolCallCost ?? 50;
    const estimator = createTokenEstimator(config);

    let tokens = messageOverhead;

    // Content tokens
    tokens += estimator(message.content);

    // Tool call tokens
    if (message.tool_calls?.length) {
        tokens += message.tool_calls.length * toolCallCost;
    }

    return tokens;
}

/**
 * Estimate tokens for an array of messages.
 * This is the function to use in compaction config.
 */
export function estimateMessagesTokens(
    messages: EstimableMessage[],
    config: TokenEstimatorConfig = {}
): number {
    return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg, config), 0);
}

/**
 * Default configuration values (exported for documentation).
 */
export const DEFAULT_ESTIMATOR_CONFIG: Required<TokenEstimatorConfig> = {
    charsPerToken: 4,
    cjkMultiplier: 1.5,
    messageOverhead: 10,
    imageTokenCost: 85,
    toolCallCost: 50,
};
