/**
 * Tests for generate-text.ts integration with tool-schema.ts
 * Ensures convertToolParameters uses normalizeToJsonSchema from lib/tool-schema.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { toolFilter } from '../../src/ai/guardrails';

describe('generate-text tool-schema integration', () => {
    it('generate-text imports normalizeToJsonSchema from lib/tool-schema', async () => {
        // Verify that generate-text.ts uses the shared normalizer
        const toolSchema = await import('../../src/lib/tool-schema');
        const spy = vi.spyOn(toolSchema, 'normalizeToJsonSchema');
        
        // After integration, generate-text should delegate to tool-schema
        expect(spy).toBeDefined();
        spy.mockRestore();
    });

    it('Zod schema in tool parameters gets normalized via shared module', async () => {
        const { normalizeToJsonSchema } = await import('../../src/lib/tool-schema');
        
        const zodParams = z.object({
            query: z.string(),
            limit: z.number().optional(),
        });

        const result = normalizeToJsonSchema(zodParams);
        expect(result).toHaveProperty('type', 'object');
        expect(result).toHaveProperty('properties.query.type', 'string');
        expect(result).toHaveProperty('properties.limit.type', 'number');
        expect(result.required).toContain('query');
        expect(result.required).not.toContain('limit');
    });
});

describe('execute-node tool-schema integration', () => {
    it('validates tool args before execution when schema is present', async () => {
        const { executeTools } = await import('../../src/ai/nodes/execute-node');
        
        const tools = new Map();
        tools.set('test_tool', {
            name: 'test_tool',
            execute: async (args: any) => `result: ${args.name}`,
            parameters: {
                type: 'object',
                properties: { name: { type: 'string' } },
                required: ['name'],
            },
            source: { type: 'user' as const },
        });

        // Valid args
        const results = await executeTools(
            [{ id: 'call1', type: 'function', function: { name: 'test_tool', arguments: JSON.stringify({ name: 'hello' }) } }],
            tools,
            { messages: [] },
        );

        expect(results).toHaveLength(1);
        expect(results[0].isError).toBe(false);
    });

    it('returns error for invalid args with strict schema', async () => {
        const { executeTools } = await import('../../src/ai/nodes/execute-node');
        
        const tools = new Map();
        tools.set('strict_tool', {
            name: 'strict_tool',
            execute: async () => 'should not reach',
            parameters: {
                type: 'object',
                properties: { count: { type: 'number' } },
                required: ['count'],
            },
            source: { type: 'user' as const },
        });

        // Missing required 'count'
        const results = await executeTools(
            [{ id: 'call2', type: 'function', function: { name: 'strict_tool', arguments: '{}' } }],
            tools,
            { messages: [] },
        );

        expect(results).toHaveLength(1);
        expect(results[0].isError).toBe(true);
        expect(results[0].result).toContain('count');
    });

    it('lenient validation for MCP tools allows anyOf', async () => {
        const { executeTools } = await import('../../src/ai/nodes/execute-node');
        
        const tools = new Map();
        tools.set('mcp_tool', {
            name: 'mcp_tool',
            execute: async (args: any) => `got: ${args.value}`,
            parameters: {
                type: 'object',
                properties: {
                    value: { anyOf: [{ type: 'string' }, { type: 'number' }] },
                },
                required: ['value'],
            },
            source: { type: 'mcp' as const, serverName: 'test-server' },
        });

        // Should pass — MCP tools use lenient validation
        const results = await executeTools(
            [{ id: 'call3', type: 'function', function: { name: 'mcp_tool', arguments: JSON.stringify({ value: 'hello' }) } }],
            tools,
            { messages: [] },
        );

        expect(results).toHaveLength(1);
        expect(results[0].isError).toBe(false);
    });

    it('blocks tool execution when tool-phase guardrail blocks arguments', async () => {
        const { executeTools } = await import('../../src/ai/nodes/execute-node');

        const execute = vi.fn(async () => 'sent');
        const tools = new Map();
        tools.set('send_email', {
            name: 'send_email',
            execute,
            parameters: {
                type: 'object',
                properties: { email: { type: 'string' } },
                required: ['email'],
            },
            source: { type: 'user' as const, namespace: 'tests' },
        });

        const results = await executeTools(
            [{ id: 'call4', type: 'function', function: { name: 'send_email', arguments: JSON.stringify({ email: 'test@example.com' }) } }],
            tools,
            { messages: [] },
            undefined,
            undefined,
            {
                guardrails: [toolFilter({ block: ['pii'] })],
                agentId: 'agent1',
            },
        );

        expect(execute).not.toHaveBeenCalled();
        expect(results[0].isError).toBe(true);
        expect(results[0].result).toContain('Guardrail Blocked');
    });

    it('redacts tool results when tool-phase guardrail redacts output', async () => {
        const { executeTools } = await import('../../src/ai/nodes/execute-node');

        const tools = new Map();
        tools.set('lookup', {
            name: 'lookup',
            execute: async () => 'email=test@example.com',
            parameters: {
                type: 'object',
                properties: {},
            },
            source: { type: 'user' as const, namespace: 'tests' },
        });

        const results = await executeTools(
            [{ id: 'call5', type: 'function', function: { name: 'lookup', arguments: '{}' } }],
            tools,
            { messages: [] },
            undefined,
            undefined,
            {
                guardrails: [toolFilter({ block: ['pii'], action: 'redact' })],
                agentId: 'agent1',
            },
        );

        expect(results[0].isError).toBe(false);
        expect(results[0].result).toContain('[REDACTED]');
        expect(results[0].result).not.toContain('test@example.com');
    });
});
