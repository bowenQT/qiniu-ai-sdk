import { describe, it, expect } from 'vitest';
import { generateTextWithGraph } from '../../../src/ai/generate-text';
import type { StepResult } from '../../../src/ai/generate-text';

// Mock client
function createMockClient(responses: Array<{
    content: string;
    tool_calls?: any[];
    finishReason?: string;
}>) {
    let callIndex = 0;

    return {
        chat: {
            async *createStream(request: any) {
                const response = responses[callIndex++] || responses[responses.length - 1];
                return {
                    content: response.content,
                    reasoningContent: '',
                    toolCalls: response.tool_calls || [],
                    finishReason: response.finishReason || 'stop',
                    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
                };
            },
        },
    } as any;
}

describe('generateTextWithGraph', () => {
    describe('G2: Basic Execution', () => {
        it('should generate text using graph', async () => {
            const client = createMockClient([
                { content: 'Hello from graph!', finishReason: 'stop' },
            ]);

            const result = await generateTextWithGraph({
                client,
                model: 'test-model',
                messages: [{ role: 'user', content: 'Hi' }],
            });

            expect(result.text).toBe('Hello from graph!');
            expect(result.finishReason).toBe('stop');
            expect(result.graphInfo?.nodesVisited).toContain('predict');
        });

        it('should handle tool calls', async () => {
            const client = createMockClient([
                {
                    content: '',
                    finishReason: 'tool_calls',
                    tool_calls: [{
                        id: 'call_1',
                        type: 'function',
                        function: { name: 'greet', arguments: '{"name":"World"}' },
                    }],
                },
                { content: 'Hello World!', finishReason: 'stop' },
            ]);

            const result = await generateTextWithGraph({
                client,
                model: 'test-model',
                messages: [{ role: 'user', content: 'Greet World' }],
                tools: {
                    greet: {
                        description: 'Greet someone',
                        parameters: { name: { type: 'string' } },
                        execute: async (args: any) => `Greeted ${args.name}`,
                    },
                },
            });

            expect(result.text).toBe('Hello World!');
            expect(result.steps.some(s => s.type === 'tool_call')).toBe(true);
            expect(result.steps.some(s => s.type === 'tool_result')).toBe(true);
        });
    });

    describe('G2: Skills Integration', () => {
        it('should inject skills and report in graphInfo', async () => {
            const invokedMessages: any[] = [];
            const mockClient = {
                chat: {
                    async *createStream(request: any) {
                        invokedMessages.push(...request.messages);
                        return {
                            content: 'Used skill!',
                            reasoningContent: '',
                            toolCalls: [],
                            finishReason: 'stop',
                            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
                        };
                    },
                },
            } as any;

            const result = await generateTextWithGraph({
                client: mockClient,
                model: 'test-model',
                messages: [{ role: 'user', content: 'Hello' }],
                skills: [
                    { name: 'skill-a', content: 'Skill A content', references: [], tokenCount: 50 },
                    { name: 'skill-b', content: 'Skill B content', references: [], tokenCount: 50 },
                ],
            });

            expect(result.graphInfo?.skillsInjected).toEqual(['skill-a', 'skill-b']);
            // Skills should be in messages (sorted order)
            expect(invokedMessages.some(m => m.content === 'Skill A content')).toBe(true);
            expect(invokedMessages.some(m => m.content === 'Skill B content')).toBe(true);
        });
    });

    describe('G4: Event Hooks', () => {
        it('should fire onStepFinish events', async () => {
            const client = createMockClient([
                { content: 'Step 1', finishReason: 'stop' },
            ]);

            const steps: StepResult[] = [];
            await generateTextWithGraph({
                client,
                model: 'test-model',
                messages: [{ role: 'user', content: 'Hi' }],
                onStepFinish: (step) => steps.push(step),
            });

            expect(steps.length).toBeGreaterThan(0);
            expect(steps[0].type).toBe('text');
        });

        it('should fire onNodeEnter/onNodeExit events', async () => {
            const client = createMockClient([
                { content: 'Done', finishReason: 'stop' },
            ]);

            const events: string[] = [];
            await generateTextWithGraph({
                client,
                model: 'test-model',
                messages: [{ role: 'user', content: 'Hi' }],
                onNodeEnter: (node) => events.push(`enter:${node}`),
                onNodeExit: (node) => events.push(`exit:${node}`),
            });

            expect(events).toContain('enter:predict');
            expect(events).toContain('exit:predict');
        });
    });

    describe('API Compatibility', () => {
        it('should return GenerateTextResult compatible structure', async () => {
            const client = createMockClient([
                { content: 'Result', finishReason: 'stop' },
            ]);

            const result = await generateTextWithGraph({
                client,
                model: 'test-model',
                prompt: 'Test',
            });

            // Must have all GenerateTextResult fields
            expect(typeof result.text).toBe('string');
            expect(Array.isArray(result.steps)).toBe(true);
            expect(result.finishReason).toBeDefined();
            // Plus graphInfo
            expect(result.graphInfo).toBeDefined();
        });
    });

    describe('Tool Approval Propagation', () => {
        it('should auto-approve MCP tools when autoApproveSources includes mcp', async () => {
            let toolExecuted = false;

            const client = createMockClient([
                {
                    content: '',
                    finishReason: 'tool_calls',
                    tool_calls: [{
                        id: 'call_mcp',
                        type: 'function',
                        function: { name: 'mcpTool', arguments: '{}' },
                    }],
                },
                { content: 'Done', finishReason: 'stop' },
            ]);

            const result = await generateTextWithGraph({
                client,
                model: 'test-model',
                messages: [{ role: 'user', content: 'Use MCP tool' }],
                tools: {
                    mcpTool: {
                        description: 'MCP tool',
                        parameters: {},
                        execute: async () => {
                            toolExecuted = true;
                            return 'executed';
                        },
                        requiresApproval: true,
                        source: { type: 'mcp', namespace: 'github' },
                    },
                },
                approvalConfig: {
                    autoApproveSources: ['mcp'],
                },
            });

            expect(toolExecuted).toBe(true);
            expect(result.text).toBe('Done');
        });

        it('should reject tool when requiresApproval=true but no handler or auto-approve', async () => {
            let toolExecuted = false;

            const client = createMockClient([
                {
                    content: '',
                    finishReason: 'tool_calls',
                    tool_calls: [{
                        id: 'call_reject',
                        type: 'function',
                        function: { name: 'dangerousTool', arguments: '{}' },
                    }],
                },
                { content: 'Tool was rejected', finishReason: 'stop' },
            ]);

            const result = await generateTextWithGraph({
                client,
                model: 'test-model',
                messages: [{ role: 'user', content: 'Use dangerous tool' }],
                tools: {
                    dangerousTool: {
                        description: 'Dangerous tool',
                        parameters: {},
                        execute: async () => {
                            toolExecuted = true;
                            return 'should not run';
                        },
                        requiresApproval: true,
                        // No source, no handler, no autoApprove -> rejection
                    },
                },
                // No approvalConfig -> fail-closed
            });

            expect(toolExecuted).toBe(false);
            // Tool result should contain rejection message
            const toolResultStep = result.steps.find(s => s.type === 'tool_result');
            expect(toolResultStep?.toolResults?.[0]?.result).toContain('No handler configured');
        });
    });
});
