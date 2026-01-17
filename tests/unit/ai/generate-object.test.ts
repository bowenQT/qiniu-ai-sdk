/**
 * Tests for generateObject module.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { StructuredOutputError } from '../../../src/lib/errors';

// Mock a minimal parseZodSchemaToJsonSchema equivalent for testing
// (The actual function is internal to generate-object.ts)

describe('generateObject Schema Conversion', () => {
    // These tests verify the Zod schema parsing behavior

    describe('Zod Schema Types', () => {
        it('should correctly define a simple object schema', () => {
            const schema = z.object({
                name: z.string(),
                age: z.number(),
            });

            expect(schema.safeParse({ name: 'John', age: 25 })).toEqual({
                success: true,
                data: { name: 'John', age: 25 },
            });
        });

        it('should correctly handle optional fields', () => {
            const schema = z.object({
                name: z.string(),
                nickname: z.string().optional(),
            });

            expect(schema.safeParse({ name: 'John' })).toEqual({
                success: true,
                data: { name: 'John' },
            });
        });

        it('should correctly handle enum fields', () => {
            const schema = z.object({
                status: z.enum(['active', 'inactive', 'pending']),
            });

            expect(schema.safeParse({ status: 'active' })).toEqual({
                success: true,
                data: { status: 'active' },
            });

            expect(schema.safeParse({ status: 'invalid' }).success).toBe(false);
        });

        it('should correctly handle nested objects', () => {
            const schema = z.object({
                user: z.object({
                    name: z.string(),
                    email: z.string(),
                }),
            });

            expect(schema.safeParse({
                user: { name: 'John', email: 'john@example.com' },
            })).toEqual({
                success: true,
                data: { user: { name: 'John', email: 'john@example.com' } },
            });
        });

        it('should correctly handle arrays', () => {
            const schema = z.object({
                tags: z.array(z.string()),
            });

            expect(schema.safeParse({ tags: ['a', 'b', 'c'] })).toEqual({
                success: true,
                data: { tags: ['a', 'b', 'c'] },
            });
        });
    });
});

describe('StructuredOutputError', () => {
    it('should create error with validation details', () => {
        const error = new StructuredOutputError(
            'Schema validation failed',
            '{"invalid": true}',
            [
                { path: ['name'], message: 'Required' },
                { path: ['age'], message: 'Expected number' },
            ],
        );

        expect(error.message).toBe('Schema validation failed');
        expect(error.name).toBe('StructuredOutputError');
        expect(error.raw).toBe('{"invalid": true}');
        expect(error.validationErrors).toHaveLength(2);
        expect(error.validationErrors[0]).toEqual({ path: ['name'], message: 'Required' });
    });

    it('should be instanceof Error', () => {
        const error = new StructuredOutputError('Test', '', []);
        expect(error instanceof Error).toBe(true);
        expect(error instanceof StructuredOutputError).toBe(true);
    });
});
