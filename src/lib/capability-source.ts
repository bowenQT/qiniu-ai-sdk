import type { ModuleMaturityInfo, ModelCapabilityInfo } from './capability-types';

export const DOCS_ROOT_URL = 'https://apidocs.qnaigc.com/';
export const CHAT_DOCS_URL = DOCS_ROOT_URL;
export const IMAGE_DOCS_URL = DOCS_ROOT_URL;
export const VIDEO_DOCS_URL = DOCS_ROOT_URL;
export const ANTHROPIC_DOCS_URL = 'https://apidocs.qnaigc.com/413432574e0';
export const RESPONSE_DOCS_URL = 'https://apidocs.qnaigc.com/417773141e0';
export const DOCS_SYNC_DATE = '2026-03-14';
export const VALIDATION_SYNC_DATE = '2026-03-15';

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

export const MODULE_MATURITY_SOURCE: ModuleMaturityInfo[] = [
    { name: 'chat', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'live' },
    { name: 'image', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'video', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: VALIDATION_SYNC_DATE, validationLevel: 'unit', notes: 'Dedicated unit suites cover Veo/Kling normalization and task-handle behavior; live verification remains opt-in.' },
    { name: 'ocr', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'asr', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'tts', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'file', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'log', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: VALIDATION_SYNC_DATE, validationLevel: 'unit', notes: 'Absolute export contract is covered by unit tests; live verification remains opt-in.' },
    { name: 'generateText', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'contract' },
    { name: 'streamText', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'contract' },
    { name: 'generateObject', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'contract' },
    { name: 'createAgent', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'contract' },
    { name: 'account', maturity: 'beta', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: VALIDATION_SYNC_DATE, validationLevel: 'unit', notes: 'Usage auth signing and response handling are covered by unit tests; live verification remains opt-in.' },
    { name: 'admin', maturity: 'beta', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: VALIDATION_SYNC_DATE, validationLevel: 'unit' },
    { name: 'batch', maturity: 'beta', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: VALIDATION_SYNC_DATE, validationLevel: 'unit', notes: 'Core task lifecycle and handle behavior are covered; live verification remains env-gated.' },
    { name: 'censor', maturity: 'beta', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: VALIDATION_SYNC_DATE, validationLevel: 'unit' },
    { name: 'adapter', maturity: 'beta', docsUrl: 'https://ai-sdk.dev/docs', sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'memory', maturity: 'beta', docsUrl: 'https://docs.langchain.com/oss/javascript/langgraph/persistence', sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'guardrails', maturity: 'beta', docsUrl: 'https://openai.github.io/openai-agents-js/guides/guardrails/', sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'NodeMCPHost', maturity: 'beta', docsUrl: 'https://modelcontextprotocol.io/specification/2025-11-25/basic/transports', sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'sandbox', maturity: 'beta', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'skills', maturity: 'beta', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'RedisCheckpointer', maturity: 'beta', docsUrl: 'https://docs.langchain.com/oss/javascript/langgraph/persistence', sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'PostgresCheckpointer', maturity: 'beta', docsUrl: 'https://docs.langchain.com/oss/javascript/langgraph/persistence', sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'KodoCheckpointer', maturity: 'beta', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'auditLogger', maturity: 'beta', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'ResponseAPI', maturity: 'experimental', docsUrl: RESPONSE_DOCS_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: VALIDATION_SYNC_DATE, validationLevel: 'unit', notes: 'Provider-only surface is covered by dedicated unit suites; live verification remains opt-in.' },
    { name: 'crew', maturity: 'experimental', docsUrl: 'https://openai.github.io/openai-agents-js/guides/handoffs/', sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'static' },
    { name: 'A2A', maturity: 'experimental', docsUrl: 'https://openai.github.io/openai-agents-js/guides/handoffs/', sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'ai-tools', maturity: 'experimental', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'QiniuMCPServer', maturity: 'experimental', docsUrl: 'https://modelcontextprotocol.io/specification/2025-11-25/basic/transports', sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
];
