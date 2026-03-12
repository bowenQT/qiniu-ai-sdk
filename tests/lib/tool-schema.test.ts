import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('tool-schema', () => {
    // =========================================================================
    // normalizeToJsonSchema
    // =========================================================================
    describe('normalizeToJsonSchema', () => {
        it('passes through plain JSON Schema objects unchanged', async () => {
            const { normalizeToJsonSchema } = await import('../../src/lib/tool-schema');
            const schema = {
                type: 'object',
                properties: { name: { type: 'string' } },
                required: ['name'],
            };
            expect(normalizeToJsonSchema(schema)).toEqual(schema);
        });

        it('converts a Zod schema to JSON Schema', async () => {
            const { normalizeToJsonSchema } = await import('../../src/lib/tool-schema');
            const zodSchema = z.object({
                name: z.string(),
                age: z.number().optional(),
            });
            const result = normalizeToJsonSchema(zodSchema);
            expect(result).toHaveProperty('type', 'object');
            expect(result).toHaveProperty('properties.name.type', 'string');
            expect(result).toHaveProperty('properties.age.type', 'number');
            expect(result.required).toContain('name');
            expect(result.required).not.toContain('age');
        });

        it('returns empty object for null/undefined', async () => {
            const { normalizeToJsonSchema } = await import('../../src/lib/tool-schema');
            expect(normalizeToJsonSchema(null)).toEqual({});
            expect(normalizeToJsonSchema(undefined)).toEqual({});
        });
    });

    // =========================================================================
    // validateToolArgs — strict mode
    // =========================================================================
    describe('validateToolArgs strict mode', () => {
        it('passes valid args', async () => {
            const { validateToolArgs } = await import('../../src/lib/tool-schema');
            const schema = {
                type: 'object',
                properties: { name: { type: 'string' } },
                required: ['name'],
            };
            const result = validateToolArgs({ name: 'hello' }, schema, 'strict');
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('rejects missing required field', async () => {
            const { validateToolArgs } = await import('../../src/lib/tool-schema');
            const schema = {
                type: 'object',
                properties: { name: { type: 'string' } },
                required: ['name'],
            };
            const result = validateToolArgs({}, schema, 'strict');
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('rejects wrong type', async () => {
            const { validateToolArgs } = await import('../../src/lib/tool-schema');
            const schema = {
                type: 'object',
                properties: { count: { type: 'number' } },
            };
            const result = validateToolArgs({ count: 'not-a-number' }, schema, 'strict');
            expect(result.valid).toBe(false);
        });

        it('throws RecoverableError for anyOf in strict mode', async () => {
            const { validateToolArgs } = await import('../../src/lib/tool-schema');
            const schema = {
                type: 'object',
                properties: {
                    value: { anyOf: [{ type: 'string' }, { type: 'number' }] },
                },
            };
            // strict mode should throw on unsupported keywords
            expect(() => validateToolArgs({ value: 'hello' }, schema, 'strict')).toThrow();
        });
    });

    // =========================================================================
    // validateToolArgs — lenient mode
    // =========================================================================
    describe('validateToolArgs lenient mode', () => {
        it('passes valid args', async () => {
            const { validateToolArgs } = await import('../../src/lib/tool-schema');
            const schema = {
                type: 'object',
                properties: { name: { type: 'string' } },
                required: ['name'],
            };
            const result = validateToolArgs({ name: 'hello' }, schema, 'lenient');
            expect(result.valid).toBe(true);
        });

        it('rejects missing required field even in lenient mode', async () => {
            const { validateToolArgs } = await import('../../src/lib/tool-schema');
            const schema = {
                type: 'object',
                properties: { name: { type: 'string' } },
                required: ['name'],
            };
            const result = validateToolArgs({}, schema, 'lenient');
            expect(result.valid).toBe(false);
        });

        it('allows schema with anyOf without throwing', async () => {
            const { validateToolArgs } = await import('../../src/lib/tool-schema');
            const schema = {
                type: 'object',
                properties: {
                    value: { anyOf: [{ type: 'string' }, { type: 'number' }] },
                },
                required: ['value'],
            };
            // lenient skips advanced keywords, only checks required + type
            const result = validateToolArgs({ value: 'hello' }, schema, 'lenient');
            expect(result.valid).toBe(true);
        });

        it('allows schema with $ref without throwing', async () => {
            const { validateToolArgs } = await import('../../src/lib/tool-schema');
            const schema = {
                type: 'object',
                properties: {
                    ref: { $ref: '#/definitions/Thing' },
                },
            };
            const result = validateToolArgs({ ref: {} }, schema, 'lenient');
            expect(result.valid).toBe(true);
        });
    });
});
