/**
 * Token Estimator Tests
 * Uses relative assertions to avoid brittle tests when heuristics change.
 */

import { describe, it, expect } from 'vitest';
import {
    createTokenEstimator,
    estimateMessageTokens,
    estimateMessagesTokens,
    DEFAULT_ESTIMATOR_CONFIG,
} from '../../../src/lib/token-estimator';
import type { ContentPart } from '../../../src/lib/types';

describe('TokenEstimator', () => {
    describe('createTokenEstimator', () => {
        it('should estimate Latin text', () => {
            const estimator = createTokenEstimator();
            // 12 chars, expect ~3 tokens
            const result = estimator('Hello World!');
            expect(result).toBeGreaterThanOrEqual(2);
            expect(result).toBeLessThanOrEqual(5);
        });

        it('should estimate CJK text higher than same-length Latin', () => {
            const estimator = createTokenEstimator();
            // Same character count, CJK should have higher estimate
            const latin = estimator('abcdefghij'); // 10 chars
            const cjk = estimator('你好世界朋友们大家好'); // 10 chars

            // CJK: 10 * 1.5 / 4 = 3.75 -> 4
            // Latin: 10 / 4 = 2.5 -> 3
            expect(cjk).toBeGreaterThan(latin);
        });

        it('should handle mixed CJK/Latin text', () => {
            const estimator = createTokenEstimator();
            // Same total length, but mixed has CJK which adds weight
            const mixed = estimator('aaaa你好世界朋友们大家好'); // 4 latin + 10 CJK = 14 chars
            const pureLatin = estimator('aaaabbbbccccdd'); // 14 latin chars

            // mixed: 4 + 10*1.5 = 19 / 4 = 4.75 -> 5
            // pureLatin: 14 / 4 = 3.5 -> 4
            expect(mixed).toBeGreaterThan(pureLatin);
        });

        it('should handle empty string', () => {
            const estimator = createTokenEstimator();
            expect(estimator('')).toBe(0);
        });
    });

    describe('ContentPart[] handling', () => {
        it('should handle text ContentPart', () => {
            const estimator = createTokenEstimator();
            const content: ContentPart[] = [
                { type: 'text', text: 'Hello World' },
            ];
            const result = estimator(content);
            expect(result).toBeGreaterThan(0);
        });

        it('should add image token cost', () => {
            const estimator = createTokenEstimator();
            const textOnly: ContentPart[] = [
                { type: 'text', text: 'Hello' },
            ];
            const withImage: ContentPart[] = [
                { type: 'text', text: 'Hello' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } },
            ];

            const textTokens = estimator(textOnly);
            const imageTokens = estimator(withImage);

            // Image should add significant tokens
            expect(imageTokens - textTokens).toBeGreaterThanOrEqual(80);
        });

        it('should handle multiple images', () => {
            const estimator = createTokenEstimator();
            const oneImage: ContentPart[] = [
                { type: 'image_url', image_url: { url: 'img1' } },
            ];
            const twoImages: ContentPart[] = [
                { type: 'image_url', image_url: { url: 'img1' } },
                { type: 'image_url', image_url: { url: 'img2' } },
            ];

            expect(estimator(twoImages)).toBeGreaterThan(estimator(oneImage));
        });
    });

    describe('estimateMessageTokens', () => {
        it('should include message overhead', () => {
            const content = 'Hi';
            const contentOnly = createTokenEstimator()(content);
            const withOverhead = estimateMessageTokens({ content });

            expect(withOverhead).toBeGreaterThan(contentOnly);
        });

        it('should add tool_call cost', () => {
            const base = estimateMessageTokens({ content: 'Hello' });
            const withToolCalls = estimateMessageTokens({
                content: 'Hello',
                tool_calls: [{}, {}], // 2 tool calls
            });

            // Each tool call adds ~50 tokens
            expect(withToolCalls - base).toBeGreaterThanOrEqual(80);
        });

        it('should handle empty content with tool_calls', () => {
            const result = estimateMessageTokens({
                content: '',
                tool_calls: [{}],
            });
            // Should have overhead + tool_call cost
            expect(result).toBeGreaterThan(50);
        });
    });

    describe('estimateMessagesTokens', () => {
        it('should sum all message tokens', () => {
            const messages = [
                { content: 'Hello' },
                { content: 'World' },
                { content: '你好' },
            ];

            const total = estimateMessagesTokens(messages);
            const sum = messages.reduce(
                (acc, m) => acc + estimateMessageTokens(m),
                0
            );

            expect(total).toBe(sum);
        });

        it('should handle empty array', () => {
            expect(estimateMessagesTokens([])).toBe(0);
        });
    });

    describe('custom configuration', () => {
        it('should respect custom charsPerToken', () => {
            const default4 = createTokenEstimator({ charsPerToken: 4 });
            const custom2 = createTokenEstimator({ charsPerToken: 2 });

            const text = 'HelloWorld'; // 10 chars
            // charsPerToken=2 should give higher estimate
            expect(custom2(text)).toBeGreaterThan(default4(text));
        });

        it('should respect custom cjkMultiplier', () => {
            const default15 = createTokenEstimator({ cjkMultiplier: 1.5 });
            const custom30 = createTokenEstimator({ cjkMultiplier: 3.0 });

            // Use longer text to ensure ceil() produces different results
            const cjkText = '你好世界朋友们大家好欢迎光临';
            expect(custom30(cjkText)).toBeGreaterThan(default15(cjkText));
        });
    });

    describe('DEFAULT_ESTIMATOR_CONFIG', () => {
        it('should have expected defaults', () => {
            expect(DEFAULT_ESTIMATOR_CONFIG.charsPerToken).toBe(4);
            expect(DEFAULT_ESTIMATOR_CONFIG.cjkMultiplier).toBe(1.5);
            expect(DEFAULT_ESTIMATOR_CONFIG.messageOverhead).toBe(10);
            expect(DEFAULT_ESTIMATOR_CONFIG.imageTokenCost).toBe(85);
            expect(DEFAULT_ESTIMATOR_CONFIG.toolCallCost).toBe(50);
        });
    });
});
