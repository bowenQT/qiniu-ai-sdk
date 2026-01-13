import { QiniuAI } from '../client';
import { QiniuChatModel } from './qiniu-chat-model';

export interface QiniuProviderSettings {
    apiKey?: string;
    baseUrl?: string;
    client?: QiniuAI;
}

export function createQiniu(settings: QiniuProviderSettings = {}) {
    let cachedClient: QiniuAI | undefined;

    const getClient = () => {
        if (settings.client) {
            return settings.client;
        }

        if (!cachedClient) {
            const apiKey =
                settings.apiKey ||
                process.env.QINIU_API_KEY ||
                process.env.OPENAI_API_KEY ||
                '';
            if (!apiKey) {
                throw new Error('Qiniu API key is required. Set apiKey or QINIU_API_KEY.');
            }

            const baseUrl =
                settings.baseUrl ||
                process.env.QINIU_BASE_URL ||
                process.env.OPENAI_BASE_URL;

            cachedClient = new QiniuAI({
                apiKey,
                baseUrl,
            });
        }

        return cachedClient;
    };

    return {
        languageModel: (modelId: string) => new QiniuChatModel(getClient(), modelId),
    };
}

export const qiniu = createQiniu();
