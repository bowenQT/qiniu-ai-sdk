import { describe, it, expect, beforeEach } from 'vitest';
import {
    ToolRegistry,
    ToolConflictError,
    type RegisteredTool,
    type ToolSourceType,
} from '../../../src/lib/tool-registry';
import { noopLogger } from '../../../src/lib/logger';

function createTool(
    name: string,
    sourceType: ToolSourceType,
    namespace: string
): RegisteredTool {
    return {
        name,
        description: `${name} tool`,
        parameters: {
            type: 'object',
            properties: { arg: { type: 'string' } },
        },
        source: { type: sourceType, namespace },
    };
}

describe('ToolRegistry', () => {
    let registry: ToolRegistry;

    beforeEach(() => {
        registry = new ToolRegistry({ logger: noopLogger });
    });

    describe('A1: Registration Priority', () => {
        it('should prioritize user > skill > mcp > builtin', () => {
            // Register in reverse priority order
            registry.register(createTool('search', 'builtin', 'core'));
            registry.register(createTool('search', 'mcp', 'github'));
            registry.register(createTool('search', 'skill', 'git-workflow'));
            registry.register(createTool('search', 'user', 'custom'));

            const tool = registry.get('search');
            expect(tool?.source.type).toBe('user');
        });

        it('should use lexical order for same priority', () => {
            const tools = [
                createTool('zebra', 'mcp', 'server1'),
                createTool('alpha', 'mcp', 'server2'),
                createTool('beta', 'mcp', 'server3'),
            ];

            const result = registry.registerAll(tools);
            expect(result.registered).toBe(3);

            const all = registry.getAll();
            const names = all.map(t => t.name);
            expect(names).toEqual(['alpha', 'beta', 'zebra']); // sorted
        });

        it('should support excludeSources', () => {
            registry = new ToolRegistry({
                excludeSources: ['mcp:github'],
                logger: noopLogger,
            });

            const result = registry.register(createTool('issue', 'mcp', 'github'));
            expect(result).toBe(false);
            expect(registry.get('issue')).toBeUndefined();
        });

        it('should match type-only exclusion', () => {
            registry = new ToolRegistry({
                excludeSources: ['mcp'],
                logger: noopLogger,
            });

            expect(registry.register(createTool('tool1', 'mcp', 'server1'))).toBe(false);
            expect(registry.register(createTool('tool2', 'skill', 'workflow'))).toBe(true);
        });
    });

    describe('A2: Conflict Strategy', () => {
        it('should use first-wins by default', () => {
            registry.register(createTool('fetch', 'mcp', 'server1'));
            registry.register(createTool('fetch', 'mcp', 'server2'));

            const tool = registry.get('fetch');
            expect(tool?.source.namespace).toBe('server1');
        });

        it('should throw error with error strategy', () => {
            registry = new ToolRegistry({
                conflictStrategy: 'error',
                logger: noopLogger,
            });

            registry.register(createTool('fetch', 'mcp', 'server1'));

            expect(() => {
                registry.register(createTool('fetch', 'mcp', 'server2'));
            }).toThrow(ToolConflictError);
        });

        it('should allow updating from same source', () => {
            registry.register(createTool('fetch', 'mcp', 'server1'));

            const updated = createTool('fetch', 'mcp', 'server1');
            updated.description = 'Updated description';

            expect(registry.register(updated)).toBe(true);
            expect(registry.get('fetch')?.description).toBe('Updated description');
        });
    });

    describe('A3: Deterministic Registration', () => {
        it('should maintain deterministic order across multiple registrations', () => {
            const tools = [
                createTool('c', 'mcp', 's1'),
                createTool('a', 'mcp', 's2'),
                createTool('b', 'mcp', 's3'),
            ];

            // First registration
            registry.registerAll(tools);
            const first = registry.getAll().map(t => t.name);

            // Clear and re-register
            registry.clear();
            registry.registerAll(tools);
            const second = registry.getAll().map(t => t.name);

            expect(first).toEqual(second);
        });

        it('should produce OpenAI-compatible format', () => {
            registry.register(createTool('search', 'user', 'custom'));

            const openAITools = registry.toOpenAITools();
            expect(openAITools).toHaveLength(1);
            expect(openAITools[0]).toEqual({
                type: 'function',
                function: {
                    name: 'search',
                    description: 'search tool',
                    parameters: {
                        type: 'object',
                        properties: { arg: { type: 'string' } },
                    },
                },
            });
        });
    });
});
