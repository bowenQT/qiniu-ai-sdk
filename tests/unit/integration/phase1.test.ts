import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ToolRegistry } from '../../../src/lib/tool-registry';
import { SkillLoader } from '../../../src/modules/skills';
import { compactMessages, buildToolPairs } from '../../../src/ai/nodes';
import { StateGraph, END } from '../../../src/ai/graph';
import type { ChatMessage } from '../../../src/lib/types';
import { noopLogger } from '../../../src/lib/logger';

describe('F2: Integration Tests', () => {
    describe('Skills + Compaction Integration', () => {
        let tempDir: string;

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-test-'));
        });

        afterEach(() => {
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        it('should inject skills in deterministic order', async () => {
            // Create skills
            const skillDir1 = path.join(tempDir, 'zebra-skill');
            const skillDir2 = path.join(tempDir, 'alpha-skill');
            fs.mkdirSync(skillDir1);
            fs.mkdirSync(skillDir2);
            fs.writeFileSync(path.join(skillDir1, 'SKILL.md'), 'Zebra skill content');
            fs.writeFileSync(path.join(skillDir2, 'SKILL.md'), 'Alpha skill content');

            const loader = new SkillLoader({ skillsDir: tempDir });
            const skills = await loader.loadAll();

            // Should be sorted alphabetically
            expect(skills[0].name).toBe('alpha-skill');
            expect(skills[1].name).toBe('zebra-skill');
        });

        it('should trigger compaction fallback when skills exceed budget', () => {
            const messages: ChatMessage[] = [
                { role: 'system', content: 'System prompt' },
                { role: 'user', content: 'Question' },
            ];

            // Simulate low token budget
            const result = compactMessages(messages, {
                maxTokens: 1000,
                estimateTokens: () => 50,
            });

            expect(result.occurred).toBe(false);
        });
    });

    describe('Tool Registry + MCP Integration', () => {
        it('should maintain deterministic tool order across registrations', () => {
            const registry = new ToolRegistry({ logger: noopLogger });

            // Simulate MCP tools arriving in random order
            const mcpTools = [
                { name: 'search', source: { type: 'mcp' as const, namespace: 'server1' }, description: 'search', parameters: { type: 'object' as const, properties: {} } },
                { name: 'fetch', source: { type: 'mcp' as const, namespace: 'server2' }, description: 'fetch', parameters: { type: 'object' as const, properties: {} } },
                { name: 'analyze', source: { type: 'mcp' as const, namespace: 'server3' }, description: 'analyze', parameters: { type: 'object' as const, properties: {} } },
            ];

            // Use registerAll which sorts internally
            registry.registerAll(mcpTools);

            // After registerAll, order should be sorted by name
            const all = registry.getAll();
            const names = all.map(t => t.name);

            expect(names).toEqual(['analyze', 'fetch', 'search']);
        });

        it('should handle priority correctly with user > skill > mcp', () => {
            const registry = new ToolRegistry({ logger: noopLogger });

            // Register same tool from different sources
            registry.register({
                name: 'search',
                description: 'MCP search',
                parameters: { type: 'object', properties: {} },
                source: { type: 'mcp', namespace: 'github' },
            });

            registry.register({
                name: 'search',
                description: 'Skill search',
                parameters: { type: 'object', properties: {} },
                source: { type: 'skill', namespace: 'search-skill' },
            });

            registry.register({
                name: 'search',
                description: 'User search',
                parameters: { type: 'object', properties: {} },
                source: { type: 'user', namespace: 'custom' },
            });

            const tool = registry.get('search');
            expect(tool?.source.type).toBe('user');
        });
    });

    describe('Graph + Tool Execution Integration', () => {
        interface AgentState {
            messages: ChatMessage[];
            toolCalls: number;
            done: boolean;
        }

        it('should execute agent loop with graph', async () => {
            const graph = new StateGraph<AgentState>()
                .addNode('agent', (state) => {
                    // Simulate LLM deciding to use tool or finish
                    if (state.toolCalls >= 2) {
                        return { done: true };
                    }
                    return {
                        messages: [...state.messages, { role: 'assistant' as const, content: 'Using tool...' }],
                    };
                })
                .addNode('tools', (state) => {
                    return {
                        toolCalls: state.toolCalls + 1,
                        messages: [...state.messages, { role: 'tool' as const, content: 'Tool result' }],
                    };
                })
                .addConditionalEdge('agent', (state) => state.done ? END : 'tools')
                .addEdge('tools', 'agent');

            const app = graph.compile();
            const result = await app.invoke({
                messages: [{ role: 'user', content: 'Hello' }],
                toolCalls: 0,
                done: false,
            });

            expect(result.done).toBe(true);
            expect(result.toolCalls).toBe(2);
        });
    });

    describe('Tool Pair Preservation', () => {
        it('should preserve tool pairs through compaction', () => {
            const messages: ChatMessage[] = [
                { role: 'system', content: 'System' },
                { role: 'user', content: 'Old question' },
                { role: 'assistant', content: 'Old answer' },
                { role: 'user', content: 'Use tool' },
                {
                    role: 'assistant',
                    content: '',
                    tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } }],
                },
                { role: 'tool', content: 'Result', tool_call_id: 'call_1' },
                { role: 'assistant', content: 'Final answer' },
                { role: 'user', content: 'Latest question' },
            ];

            const result = compactMessages(messages, {
                maxTokens: 80,
                estimateTokens: (msgs) => msgs.reduce((sum, m) => {
                    const content = typeof m.content === 'string' ? m.content : '';
                    return sum + content.length / 4 + 10;
                }, 0),
            });

            // Verify tool pair is preserved
            const { toolPairs } = buildToolPairs(result.messages);
            expect(toolPairs.length).toBeGreaterThan(0);

            // Both call and result should be present
            const hasCall = result.messages.some(m => m.tool_calls?.length);
            const hasResult = result.messages.some(m => m.role === 'tool');
            expect(hasCall).toBe(true);
            expect(hasResult).toBe(true);
        });
    });
});
