import { IQiniuClient } from '../../lib/types';

/**
 * Audio encoding formats for TTS
 */
export type TtsEncoding = 'mp3' | 'wav' | 'pcm';

/**
 * Available voice type
 */
export interface Voice {
    /**
     * Voice identifier (e.g., 'qiniu_zh_female_tmjxxy')
     */
    id: string;
    /**
     * Human-readable name
     */
    name: string;
    /**
     * Language code (e.g., 'zh', 'en')
     */
    language?: string;
    /**
     * Gender ('male' | 'female' | 'neutral')
     */
    gender?: 'male' | 'female' | 'neutral';
    /**
     * Description of the voice
     */
    description?: string;
    /**
     * Sample audio URL
     */
    sample_url?: string;
}

/**
 * TTS synthesis request parameters
 */
export interface TtsRequest {
    /**
     * Text to synthesize
     */
    text: string;
    /**
     * Voice type identifier
     */
    voice_type: string;
    /**
     * Audio encoding format. Default: 'mp3'
     */
    encoding?: TtsEncoding;
    /**
     * Speech speed ratio (0.5 - 2.0). Default: 1.0
     */
    speed_ratio?: number;
    /**
     * Volume level (0.0 - 1.0). Default: 1.0
     */
    volume?: number;
    /**
     * Pitch adjustment (-1.0 to 1.0). Default: 0.0
     */
    pitch?: number;
}

/**
 * TTS synthesis response
 */
export interface TtsResponse {
    /**
     * Base64-encoded audio data
     */
    audio: string;
    /**
     * Audio duration in milliseconds
     */
    duration: number;
    /**
     * Audio format
     */
    format?: string;
    /**
     * Sample rate in Hz
     */
    sample_rate?: number;
}

/**
 * Options for WebSocket streaming TTS
 */
export interface TtsStreamOptions {
    /**
     * Voice type identifier
     */
    voice_type: string;
    /**
     * Audio encoding format. Default: 'mp3'
     */
    encoding?: TtsEncoding;
    /**
     * Speech speed ratio (0.5 - 2.0). Default: 1.0
     */
    speed_ratio?: number;
    /**
     * Volume level (0.0 - 1.0). Default: 1.0
     */
    volume?: number;
    /**
     * AbortSignal for cancellation
     */
    signal?: AbortSignal;
}

/**
 * WebSocket message frame from TTS stream
 */
interface TtsWebSocketFrame {
    /**
     * Audio data (base64 encoded)
     */
    data?: string;
    /**
     * Sequence number. Negative value indicates end of stream.
     */
    sequence: number;
    /**
     * Error message if any
     */
    error?: string;
}

/**
 * Raw API response formats
 */
interface TtsApiResponse {
    audio?: string;
    data?: string;
    duration?: number;
    duration_ms?: number;
    format?: string;
    sample_rate?: number;
    result?: {
        audio?: string;
        data?: string;
        duration?: number;
        duration_ms?: number;
    };
}

interface TtsApiPayload {
    audio: {
        voice_type: string;
        encoding: TtsEncoding;
        speed_ratio?: number;
        volume?: number;
        pitch?: number;
    };
    request: {
        text: string;
    };
}

interface VoiceListResponse {
    voices?: Voice[];
    data?: Voice[];
    result?: Voice[];
}

function isNativeWebSocket(impl: typeof WebSocket): boolean {
    const maybeWs = impl as unknown as { Server?: unknown; WebSocketServer?: unknown };
    return !maybeWs.Server && !maybeWs.WebSocketServer;
}

export class Tts {
    private client: IQiniuClient;
    private wsBaseUrl: string;
    private apiKey: string;

    constructor(client: IQiniuClient) {
        this.client = client;
        // Derive WebSocket URL from HTTP base URL
        // Correctly map http:// -> ws:// and https:// -> wss://
        const httpUrl = client.getBaseUrl();
        this.wsBaseUrl = httpUrl
            .replace(/^https:\/\//, 'wss://')
            .replace(/^http:\/\//, 'ws://')
            .replace(/\/v1$/, '');
        // Store API key for WebSocket auth (extracted from client)
        this.apiKey = (client as any).apiKey || '';
    }

    private async resolveWebSocketImpl(): Promise<{
        WebSocketImpl: typeof WebSocket;
        supportsHeaders: boolean;
        preferBinary: boolean;
    }> {
        const hasGlobal = typeof WebSocket !== 'undefined';
        const isNode = typeof process !== 'undefined' && !!process.versions?.node;

        if (isNode) {
            try {
                const wsModule = await import('ws');
                const wsImpl = (wsModule as { default?: typeof WebSocket }).default || (wsModule as unknown as typeof WebSocket);
                return { WebSocketImpl: wsImpl, supportsHeaders: true, preferBinary: true };
            } catch {
                throw new Error(
                    'WebSocket implementation "ws" is required in Node.js for TTS streaming. ' +
                    'Install it with: npm install ws'
                );
            }
        }

        if (hasGlobal) {
            return { WebSocketImpl: WebSocket, supportsHeaders: false, preferBinary: false };
        }

        throw new Error(
            'WebSocket is not available in this environment. ' +
            'For Node.js, install the "ws" package and assign it to globalThis.WebSocket'
        );
    }

    /**
     * List available voices.
     *
     * @example
     * ```typescript
     * const voices = await client.tts.listVoices();
     * for (const voice of voices) {
     *   console.log(`${voice.id}: ${voice.name} (${voice.language})`);
     * }
     * ```
     */
    async listVoices(): Promise<Voice[]> {
        const logger = this.client.getLogger();

        logger.debug('Fetching TTS voice list');

        const response = await this.client.get<VoiceListResponse>('/voice/list');

        // Normalize response format
        const voices = response.voices || response.data || response.result || [];

        if (!Array.isArray(voices)) {
            logger.warn('Unexpected voice list response format', { response });
            return [];
        }

        return voices;
    }

    /**
     * Synthesize text to audio (non-streaming).
     *
     * @example
     * ```typescript
     * const result = await client.tts.synthesize({
     *   text: 'Hello, world!',
     *   voice_type: 'qiniu_zh_female_tmjxxy',
     *   encoding: 'mp3',
     *   speed_ratio: 1.0,
     * });
     *
     * // Save to file
     * const audioBuffer = Buffer.from(result.audio, 'base64');
     * fs.writeFileSync('output.mp3', audioBuffer);
     * ```
     */
    async synthesize(params: TtsRequest): Promise<TtsResponse> {
        const logger = this.client.getLogger();

        // Validate input
        if (!params.text || !params.text.trim()) {
            throw new Error('Text is required and must be non-empty');
        }
        if (!params.voice_type || !params.voice_type.trim()) {
            throw new Error('voice_type is required');
        }
        if (params.speed_ratio !== undefined && (params.speed_ratio < 0.5 || params.speed_ratio > 2.0)) {
            throw new Error('speed_ratio must be between 0.5 and 2.0');
        }
        if (params.volume !== undefined && (params.volume < 0 || params.volume > 1)) {
            throw new Error('volume must be between 0.0 and 1.0');
        }
        if (params.pitch !== undefined && (params.pitch < -1 || params.pitch > 1)) {
            throw new Error('pitch must be between -1.0 and 1.0');
        }

        const requestBody: TtsApiPayload = {
            audio: {
                voice_type: params.voice_type,
                encoding: params.encoding || 'mp3',
                ...(params.speed_ratio !== undefined ? { speed_ratio: params.speed_ratio } : {}),
                ...(params.volume !== undefined ? { volume: params.volume } : {}),
                ...(params.pitch !== undefined ? { pitch: params.pitch } : {}),
            },
            request: {
                text: params.text,
            },
        };

        logger.debug('TTS synthesize request', {
            voice_type: params.voice_type,
            encoding: requestBody.audio.encoding,
            textLength: params.text.length,
        });

        const response = await this.client.post<TtsApiResponse>('/voice/tts', requestBody);

        // Normalize response
        return this.normalizeResponse(response, logger);
    }

    /**
     * Stream TTS synthesis via WebSocket.
     * Yields audio chunks as Uint8Array.
     *
     * Note: Requires WebSocket support in the runtime (Node.js, browser, Deno).
     *
     * @example
     * ```typescript
     * const audioChunks: Uint8Array[] = [];
     *
     * for await (const chunk of client.tts.stream('Hello, world!', {
     *   voice_type: 'qiniu_zh_female_tmjxxy',
     *   encoding: 'mp3',
     * })) {
     *   audioChunks.push(chunk);
     * }
     *
     * // Combine chunks
     * const totalLength = audioChunks.reduce((sum, c) => sum + c.length, 0);
     * const fullAudio = new Uint8Array(totalLength);
     * let offset = 0;
     * for (const chunk of audioChunks) {
     *   fullAudio.set(chunk, offset);
     *   offset += chunk.length;
     * }
     * ```
     */
    async *stream(
        text: string,
        options: TtsStreamOptions
    ): AsyncGenerator<Uint8Array, void, unknown> {
        const logger = this.client.getLogger();

        // Validate input
        if (!text || !text.trim()) {
            throw new Error('Text is required and must be non-empty');
        }
        if (!options.voice_type || !options.voice_type.trim()) {
            throw new Error('voice_type is required');
        }

        const wsImplInfo = await this.resolveWebSocketImpl();

        const wsUrl = `${this.wsBaseUrl}/v1/voice/tts`;

        logger.debug('Starting TTS WebSocket stream', {
            url: wsUrl,
            voice_type: options.voice_type,
            encoding: options.encoding || 'mp3',
        });

        // Create WebSocket connection with auth headers
        // Note: Node.js ws library supports headers option, browser WebSocket does not
        // For browser environments, consider using a server-side proxy
        const wsOptions: { headers?: Record<string, string> } = {};
        if (this.apiKey && wsImplInfo.supportsHeaders) {
            wsOptions.headers = {
                'Authorization': `Bearer ${this.apiKey}`,
            };
        }
        if (wsImplInfo.supportsHeaders) {
            wsOptions.headers = {
                ...wsOptions.headers,
                'VoiceType': options.voice_type,
            };
        }

        // TypeScript: ws library accepts options as second parameter
        // Browser WebSocket ignores it, ws library uses it
        const ws = new (wsImplInfo.WebSocketImpl as any)(wsUrl, wsOptions);

        // Create a queue to handle async message delivery
        const messageQueue: (Uint8Array | Error | 'done')[] = [];
        let resolveWait: (() => void) | null = null;

        const waitForMessage = (): Promise<void> => {
            if (messageQueue.length > 0) {
                return Promise.resolve();
            }
            return new Promise((resolve) => {
                resolveWait = resolve;
            });
        };

        const enqueueMessage = (msg: Uint8Array | Error | 'done') => {
            messageQueue.push(msg);
            if (resolveWait) {
                resolveWait();
                resolveWait = null;
            }
        };

        // Setup WebSocket handlers
        const openPromise = new Promise<void>((resolve, reject) => {
            ws.onopen = () => {
                logger.debug('TTS WebSocket connected');

                // Send initial configuration message
                const initMessage = JSON.stringify({
                    audio: {
                        voice_type: options.voice_type,
                        encoding: options.encoding || 'mp3',
                        speed_ratio: options.speed_ratio ?? 1.0,
                        volume: options.volume ?? 1.0,
                    },
                    request: {
                        text,
                    },
                } as TtsApiPayload);
                if (wsImplInfo.preferBinary && typeof Buffer !== 'undefined') {
                    ws.send(Buffer.from(initMessage));
                } else {
                    ws.send(initMessage);
                }

                resolve();
            };

            ws.onerror = (event: Event) => {
                const error = new Error('WebSocket connection error');
                logger.error('TTS WebSocket error', { event });
                reject(error);
                enqueueMessage(error);
            };
        });

        const tryParseFrame = (textPayload: string): TtsWebSocketFrame | null => {
            const trimmed = textPayload.trim();
            if (!trimmed.startsWith('{')) {
                return null;
            }
            try {
                const parsed = JSON.parse(trimmed) as TtsWebSocketFrame;
                if (typeof parsed.sequence === 'number') {
                    return parsed;
                }
            } catch {
                return null;
            }
            return null;
        };

        const handleFrame = (frame: TtsWebSocketFrame) => {
            if (frame.error) {
                enqueueMessage(new Error(frame.error));
                return;
            }

            if (frame.sequence < 0) {
                logger.debug('TTS stream ended', { sequence: frame.sequence });
                enqueueMessage('done');
                return;
            }

            if (frame.data) {
                const binaryString = atob(frame.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                enqueueMessage(bytes);
            }
        };

        const decodeBytesToText = (bytes: Uint8Array): string => {
            if (typeof TextDecoder !== 'undefined') {
                return new TextDecoder().decode(bytes);
            }
            if (typeof Buffer !== 'undefined') {
                return Buffer.from(bytes).toString('utf8');
            }
            return '';
        };

        ws.onmessage = (event: MessageEvent) => {
            try {
                if (typeof event.data === 'string') {
                    const frame = tryParseFrame(event.data);
                    if (frame) {
                        handleFrame(frame);
                    }
                    return;
                }

                if (event.data instanceof ArrayBuffer) {
                    const bytes = new Uint8Array(event.data);
                    const frame = tryParseFrame(decodeBytesToText(bytes));
                    if (frame) {
                        handleFrame(frame);
                        return;
                    }
                    enqueueMessage(bytes);
                    return;
                }

                if (typeof Buffer !== 'undefined' && Buffer.isBuffer(event.data)) {
                    const bytes = new Uint8Array(event.data);
                    const frame = tryParseFrame(event.data.toString('utf8'));
                    if (frame) {
                        handleFrame(frame);
                        return;
                    }
                    enqueueMessage(bytes);
                    return;
                }

                if (event.data instanceof Uint8Array) {
                    const frame = tryParseFrame(decodeBytesToText(event.data));
                    if (frame) {
                        handleFrame(frame);
                        return;
                    }
                    enqueueMessage(event.data);
                    return;
                }

                if (event.data instanceof Blob) {
                    event.data.arrayBuffer().then((buffer: ArrayBuffer) => {
                        const bytes = new Uint8Array(buffer);
                        const frame = tryParseFrame(decodeBytesToText(bytes));
                        if (frame) {
                            handleFrame(frame);
                            return;
                        }
                        enqueueMessage(bytes);
                    });
                }
            } catch (parseError) {
                logger.warn('Failed to parse TTS WebSocket message', {
                    error: parseError instanceof Error ? parseError.message : String(parseError),
                });
            }
        };

        ws.onclose = (event: { code: number; reason: string }) => {
            logger.debug('TTS WebSocket closed', { code: event.code, reason: event.reason });
            if (event.code !== 1000) {
                enqueueMessage(new Error(`WebSocket closed unexpectedly: ${event.code} ${event.reason}`));
            } else {
                enqueueMessage('done');
            }
        };

        // Handle cancellation
        if (options.signal) {
            options.signal.addEventListener('abort', () => {
                logger.info('TTS stream cancelled');
                ws.close(1000, 'Cancelled');
                enqueueMessage(new Error('Operation cancelled'));
            }, { once: true });
        }

        try {
            // Wait for connection
            await openPromise;

            // Yield audio chunks
            while (true) {
                await waitForMessage();

                const msg = messageQueue.shift();
                if (!msg) continue;

                if (msg === 'done') {
                    break;
                }
                if (msg instanceof Error) {
                    throw msg;
                }

                yield msg;
            }
        } finally {
            // Ensure WebSocket is closed
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close(1000, 'Stream ended');
            }
        }
    }

    /**
     * Normalize various API response formats to a consistent TtsResponse
     */
    private normalizeResponse(response: TtsApiResponse, logger: ReturnType<IQiniuClient['getLogger']>): TtsResponse {
        const result = response.result || response;

        const audio = result.audio || result.data || '';
        const duration = result.duration_ms ?? result.duration ?? 0;

        if (!audio) {
            logger.warn('TTS response has no audio data', { response });
        }

        return {
            audio,
            duration,
            format: response.format,
            sample_rate: response.sample_rate,
        };
    }
}
