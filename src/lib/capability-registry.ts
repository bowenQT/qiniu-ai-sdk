import {
    CHAT_MODELS,
    IMAGE_MODELS,
    MODEL_CATALOG,
    VIDEO_MODELS,
    type ModelInfo,
} from '../models';

export type ModuleMaturity = 'ga' | 'beta' | 'experimental';
export type ValidationLevel = 'static' | 'unit' | 'contract' | 'live';
export type CapabilityType = 'chat' | 'image' | 'video';

export interface ModelCapabilityInfo extends ModelInfo {
    docsUrl: string;
    sourceUpdatedAt: string;
    stability: ModuleMaturity;
    validatedAt?: string;
    validationLevel: ValidationLevel;
}

export interface ModuleMaturityInfo {
    name: string;
    maturity: ModuleMaturity;
    docsUrl: string;
    sourceUpdatedAt: string;
    validatedAt?: string;
    validationLevel: ValidationLevel;
    notes?: string;
}

export interface ListModelsOptions {
    type?: CapabilityType;
    provider?: string;
    stability?: ModuleMaturity;
}

const DOCS_ROOT_URL = 'https://apidocs.qnaigc.com/';
const CHAT_DOCS_URL = DOCS_ROOT_URL;
const IMAGE_DOCS_URL = DOCS_ROOT_URL;
const VIDEO_DOCS_URL = DOCS_ROOT_URL;
const ANTHROPIC_DOCS_URL = 'https://apidocs.qnaigc.com/413432574e0';
const RESPONSE_DOCS_URL = 'https://apidocs.qnaigc.com/417773141e0';
const DOCS_SYNC_DATE = '2026-03-14';

const FEATURED_MODEL_INFO_BY_ID = new Map(
    MODEL_CATALOG.map((model) => [model.id, model] as const),
);

const PROVIDER_HINTS: Array<{ match: RegExp; provider: string }> = [
    { match: /^claude-/i, provider: 'Anthropic' },
    { match: /^gemini-/i, provider: 'Google' },
    { match: /^deepseek/i, provider: 'DeepSeek' },
    { match: /^doubao/i, provider: 'ByteDance' },
    { match: /^glm-|^z-ai\//i, provider: 'Zhipu AI' },
    { match: /^x-ai\//i, provider: 'xAI' },
    { match: /^openai\//i, provider: 'OpenAI' },
    { match: /^gpt-/i, provider: 'OpenAI' },
    { match: /^moonshotai\//i, provider: 'Moonshot AI' },
    { match: /^kimi-/i, provider: 'Moonshot AI' },
    { match: /^minimax/i, provider: 'MiniMax' },
    { match: /^meituan\//i, provider: 'Meituan' },
    { match: /^stepfun/i, provider: 'StepFun' },
    { match: /^kling/i, provider: 'Kuaishou' },
    { match: /^sora/i, provider: 'OpenAI' },
    { match: /^veo-/i, provider: 'Google' },
    { match: /^vidu/i, provider: 'Shengshu' },
    { match: /^mimo/i, provider: 'MiniMax' },
];

function inferProvider(id: string): string {
    for (const hint of PROVIDER_HINTS) {
        if (hint.match.test(id)) return hint.provider;
    }
    return id.includes('/') ? id.split('/')[0] : 'Qiniu AI';
}

function humanizeToken(token: string): string {
    return token
        .toLowerCase()
        .split(/[_/-]+/)
        .filter(Boolean)
        .map((segment) => segment === 'vl' ? 'VL' : segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
}

function inferDisplayName(key: string, id: string): string {
    const featured = FEATURED_MODEL_INFO_BY_ID.get(id);
    if (featured?.name) return featured.name;
    return humanizeToken(key);
}

function inferValidationMetadata(
    type: CapabilityType,
    featured?: ModelInfo,
): Pick<ModelCapabilityInfo, 'stability' | 'validatedAt' | 'validationLevel'> {
    if (!featured) {
        return {
            stability: 'beta',
            validationLevel: 'static',
        };
    }

    if (type === 'chat') {
        return {
            stability: 'ga',
            validatedAt: DOCS_SYNC_DATE,
            validationLevel: 'live',
        };
    }

    return {
        stability: 'ga',
        validatedAt: DOCS_SYNC_DATE,
        validationLevel: 'unit',
    };
}

function inferCapabilities(type: CapabilityType, id: string, featured?: ModelInfo): string[] | undefined {
    const capabilities = new Set<string>(featured?.capabilities ?? []);
    if (type === 'chat') {
        capabilities.add('text');
        if (/thinking|reasoning/i.test(id)) capabilities.add('reasoning');
        if (/claude|gemini|vision|vl/i.test(id)) capabilities.add('vision');
    } else if (type === 'image') {
        capabilities.add('image-generation');
        if (/vision|vl/i.test(id)) capabilities.add('vision');
    } else if (type === 'video') {
        capabilities.add('video-generation');
        capabilities.add('async-task');
    }

    return capabilities.size > 0 ? Array.from(capabilities).sort() : undefined;
}

function buildRegistry(
    models: Record<string, string>,
    type: CapabilityType,
    docsUrl: string,
): ModelCapabilityInfo[] {
    return Object.entries(models).map(([key, id]) => {
        const featured = FEATURED_MODEL_INFO_BY_ID.get(id);
        const provider = featured?.provider ?? inferProvider(id);
        const validation = inferValidationMetadata(type, featured);
        return {
            id,
            name: inferDisplayName(key, id),
            provider,
            type,
            capabilities: inferCapabilities(type, id, featured),
            docsUrl: id.startsWith('claude-') ? ANTHROPIC_DOCS_URL : docsUrl,
            sourceUpdatedAt: DOCS_SYNC_DATE,
            ...validation,
        };
    }).sort((a, b) => a.id.localeCompare(b.id));
}

export const MODEL_CAPABILITY_REGISTRY: ModelCapabilityInfo[] = [
    ...buildRegistry(CHAT_MODELS, 'chat', CHAT_DOCS_URL),
    ...buildRegistry(IMAGE_MODELS, 'image', IMAGE_DOCS_URL),
    ...buildRegistry(VIDEO_MODELS, 'video', VIDEO_DOCS_URL),
];

const MODEL_CAPABILITY_INDEX = new Map(
    MODEL_CAPABILITY_REGISTRY.map((model) => [model.id, model] as const),
);

export const MODULE_MATURITY_REGISTRY: ModuleMaturityInfo[] = [
    { name: 'chat', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'live' },
    { name: 'image', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'video', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'ocr', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'asr', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'tts', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'file', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'log', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'generateText', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'contract' },
    { name: 'streamText', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'contract' },
    { name: 'generateObject', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'contract' },
    { name: 'createAgent', maturity: 'ga', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validatedAt: DOCS_SYNC_DATE, validationLevel: 'contract' },
    { name: 'account', maturity: 'beta', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'admin', maturity: 'beta', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'static', notes: 'Direct module validation is still being expanded.' },
    { name: 'censor', maturity: 'beta', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'static', notes: 'Direct module validation is still being expanded.' },
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
    { name: 'ResponseAPI', maturity: 'experimental', docsUrl: RESPONSE_DOCS_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'static' },
    { name: 'crew', maturity: 'experimental', docsUrl: 'https://openai.github.io/openai-agents-js/guides/handoffs/', sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'static' },
    { name: 'A2A', maturity: 'experimental', docsUrl: 'https://openai.github.io/openai-agents-js/guides/handoffs/', sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'ai-tools', maturity: 'experimental', docsUrl: DOCS_ROOT_URL, sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
    { name: 'QiniuMCPServer', maturity: 'experimental', docsUrl: 'https://modelcontextprotocol.io/specification/2025-11-25/basic/transports', sourceUpdatedAt: DOCS_SYNC_DATE, validationLevel: 'unit' },
];

const MODULE_MATURITY_INDEX = new Map(
    MODULE_MATURITY_REGISTRY.map((entry) => [entry.name.toLowerCase(), entry] as const),
);

export function listModels(options: ListModelsOptions = {}): ModelCapabilityInfo[] {
    return MODEL_CAPABILITY_REGISTRY.filter((model) => {
        if (options.type && model.type !== options.type) return false;
        if (options.provider && model.provider !== options.provider) return false;
        if (options.stability && model.stability !== options.stability) return false;
        return true;
    });
}

export function getModelCapabilities(modelId: string): ModelCapabilityInfo | undefined {
    return MODEL_CAPABILITY_INDEX.get(modelId);
}

export function listModuleMaturities(): ModuleMaturityInfo[] {
    return MODULE_MATURITY_REGISTRY.slice();
}

export function getModuleMaturity(name: string): ModuleMaturityInfo | undefined {
    return MODULE_MATURITY_INDEX.get(name.toLowerCase());
}
