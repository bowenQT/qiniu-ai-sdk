/**
 * MCP Dynamic Schema Validation.
 * 
 * Lightweight JSON Schema validator for MCP tool inputSchema validation.
 * 
 * Design decisions (v0.32.0):
 * - Explicit subset of JSON Schema Draft-07/OpenAPI 3.0
 * - Unsupported keywords throw RecoverableError (fail-fast, not silent)
 * - additionalProperties is NOT supported (throws error for safety)
 * 
 * @module
 */

import { RecoverableError } from '../../lib/errors';

// ============================================================================
// Constants
// ============================================================================

/** Keywords supported by this validator */
export const SUPPORTED_KEYWORDS = new Set([
    'type',
    'properties',
    'required',
    'enum',
    'minLength',
    'maxLength',
    'minimum',
    'maximum',
    'items',
    'nullable',
    // Ignored (no error, no processing)
    'description',
    'title',
    'examples',
    'default', // ignored, not filled
]);

/** Keywords that throw RecoverableError */
export const UNSUPPORTED_KEYWORDS = new Set([
    'oneOf',
    'anyOf',
    'allOf',
    '$ref',
    'additionalProperties',
    'pattern',
    'patternProperties',
    'if',
    'then',
    'else',
    'not',
    'contains',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minProperties',
    'maxProperties',
    'const',
    'format',
    'dependencies',
    'propertyNames',
]);

// ============================================================================
// Types
// ============================================================================

/** JSON Schema subset supported by this validator */
export interface JsonSchema {
    type?: string | string[];
    properties?: Record<string, JsonSchema>;
    required?: string[];
    enum?: unknown[];
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    items?: JsonSchema;
    nullable?: boolean;
    // Meta (ignored)
    description?: string;
    title?: string;
    examples?: unknown[];
    default?: unknown;
    // Unsupported (will throw)
    [key: string]: unknown;
}

/** Validation result */
export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

/** Validation error detail */
export interface ValidationError {
    path: string;
    message: string;
    keyword: string;
    expected?: unknown;
    actual?: unknown;
}

// ============================================================================
// Schema Validator
// ============================================================================

/**
 * Validate data against a JSON Schema.
 * 
 * @param data - Data to validate
 * @param schema - JSON Schema to validate against
 * @param path - Internal path tracking (for error messages)
 * @returns Validation result
 * @throws RecoverableError if schema contains unsupported keywords
 * 
 * @example
 * ```typescript
 * const schema = {
 *   type: 'object',
 *   properties: { name: { type: 'string' } },
 *   required: ['name']
 * };
 * const result = validateAgainstSchema({ name: 'test' }, schema);
 * console.log(result.valid); // true
 * ```
 */
export function validateAgainstSchema(
    data: unknown,
    schema: JsonSchema,
    path: string = ''
): ValidationResult {
    const errors: ValidationError[] = [];

    // Check for unsupported keywords first
    checkUnsupportedKeywords(schema);

    // Handle nullable
    if (schema.nullable && data === null) {
        return { valid: true, errors: [] };
    }

    // Type validation
    if (schema.type !== undefined) {
        const typeValid = validateType(data, schema.type, schema.nullable);
        if (!typeValid) {
            errors.push({
                path: path || '$',
                message: `Expected type ${JSON.stringify(schema.type)}, got ${typeof data}`,
                keyword: 'type',
                expected: schema.type,
                actual: typeof data,
            });
            return { valid: false, errors };
        }
    }

    // Enum validation
    if (schema.enum !== undefined) {
        if (!schema.enum.includes(data)) {
            errors.push({
                path: path || '$',
                message: `Value must be one of: ${JSON.stringify(schema.enum)}`,
                keyword: 'enum',
                expected: schema.enum,
                actual: data,
            });
        }
    }

    // String validations
    if (typeof data === 'string') {
        if (schema.minLength !== undefined && data.length < schema.minLength) {
            errors.push({
                path: path || '$',
                message: `String length ${data.length} is less than minimum ${schema.minLength}`,
                keyword: 'minLength',
                expected: schema.minLength,
                actual: data.length,
            });
        }
        if (schema.maxLength !== undefined && data.length > schema.maxLength) {
            errors.push({
                path: path || '$',
                message: `String length ${data.length} exceeds maximum ${schema.maxLength}`,
                keyword: 'maxLength',
                expected: schema.maxLength,
                actual: data.length,
            });
        }
    }

    // Number validations
    if (typeof data === 'number') {
        if (schema.minimum !== undefined && data < schema.minimum) {
            errors.push({
                path: path || '$',
                message: `Number ${data} is less than minimum ${schema.minimum}`,
                keyword: 'minimum',
                expected: schema.minimum,
                actual: data,
            });
        }
        if (schema.maximum !== undefined && data > schema.maximum) {
            errors.push({
                path: path || '$',
                message: `Number ${data} exceeds maximum ${schema.maximum}`,
                keyword: 'maximum',
                expected: schema.maximum,
                actual: data,
            });
        }
    }

    // Object validations
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        const obj = data as Record<string, unknown>;

        // Required properties
        if (schema.required) {
            for (const key of schema.required) {
                if (!(key in obj)) {
                    errors.push({
                        path: `${path}.${key}`,
                        message: `Missing required property: ${key}`,
                        keyword: 'required',
                        expected: key,
                        actual: undefined,
                    });
                }
            }
        }

        // Property validations
        if (schema.properties) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (key in obj) {
                    const propResult = validateAgainstSchema(
                        obj[key],
                        propSchema,
                        path ? `${path}.${key}` : key
                    );
                    errors.push(...propResult.errors);
                }
            }
        }
    }

    // Array validations
    if (Array.isArray(data) && schema.items) {
        for (let i = 0; i < data.length; i++) {
            const itemResult = validateAgainstSchema(
                data[i],
                schema.items,
                `${path}[${i}]`
            );
            errors.push(...itemResult.errors);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Check for unsupported keywords and throw RecoverableError.
 */
function checkUnsupportedKeywords(schema: JsonSchema): void {
    const foundUnsupported: string[] = [];

    for (const key of Object.keys(schema)) {
        if (UNSUPPORTED_KEYWORDS.has(key)) {
            foundUnsupported.push(key);
        }
    }

    if (foundUnsupported.length > 0) {
        throw new RecoverableError(
            `Schema contains unsupported keywords: ${foundUnsupported.join(', ')}`,
            'schema-validator',
            'Simplify schema to use only supported keywords: ' +
            Array.from(SUPPORTED_KEYWORDS).join(', '),
            { unsupportedKeywords: foundUnsupported },
        );
    }
}

/**
 * Validate value type against schema type.
 */
function validateType(
    value: unknown,
    schemaType: string | string[],
    nullable?: boolean
): boolean {
    const types = Array.isArray(schemaType) ? schemaType : [schemaType];

    for (const type of types) {
        switch (type) {
            case 'string':
                if (typeof value === 'string') return true;
                break;
            case 'number':
            case 'integer':
                if (typeof value === 'number') {
                    if (type === 'integer' && !Number.isInteger(value)) break;
                    return true;
                }
                break;
            case 'boolean':
                if (typeof value === 'boolean') return true;
                break;
            case 'object':
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) return true;
                break;
            case 'array':
                if (Array.isArray(value)) return true;
                break;
            case 'null':
                if (value === null) return true;
                break;
        }
    }

    // Handle nullable
    if (nullable && value === null) return true;

    return false;
}

/**
 * Create a validation wrapper for MCP tool execution.
 * 
 * @param schema - Tool input schema
 * @param toolName - Tool name for error context
 * @returns Validator function
 */
export function createToolValidator(
    schema: JsonSchema,
    toolName: string
): (args: Record<string, unknown>) => void {
    return (args: Record<string, unknown>) => {
        const result = validateAgainstSchema(args, schema);
        if (!result.valid) {
            throw new RecoverableError(
                `Tool "${toolName}" validation failed: ${result.errors.map(e => e.message).join('; ')}`,
                toolName,
                'Fix the tool arguments to match the expected schema',
                { validationErrors: result.errors },
            );
        }
    };
}
