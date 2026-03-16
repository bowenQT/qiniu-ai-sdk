import type { ModelCapabilityInfo } from './capability-types';
export {
    CAPABILITY_EVIDENCE_DECISION_FILES,
    CAPABILITY_EVIDENCE_GENERATED_AT,
    LATEST_LIVE_VERIFY_GATE,
    MODULE_MATURITY_SOURCE,
    TRACKED_PROMOTION_DECISIONS,
} from './capability-evidence.generated';

export const DOCS_ROOT_URL = 'https://apidocs.qnaigc.com/';
export const CHAT_DOCS_URL = DOCS_ROOT_URL;
export const IMAGE_DOCS_URL = DOCS_ROOT_URL;
export const VIDEO_DOCS_URL = DOCS_ROOT_URL;
export const ANTHROPIC_DOCS_URL = 'https://apidocs.qnaigc.com/413432574e0';
export const RESPONSE_DOCS_URL = 'https://apidocs.qnaigc.com/417773141e0';
export const DOCS_SYNC_DATE = '2026-03-14';

export const CURATED_MODEL_VALIDATION: Record<
    string,
    Pick<ModelCapabilityInfo, 'stability' | 'validatedAt' | 'validationLevel'>
> = {
    'gemini-2.5-flash': {
        stability: 'ga',
        validatedAt: DOCS_SYNC_DATE,
        validationLevel: 'live',
    },
    'claude-3.5-sonnet': {
        stability: 'ga',
        validatedAt: DOCS_SYNC_DATE,
        validationLevel: 'live',
    },
    'deepseek-r1': {
        stability: 'ga',
        validatedAt: DOCS_SYNC_DATE,
        validationLevel: 'live',
    },
    'qwen3-max': {
        stability: 'ga',
        validatedAt: DOCS_SYNC_DATE,
        validationLevel: 'live',
    },
    'openai/gpt-5.2': {
        stability: 'ga',
        validatedAt: DOCS_SYNC_DATE,
        validationLevel: 'live',
    },
    'kling-v2': {
        stability: 'ga',
        validatedAt: DOCS_SYNC_DATE,
        validationLevel: 'unit',
    },
    'gemini-2.5-flash-image': {
        stability: 'ga',
        validatedAt: DOCS_SYNC_DATE,
        validationLevel: 'unit',
    },
    'kling-video-o1': {
        stability: 'ga',
        validatedAt: DOCS_SYNC_DATE,
        validationLevel: 'unit',
    },
    'sora-2': {
        stability: 'ga',
        validatedAt: DOCS_SYNC_DATE,
        validationLevel: 'unit',
    },
    'veo-3.0-generate-001': {
        stability: 'ga',
        validatedAt: DOCS_SYNC_DATE,
        validationLevel: 'unit',
    },
};
