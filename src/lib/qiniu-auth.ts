export interface QiniuCredentialAuth {
    accessKey: string;
    secretKey: string;
}

function bytesToBinaryString(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return binary;
}

function urlSafeBase64Encode(input: ArrayBuffer | ArrayBufferView): string {
    const bytes = input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);

    if (typeof btoa !== 'function') {
        throw new Error('Global btoa() is required for Qiniu auth signing');
    }

    return btoa(bytesToBinaryString(bytes)).replace(/\+/g, '-').replace(/\//g, '_');
}

export function buildQiniuSigningString(options: {
    method: string;
    path: string;
    query?: string;
    host: string;
    contentType?: string;
    headers?: Record<string, string>;
    body?: string;
}): string {
    const { method, path, query, host, contentType, headers, body } = options;
    let signingStr = `${method.toUpperCase()} ${path}`;

    if (query) {
        signingStr += `?${query}`;
    }

    signingStr += `\nHost: ${host}`;

    if (contentType) {
        signingStr += `\nContent-Type: ${contentType}`;
    }

    if (headers) {
        const sortedKeys = Object.keys(headers).sort();
        for (const key of sortedKeys) {
            if (key.toLowerCase().startsWith('x-qiniu-')) {
                signingStr += `\n${key}: ${headers[key]}`;
            }
        }
    }

    signingStr += '\n\n';

    if (body && contentType && contentType !== 'application/octet-stream') {
        signingStr += body;
    }

    return signingStr;
}

export async function generateQiniuAccessToken(
    auth: QiniuCredentialAuth,
    options: {
        method: string;
        path: string;
        query?: string;
        host: string;
        contentType?: string;
        headers?: Record<string, string>;
        body?: string;
    },
): Promise<string> {
    if (!globalThis.crypto?.subtle) {
        throw new Error('Web Crypto API is required for Qiniu auth signing');
    }

    const signingStr = buildQiniuSigningString(options);
    const cryptoKey = await globalThis.crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(auth.secretKey),
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign'],
    );
    const signature = await globalThis.crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        new TextEncoder().encode(signingStr),
    );
    const encodedSign = urlSafeBase64Encode(signature);
    return `${auth.accessKey}:${encodedSign}`;
}

export async function resolveQiniuAuthorizationHeader(options: {
    authorization?: string;
    auth?: QiniuCredentialAuth;
    method: string;
    absoluteUrl: string;
    headers?: Record<string, string>;
    body?: string;
}): Promise<string | undefined> {
    if (options.authorization?.trim()) {
        return options.authorization.trim();
    }

    if (!options.auth) {
        return undefined;
    }

    const url = new URL(options.absoluteUrl);
    const contentType = options.headers?.['Content-Type'] ?? options.headers?.['content-type'];
    const query = url.search ? url.search.slice(1) : undefined;
    const token = await generateQiniuAccessToken(options.auth, {
        method: options.method,
        path: url.pathname,
        query,
        host: url.host,
        contentType,
        headers: options.headers,
        body: options.body,
    });

    return `Qiniu ${token}`;
}
