import { describe, expect, it } from 'vitest';
import { createAgent } from '../../../src/ai/create-agent';
import {
    createRevisionRef,
    InMemoryArtifactRegistry,
    resolveControlPlaneRevisionRef,
    resolveControlPlaneRunMetadata,
} from '../../../src/ai/control-plane';
import type { RunTrace, TraceStore } from '../../../src/ai/control-plane';
import type { LanguageModelClient } from '../../../src/core/client';

function createMockClient(text = 'resolved reply'): LanguageModelClient {
    return {
        chat: {
            create: async () => ({
                choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
            }),
            async *createStream() {
                yield {
                    choices: [{ index: 0, delta: { content: text } }],
                };
                return {
                    content: text,
                    reasoningContent: '',
                    toolCalls: [],
                    finishReason: 'stop',
                    usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
                };
            },
        },
        getBaseUrl: () => 'https://api.example.com/v1',
    } as LanguageModelClient;
}

describe('control-plane revisions', () => {
    it('stores revisions and resolves labels through the in-memory registry', async () => {
        const registry = new InMemoryArtifactRegistry();
        registry.putRevision({
            ref: createRevisionRef({
                kind: 'prompt',
                revisionId: 'rev_prompt_candidate',
                labels: ['candidate'],
                metadata: { owner: 'runtime' },
            }),
        });
        registry.putRevision({
            ref: createRevisionRef({
                kind: 'prompt',
                revisionId: 'rev_prompt_production',
                labels: ['production'],
            }),
        });

        await expect(resolveControlPlaneRevisionRef(
            'prompt',
            { revisionId: 'rev_prompt_candidate' },
            { revisionStore: registry },
        )).resolves.toMatchObject({
            kind: 'prompt',
            revisionId: 'rev_prompt_candidate',
            labels: ['candidate'],
        });

        await expect(resolveControlPlaneRevisionRef(
            'prompt',
            { labels: ['candidate'] },
            { artifactRegistry: registry },
        )).resolves.toMatchObject({
            kind: 'prompt',
            revisionId: 'rev_prompt_candidate',
            labels: ['candidate'],
        });

        registry.assignLabels('rev_prompt_candidate', ['staging']);

        await expect(resolveControlPlaneRevisionRef(
            'prompt',
            { labels: ['staging'] },
            { artifactRegistry: registry },
        )).resolves.toMatchObject({
            kind: 'prompt',
            revisionId: 'rev_prompt_candidate',
            labels: ['staging'],
        });

        expect(registry.getRevision('rev_prompt_production')?.ref.labels).toEqual(['production']);
    });

    it('normalizes run metadata selectors into revision refs', async () => {
        const registry = new InMemoryArtifactRegistry();
        registry.putRevision({
            ref: createRevisionRef({
                kind: 'routing-policy',
                revisionId: 'rev_route_1',
                labels: ['production'],
            }),
        });
        registry.putRevision({
            ref: createRevisionRef({
                kind: 'memory-policy',
                revisionId: 'rev_memory_1',
                labels: ['candidate'],
            }),
        });

        await expect(resolveControlPlaneRunMetadata({
            taskId: 'task-1',
            promptRevision: { revisionId: 'rev_prompt_1', kind: 'prompt', labels: ['candidate'] },
            routingPolicyRevision: { labels: ['production'] },
            memoryPolicyRevision: { labels: ['candidate'] },
            guardrailRevision: { kind: 'guardrail-policy', revisionId: 'rev_guardrail_1', labels: ['staging'] },
        }, {
            artifactRegistry: registry,
        })).resolves.toMatchObject({
            taskId: 'task-1',
            promptRevision: {
                kind: 'prompt',
                revisionId: 'rev_prompt_1',
                labels: ['candidate'],
            },
            routingPolicyRevision: {
                kind: 'routing-policy',
                revisionId: 'rev_route_1',
                labels: ['production'],
            },
            memoryPolicyRevision: {
                kind: 'memory-policy',
                revisionId: 'rev_memory_1',
                labels: ['candidate'],
            },
            guardrailRevision: {
                kind: 'guardrail-policy',
                revisionId: 'rev_guardrail_1',
                labels: ['staging'],
            },
        });
    });

    it('writes resolved revision refs into trace metadata through createAgent', async () => {
        const registry = new InMemoryArtifactRegistry();
        registry.putRevision({
            ref: createRevisionRef({
                kind: 'prompt',
                revisionId: 'rev_prompt_prod',
                labels: ['production'],
            }),
        });
        registry.putRevision({
            ref: createRevisionRef({
                kind: 'routing-policy',
                revisionId: 'rev_route_prod',
                labels: ['production'],
            }),
        });

        const traces: RunTrace[] = [];
        const traceStore: TraceStore = {
            putRunTrace: (trace) => {
                traces.push(trace);
            },
        };

        const agent = createAgent({
            client: createMockClient(),
            model: 'test-model',
            artifactRegistry: registry,
            traceStore,
            runMetadata: {
                taskId: 'task-resolve',
                promptRevision: { labels: ['production'] },
                routingPolicyRevision: { labels: ['production'] },
            },
        });

        const result = await agent.run({ prompt: 'hello' });

        expect(result.text).toBe('resolved reply');
        expect(traces).toHaveLength(1);
        expect(traces[0].promptRevision).toMatchObject({
            kind: 'prompt',
            revisionId: 'rev_prompt_prod',
            labels: ['production'],
        });
        expect(traces[0].routingPolicyRevision).toMatchObject({
            kind: 'routing-policy',
            revisionId: 'rev_route_prod',
            labels: ['production'],
        });
    });
});
