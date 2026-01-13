import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { tool, zodToJsonSchema } from '../../../src/ai-tools';

describe('ai-tools', () => {
    it('tool should return definition', () => {
        const definition = tool({
            description: 'Test tool',
            parameters: { type: 'object', properties: {} },
        });

        expect(definition.description).toBe('Test tool');
    });

    it('zodToJsonSchema should convert basic objects', () => {
        const schema = z.object({
            name: z.string(),
            age: z.number().optional(),
        });

        const jsonSchema = zodToJsonSchema(schema);
        expect(jsonSchema).toEqual({
            type: 'object',
            properties: {
                name: { type: 'string' },
                age: { type: 'number' },
            },
            required: ['name'],
        });
    });
});
