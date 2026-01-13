/**
 * Model catalog for Qiniu AI SDK.
 * Use these constants for type-safe model selection.
 */

// ============================================================================
// Chat & Reasoning Models (66 models)
// ============================================================================

export const CHAT_MODELS = {
    // Qwen
    QWEN3_235B_A22B_THINKING: 'qwen3-235b-a22b-thinking-2507',
    QWEN3_235B_A22B_INSTRUCT: 'qwen3-235b-a22b-instruct-2507',
    QWEN3_235B_A22B: 'qwen3-235b-a22b',
    QWEN3_MAX_PREVIEW: 'qwen3-max-preview',
    QWEN3_MAX: 'qwen3-max',
    QWEN3_32B: 'qwen3-32b',
    QWEN3_30B_A3B: 'qwen3-30b-a3b',
    QWEN3_NEXT_80B_A3B_THINKING: 'qwen3-next-80b-a3b-thinking',
    QWEN3_NEXT_80B_A3B_INSTRUCT: 'qwen3-next-80b-a3b-instruct',
    QWEN3_CODER_480B_A35B_INSTRUCT: 'qwen3-coder-480b-a35b-instruct',
    QWEN_MAX_2025_01_25: 'qwen-max-2025-01-25',
    QWEN_TURBO: 'qwen-turbo',

    // Claude
    CLAUDE_4_5_OPUS: 'claude-4.5-opus',
    CLAUDE_4_5_HAIKU: 'claude-4.5-haiku',
    CLAUDE_4_5_SONNET: 'claude-4.5-sonnet',
    CLAUDE_4_1_OPUS: 'claude-4.1-opus',
    CLAUDE_4_0_OPUS: 'claude-4.0-opus',
    CLAUDE_4_0_SONNET: 'claude-4.0-sonnet',
    CLAUDE_3_7_SONNET: 'claude-3.7-sonnet',
    CLAUDE_3_5_SONNET: 'claude-3.5-sonnet',
    CLAUDE_3_5_HAIKU: 'claude-3.5-haiku',

    // Gemini
    GEMINI_3_0_FLASH_PREVIEW: 'gemini-3.0-flash-preview',
    GEMINI_3_0_PRO_PREVIEW: 'gemini-3.0-pro-preview',
    GEMINI_2_5_FLASH_LITE: 'gemini-2.5-flash-lite',
    GEMINI_2_5_FLASH: 'gemini-2.5-flash',
    GEMINI_2_5_PRO: 'gemini-2.5-pro',
    GEMINI_2_0_FLASH_LITE: 'gemini-2.0-flash-lite',
    GEMINI_2_0_FLASH: 'gemini-2.0-flash',

    // DeepSeek
    DEEPSEEK_R1_0528: 'deepseek-r1-0528',
    DEEPSEEK_R1: 'deepseek-r1',
    DEEPSEEK_V3: 'deepseek-v3',
    DEEPSEEK_V3_0324: 'deepseek-v3-0324',
    DEEPSEEK_V3_1: 'deepseek-v3.1',
    DEEPSEEK_V3_2_251201: 'deepseek/deepseek-v3.2-251201',
    DEEPSEEK_V3_2_EXP_THINKING: 'deepseek/deepseek-v3.2-exp-thinking',
    DEEPSEEK_V3_2_EXP: 'deepseek/deepseek-v3.2-exp',
    DEEPSEEK_V3_1_TERMINUS_THINKING: 'deepseek/deepseek-v3.1-terminus-thinking',
    DEEPSEEK_V3_1_TERMINUS: 'deepseek/deepseek-v3.1-terminus',

    // Doubao
    DOUBAO_SEED_1_6_THINKING: 'doubao-seed-1.6-thinking',
    DOUBAO_SEED_1_6_FLASH: 'doubao-seed-1.6-flash',
    DOUBAO_SEED_1_6: 'doubao-seed-1.6',
    DOUBAO_1_5_THINKING_PRO: 'doubao-1.5-thinking-pro',
    DOUBAO_1_5_PRO_32K: 'doubao-1.5-pro-32k',

    // GLM
    GLM_4_5: 'glm-4.5',
    GLM_4_5_AIR: 'glm-4.5-air',
    GLM_4_7: 'z-ai/glm-4.7',
    GLM_4_6: 'z-ai/glm-4.6',

    // Grok
    GROK_4_FAST_REASONING: 'x-ai/grok-4-fast-reasoning',
    GROK_4_FAST_NON_REASONING: 'x-ai/grok-4-fast-non-reasoning',
    GROK_4_FAST: 'x-ai/grok-4-fast',
    GROK_4_1_FAST_NON_REASONING: 'x-ai/grok-4.1-fast-non-reasoning',
    GROK_4_1_FAST_REASONING: 'x-ai/grok-4.1-fast-reasoning',
    GROK_4_1_FAST: 'x-ai/grok-4.1-fast',
    GROK_CODE_FAST_1: 'x-ai/grok-code-fast-1',

    // OpenAI
    GPT_5_2: 'openai/gpt-5.2',
    GPT_5: 'openai/gpt-5',
    GPT_OSS_20B: 'gpt-oss-20b',
    GPT_OSS_120B: 'gpt-oss-120b',

    // Kimi
    KIMI_K2_THINKING: 'moonshotai/kimi-k2-thinking',
    KIMI_K2_0905: 'moonshotai/kimi-k2-0905',
    KIMI_K2: 'kimi-k2',

    // MiniMax
    MINIMAX_M2: 'minimax/minimax-m2',
    MINIMAX_M2_1: 'minimax/minimax-m2.1',
    MINIMAX_M1: 'MiniMax-M1',
    MIMO_V2_FLASH: 'mimo-v2-flash',

    // Meituan
    LONGCAT_FLASH_CHAT: 'meituan/longcat-flash-chat',

    // StepFun
    GELAB_ZERO_4B_PREVIEW: 'stepfun-ai/gelab-zero-4b-preview',

    // AutoGLM
    AUTOGLM_PHONE_9B: 'z-ai/autoglm-phone-9b',
} as const;

export type ChatModel = (typeof CHAT_MODELS)[keyof typeof CHAT_MODELS];

// ============================================================================
// Image Generation Models (11 models)
// ============================================================================

export const IMAGE_MODELS = {
    // Kling
    KLING_V1: 'kling-v1',
    KLING_V1_5: 'kling-v1-5',
    KLING_V2: 'kling-v2',
    KLING_V2_NEW: 'kling-v2-new',
    KLING_V2_1: 'kling-v2-1',

    // Gemini
    GEMINI_3_0_PRO_IMAGE_PREVIEW: 'gemini-3.0-pro-image-preview',
    GEMINI_2_5_FLASH_IMAGE: 'gemini-2.5-flash-image',

    // Vision (multi-modal input)
    DOUBAO_1_5_VISION_PRO: 'doubao-1.5-vision-pro',
    QWEN2_5_VL_7B_INSTRUCT: 'qwen2.5-vl-7b-instruct',
    QWEN2_5_VL_72B_INSTRUCT: 'qwen2.5-vl-72b-instruct',
    QWEN_VL_MAX_2025_01_25: 'qwen-vl-max-2025-01-25',
} as const;

export type ImageModel = (typeof IMAGE_MODELS)[keyof typeof IMAGE_MODELS];

// ============================================================================
// Video Generation Models (12 models)
// ============================================================================

export const VIDEO_MODELS = {
    // Kling
    KLING_VIDEO_O1: 'kling-video-o1',
    KLING_V2_1: 'kling-v2-1',
    KLING_V2_5_TURBO: 'kling-v2-5-turbo',

    // Sora
    SORA_2: 'sora-2',

    // Veo
    VEO_2_0_GENERATE_001: 'veo-2.0-generate-001',
    VEO_3_0_GENERATE_001: 'veo-3.0-generate-001',
    VEO_3_0_FAST_GENERATE_001: 'veo-3.0-fast-generate-001',
    VEO_3_0_GENERATE_PREVIEW: 'veo-3.0-generate-preview',
    VEO_3_0_FAST_GENERATE_PREVIEW: 'veo-3.0-fast-generate-preview',
    VEO_3_1_GENERATE_PREVIEW: 'veo-3.1-generate-preview',
    VEO_3_1_FAST_GENERATE_PREVIEW: 'veo-3.1-fast-generate-preview',

    // Other
    MINIMAX_M2_VIDEO: 'minimax/minimax-m2',
    MIMO_V2_FLASH_VIDEO: 'mimo-v2-flash',
} as const;

export type VideoModel = (typeof VIDEO_MODELS)[keyof typeof VIDEO_MODELS];

// ============================================================================
// All Models Union
// ============================================================================

export type Model = ChatModel | ImageModel | VideoModel;

// ============================================================================
// Model Metadata Catalog (for UI builders)
// ============================================================================

export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
    type: 'chat' | 'image' | 'video' | 'ocr' | 'asr' | 'tts';
    capabilities?: string[];
}

export const MODEL_CATALOG: ModelInfo[] = [
    // Featured Chat Models
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', type: 'chat', capabilities: ['reasoning', 'vision'] },
    { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', type: 'chat' },
    { id: 'deepseek-r1', name: 'DeepSeek R1', provider: 'DeepSeek', type: 'chat', capabilities: ['reasoning'] },
    { id: 'qwen3-max', name: 'Qwen 3 Max', provider: 'Alibaba', type: 'chat' },
    { id: 'openai/gpt-5.2', name: 'GPT-5.2', provider: 'OpenAI', type: 'chat' },

    // Featured Image Models
    { id: 'kling-v2', name: 'Kling v2', provider: 'Kuaishou', type: 'image' },
    { id: 'gemini-2.5-flash-image', name: 'Gemini Image', provider: 'Google', type: 'image' },

    // Featured Video Models
    { id: 'kling-video-o1', name: 'Kling Video O1', provider: 'Kuaishou', type: 'video' },
    { id: 'sora-2', name: 'Sora 2', provider: 'OpenAI', type: 'video' },
    { id: 'veo-3.0-generate-001', name: 'Veo 3.0', provider: 'Google', type: 'video' },
];
