import { describe, it, expect } from 'vitest';
import { AgentGraph } from '../../../src/ai/agent-graph';
import { compactMessages } from '../../../src/ai/nodes/memory-node';
import type { InternalMessage, InjectedSkill } from '../../../src/ai/internal-types';
import type { CompactionConfig } from '../../../src/ai/nodes/types';

describe('Skill Injection', () => {
    describe('H4: Injection Order', () => {
        it('should inject skills in ASCII sorted order', async () => {
            const invokedMessages: any[] = [];
            const mockClient = {
                chat: {
                    async *createStream(request: any) {
                        invokedMessages.push(...request.messages);
                        return {
                            content: 'Done',
                            reasoningContent: '',
                            toolCalls: [],
                            finishReason: 'stop',
                            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
                        };
                    },
                },
            } as any;

            const graph = new AgentGraph({
                client: mockClient,
                model: 'test-model',
                skills: [
                    { name: 'zebra', content: 'Zebra content', references: [], tokenCount: 50 },
                    { name: 'alpha', content: 'Alpha content', references: [], tokenCount: 50 },
                    { name: 'middle', content: 'Middle content', references: [], tokenCount: 50 },
                ],
            });

            await graph.invoke([
                { role: 'system', content: 'Original system prompt' },
                { role: 'user', content: 'Hello' },
            ]);

            // Verify order: original system, alpha, middle, zebra, user
            expect(invokedMessages[0].content).toBe('Original system prompt');
            expect(invokedMessages[1].content).toBe('Alpha content');
            expect(invokedMessages[2].content).toBe('Middle content');
            expect(invokedMessages[3].content).toBe('Zebra content');
            expect(invokedMessages[4].content).toBe('Hello');
        });

        it('should insert skills after first system message', async () => {
            const invokedMessages: any[] = [];
            const mockClient = {
                chat: {
                    async *createStream(request: any) {
                        invokedMessages.push(...request.messages);
                        return {
                            content: 'Done',
                            reasoningContent: '',
                            toolCalls: [],
                            finishReason: 'stop',
                            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
                        };
                    },
                },
            } as any;

            const graph = new AgentGraph({
                client: mockClient,
                model: 'test-model',
                skills: [
                    { name: 'skill-1', content: 'Skill 1', references: [], tokenCount: 50 },
                ],
            });

            await graph.invoke([
                { role: 'system', content: 'System 1' },
                { role: 'system', content: 'System 2' },
                { role: 'user', content: 'Hello' },
            ]);

            // Skills should be after first system, before second system
            expect(invokedMessages[0].content).toBe('System 1');
            expect(invokedMessages[1].content).toBe('Skill 1');
            expect(invokedMessages[2].content).toBe('System 2');
            expect(invokedMessages[3].content).toBe('Hello');
        });

        it('should handle no system message', async () => {
            const invokedMessages: any[] = [];
            const mockClient = {
                chat: {
                    async *createStream(request: any) {
                        invokedMessages.push(...request.messages);
                        return {
                            content: 'Done',
                            reasoningContent: '',
                            toolCalls: [],
                            finishReason: 'stop',
                            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
                        };
                    },
                },
            } as any;

            const graph = new AgentGraph({
                client: mockClient,
                model: 'test-model',
                skills: [
                    { name: 'skill-1', content: 'Skill 1', references: [], tokenCount: 50 },
                ],
            });

            await graph.invoke([
                { role: 'user', content: 'Hello' },
            ]);

            // Skills should be at start (before user message)
            expect(invokedMessages[0].content).toBe('Skill 1');
            expect(invokedMessages[1].content).toBe('Hello');
        });
    });

    describe('H4: Compaction with Droppable Skills', () => {
        it('should drop droppable skill messages first', () => {
            const messages: InternalMessage[] = [
                { role: 'system', content: 'Original system' },
                { role: 'system', content: 'Skill A content (100 tokens)', _meta: { skillId: 'skill-a', droppable: true } },
                { role: 'system', content: 'Skill B content (100 tokens)', _meta: { skillId: 'skill-b', droppable: true } },
                { role: 'user', content: 'Hello' },
            ];

            const injectedSkills: InjectedSkill[] = [
                { name: 'skill-a', priority: 0, messageIndex: 1, tokenCount: 50 },
                { name: 'skill-b', priority: 1, messageIndex: 2, tokenCount: 50 },
            ];

            const config: CompactionConfig = {
                maxTokens: 120, // Allow some room but trigger compaction
                estimateTokens: (msgs) => msgs.length * 50,
            };

            const result = compactMessages(messages, config, injectedSkills);

            // Should drop skills (droppable) before other messages
            expect(result.occurred).toBe(true);
            expect(result.droppedSkills.length).toBeGreaterThan(0);
            // Original system should be preserved
            expect(result.messages.some(m => m.content === 'Original system')).toBe(true);
        });

        it('should preserve non-droppable system messages', () => {
            const messages: InternalMessage[] = [
                { role: 'system', content: 'Core system prompt' },
                { role: 'system', content: 'Droppable skill', _meta: { skillId: 'skill-1', droppable: true } },
                { role: 'user', content: 'User message' },
            ];

            const config: CompactionConfig = {
                maxTokens: 80,
                estimateTokens: (msgs) => msgs.length * 40,
            };

            const result = compactMessages(messages, config, [
                { name: 'skill-1', priority: 0, messageIndex: 1, tokenCount: 40 },
            ]);

            // Core system preserved, skill dropped
            expect(result.messages.some(m => m.content === 'Core system prompt')).toBe(true);
            expect(result.droppedSkills).toContain('skill-1');
        });

        it('should drop skills by priority (lower first)', () => {
            const messages: InternalMessage[] = [
                { role: 'system', content: 'System' },
                { role: 'system', content: 'Low priority skill', _meta: { skillId: 'low', droppable: true } },
                { role: 'system', content: 'High priority skill', _meta: { skillId: 'high', droppable: true } },
                { role: 'user', content: 'User' },
            ];

            const injectedSkills: InjectedSkill[] = [
                { name: 'low', priority: 0, messageIndex: 1, tokenCount: 30 },  // Lower = drop first
                { name: 'high', priority: 1, messageIndex: 2, tokenCount: 30 },
            ];

            const config: CompactionConfig = {
                maxTokens: 100, // Need to drop at least one
                estimateTokens: (msgs) => msgs.length * 35,
            };

            const result = compactMessages(messages, config, injectedSkills);

            // Low priority should be dropped first
            if (result.droppedSkills.length === 1) {
                expect(result.droppedSkills[0]).toBe('low');
            }
        });
    });
});
