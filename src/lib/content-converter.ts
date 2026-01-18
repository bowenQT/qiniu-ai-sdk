/**
 * Content converter for multimodal messages.
 * Normalizes SDK convenience formats to API-compatible formats.
 * 
 * @example
 * ```typescript
 * import { normalizeContent } from './content-converter';
 * 
 * const content: ContentPart[] = [
 *     { type: 'text', text: 'Describe this image' },
 *     { type: 'image', image: fs.readFileSync('photo.jpg') },
 * ];
 * 
 * const normalized = normalizeContent(content);
 * // [{ type: 'text', text: '...' }, { type: 'image_url', image_url: { url: 'data:...' } }]
 * ```
 */

import type { ContentPart, ImageSource, ImageUrlContentPart } from './types';

/**
 * Normalize content parts for API calls.
 * Converts `image` sugar format to `image_url` API format.
 */
export function normalizeContent(content: string | ContentPart[]): string | ContentPart[] {
    // String content doesn't need normalization
    if (typeof content === 'string') {
        return content;
    }

    // Normalize each content part
    return content.map(part => normalizeContentPart(part));
}

/**
 * Normalize a single content part.
 */
function normalizeContentPart(part: ContentPart): ContentPart {
    // Already in API format
    if (part.type === 'text' || part.type === 'image_url') {
        return part;
    }

    // Convert image sugar to image_url
    if (part.type === 'image') {
        return {
            type: 'image_url',
            image_url: {
                url: imageSourceToDataUrl(part.image),
                detail: part.detail,
            },
        } as ImageUrlContentPart;
    }

    // Unknown type, return as-is
    return part;
}

/**
 * Convert ImageSource to data URL.
 */
function imageSourceToDataUrl(source: ImageSource): string {
    // Already a string (base64 or URL)
    if (typeof source === 'string') {
        // Check if it's already a data URL or regular URL
        if (source.startsWith('data:') || source.startsWith('http://') || source.startsWith('https://')) {
            return source;
        }
        // Assume base64, wrap in data URL
        return `data:image/png;base64,${source}`;
    }

    // URL object
    if (source instanceof URL) {
        return source.toString();
    }

    // Blob (browser)
    if (typeof Blob !== 'undefined' && source instanceof Blob) {
        // Note: Synchronous conversion not possible for Blob
        // For real usage, caller should pre-convert to base64
        throw new Error('Blob must be converted to base64 before passing to normalizeContent. Use blobToDataUrl() helper.');
    }

    // ArrayBuffer or Uint8Array
    if (source instanceof ArrayBuffer) {
        return arrayBufferToDataUrl(new Uint8Array(source));
    }

    if (source instanceof Uint8Array) {
        return arrayBufferToDataUrl(source);
    }

    throw new Error(`Unsupported image source type: ${typeof source}`);
}

/**
 * Convert Uint8Array to data URL.
 */
function arrayBufferToDataUrl(buffer: Uint8Array): string {
    // Detect MIME type from magic bytes
    const mimeType = detectMimeType(buffer);

    // Convert to base64
    const base64 = uint8ArrayToBase64(buffer);

    return `data:${mimeType};base64,${base64}`;
}

/**
 * Detect image MIME type from magic bytes.
 */
function detectMimeType(buffer: Uint8Array): string {
    if (buffer.length < 4) {
        return 'application/octet-stream';
    }

    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'image/png';
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'image/jpeg';
    }

    // GIF: 47 49 46 38
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return 'image/gif';
    }

    // WebP: 52 49 46 46 ... 57 45 42 50
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer.length > 11 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return 'image/webp';
    }

    return 'image/png'; // Default fallback
}

/**
 * Convert Uint8Array to base64 string.
 * Works in both Node.js and browser environments.
 */
function uint8ArrayToBase64(buffer: Uint8Array): string {
    // Node.js environment
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(buffer).toString('base64');
    }

    // Browser environment
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
        binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
}

/**
 * Helper to convert Blob to data URL asynchronously (for browser use).
 * Only available in browser environments.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
    // Check if FileReader is available (browser environment)
    const FR = (globalThis as any).FileReader;
    if (!FR) {
        throw new Error('blobToDataUrl is only available in browser environments');
    }

    return new Promise((resolve, reject) => {
        const reader = new FR();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Check if content contains any image parts that need normalization.
 */
export function hasImageParts(content: string | ContentPart[]): boolean {
    if (typeof content === 'string') {
        return false;
    }
    return content.some(part => part.type === 'image');
}
