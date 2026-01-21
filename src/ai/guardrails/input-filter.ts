/**
 * Input Filter - PII and injection detection.
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

const PII_PATTERNS: Record<string, RegExp> = {
    // Email
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
    // Phone (various formats)
    phone: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    // Chinese phone
    phoneZh: /\b1[3-9]\d{9}\b/g,
    // SSN
    ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    // Credit card
    creditCard: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
    // Chinese ID
    idCardZh: /\b\d{17}[\dXx]\b/g,
    // IP Address
    ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
};

// ============================================================================
// Injection Patterns
// ============================================================================

const INJECTION_PATTERNS: RegExp[] = [
    // Common prompt injection patterns
    /ignore\s+(previous|all|above)\s+instructions?/i,
    /disregard\s+(previous|all|above)/i,
    /forget\s+(everything|previous|all)/i,
    /new\s+instructions?:/i,
    /system\s*:\s*/i,
    /\[\s*system\s*\]/i,
    /###\s*instruction/i,
    /you\s+are\s+now\s+an?\s+/i,
    /pretend\s+(you\s+are|to\s+be)/i,
    /jailbreak/i,
    /DAN\s+mode/i,
];

// ============================================================================
// Toxic Patterns (basic)
// ============================================================================

const TOXIC_PATTERNS: RegExp[] = [
    // Placeholder - extend with actual patterns
    /\b(hate|kill|murder|terrorist)\b/i,
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

            // Check PII
            if (categories.includes('pii')) {
                for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
                    if (pattern.test(content)) {
                        detections.push(`pii:${type}`);
                    }
                }
            }

            // Check injection
            if (categories.includes('injection')) {
                for (const pattern of INJECTION_PATTERNS) {
                    if (pattern.test(content)) {
                        detections.push('injection');
                        break;
                    }
                }
            }

            // Check toxic (if included)
            if (categories.includes('toxic')) {
                for (const pattern of TOXIC_PATTERNS) {
                    if (pattern.test(content)) {
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
        for (const pattern of Object.values(PII_PATTERNS)) {
            result = result.replace(pattern, '[REDACTED]');
        }
    }

    return result;
}
