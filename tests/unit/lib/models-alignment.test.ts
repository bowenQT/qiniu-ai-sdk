/**
 * TDD RED: Models alignment tests for Phase 1
 * Verify that the model catalog includes all models from API docs.
 */
import { describe, it, expect } from 'vitest';
import { CHAT_MODELS, IMAGE_MODELS, VIDEO_MODELS } from '../../../src/models';

describe('Phase 1: Model Catalog Alignment', () => {
    describe('Chat Models', () => {
        it('should include claude-4.6-opus', () => {
            expect(CHAT_MODELS.CLAUDE_4_6_OPUS).toBe('claude-4.6-opus');
        });

        it('should include doubao-seed-1.6 (non-thinking variant)', () => {
            expect(CHAT_MODELS.DOUBAO_SEED_1_6).toBeDefined();
        });

        it('should include qwen3-max-2026-01-23', () => {
            expect(CHAT_MODELS.QWEN3_MAX_2026_01_23).toBe('qwen3-max-2026-01-23');
        });

        it('should include moonshotai/kimi-k2.5', () => {
            expect(CHAT_MODELS.KIMI_K2_5).toBe('moonshotai/kimi-k2.5');
        });

        it('should include openai/gpt-5.2-codex', () => {
            expect(CHAT_MODELS.GPT_5_2_CODEX).toBe('openai/gpt-5.2-codex');
        });
    });

    describe('Video Models', () => {
        it('should include sora-2-pro', () => {
            expect(VIDEO_MODELS.SORA_2_PRO).toBe('sora-2-pro');
        });

        it('should include kling-v2-6', () => {
            expect(VIDEO_MODELS.KLING_V2_6).toBe('kling-v2-6');
        });

        it('should include kling-v3', () => {
            expect(VIDEO_MODELS.KLING_V3).toBe('kling-v3');
        });

        it('should include kling-v3-omni', () => {
            expect(VIDEO_MODELS.KLING_V3_OMNI).toBe('kling-v3-omni');
        });

        // New Veo 2.0 models (alignment gap)
        it('should include veo-2.0-generate-exp', () => {
            expect(VIDEO_MODELS.VEO_2_0_GENERATE_EXP).toBe('veo-2.0-generate-exp');
        });

        it('should include veo-2.0-generate-preview', () => {
            expect(VIDEO_MODELS.VEO_2_0_GENERATE_PREVIEW).toBe('veo-2.0-generate-preview');
        });

        // Existing Veo models should remain
        it('should include veo-2.0-generate-001', () => {
            expect(VIDEO_MODELS.VEO_2_0_GENERATE_001).toBe('veo-2.0-generate-001');
        });

        it('should include veo-3.0-generate-001 (live)', () => {
            expect(VIDEO_MODELS.VEO_3_0_GENERATE_001).toBe('veo-3.0-generate-001');
        });

        it('should include veo-3.0-fast-generate-001 (live)', () => {
            expect(VIDEO_MODELS.VEO_3_0_FAST_GENERATE_001).toBe('veo-3.0-fast-generate-001');
        });

        // Deprecated preview models (sunset 2026-04-02)
        it('should still include deprecated veo-3.0-generate-preview', () => {
            expect(VIDEO_MODELS.VEO_3_0_GENERATE_PREVIEW).toBe('veo-3.0-generate-preview');
        });

        it('should still include deprecated veo-3.0-fast-generate-preview', () => {
            expect(VIDEO_MODELS.VEO_3_0_FAST_GENERATE_PREVIEW).toBe('veo-3.0-fast-generate-preview');
        });

        it('should include viduq1', () => {
            expect(VIDEO_MODELS.VIDUQ1).toBe('viduq1');
        });

        it('should include viduq2', () => {
            expect(VIDEO_MODELS.VIDUQ2).toBe('viduq2');
        });

        it('should include viduq2-pro', () => {
            expect(VIDEO_MODELS.VIDUQ2_PRO).toBe('viduq2-pro');
        });

        it('should include viduq2-turbo', () => {
            expect(VIDEO_MODELS.VIDUQ2_TURBO).toBe('viduq2-turbo');
        });
    });

    describe('Image Models', () => {
        it('should include kling-image-o1', () => {
            expect(IMAGE_MODELS.KLING_IMAGE_O1).toBe('kling-image-o1');
        });

        it('should include gemini-3.1-flash-image-preview', () => {
            expect(IMAGE_MODELS.GEMINI_3_1_FLASH_IMAGE_PREVIEW).toBe('gemini-3.1-flash-image-preview');
        });
    });
});
