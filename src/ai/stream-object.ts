/**
 * streamObject - Stream structured output with incremental parsing.
 * Bypasses predict-node to enable streaming with JSON schema.
 * 
 * @example
 * ```typescript
 * import { streamObject } from '@bowenqt/qiniu-ai-sdk';
 * import { z } from 'zod';
 * 
 * const { partialObjectStream, object } = await streamObject({
 *     client,
 *     model: 'gemini-2.5-flash',
 *     schema: z.object({
 *         title: z.string(),
 *         chapters: z.array(z.object({
 *             title: z.string(),
 *             content: z.string(),
 *         })),
 *     }),
 *     prompt: 'Generate a book outline about AI',
 * });
 * 
 * // Stream partial objects
 * for await (const partial of partialObjectStream) {
 *     console.log(partial);
 * }
 * 
 * // Get final validated object
 * const result = await object;
 * ```
 */

import type { QiniuAI } from '../client';
import type { ChatMessage, ResponseFormat } from '../lib/types';
import { StructuredOutputError, type ValidationErrorItem } from '../lib/errors';
import { PartialJsonParser } from '../lib/partial-json-parser';
import { capabilityCache } from '../lib/capability-cache';
import { generateObject, type GenerateObjectResult } from './generate-object';
import { normalizeContent } from '../lib/content-converter';

// ============================================================================
// Types
// ============================================================================

/** Options for streamObject */
export interface StreamObjectOptions<T> {
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
    /** Abort signal */
    abortSignal?: AbortSignal;
    /** 
     * Allow fallback to non-streaming if API doesn't support streaming JSON.
     * Default: false (will throw if streaming not supported)
     */
    allowFallback?: boolean;
}

/** Result from streamObject */
export interface StreamObjectResult<T> {
    /** Async iterator of partial objects */
    partialObjectStream: AsyncIterable<DeepPartial<T>>;
    /** Promise resolving to final validated object */
    object: Promise<T>;
    /** Promise resolving to raw text */
    rawText: Promise<string>;
    /** Promise resolving to usage info */
    usage: Promise<{
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    } | undefined>;
    /** Whether streaming was used (false if fell back to non-streaming) */
    streamed: boolean;
}

/** Deep partial type for partial objects */
export type DeepPartial<T> = T extends object
    ? { [P in keyof T]?: DeepPartial<T[P]> }
    : T;

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
// JSON Schema Conversion (reuse from generate-object)
// ============================================================================

// Dynamic import cache for zod-to-json-schema
let loadAttempted = false;
let cachedZodToJsonSchema: ((schema: ZodSchema) => Record<string, unknown>) | null = null;

async function zodToJsonSchemaAsync(schema: ZodSchema): Promise<Record<string, unknown>> {
    if (!loadAttempted) {
        loadAttempted = true;
        try {
            const zodToJsonSchemaModule = await import('zod-to-json-schema');
            cachedZodToJsonSchema = zodToJsonSchemaModule.zodToJsonSchema as any;
        } catch {
            cachedZodToJsonSchema = null;
        }
    }

    if (cachedZodToJsonSchema) {
        const result = cachedZodToJsonSchema(schema);
        const { $schema, ...rest } = result as any;
        return rest;
    }

    return parseZodSchemaToJsonSchema(schema);
}

function parseZodSchemaToJsonSchema(schema: ZodSchema): Record<string, unknown> {
    const def = (schema as any)._def;
    if (!def) {
        return { type: 'object' };
    }

    const typeName = def.typeName;
    switch (typeName) {
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
        case 'ZodObject': {
            const shape = def.shape?.() ?? {};
            const properties: Record<string, unknown> = {};
            const required: string[] = [];

            for (const [key, value] of Object.entries(shape)) {
                properties[key] = parseZodSchemaToJsonSchema(value as ZodSchema);
                const innerDef = (value as any)?._def;
                if (innerDef?.typeName !== 'ZodOptional') {
                    required.push(key);
                }
            }

            return {
                type: 'object',
                properties,
                ...(required.length > 0 ? { required } : {}),
            };
        }
        default:
            return { type: 'object' };
    }
}

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Check if error indicates unsupported streaming format.
 */
function isUnsupportedStreamError(error: unknown): boolean {
    // Check error code
    const code = (error as any)?.code;
    if (code === 'UNSUPPORTED_STREAM_FORMAT' ||
        code === 'INVALID_RESPONSE_FORMAT' ||
        code === 'unsupported_response_format') {
        return true;
    }

    // Check HTTP status
    const status = (error as any)?.status;
    if (status === 400 || status === 422) {
        const message = String((error as any)?.message ?? '').toLowerCase();
        if (message.includes('stream') ||
            message.includes('response_format') ||
            message.includes('json_schema')) {
            return true;
        }
    }

    return false;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Stream structured output with JSON schema validation.
 */
export async function streamObject<T>(
    options: StreamObjectOptions<T>
): Promise<StreamObjectResult<T>> {
    const { client, model, schema, allowFallback = false } = options;

    // Check capability cache
    if (capabilityCache.isNotSupported(client as any, model, 'stream_json_schema')) {
        if (allowFallback) {
            return createFallbackResult(options);
        }
        throw new Error(`Model ${model} does not support streaming JSON schema. Set allowFallback: true to use non-streaming.`);
    }

    // Try streaming
    try {
        return await streamObjectInternal(options);
    } catch (error) {
        if (isUnsupportedStreamError(error)) {
            // Cache the failure
            capabilityCache.set(client as any, model, 'stream_json_schema', false);

            if (allowFallback) {
                console.warn('streamObject: API does not support streaming JSON schema, falling back to non-streaming');
                return createFallbackResult(options);
            }
        }
        throw error;
    }
}

/**
 * Internal streaming implementation.
 */
async function streamObjectInternal<T>(
    options: StreamObjectOptions<T>
): Promise<StreamObjectResult<T>> {
    const { client, model, schema, prompt, messages, system, temperature, topP, maxTokens, abortSignal } = options;

    // Build messages
    const apiMessages: ChatMessage[] = [];

    if (system) {
        apiMessages.push({ role: 'system', content: system });
    }

    if (messages) {
        apiMessages.push(...messages);
    }

    if (prompt) {
        apiMessages.push({ role: 'user', content: prompt });
    }

    // Convert schema to JSON Schema
    const jsonSchema = await zodToJsonSchemaAsync(schema);

    // Build response format
    const responseFormat: ResponseFormat = {
        type: 'json_schema',
        json_schema: {
            name: 'response',
            strict: true,
            schema: jsonSchema,
        },
    };

    // Normalize multimodal content (image -> image_url) for API compatibility
    const normalizedMessages = apiMessages.map(msg => ({
        ...msg,
        content: normalizeContent(msg.content),
    }));

    // Create streaming request - bypass predict-node, go directly to client
    const response = await client.chat.createStream({
        model,
        messages: normalizedMessages,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        response_format: responseFormat,
    }, { signal: abortSignal });

    // NOTE: capabilityCache is set AFTER stream completes successfully (in background consumer)

    // Create parser and state
    const parser = new PartialJsonParser();
    let rawText = '';
    let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
    let resolveObject!: (value: T) => void;
    let rejectObject!: (error: Error) => void;
    let resolveRaw!: (value: string) => void;
    let resolveUsage!: (value: typeof usage) => void;

    const objectPromise = new Promise<T>((resolve, reject) => {
        resolveObject = resolve;
        rejectObject = reject;
    });

    const rawTextPromise = new Promise<string>((resolve) => {
        resolveRaw = resolve;
    });

    const usagePromise = new Promise<typeof usage>((resolve) => {
        resolveUsage = resolve;
    });

    // Shared state for background consumer and partial stream
    const partialValues: DeepPartial<T>[] = [];
    let streamComplete = false;
    let streamError: Error | null = null;
    const waiters: Array<{ resolve: (done: boolean) => void }> = [];

    // Background consumer - ensures object resolves even if partialObjectStream is not iterated
    const backgroundConsumer = (async () => {
        try {
            for await (const chunk of response) {
                const delta = chunk.choices?.[0]?.delta?.content ?? '';
                if (delta) {
                    rawText += delta;
                    parser.append(delta);

                    // Try to parse partial object
                    const result = parser.parsePartial<T>();
                    if (result.value !== null) {
                        partialValues.push(result.value as DeepPartial<T>);
                        // Wake up any waiting iterators
                        while (waiters.length > 0) {
                            waiters.shift()!.resolve(false);
                        }
                    }
                }

                // Capture usage from final chunk
                if (chunk.usage) {
                    usage = chunk.usage;
                }
            }

            // Stream complete - cache success
            capabilityCache.set(client as any, model, 'stream_json_schema', true);

            // Resolve final values
            streamComplete = true;
            resolveRaw(rawText);
            resolveUsage(usage);

            // Validate final object
            try {
                const parseResult = schema.safeParse(JSON.parse(rawText));
                if (parseResult.success) {
                    resolveObject(parseResult.data);
                } else {
                    const validationErrors: ValidationErrorItem[] = parseResult.error.errors.map(e => ({
                        path: e.path.map(String),
                        message: e.message,
                    }));
                    const error = new StructuredOutputError('Validation failed', rawText, validationErrors);
                    streamError = error; // Ensure partialObjectStream also throws
                    rejectObject(error);
                }
            } catch (e) {
                const error = e instanceof Error ? e : new Error(String(e));
                streamError = error; // Ensure partialObjectStream also throws
                rejectObject(error);
            }

            // Wake up any waiting iterators
            while (waiters.length > 0) {
                waiters.shift()!.resolve(true);
            }
        } catch (error) {
            streamError = error instanceof Error ? error : new Error(String(error));
            streamComplete = true;
            resolveRaw(rawText);
            resolveUsage(usage);
            rejectObject(streamError);
            // Wake up any waiting iterators
            while (waiters.length > 0) {
                waiters.shift()!.resolve(true);
            }
        }
    })();

    // Create async generator for partial objects (consumes from shared state)
    async function* generatePartials(): AsyncIterable<DeepPartial<T>> {
        let yieldedCount = 0;

        while (true) {
            // Yield any new partial values
            while (yieldedCount < partialValues.length) {
                yield partialValues[yieldedCount++];
            }

            // Check if stream is complete
            if (streamComplete) {
                if (streamError) throw streamError;
                break;
            }

            // Wait for more data
            await new Promise<boolean>((resolve) => {
                waiters.push({ resolve });
            });
        }
    }

    return {
        partialObjectStream: generatePartials(),
        object: objectPromise,
        rawText: rawTextPromise,
        usage: usagePromise,
        streamed: true,
    };
}

/**
 * Create fallback result using non-streaming generateObject.
 */
async function createFallbackResult<T>(
    options: StreamObjectOptions<T>
): Promise<StreamObjectResult<T>> {
    // Use generateObject (non-streaming)
    const result = await generateObject({
        client: options.client,
        model: options.model,
        schema: options.schema,
        prompt: options.prompt,
        messages: options.messages,
        system: options.system,
        temperature: options.temperature,
        topP: options.topP,
        maxTokens: options.maxTokens,
        mode: 'strict',
        abortSignal: options.abortSignal,
    });

    // Create single-yield async iterable
    async function* singleYield(): AsyncIterable<DeepPartial<T>> {
        yield result.object as DeepPartial<T>;
    }

    return {
        partialObjectStream: singleYield(),
        object: Promise.resolve(result.object),
        rawText: Promise.resolve(result.raw),
        usage: Promise.resolve(result.usage),
        streamed: false,
    };
}
