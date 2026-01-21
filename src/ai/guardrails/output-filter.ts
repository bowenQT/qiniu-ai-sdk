/**
 * Output Filter - Toxic content and PII detection in responses.
 *
 * Note: Uses string.match() instead of regex.test() to avoid stateful lastIndex issues.
 */

import type {
    Guardrail,
    GuardrailContext,
    GuardrailResult,
    ContentFilterConfig,
    ContentCategory,
} from './types';

// ============================================================================
// PII Patterns
// ============================================================================

const PII_PATTERN_SOURCES: Record<string, { source: string; flags: string }> = {
    email: { source: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b', flags: 'gi' },
    phone: { source: '\\b(?:\\+?1[-.\\s]?)?\\(?[0-9]{3}\\)?[-.\\s]?[0-9]{3}[-.\\s]?[0-9]{4}\\b', flags: 'g' },
    phoneZh: { source: '\\b1[3-9]\\d{9}\\b', flags: 'g' },
    ssn: { source: '\\b\\d{3}[-.\\s]?\\d{2}[-.\\s]?\\d{4}\\b', flags: 'g' },
    creditCard: { source: '\\b(?:\\d{4}[-.\\s]?){3}\\d{4}\\b', flags: 'g' },
    idCardZh: { source: '\\b\\d{17}[\\dXx]\\b', flags: 'g' },
    ipAddress: { source: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b', flags: 'g' },
};

// ============================================================================
// Toxic Patterns
// ============================================================================

const TOXIC_PATTERN_SOURCES: Array<{ source: string; flags: string }> = [
    { source: '\\b(hate|hatred)\\s+(speech|crime)', flags: 'i' },
    { source: '\\b(how\\s+to\\s+)?(kill|murder|harm|hurt)\\s+(someone|people|a\\s+person)', flags: 'i' },
    { source: '\\b(suicide|self[-\\s]?harm)\\b', flags: 'i' },
    { source: '\\b(explicit|nsfw|xxx)\\b', flags: 'i' },
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

            // Check toxic (create fresh regex each call)
            if (categories.includes('toxic')) {
                for (const { source, flags } of TOXIC_PATTERN_SOURCES) {
                    const pattern = new RegExp(source, flags);
                    if (content.match(pattern)) {
                        detections.push('toxic');
                        break;
                    }
                }
            }

            // Check PII leakage
            if (categories.includes('pii')) {
                for (const [type, { source, flags }] of Object.entries(PII_PATTERN_SOURCES)) {
                    const pattern = new RegExp(source, flags);
                    if (content.match(pattern)) {
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
        for (const { source, flags } of Object.values(PII_PATTERN_SOURCES)) {
            const pattern = new RegExp(source, flags);
            result = result.replace(pattern, '[REDACTED]');
        }
    }

    if (categories.includes('toxic')) {
        for (const { source, flags } of TOXIC_PATTERN_SOURCES) {
            const pattern = new RegExp(source, flags);
            result = result.replace(pattern, '[REMOVED]');
        }
    }

    return result;
}
