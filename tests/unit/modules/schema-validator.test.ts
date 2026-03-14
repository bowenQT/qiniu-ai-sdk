import { describe, it, expect } from 'vitest';
import {
    validateAgainstSchema,
    createToolValidator,
    SUPPORTED_KEYWORDS,
    UNSUPPORTED_KEYWORDS,
    type JsonSchema,
} from '../../../src/lib/mcp-schema-validator';
import { RecoverableError } from '../../../src/lib/errors';

describe('validateAgainstSchema', () => {
    describe('Type Validation', () => {
        it('should validate string type', () => {
            const schema: JsonSchema = { type: 'string' };
            expect(validateAgainstSchema('hello', schema).valid).toBe(true);
            expect(validateAgainstSchema(123, schema).valid).toBe(false);
        });

        it('should validate number type', () => {
            const schema: JsonSchema = { type: 'number' };
            expect(validateAgainstSchema(42, schema).valid).toBe(true);
            expect(validateAgainstSchema(3.14, schema).valid).toBe(true);
            expect(validateAgainstSchema('42', schema).valid).toBe(false);
        });

        it('should validate integer type', () => {
            const schema: JsonSchema = { type: 'integer' };
            expect(validateAgainstSchema(42, schema).valid).toBe(true);
            expect(validateAgainstSchema(3.14, schema).valid).toBe(false);
        });

        it('should validate boolean type', () => {
            const schema: JsonSchema = { type: 'boolean' };
            expect(validateAgainstSchema(true, schema).valid).toBe(true);
            expect(validateAgainstSchema(false, schema).valid).toBe(true);
            expect(validateAgainstSchema('true', schema).valid).toBe(false);
        });

        it('should validate object type', () => {
            const schema: JsonSchema = { type: 'object' };
            expect(validateAgainstSchema({}, schema).valid).toBe(true);
            expect(validateAgainstSchema({ key: 'value' }, schema).valid).toBe(true);
            expect(validateAgainstSchema([], schema).valid).toBe(false);
        });

        it('should validate array type', () => {
            const schema: JsonSchema = { type: 'array' };
            expect(validateAgainstSchema([], schema).valid).toBe(true);
            expect(validateAgainstSchema([1, 2, 3], schema).valid).toBe(true);
            expect(validateAgainstSchema({}, schema).valid).toBe(false);
        });

        it('should validate null type', () => {
            const schema: JsonSchema = { type: 'null' };
            expect(validateAgainstSchema(null, schema).valid).toBe(true);
            expect(validateAgainstSchema(undefined, schema).valid).toBe(false);
        });
    });

    describe('Object Properties Validation', () => {
        it('should validate required properties', () => {
            const schema: JsonSchema = {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    age: { type: 'number' },
                },
                required: ['name'],
            };

            expect(validateAgainstSchema({ name: 'Alice', age: 30 }, schema).valid).toBe(true);
            expect(validateAgainstSchema({ name: 'Bob' }, schema).valid).toBe(true);

            const missingRequired = validateAgainstSchema({ age: 25 }, schema);
            expect(missingRequired.valid).toBe(false);
            // Path format includes leading dot
            expect(missingRequired.errors[0].path).toContain('name');
        });

        it('should validate nested object properties', () => {
            const schema: JsonSchema = {
                type: 'object',
                properties: {
                    user: {
                        type: 'object',
                        properties: {
                            email: { type: 'string' },
                        },
                        required: ['email'],
                    },
                },
            };

            expect(validateAgainstSchema({ user: { email: 'test@example.com' } }, schema).valid).toBe(true);

            const invalid = validateAgainstSchema({ user: {} }, schema);
            expect(invalid.valid).toBe(false);
        });
    });

    describe('Enum Validation', () => {
        it('should validate enum values', () => {
            const schema: JsonSchema = {
                type: 'string',
                enum: ['red', 'green', 'blue'],
            };

            expect(validateAgainstSchema('red', schema).valid).toBe(true);
            expect(validateAgainstSchema('green', schema).valid).toBe(true);

            const invalid = validateAgainstSchema('yellow', schema);
            expect(invalid.valid).toBe(false);
        });
    });

    describe('String Constraints', () => {
        it('should validate minLength', () => {
            const schema: JsonSchema = { type: 'string', minLength: 3 };
            expect(validateAgainstSchema('abc', schema).valid).toBe(true);
            expect(validateAgainstSchema('ab', schema).valid).toBe(false);
        });

        it('should validate maxLength', () => {
            const schema: JsonSchema = { type: 'string', maxLength: 5 };
            expect(validateAgainstSchema('hello', schema).valid).toBe(true);
            expect(validateAgainstSchema('hello!', schema).valid).toBe(false);
        });
    });

    describe('Number Constraints', () => {
        it('should validate minimum', () => {
            const schema: JsonSchema = { type: 'number', minimum: 0 };
            expect(validateAgainstSchema(0, schema).valid).toBe(true);
            expect(validateAgainstSchema(10, schema).valid).toBe(true);
            expect(validateAgainstSchema(-1, schema).valid).toBe(false);
        });

        it('should validate maximum', () => {
            const schema: JsonSchema = { type: 'number', maximum: 100 };
            expect(validateAgainstSchema(100, schema).valid).toBe(true);
            expect(validateAgainstSchema(101, schema).valid).toBe(false);
        });
    });

    describe('Array Constraints', () => {
        it('should validate items schema', () => {
            const schema: JsonSchema = {
                type: 'array',
                items: { type: 'number' },
            };

            expect(validateAgainstSchema([1, 2, 3], schema).valid).toBe(true);
            expect(validateAgainstSchema([1, 'two', 3], schema).valid).toBe(false);
        });

        // minItems/maxItems are in UNSUPPORTED_KEYWORDS - test they throw
        it('should throw RecoverableError for minItems (unsupported)', () => {
            const schema: JsonSchema = { type: 'array', minItems: 2 } as unknown as JsonSchema;
            expect(() => validateAgainstSchema([1, 2], schema)).toThrow(RecoverableError);
        });

        it('should throw RecoverableError for maxItems (unsupported)', () => {
            const schema: JsonSchema = { type: 'array', maxItems: 3 } as unknown as JsonSchema;
            expect(() => validateAgainstSchema([1, 2, 3], schema)).toThrow(RecoverableError);
        });
    });

    describe('Nullable', () => {
        it('should allow null when nullable is true', () => {
            const schema: JsonSchema = { type: 'string', nullable: true };
            expect(validateAgainstSchema(null, schema).valid).toBe(true);
            expect(validateAgainstSchema('hello', schema).valid).toBe(true);
        });

        it('should reject null when nullable is false or absent', () => {
            const schema: JsonSchema = { type: 'string' };
            expect(validateAgainstSchema(null, schema).valid).toBe(false);
        });
    });

    describe('Unsupported Keywords Detection', () => {
        it('should throw RecoverableError for additionalProperties', () => {
            const schema = {
                type: 'object',
                properties: { name: { type: 'string' } },
                additionalProperties: false,
            } as unknown as JsonSchema;

            expect(() => validateAgainstSchema({}, schema)).toThrow(RecoverableError);
        });

        it('should throw RecoverableError for allOf', () => {
            const schema = {
                allOf: [{ type: 'object' }],
            } as unknown as JsonSchema;

            expect(() => validateAgainstSchema({}, schema)).toThrow(RecoverableError);
        });

        it('should throw RecoverableError for oneOf', () => {
            const schema = {
                oneOf: [{ type: 'string' }, { type: 'number' }],
            } as unknown as JsonSchema;

            expect(() => validateAgainstSchema('test', schema)).toThrow(RecoverableError);
        });

        it('should throw RecoverableError for $ref', () => {
            const schema = {
                $ref: '#/definitions/User',
            } as unknown as JsonSchema;

            expect(() => validateAgainstSchema({}, schema)).toThrow(RecoverableError);
        });

        it('should throw RecoverableError for pattern', () => {
            const schema = { type: 'string', pattern: '^[a-z]+$' } as unknown as JsonSchema;
            expect(() => validateAgainstSchema('hello', schema)).toThrow(RecoverableError);
        });
    });
});

describe('createToolValidator', () => {
    it('should create a validator function', () => {
        const schema: JsonSchema = {
            type: 'object',
            properties: {
                query: { type: 'string' },
            },
            required: ['query'],
        };

        const validator = createToolValidator(schema, 'search');
        expect(typeof validator).toBe('function');
    });

    it('should pass for valid arguments', () => {
        const schema: JsonSchema = {
            type: 'object',
            properties: {
                url: { type: 'string' },
            },
            required: ['url'],
        };

        const validator = createToolValidator(schema, 'fetch');
        expect(() => validator({ url: 'https://example.com' })).not.toThrow();
    });

    it('should throw RecoverableError for invalid arguments', () => {
        const schema: JsonSchema = {
            type: 'object',
            properties: {
                count: { type: 'number' },
            },
            required: ['count'],
        };

        const validator = createToolValidator(schema, 'process');
        expect(() => validator({})).toThrow(RecoverableError);
    });

    it('should include tool name in error', () => {
        const schema: JsonSchema = {
            type: 'object',
            properties: {},
            required: ['missing'],
        };

        const validator = createToolValidator(schema, 'my-tool');

        try {
            validator({});
            expect.fail('Should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(RecoverableError);
            expect((error as RecoverableError).toolName).toBe('my-tool');
        }
    });
});

describe('Keyword Constants', () => {
    it('should have expected supported keywords', () => {
        expect(SUPPORTED_KEYWORDS.has('type')).toBe(true);
        expect(SUPPORTED_KEYWORDS.has('properties')).toBe(true);
        expect(SUPPORTED_KEYWORDS.has('required')).toBe(true);
        expect(SUPPORTED_KEYWORDS.has('enum')).toBe(true);
        expect(SUPPORTED_KEYWORDS.has('items')).toBe(true);
        expect(SUPPORTED_KEYWORDS.has('nullable')).toBe(true);
    });

    it('should have expected unsupported keywords', () => {
        expect(UNSUPPORTED_KEYWORDS.has('additionalProperties')).toBe(true);
        expect(UNSUPPORTED_KEYWORDS.has('allOf')).toBe(true);
        expect(UNSUPPORTED_KEYWORDS.has('oneOf')).toBe(true);
        expect(UNSUPPORTED_KEYWORDS.has('anyOf')).toBe(true);
        expect(UNSUPPORTED_KEYWORDS.has('$ref')).toBe(true);
        expect(UNSUPPORTED_KEYWORDS.has('pattern')).toBe(true);
        expect(UNSUPPORTED_KEYWORDS.has('minItems')).toBe(true);
        expect(UNSUPPORTED_KEYWORDS.has('maxItems')).toBe(true);
    });
});
