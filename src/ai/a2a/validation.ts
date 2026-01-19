/**
 * A2A Validation - Schema validation and argument sanitization.
 */

import type { A2AErrorCode } from './types';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
    valid: boolean;
    error?: {
        code: A2AErrorCode;
        message: string;
    };
}

export interface JsonSchema {
    type?: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
    enum?: unknown[];
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
}

// ============================================================================
// Schema Validation
// ============================================================================

/**
 * Validate arguments against a JSON schema.
 */
export function validateSchema(
    args: Record<string, unknown>,
    schema: JsonSchema
): ValidationResult {
    // Check required fields
    if (schema.required) {
        for (const field of schema.required) {
            if (!(field in args) || args[field] === undefined) {
                return {
                    valid: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: `Missing required field: ${field}`,
                    },
                };
            }
        }
    }

    // Check property types
    if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            if (key in args) {
                const value = args[key];
                const propResult = validateValue(value, propSchema, key);
                if (!propResult.valid) {
                    return propResult;
                }
            }
        }
    }

    return { valid: true };
}

/**
 * Validate a single value against a schema.
 */
function validateValue(
    value: unknown,
    schema: JsonSchema,
    path: string
): ValidationResult {
    // Type check
    if (schema.type) {
        const actualType = getJsonType(value);
        if (actualType !== schema.type) {
            return {
                valid: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `Field "${path}" expected ${schema.type}, got ${actualType}`,
                },
            };
        }
    }

    // Enum check
    if (schema.enum && !schema.enum.includes(value)) {
        return {
            valid: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: `Field "${path}" must be one of: ${schema.enum.join(', ')}`,
            },
        };
    }

    // String constraints
    if (typeof value === 'string') {
        if (schema.minLength !== undefined && value.length < schema.minLength) {
            return {
                valid: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `Field "${path}" must be at least ${schema.minLength} characters`,
                },
            };
        }
        if (schema.maxLength !== undefined && value.length > schema.maxLength) {
            return {
                valid: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `Field "${path}" must be at most ${schema.maxLength} characters`,
                },
            };
        }
        if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
            return {
                valid: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `Field "${path}" does not match pattern: ${schema.pattern}`,
                },
            };
        }
    }

    // Number constraints
    if (typeof value === 'number') {
        if (schema.minimum !== undefined && value < schema.minimum) {
            return {
                valid: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `Field "${path}" must be >= ${schema.minimum}`,
                },
            };
        }
        if (schema.maximum !== undefined && value > schema.maximum) {
            return {
                valid: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `Field "${path}" must be <= ${schema.maximum}`,
                },
            };
        }
    }

    return { valid: true };
}

/**
 * Get JSON type name for a value.
 */
function getJsonType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

// ============================================================================
// Argument Sanitization
// ============================================================================

/** Patterns to redact from arguments */
const SENSITIVE_PATTERNS = [
    /password/i,
    /secret/i,
    /token/i,
    /api[_-]?key/i,
    /auth/i,
    /credential/i,
    /private[_-]?key/i,
];

/**
 * Sanitize arguments by removing or redacting sensitive fields.
 * 
 * Note: This modifies the object in place for performance.
 * Returns the same object reference.
 */
export function sanitizeArgs(
    args: Record<string, unknown>,
    options: { redact?: boolean } = {}
): Record<string, unknown> {
    const { redact = false } = options;

    for (const key of Object.keys(args)) {
        if (SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
            if (redact) {
                args[key] = '[REDACTED]';
            } else {
                delete args[key];
            }
        } else if (typeof args[key] === 'object' && args[key] !== null && !Array.isArray(args[key])) {
            // Recursively sanitize nested objects
            sanitizeArgs(args[key] as Record<string, unknown>, options);
        }
    }

    return args;
}

/**
 * Deep clone and sanitize arguments.
 */
export function cloneAndSanitize(
    args: Record<string, unknown>,
    options: { redact?: boolean } = {}
): Record<string, unknown> {
    const cloned = structuredClone(args);
    return sanitizeArgs(cloned, options);
}
