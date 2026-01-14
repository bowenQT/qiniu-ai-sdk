import type { ChatCompletionRequest, ChatMessage, ContentPart, ToolCall, ResponseFormat } from '../lib/types';
import type {
    LanguageModelV2FilePart,
    LanguageModelV2FinishReason,
    LanguageModelV2FunctionTool,
    LanguageModelV2Message,
    LanguageModelV2Prompt,
    LanguageModelV2ProviderDefinedTool,
    LanguageModelV2ReasoningPart,
    LanguageModelV2ToolCallPart,
    LanguageModelV2ToolChoice,
    LanguageModelV2ToolResultPart,
    LanguageModelV2TextPart,
} from './types';

export function convertPromptToMessages(prompt: LanguageModelV2Prompt): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const message of prompt) {
        if (message.role === 'system') {
            messages.push({ role: 'system', content: message.content });
            continue;
        }

        if (message.role === 'tool') {
            messages.push(...convertToolResultMessages(message));
            continue;
        }

        const { content, toolCalls } = convertAssistantOrUserMessage(message);
        const normalized: ChatMessage = {
            role: message.role,
            content,
        };

        if (toolCalls.length > 0) {
            normalized.tool_calls = toolCalls;
        }

        messages.push(normalized);
    }

    return messages;
}

export function mapFinishReason(reason?: string | null): LanguageModelV2FinishReason {
    switch (reason) {
        case 'stop':
            return 'stop';
        case 'length':
            return 'length';
        case 'tool_calls':
            return 'tool-calls';
        case 'content_filter':
            return 'content-filter';
        default:
            return 'unknown';
    }
}

export function convertTools(
    tools?: Array<LanguageModelV2FunctionTool | LanguageModelV2ProviderDefinedTool>
): ChatCompletionRequest['tools'] | undefined {
    if (!tools || tools.length === 0) {
        return undefined;
    }

    const functionTools = tools.filter((tool): tool is LanguageModelV2FunctionTool => tool.type === 'function');

    if (functionTools.length === 0) {
        return undefined;
    }

    return functionTools.map((tool) => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        },
    }));
}

export function convertToolChoice(choice?: LanguageModelV2ToolChoice): ChatCompletionRequest['tool_choice'] | undefined {
    if (!choice) {
        return undefined;
    }

    if (choice.type === 'auto') {
        return 'auto';
    }

    if (choice.type === 'none') {
        return 'none';
    }

    if (choice.type === 'required') {
        return 'auto';
    }

    if (choice.type === 'tool') {
        return { type: 'function', function: { name: choice.toolName } };
    }

    return undefined;
}

/**
 * Convert Vercel AI SDK responseFormat to SDK response_format
 * Vercel uses { type: 'json' } while SDK uses { type: 'json_object' }
 */
export function convertResponseFormat(responseFormat?: { type: string; schema?: unknown }): ResponseFormat | undefined {
    if (!responseFormat) {
        return undefined;
    }

    // Vercel AI SDK uses 'json' while OpenAI spec uses 'json_object'
    if (responseFormat.type === 'json') {
        if (responseFormat.schema) {
            return {
                type: 'json_schema',
                json_schema: {
                    name: 'response',
                    strict: true,
                    schema: responseFormat.schema as Record<string, unknown>,
                },
            };
        }
        return { type: 'json_object' };
    }

    // Pass through other types (text, json_object, json_schema)
    return responseFormat as ResponseFormat;
}

function convertAssistantOrUserMessage(message: LanguageModelV2Message): {
    content: string | ContentPart[];
    toolCalls: ToolCall[];
} {
    const parts: ContentPart[] = [];
    const toolCalls: ToolCall[] = [];

    for (const part of message.content as Array<LanguageModelV2TextPart | LanguageModelV2FilePart | LanguageModelV2ReasoningPart | LanguageModelV2ToolCallPart>) {
        if (part.type === 'text') {
            parts.push({ type: 'text', text: part.text });
            continue;
        }

        if (part.type === 'reasoning') {
            parts.push({ type: 'text', text: part.text });
            continue;
        }

        if (part.type === 'file') {
            const converted = convertFilePart(part);
            if (converted) {
                parts.push(converted);
            }
            continue;
        }

        if (part.type === 'tool-call') {
            toolCalls.push(convertToolCall(part));
        }
    }

    const content = mergeTextParts(parts);
    return { content, toolCalls };
}

function convertToolResultMessages(message: LanguageModelV2Message): ChatMessage[] {
    const toolMessages: ChatMessage[] = [];

    for (const part of message.content as LanguageModelV2ToolResultPart[]) {
        if (part.type !== 'tool-result') {
            continue;
        }

        const content = stringifyToolResult(part);
        toolMessages.push({
            role: 'tool',
            tool_call_id: part.toolCallId,
            content,
            name: part.toolName,
        });
    }

    return toolMessages;
}

function convertFilePart(part: LanguageModelV2FilePart): ContentPart | null {
    const mediaType = part.mediaType.toLowerCase();
    if (!mediaType.startsWith('image/')) {
        return null;
    }

    const url = resolveFileDataUrl(part);
    if (!url) {
        return null;
    }

    return {
        type: 'image_url',
        image_url: {
            url,
        },
    };
}

function resolveFileDataUrl(part: LanguageModelV2FilePart): string | null {
    const data = part.data;
    if (data instanceof URL) {
        return data.toString();
    }

    if (typeof data === 'string') {
        if (/^https?:/i.test(data) || /^data:/i.test(data)) {
            return data;
        }
        return `data:${part.mediaType};base64,${data}`;
    }

    if (data instanceof Uint8Array) {
        const base64 = encodeBase64(data);
        return `data:${part.mediaType};base64,${base64}`;
    }

    return null;
}

function encodeBase64(data: Uint8Array): string {
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(data).toString('base64');
    }

    let binary = '';
    for (const byte of data) {
        binary += String.fromCharCode(byte);
    }
    const btoaFn = (globalThis as { btoa?: (data: string) => string }).btoa;
    if (btoaFn) {
        return btoaFn(binary);
    }

    throw new Error('Base64 encoding is not available in this environment.');
}

function convertToolCall(part: LanguageModelV2ToolCallPart): ToolCall {
    return {
        id: part.toolCallId,
        type: 'function',
        function: {
            name: part.toolName,
            arguments: JSON.stringify(part.args ?? {}),
        },
    };
}

function stringifyToolResult(part: LanguageModelV2ToolResultPart): string {
    if (Array.isArray(part.content) && part.content.length > 0) {
        return part.content
            .map((contentPart) => {
                if (contentPart.type === 'text') {
                    return contentPart.text;
                }
                if (contentPart.type === 'image') {
                    const mediaType = contentPart.mediaType || 'image/png';
                    return `data:${mediaType};base64,${contentPart.data}`;
                }
                return '';
            })
            .join('');
    }

    if (part.result !== undefined) {
        return JSON.stringify(part.result);
    }

    return '';
}

function mergeTextParts(parts: ContentPart[]): string | ContentPart[] {
    if (parts.length === 0) {
        return '';
    }

    const hasNonText = parts.some((part) => part.type !== 'text');
    if (hasNonText) {
        return parts;
    }

    return parts.map((part) => (part.type === 'text' ? part.text ?? '' : '')).join('');
}
