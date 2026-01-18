/**
 * Tests for Memory Manager.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryManager, InMemoryVectorStore, isDroppable } from '../../../src/ai/memory';
import type { InternalMessage } from '../../../src/ai/internal-types';

describe('MemoryManager', () => {
    let memory: MemoryManager;

    beforeEach(() => {
        memory = new MemoryManager({
            shortTerm: { maxMessages: 10 },
        });
    });

    describe('process', () => {
        it('should return messages unchanged when under limit', async () => {
            const messages: InternalMessage[] = [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there!' },
            ];

            const result = await memory.process(messages);

            expect(result.messages).toHaveLength(2);
            expect(result.droppedCount).toBe(0);
            expect(result.summarized).toBe(false);
        });

        it('should trim messages when exceeding maxMessages', async () => {
            const messages: InternalMessage[] = Array.from({ length: 15 }, (_, i) => ({
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Message ${i}`,
            })) as InternalMessage[];

            const result = await memory.process(messages);

            expect(result.messages.length).toBeLessThanOrEqual(10);
            expect(result.droppedCount).toBe(5);
        });

        it('should inject existing summary', async () => {
            memory.setSummary('test-thread', 'Previous conversation summary');

            const messages: InternalMessage[] = [
                { role: 'system', content: 'You are helpful.' },
                { role: 'user', content: 'Hello' },
            ];

            const result = await memory.process(messages, { threadId: 'test-thread' });

            expect(result.messages.length).toBe(3);
            expect(result.messages[1].content).toContain('CONVERSATION SUMMARY');
            expect(result.messages[1]._meta?.summaryId).toBe('summary_test-thread');
            expect(result.messages[1]._meta?.droppable).toBe(true);
        });
    });

    describe('clearThread', () => {
        it('should clear summary for thread', () => {
            memory.setSummary('thread-1', 'Summary 1');
            memory.setSummary('thread-2', 'Summary 2');

            memory.clearThread('thread-1');

            expect(memory.getSummary('thread-1')).toBeUndefined();
            expect(memory.getSummary('thread-2')).toBe('Summary 2');
        });
    });
});

describe('InMemoryVectorStore', () => {
    let store: InMemoryVectorStore;

    beforeEach(() => {
        store = new InMemoryVectorStore();
    });

    it('should add and search documents', async () => {
        await store.add([
            { id: '1', content: 'The quick brown fox jumps over the lazy dog' },
            { id: '2', content: 'Hello world this is a test' },
            { id: '3', content: 'The fox is quick and brown' },
        ]);

        const results = await store.search('quick brown fox', 2);

        expect(results.length).toBeGreaterThanOrEqual(1);
        // First result should contain matching words
        expect(results[0].content).toContain('fox');
    });

    it('should clear all documents', async () => {
        await store.add([{ id: '1', content: 'Test' }]);
        await store.clear();

        const results = await store.search('test');
        expect(results).toHaveLength(0);
    });
});

describe('isDroppable', () => {
    it('should return true for message with skillId and droppable', () => {
        const msg: InternalMessage = {
            role: 'system',
            content: 'Skill content',
            _meta: { skillId: 'skill-1', droppable: true },
        };
        expect(isDroppable(msg)).toBe(true);
    });

    it('should return true for message with summaryId and droppable', () => {
        const msg: InternalMessage = {
            role: 'system',
            content: 'Summary content',
            _meta: { summaryId: 'summary-1', droppable: true },
        };
        expect(isDroppable(msg)).toBe(true);
    });

    it('should return false for message without droppable flag', () => {
        const msg: InternalMessage = {
            role: 'system',
            content: 'Regular content',
            _meta: { skillId: 'skill-1' },
        };
        expect(isDroppable(msg)).toBe(false);
    });

    it('should return false for regular message', () => {
        const msg: InternalMessage = {
            role: 'user',
            content: 'Hello',
        };
        expect(isDroppable(msg)).toBe(false);
    });
});
