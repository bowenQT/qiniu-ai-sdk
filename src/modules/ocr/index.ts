import { IQiniuClient } from '../../lib/types';

/**
 * OCR request parameters
 */
export interface OcrRequest {
    /**
     * Model to use for OCR. Default: 'ocr'
     */
    model?: 'ocr' | string;
    /**
     * Image URL (mutually exclusive with image)
     */
    url?: string;
    /**
     * Base64-encoded image data (mutually exclusive with url)
     */
    image?: string;
}

/**
 * Detected text block from OCR
 */
export interface OcrBlock {
    /**
     * Detected text content
     */
    text: string;
    /**
     * Confidence score (0-1)
     */
    confidence?: number;
    /**
     * Bounding box coordinates [x, y, width, height]
     */
    bbox?: [number, number, number, number];
}

/**
 * OCR detection response
 */
export interface OcrResponse {
    /**
     * Request ID (if provided by API)
     */
    id?: string;
    /**
     * Full extracted text from the image
     */
    text: string;
    /**
     * Overall confidence score (0-1)
     */
    confidence?: number;
    /**
     * Individual text blocks with positions
     */
    blocks?: OcrBlock[];
}

/**
 * Raw API response format (may vary)
 */
interface OcrApiResponse {
    id?: string;
    text?: string;
    content?: string;
    confidence?: number;
    blocks?: OcrBlock[];
    data?: {
        id?: string;
        text?: string;
        content?: string;
        confidence?: number;
        blocks?: OcrBlock[];
    };
    result?: {
        id?: string;
        text?: string;
        content?: string;
        confidence?: number;
        blocks?: OcrBlock[];
    };
}

export class Ocr {
    private client: IQiniuClient;

    constructor(client: IQiniuClient) {
        this.client = client;
    }

    /**
     * Detect and extract text from an image.
     *
     * @example
     * ```typescript
     * // Using image URL
     * const result = await client.ocr.detect({
     *   url: 'https://example.com/image.png'
     * });
     * console.log(result.text);
     *
     * // Using base64 image
     * const result = await client.ocr.detect({
     *   image: fs.readFileSync('image.png').toString('base64')
     * });
     * ```
     */
    async detect(params: OcrRequest): Promise<OcrResponse> {
        const logger = this.client.getLogger();

        // Validate input
        if (!params.url && !params.image) {
            throw new Error('Either url or image must be provided');
        }
        if (params.url && params.image) {
            throw new Error('Only one of url or image should be provided, not both');
        }

        const requestBody = {
            model: params.model || 'ocr',
            ...(params.url ? { url: params.url } : {}),
            ...(params.image ? { image: params.image } : {}),
        };

        logger.debug('OCR detect request', { model: requestBody.model, hasUrl: !!params.url });

        const response = await this.client.post<OcrApiResponse>('/images/ocr', requestBody);

        // Normalize response format
        return this.normalizeResponse(response, logger);
    }

    /**
     * Normalize various API response formats to a consistent OcrResponse
     */
    private normalizeResponse(response: OcrApiResponse, logger: ReturnType<IQiniuClient['getLogger']>): OcrResponse {
        // Try different response structures
        const data = response.data || response.result || response;

        const text = data.text || data.content || response.text || '';
        const confidence = data.confidence;
        const blocks = data.blocks;

        if (!text && !blocks?.length) {
            logger.warn('OCR response has no text or blocks', { response });
        }

        return {
            id: data.id || response.id,
            text,
            confidence,
            blocks,
        };
    }
}
