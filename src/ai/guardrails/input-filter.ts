/**
 * Input Filter - PII and injection detection.
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
// PII Patterns (use string literals, create new RegExp per call)
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

const INJECTION_PATTERN_SOURCES: Array<{ source: string; flags: string }> = [
    { source: 'ignore\\s+(previous|all|above)\\s+instructions?', flags: 'i' },
    { source: 'disregard\\s+(previous|all|above)', flags: 'i' },
    { source: 'forget\\s+(everything|previous|all)', flags: 'i' },
    { source: 'new\\s+instructions?:', flags: 'i' },
    { source: 'system\\s*:\\s*', flags: 'i' },
    { source: '\\[\\s*system\\s*\\]', flags: 'i' },
    { source: '###\\s*instruction', flags: 'i' },
    { source: 'you\\s+are\\s+now\\s+an?\\s+', flags: 'i' },
    { source: 'pretend\\s+(you\\s+are|to\\s+be)', flags: 'i' },
    { source: 'jailbreak', flags: 'i' },
    { source: 'DAN\\s+mode', flags: 'i' },
];

const TOXIC_PATTERN_SOURCES: Array<{ source: string; flags: string }> = [
    { source: '\\b(hate|kill|murder|terrorist)\\b', flags: 'i' },
];

// ============================================================================
// Input Filter
// ============================================================================

/**
 * Create an input filter guardrail.
 */
export function inputFilter(config: ContentFilterConfig): Guardrail {
    const categories = config.block;
    const action = config.action ?? 'block';

    return {
        name: 'inputFilter',
        phase: 'pre-request',

        async process(context: GuardrailContext): Promise<GuardrailResult> {
            const content = context.content;
            const detections: string[] = [];

            // Check PII (create fresh regex each call)
            if (categories.includes('pii')) {
                for (const [type, { source, flags }] of Object.entries(PII_PATTERN_SOURCES)) {
                    const pattern = new RegExp(source, flags);
                    if (content.match(pattern)) {
                        detections.push(`pii:${type}`);
                    }
                }
            }

            // Check injection
            if (categories.includes('injection')) {
                for (const { source, flags } of INJECTION_PATTERN_SOURCES) {
                    const pattern = new RegExp(source, flags);
                    if (content.match(pattern)) {
                        detections.push('injection');
                        break;
                    }
                }
            }

            // Check toxic
            if (categories.includes('toxic')) {
                for (const { source, flags } of TOXIC_PATTERN_SOURCES) {
                    const pattern = new RegExp(source, flags);
                    if (content.match(pattern)) {
                        detections.push('toxic');
                        break;
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
 * Redact PII from content.
 */
function redactContent(content: string, categories: ContentCategory[]): string {
    let result = content;

    if (categories.includes('pii')) {
        for (const { source, flags } of Object.values(PII_PATTERN_SOURCES)) {
            const pattern = new RegExp(source, flags);
            result = result.replace(pattern, '[REDACTED]');
        }
    }

    return result;
}
