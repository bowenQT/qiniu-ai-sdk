import type { ChatMessage, ContentPart } from './types';

export interface TruncateOptions {
    /**
     * Whether to keep the first system message when truncating.
     * Default: false
     */
    keepSystem?: boolean;
}

/**
 * Append one or multiple messages to a history without mutating it.
 */
export function appendMessages(
    history: ChatMessage[],
    newMessage: ChatMessage | ChatMessage[]
): ChatMessage[] {
    const next = Array.isArray(newMessage) ? newMessage : [newMessage];
    return [...history, ...next];
}

/**
 * Truncate a message list to fit within an approximate token budget.
 * Uses a lightweight heuristic based on character length.
 */
export function truncateHistory(
    messages: ChatMessage[],
    maxTokens: number,
    options: TruncateOptions = {}
): ChatMessage[] {
    if (maxTokens <= 0) {
        return [];
    }

    const keepSystem = options.keepSystem ?? false;
    const systemMessage = keepSystem ? messages.find((msg) => msg.role === 'system') : undefined;

    const trimmed: ChatMessage[] = [];
    let totalTokens = 0;

    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (keepSystem && message.role === 'system') {
            continue;
        }

        const messageTokens = estimateMessageTokens(message);
        if (totalTokens + messageTokens > maxTokens) {
            break;
        }

        trimmed.push(message);
        totalTokens += messageTokens;
    }

    trimmed.reverse();

    if (systemMessage && !trimmed.includes(systemMessage)) {
        trimmed.unshift(systemMessage);
    }

    return trimmed;
}

function estimateMessageTokens(message: ChatMessage): number {
    if (typeof message.content === 'string') {
        return estimateTokensFromText(message.content);
    }

    if (Array.isArray(message.content)) {
        return message.content.reduce((sum, part) => sum + estimateTokensFromPart(part), 0);
    }

    return 0;
}

function estimateTokensFromPart(part: ContentPart): number {
    if (part.type === 'text' && 'text' in part) {
        return estimateTokensFromText(part.text);
    }

    // Both image_url (API format) and image (SDK sugar) count as image tokens
    if (part.type === 'image_url' || part.type === 'image') {
        return 50;
    }

    return 0;
}

function estimateTokensFromText(text: string): number {
    if (!text) {
        return 0;
    }

    return Math.ceil(text.length / 4);
}
