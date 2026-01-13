import type { ZodTypeAny } from 'zod';

export type JsonSchema = {
    type?: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
    enum?: unknown[];
    oneOf?: JsonSchema[];
};

export interface ToolDefinition<PARAMETERS = unknown, RESULT = unknown> {
    description?: string;
    parameters: JsonSchema | ZodTypeAny;
    execute?: (args: PARAMETERS) => Promise<RESULT> | RESULT;
}

export function tool<PARAMETERS, RESULT>(definition: ToolDefinition<PARAMETERS, RESULT>): ToolDefinition<PARAMETERS, RESULT> {
    return definition;
}

export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
    return convertSchema(schema);
}

function convertSchema(schema: ZodTypeAny): JsonSchema {
    const def = (schema as { _def?: { typeName?: string; [key: string]: unknown } })._def;
    const typeName = def?.typeName;

    switch (typeName) {
        case 'ZodString':
            return { type: 'string' };
        case 'ZodNumber':
            return { type: 'number' };
        case 'ZodBoolean':
            return { type: 'boolean' };
        case 'ZodArray':
            return { type: 'array', items: convertSchema((def as { type: ZodTypeAny }).type) };
        case 'ZodEnum':
            return { type: 'string', enum: (def as { values: unknown[] }).values };
        case 'ZodLiteral':
            return literalSchema((def as { value: unknown }).value);
        case 'ZodObject':
            return objectSchema(schema);
        case 'ZodUnion':
            return { oneOf: (def as { options: ZodTypeAny[] }).options.map(convertSchema) };
        case 'ZodOptional':
            return convertSchema((def as { innerType: ZodTypeAny }).innerType);
        case 'ZodNullable':
            return convertSchema((def as { innerType: ZodTypeAny }).innerType);
        case 'ZodDefault':
            return convertSchema((def as { innerType: ZodTypeAny }).innerType);
        default:
            return {};
    }
}

function objectSchema(schema: ZodTypeAny): JsonSchema {
    const def = (schema as { _def?: { shape?: (() => Record<string, ZodTypeAny>) | Record<string, ZodTypeAny> } })._def;
    const shapeSource = def?.shape;
    const shape = typeof shapeSource === 'function' ? shapeSource() : shapeSource || {};

    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
        const { inner, optional } = unwrapOptional(value as ZodTypeAny);
        properties[key] = convertSchema(inner);
        if (!optional) {
            required.push(key);
        }
    }

    const schemaResult: JsonSchema = { type: 'object', properties };
    if (required.length) {
        schemaResult.required = required;
    }

    return schemaResult;
}

function unwrapOptional(schema: ZodTypeAny): { inner: ZodTypeAny; optional: boolean } {
    const def = (schema as { _def?: { typeName?: string; innerType?: ZodTypeAny } })._def;
    if (!def?.typeName) {
        return { inner: schema, optional: false };
    }

    if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') {
        return { inner: def.innerType as ZodTypeAny, optional: true };
    }

    return { inner: schema, optional: false };
}

function literalSchema(value: unknown): JsonSchema {
    const valueType = typeof value;
    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
        return { type: valueType, enum: [value] };
    }

    return { enum: [value] };
}
