/**
 * generateObject - Generate structured output with schema validation.
 * Uses Zod for runtime type validation.
 */

import type { QiniuAI } from '../client';
import type { ChatMessage, ResponseFormat } from '../lib/types';
import { StructuredOutputError, type ValidationErrorItem } from '../lib/errors';

// ============================================================================
// Types
// ============================================================================

/** Mode for structured output generation */
export type GenerateObjectMode = 'strict' | 'json_object';

/** Options for generateObject */
export interface GenerateObjectOptions<T> {
    /** Qiniu AI client */
    client: QiniuAI;
    /** Model to use */
    model: string;
    /** Zod schema for validation */
    schema: ZodSchema<T>;
    /** User prompt */
    prompt?: string;
    /** Message history */
    messages?: ChatMessage[];
    /** System prompt */
    system?: string;
    /** Temperature (0-2) */
    temperature?: number;
    /** Top-p sampling */
    topP?: number;
    /** Maximum output tokens */
    maxTokens?: number;
    /** 
     * Generation mode:
     * - 'strict': Use json_schema response format (recommended)
     * - 'json_object': Use JSON mode + local validation
     */
    mode?: GenerateObjectMode;
    /** Abort signal */
    abortSignal?: AbortSignal;
}

/** Result from generateObject */
export interface GenerateObjectResult<T> {
    /** Validated object */
    object: T;
    /** Raw LLM response text */
    raw: string;
    /** Token usage */
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    /** Finish reason */
    finishReason: string | null;
}

// ============================================================================
// Zod Type (for type-only import)
// ============================================================================

/** Minimal Zod schema interface */
interface ZodSchema<T = unknown> {
    parse: (data: unknown) => T;
    safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: ZodError };
    _def?: {
        typeName?: string;
    };
}

/** Zod error interface */
interface ZodError {
    errors: Array<{
        path: (string | number)[];
        message: string;
    }>;
}

// ============================================================================
// JSON Schema Conversion
// ============================================================================

/** Cached zodToJsonSchema function from zod-to-json-schema package */
let cachedZodToJsonSchema: ((schema: ZodSchema) => Record<string, unknown>) | null = null;
let loadAttempted = false;

/**
 * Convert Zod schema to JSON Schema.
 * Uses zod-to-json-schema package if available, otherwise falls back to simplified version.
 */
async function zodToJsonSchemaAsync(schema: ZodSchema): Promise<Record<string, unknown>> {
    // Try to load zod-to-json-schema package dynamically
    if (!loadAttempted) {
        loadAttempted = true;
        try {
            const zodToJsonSchemaModule = await import('zod-to-json-schema');
            cachedZodToJsonSchema = zodToJsonSchemaModule.zodToJsonSchema as any;
        } catch {
            // Package not installed, will use fallback
            cachedZodToJsonSchema = null;
        }
    }

    // Use real converter if available
    if (cachedZodToJsonSchema) {
        const result = cachedZodToJsonSchema(schema);
        // Remove $schema and name for API compatibility
        const { $schema, ...rest } = result as any;
        return rest;
    }

    // Fallback: Parse Zod schema structure manually
    return parseZodSchemaToJsonSchema(schema);
}

/**
 * Fallback Zod to JSON Schema parser.
 * Handles common Zod types when zod-to-json-schema is not installed.
 */
function parseZodSchemaToJsonSchema(schema: ZodSchema): Record<string, unknown> {
    const def = (schema as any)._def;
    if (!def) {
        return { type: 'object' };
    }

    const typeName = def.typeName as string;

    switch (typeName) {
        case 'ZodObject': {
            const shape = def.shape?.();
            const properties: Record<string, unknown> = {};
            const required: string[] = [];

            if (shape) {
                for (const [key, value] of Object.entries(shape)) {
                    properties[key] = parseZodSchemaToJsonSchema(value as ZodSchema);
                    // Check if optional
                    const valueDef = (value as any)?._def;
                    if (valueDef?.typeName !== 'ZodOptional' && valueDef?.typeName !== 'ZodNullable') {
                        required.push(key);
                    }
                }
            }

            return {
                type: 'object',
                properties,
                required: required.length > 0 ? required : undefined,
                additionalProperties: false,
            };
        }
        case 'ZodString':
            return { type: 'string' };
        case 'ZodNumber':
            return { type: 'number' };
        case 'ZodBoolean':
            return { type: 'boolean' };
        case 'ZodArray':
            return {
                type: 'array',
                items: def.type ? parseZodSchemaToJsonSchema(def.type) : {},
            };
        case 'ZodOptional':
        case 'ZodNullable':
            return def.innerType ? parseZodSchemaToJsonSchema(def.innerType) : {};
        case 'ZodEnum':
            return { type: 'string', enum: def.values };
        case 'ZodLiteral':
            return { const: def.value };
        default:
            return { type: 'object' };
    }
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate a structured object from LLM with schema validation.
 * 
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { generateObject } from '@bowenqt/qiniu-ai-sdk';
 * 
 * const schema = z.object({
 *   name: z.string(),
 *   age: z.number(),
 * });
 * 
 * const result = await generateObject({
 *   client,
 *   model: 'gemini-2.5-flash',
 *   schema,
 *   prompt: 'Extract user info from: John is 30 years old.',
 * });
 * 
 * console.log(result.object); // { name: 'John', age: 30 }
 * ```
 */
export async function generateObject<T>(
    options: GenerateObjectOptions<T>,
): Promise<GenerateObjectResult<T>> {
    const {
        client,
        model,
        schema,
        prompt,
        messages: inputMessages,
        system,
        temperature,
        topP,
        maxTokens,
        mode = 'strict',
        abortSignal,
    } = options;

    // Build messages
    const messages: ChatMessage[] = [];

    if (system) {
        messages.push({ role: 'system', content: system });
    }

    if (inputMessages) {
        messages.push(...inputMessages);
    }

    if (prompt) {
        messages.push({ role: 'user', content: prompt });
    }

    if (messages.length === 0) {
        throw new Error('generateObject requires at least prompt or messages');
    }

    // Build response format based on mode
    let responseFormat: ResponseFormat;

    if (mode === 'strict') {
        // Use strict json_schema mode
        const jsonSchema = await zodToJsonSchemaAsync(schema);
        responseFormat = {
            type: 'json_schema',
            json_schema: {
                name: 'response',
                strict: true,
                schema: jsonSchema,
            },
        };
    } else {
        // Use json_object mode
        responseFormat = {
            type: 'json_object',
        };
    }

    // Make API call (non-streaming for structured output)
    const response = await client.chat.create({
        model,
        messages,
        response_format: responseFormat,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
    }, {
        signal: abortSignal,
    });

    // Extract content
    const rawContent = response.choices?.[0]?.message?.content;
    const raw = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent ?? '');
    const finishReason = response.choices?.[0]?.finish_reason ?? null;
    const usage = response.usage;

    // Parse JSON
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new StructuredOutputError(
            'Failed to parse LLM response as JSON',
            raw,
            [{ path: [], message: 'Invalid JSON' }],
        );
    }

    // Validate with Zod schema
    const result = schema.safeParse(parsed);

    if (!result.success) {
        const validationErrors: ValidationErrorItem[] = result.error.errors.map(e => ({
            path: e.path,
            message: e.message,
        }));

        throw new StructuredOutputError(
            'Schema validation failed',
            raw,
            validationErrors,
        );
    }

    return {
        object: result.data,
        raw,
        usage,
        finishReason,
    };
}
