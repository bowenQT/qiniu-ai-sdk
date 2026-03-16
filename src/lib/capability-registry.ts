import {
    CHAT_MODELS,
    IMAGE_MODELS,
    MODEL_CATALOG,
    VIDEO_MODELS,
    type ModelInfo,
} from '../models';
import {
    ANTHROPIC_DOCS_URL,
    CHAT_DOCS_URL,
    CURATED_MODEL_VALIDATION,
    DOCS_SYNC_DATE,
    IMAGE_DOCS_URL,
    MODULE_MATURITY_SOURCE,
    VIDEO_DOCS_URL,
} from './capability-source';
export type {
    ModuleMaturity,
    ValidationLevel,
    CapabilityType,
    ModelCapabilityInfo,
    ModuleMaturityInfo,
    ListModelsOptions,
} from './capability-types';
import type {
    CapabilityType,
    ListModelsOptions,
    ModelCapabilityInfo,
    ModuleMaturityInfo,
} from './capability-types';

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
    id: string,
): Pick<ModelCapabilityInfo, 'stability' | 'validatedAt' | 'validationLevel'> {
    return CURATED_MODEL_VALIDATION[id] ?? {
        stability: 'beta',
        validationLevel: 'static',
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
        const validation = inferValidationMetadata(type, id);
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

export const MODULE_MATURITY_REGISTRY: ModuleMaturityInfo[] = MODULE_MATURITY_SOURCE.slice();

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
