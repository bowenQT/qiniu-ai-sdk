import { IQiniuClient, ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk } from '../../lib/types';

export class Chat {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Create a chat completion (non-streaming only)
     * @throws Error if stream: true is passed (streaming not yet implemented)
     */
    async create(params: ChatCompletionRequest): Promise<ChatCompletionResponse> {
        if (params.stream) {
            throw new Error(
                'Streaming is not yet supported in this SDK. ' +
                'Please set stream: false or omit it. ' +
                'For streaming, use the raw HTTP endpoint directly.'
            );
        }
        return this.client.post<ChatCompletionResponse>('/chat/completions', params);
    }

    // TODO: Implement createStream() for SSE support
    // async *createStream(params: Omit<ChatCompletionRequest, 'stream'>): AsyncGenerator<ChatCompletionChunk>
}
