/**
 * Output Filter - Toxic content and PII detection in responses.
 */

import type {
    Guardrail,
    GuardrailContext,
    GuardrailResult,
    ContentFilterConfig,
    ContentCategory,
} from './types';

// ============================================================================
// PII Patterns (same as input filter)
// ============================================================================

const PII_PATTERNS: Record<string, RegExp> = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
    phone: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    phoneZh: /\b1[3-9]\d{9}\b/g,
    ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    creditCard: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
    idCardZh: /\b\d{17}[\dXx]\b/g,
    ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
};

// ============================================================================
// Toxic Patterns
// ============================================================================

const TOXIC_PATTERNS: RegExp[] = [
    // Hate speech indicators
    /\b(hate|hatred)\s+(speech|crime)/i,
    // Violent content
    /\b(how\s+to\s+)?(kill|murder|harm|hurt)\s+(someone|people|a\s+person)/i,
    // Self-harm
    /\b(suicide|self[-\s]?harm)\b/i,
    // Explicit content markers
    /\b(explicit|nsfw|xxx)\b/i,
];

// ============================================================================
// Output Filter
// ============================================================================

/**
 * Create an output filter guardrail.
 */
export function outputFilter(config: ContentFilterConfig): Guardrail {
    const categories = config.block;
    const action = config.action ?? 'redact';

    return {
        name: 'outputFilter',
        phase: 'post-response',

        async process(context: GuardrailContext): Promise<GuardrailResult> {
            const content = context.content;
            const detections: string[] = [];

            // Check toxic
            if (categories.includes('toxic')) {
                for (const pattern of TOXIC_PATTERNS) {
                    if (pattern.test(content)) {
                        detections.push('toxic');
                        break;
                    }
                }
            }

            // Check PII leakage
            if (categories.includes('pii')) {
                for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
                    if (pattern.test(content)) {
                        detections.push(`pii:${type}`);
                    }
                }
            }

            if (detections.length === 0) {
                return { action: 'pass' };
            }

            const reason = `Detected: ${detections.join(', ')}`;

            if (action === 'redact') {
                const redacted = redactContent(content, categories);
                return {
                    action: 'redact',
                    modifiedContent: redacted,
                    reason,
                };
            }

            return {
                action: 'block',
                reason,
            };
        },
    };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Redact sensitive content.
 */
function redactContent(content: string, categories: ContentCategory[]): string {
    let result = content;

    if (categories.includes('pii')) {
        for (const pattern of Object.values(PII_PATTERNS)) {
            result = result.replace(pattern, '[REDACTED]');
        }
    }

    if (categories.includes('toxic')) {
        for (const pattern of TOXIC_PATTERNS) {
            result = result.replace(pattern, '[REMOVED]');
        }
    }

    return result;
}
