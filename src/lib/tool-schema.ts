/**
 * Shared tool parameter normalization and validation.
 *
 * Provides:
 *  - normalizeToJsonSchema(): Zod duck-typing → JSON Schema, raw passthrough
 *  - validateToolArgs(): strict (user/skill) vs lenient (mcp) validation
 *
 * This module is the single source of truth for tool param handling,
 * consumed by both generate-text.ts and execute-node.ts — no circular deps.
 *
 * @module
 */

import { RecoverableError } from './errors';

// ============================================================================
// Types
// ============================================================================

/** JSON Schema (subset used by this validator) */
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
    description?: string;
    title?: string;
    examples?: unknown[];
    default?: unknown;
    [key: string]: unknown;
}

export interface ToolValidationResult {
    valid: boolean;
    errors: string[];
}

// ============================================================================
// Normalization
// ============================================================================

/**
 * Normalize tool parameters to JSON Schema.
 * Handles: Zod schemas (duck-typed), plain JSON Schema, null/undefined.
 */
export function normalizeToJsonSchema(parameters: unknown): JsonSchema {
    if (parameters == null) {
        return {};
    }

    if (isZodSchema(parameters)) {
        return zodToJsonSchemaSimple(parameters);
    }

    return parameters as JsonSchema;
}

/**
 * Check if an object is a Zod schema using robust duck-typing.
 */
function isZodSchema(obj: unknown): boolean {
    if (obj == null || typeof obj !== 'object') {
        return false;
    }
    const def = (obj as { _def?: { typeName?: string } })._def;
    return def != null && typeof def.typeName === 'string' && def.typeName.startsWith('Zod');
}

/**
 * Simple Zod → JSON Schema conversion (subset for tool parameters).
 * Supports: ZodString, ZodNumber, ZodBoolean, ZodArray, ZodEnum, ZodLiteral,
 *           ZodUnion, ZodObject, ZodOptional, ZodNullable, ZodDefault
 */
function zodToJsonSchemaSimple(schema: unknown, path = 'root'): JsonSchema {
    const def = (schema as { _def?: { typeName?: string;[key: string]: unknown } })._def;
    const typeName = def?.typeName;

    switch (typeName) {
        case 'ZodString':
            return { type: 'string' };
        case 'ZodNumber':
            return { type: 'number' };
        case 'ZodBoolean':
            return { type: 'boolean' };
        case 'ZodArray':
            return { type: 'array', items: zodToJsonSchemaSimple((def as { type: unknown }).type, `${path}[]`) };
        case 'ZodEnum':
            return { type: 'string', enum: (def as { values: unknown[] }).values };
        case 'ZodLiteral': {
            const value = (def as { value: unknown }).value;
            const valueType = typeof value;
            if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
                return { type: valueType, const: value };
            }
            return { const: value };
        }
        case 'ZodUnion': {
            const options = (def as { options: unknown[] }).options;
            return { anyOf: options.map((opt, i) => zodToJsonSchemaSimple(opt, `${path}.union[${i}]`)) };
        }
        case 'ZodObject': {
            const shapeSource = def?.shape as (() => Record<string, unknown>) | Record<string, unknown>;
            const shape = typeof shapeSource === 'function' ? shapeSource() : shapeSource || {};
            const properties: Record<string, unknown> = {};
            const required: string[] = [];

            for (const [key, value] of Object.entries(shape)) {
                const innerDef = (value as { _def?: { typeName?: string; innerType?: unknown } })._def;
                const isOptional = innerDef?.typeName === 'ZodOptional' || innerDef?.typeName === 'ZodDefault';
                const inner = isOptional ? innerDef?.innerType : value;
                properties[key] = zodToJsonSchemaSimple(inner, `${path}.${key}`);
                if (!isOptional) {
                    required.push(key);
                }
            }

            const result: JsonSchema = { type: 'object', properties: properties as Record<string, JsonSchema> };
            if (required.length) {
                result.required = required;
            }
            return result;
        }
        case 'ZodOptional':
        case 'ZodNullable':
        case 'ZodDefault':
            return zodToJsonSchemaSimple((def as { innerType: unknown }).innerType, path);
        default:
            if (typeName && typeName.startsWith('Zod')) {
                console.warn(
                    `[qiniu-ai-sdk] Unsupported Zod type "${typeName}" at path "${path}". ` +
                    `Consider using zodToJsonSchema from '@bowenqt/qiniu-ai-sdk/ai-tools' for full Zod support.`
                );
            }
            return {};
    }
}

// ============================================================================
// Validation
// ============================================================================

/** Keywords that trigger RecoverableError in strict mode */
const STRICT_UNSUPPORTED_KEYWORDS = new Set([
    'oneOf', 'anyOf', 'allOf', '$ref', 'additionalProperties', 'pattern',
    'patternProperties', 'if', 'then', 'else', 'not', 'contains',
    'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties',
    'const', 'format', 'dependencies', 'propertyNames',
]);

/**
 * Validate tool arguments against a JSON Schema.
 *
 * @param args - Tool arguments to validate
 * @param schema - JSON Schema to validate against
 * @param mode - 'strict' (user/skill/builtin: throws on unsupported keywords)
 *               'lenient' (mcp: only checks required + type, skips advanced keywords)
 */
export function validateToolArgs(
    args: Record<string, unknown>,
    schema: JsonSchema,
    mode: 'strict' | 'lenient',
): ToolValidationResult {
    if (mode === 'strict') {
        return validateStrict(args, schema, '');
    }
    return validateLenient(args, schema);
}

// ============================================================================
// Strict validation (reuses schema-validator logic)
// ============================================================================

function validateStrict(data: unknown, schema: JsonSchema, path: string): ToolValidationResult {
    const errors: string[] = [];

    // Check for unsupported keywords → throw
    for (const key of Object.keys(schema)) {
        if (STRICT_UNSUPPORTED_KEYWORDS.has(key)) {
            throw new RecoverableError(
                `Schema contains unsupported keyword: ${key}`,
                'tool-schema',
                'Simplify schema or use lenient mode for MCP tools',
                { keyword: key },
            );
        }
    }

    // Nullable
    if (schema.nullable && data === null) {
        return { valid: true, errors: [] };
    }

    // Type
    if (schema.type !== undefined) {
        if (!checkType(data, schema.type, schema.nullable)) {
            errors.push(`${path || '$'}: expected type ${JSON.stringify(schema.type)}, got ${typeof data}`);
            return { valid: false, errors };
        }
    }

    // Enum
    if (schema.enum !== undefined) {
        if (!schema.enum.includes(data)) {
            errors.push(`${path || '$'}: value must be one of ${JSON.stringify(schema.enum)}`);
        }
    }

    // String constraints
    if (typeof data === 'string') {
        if (schema.minLength !== undefined && data.length < schema.minLength) {
            errors.push(`${path || '$'}: string length ${data.length} < minimum ${schema.minLength}`);
        }
        if (schema.maxLength !== undefined && data.length > schema.maxLength) {
            errors.push(`${path || '$'}: string length ${data.length} > maximum ${schema.maxLength}`);
        }
    }

    // Number constraints
    if (typeof data === 'number') {
        if (schema.minimum !== undefined && data < schema.minimum) {
            errors.push(`${path || '$'}: ${data} < minimum ${schema.minimum}`);
        }
        if (schema.maximum !== undefined && data > schema.maximum) {
            errors.push(`${path || '$'}: ${data} > maximum ${schema.maximum}`);
        }
    }

    // Object: required + properties
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        const obj = data as Record<string, unknown>;
        if (schema.required) {
            for (const key of schema.required) {
                if (!(key in obj)) {
                    errors.push(`${path ? path + '.' : ''}${key}: missing required property`);
                }
            }
        }
        if (schema.properties) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (key in obj) {
                    const sub = validateStrict(obj[key], propSchema, path ? `${path}.${key}` : key);
                    errors.push(...sub.errors);
                }
            }
        }
    }

    // Array: items
    if (Array.isArray(data) && schema.items) {
        for (let i = 0; i < data.length; i++) {
            const sub = validateStrict(data[i], schema.items, `${path}[${i}]`);
            errors.push(...sub.errors);
        }
    }

    return { valid: errors.length === 0, errors };
}

// ============================================================================
// Lenient validation (MCP tools: only required + basic type)
// ============================================================================

function validateLenient(args: Record<string, unknown>, schema: JsonSchema): ToolValidationResult {
    const errors: string[] = [];

    // Only check required
    if (schema.required) {
        for (const key of schema.required) {
            if (!(key in args)) {
                errors.push(`${key}: missing required property`);
            }
        }
    }

    // Only check top-level property types (skip advanced keywords like anyOf/$ref)
    if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
            if (key in args && propSchema.type) {
                // Skip type check if property has advanced keywords
                const hasAdvanced = Object.keys(propSchema).some(k => STRICT_UNSUPPORTED_KEYWORDS.has(k));
                if (!hasAdvanced && !checkType(args[key], propSchema.type, propSchema.nullable)) {
                    errors.push(`${key}: expected type ${JSON.stringify(propSchema.type)}, got ${typeof args[key]}`);
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

// ============================================================================
// Shared helpers
// ============================================================================

function checkType(value: unknown, schemaType: string | string[], nullable?: boolean): boolean {
    if (nullable && value === null) return true;

    const types = Array.isArray(schemaType) ? schemaType : [schemaType];
    for (const type of types) {
        switch (type) {
            case 'string': if (typeof value === 'string') return true; break;
            case 'number':
            case 'integer':
                if (typeof value === 'number') {
                    if (type === 'integer' && !Number.isInteger(value)) break;
                    return true;
                }
                break;
            case 'boolean': if (typeof value === 'boolean') return true; break;
            case 'object': if (typeof value === 'object' && value !== null && !Array.isArray(value)) return true; break;
            case 'array': if (Array.isArray(value)) return true; break;
            case 'null': if (value === null) return true; break;
        }
    }

    return false;
}
