import { IQiniuClient } from '../../lib/types';

/**
 * Supported audio formats for ASR
 */
export type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'raw' | 'pcm' | 'm4a' | 'flac';

/**
 * ASR request parameters
 */
export interface AsrRequest {
    /**
     * Model to use for ASR. Default: 'asr'
     */
    model?: 'asr' | string;
    /**
     * Audio data to transcribe
     */
    audio: {
        /**
         * Audio format
         */
        format: AudioFormat;
        /**
         * Audio URL (mutually exclusive with data)
         */
        url?: string;
        /**
         * Base64-encoded audio data (mutually exclusive with url)
         */
        data?: string;
        /**
         * Sample rate in Hz (required for raw/pcm format)
         */
        sample_rate?: number;
        /**
         * Number of channels (required for raw/pcm format)
         */
        channels?: number;
    };
    /**
     * Language code (e.g., 'zh', 'en'). Auto-detected if not specified.
     */
    language?: string;
}

/**
 * Word-level timing information
 */
export interface WordTiming {
    /**
     * The word or phrase
     */
    word: string;
    /**
     * Start time in milliseconds
     */
    start: number;
    /**
     * End time in milliseconds
     */
    end: number;
    /**
     * Confidence score (0-1)
     */
    confidence?: number;
}

/**
 * ASR transcription response
 */
export interface AsrResponse {
    /**
     * Full transcribed text
     */
    text: string;
    /**
     * Audio duration in milliseconds
     */
    duration: number;
    /**
     * Detected or specified language
     */
    language?: string;
    /**
     * Word-level timing information (if available)
     */
    words?: WordTiming[];
    /**
     * Overall confidence score (0-1)
     */
    confidence?: number;
}

/**
 * Raw API response format (may vary)
 */
interface AsrApiResponse {
    text?: string;
    content?: string;
    transcript?: string;
    duration?: number;
    duration_ms?: number;
    language?: string;
    words?: WordTiming[];
    confidence?: number;
    data?: {
        text?: string;
        content?: string;
        transcript?: string;
        duration?: number;
        duration_ms?: number;
        language?: string;
        words?: WordTiming[];
        confidence?: number;
    };
    result?: {
        text?: string;
        content?: string;
        transcript?: string;
        duration?: number;
        duration_ms?: number;
        language?: string;
        words?: WordTiming[];
        confidence?: number;
    };
}

export class Asr {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Transcribe audio to text.
     *
     * @example
     * ```typescript
     * // Using audio URL
     * const result = await client.asr.transcribe({
     *   audio: {
     *     format: 'mp3',
     *     url: 'https://example.com/audio.mp3'
     *   }
     * });
     * console.log(result.text);
     *
     * // Using base64 audio data
     * const result = await client.asr.transcribe({
     *   audio: {
     *     format: 'wav',
     *     data: fs.readFileSync('audio.wav').toString('base64')
     *   }
     * });
     *
     * // With word-level timing
     * if (result.words) {
     *   for (const word of result.words) {
     *     console.log(`${word.word}: ${word.start}ms - ${word.end}ms`);
     *   }
     * }
     * ```
     */
    async transcribe(params: AsrRequest): Promise<AsrResponse> {
        const logger = this.client.getLogger();

        // Validate input
        if (!params.audio) {
            throw new Error('Audio data is required');
        }
        if (!params.audio.url && !params.audio.data) {
            throw new Error('Either audio.url or audio.data must be provided');
        }
        if (params.audio.url && params.audio.data) {
            throw new Error('Only one of audio.url or audio.data should be provided, not both');
        }
        if (!params.audio.format) {
            throw new Error('Audio format is required');
        }

        // Validate raw/pcm format requirements
        if (params.audio.format === 'raw' || params.audio.format === 'pcm') {
            if (!params.audio.sample_rate) {
                throw new Error('sample_rate is required for raw/pcm audio format');
            }
            if (!params.audio.channels) {
                throw new Error('channels is required for raw/pcm audio format');
            }
        }

        const requestBody = {
            model: params.model || 'asr',
            audio: {
                format: params.audio.format,
                ...(params.audio.url ? { url: params.audio.url } : {}),
                ...(params.audio.data ? { data: params.audio.data } : {}),
                ...(params.audio.sample_rate ? { sample_rate: params.audio.sample_rate } : {}),
                ...(params.audio.channels ? { channels: params.audio.channels } : {}),
            },
            ...(params.language ? { language: params.language } : {}),
        };

        logger.debug('ASR transcribe request', {
            model: requestBody.model,
            format: params.audio.format,
            hasUrl: !!params.audio.url,
        });

        const response = await this.client.post<AsrApiResponse>('/asr', requestBody);

        // Normalize response format
        return this.normalizeResponse(response, logger);
    }

    /**
     * Normalize various API response formats to a consistent AsrResponse
     */
    private normalizeResponse(response: AsrApiResponse, logger: ReturnType<IQiniuClient['getLogger']>): AsrResponse {
        // Try different response structures
        const data = response.data || response.result || response;

        const text = data.text || data.content || data.transcript || '';
        const duration = data.duration_ms ?? data.duration ?? 0;
        const language = data.language;
        const words = data.words;
        const confidence = data.confidence;

        if (!text) {
            logger.warn('ASR response has no text', { response });
        }

        return {
            text,
            duration,
            language,
            words,
            confidence,
        };
    }
}
