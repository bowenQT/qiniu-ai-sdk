import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tts } from '../../../src/modules/tts';

type TtsHookGlobal = typeof globalThis & {
    __QINIU_AI_SDK_TTS_TEST_HOOKS__?: {
        loadOptionalWebSocket?: () => Promise<typeof WebSocket>;
    };
};

function createMockClient() {
    return {
        getBaseUrl: vi.fn(() => 'https://api.qnaigc.com/v1'),
        getLogger: vi.fn(() => ({
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        })),
        getApiKey: vi.fn(() => 'sk-test'),
        post: vi.fn(),
        get: vi.fn(),
        getAbsolute: vi.fn(),
        postAbsolute: vi.fn(),
        postStream: vi.fn(),
        createChildTransport: vi.fn(),
        apiKey: 'sk-test',
    };
}

class FakeBrowserWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    static readonly instances: FakeBrowserWebSocket[] = [];

    readyState = FakeBrowserWebSocket.CONNECTING;
    sent: unknown[] = [];
    args: unknown[];
    onopen: (() => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;

    constructor(...args: unknown[]) {
        this.args = args;
        FakeBrowserWebSocket.instances.push(this);
        queueMicrotask(() => {
            this.readyState = FakeBrowserWebSocket.OPEN;
            this.onopen?.();
            queueMicrotask(() => {
                this.readyState = FakeBrowserWebSocket.CLOSED;
                this.onclose?.({ code: 1000, reason: 'done' });
            });
        });
    }

    send(payload: unknown): void {
        this.sent.push(payload);
    }

    close(code: number, reason: string): void {
        this.readyState = FakeBrowserWebSocket.CLOSED;
        this.onclose?.({ code, reason });
    }
}

class FakeClosingWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readyState = FakeClosingWebSocket.CONNECTING;
    onopen: (() => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;

    constructor(..._args: unknown[]) {
        queueMicrotask(() => {
            this.readyState = FakeClosingWebSocket.CLOSED;
            this.onclose?.({ code: 1006, reason: 'handshake failed' });
        });
    }

    send(): void {}

    close(code: number, reason: string): void {
        this.readyState = FakeClosingWebSocket.CLOSED;
        this.onclose?.({ code, reason });
    }
}

class FakeNodeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    static readonly Server = class {};
}

describe('TTS Module', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        delete (globalThis as TtsHookGlobal).__QINIU_AI_SDK_TTS_TEST_HOOKS__;
        FakeBrowserWebSocket.instances.length = 0;
    });

    it('should fail fast in browsers because the official TTS stream API requires custom headers', async () => {
        const tts = new Tts(createMockClient() as any);

        vi.stubGlobal('process', undefined);
        vi.stubGlobal('WebSocket', FakeBrowserWebSocket as unknown as typeof WebSocket);

        await expect(async () => {
            for await (const _chunk of tts.stream('hello world', { voice_type: 'voice-1' })) {
                // noop
            }
        }).rejects.toThrow('TTS streaming requires a WebSocket implementation that supports custom headers');
        expect(FakeBrowserWebSocket.instances).toHaveLength(0);
    });

    it('should load an optional ws implementation in Node.js when global WebSocket is absent', async () => {
        const tts = new Tts(createMockClient() as any);
        const loadOptionalWebSocket = vi.fn(async () => FakeNodeWebSocket as unknown as typeof WebSocket);

        vi.stubGlobal('WebSocket', undefined);
        (globalThis as TtsHookGlobal).__QINIU_AI_SDK_TTS_TEST_HOOKS__ = {
            loadOptionalWebSocket,
        };

        const wsInfo = await (tts as any).resolveWebSocketImpl();

        expect(loadOptionalWebSocket).toHaveBeenCalledOnce();
        expect(wsInfo.WebSocketImpl).toBe(FakeNodeWebSocket);
        expect(wsInfo.supportsHeaders).toBe(true);
        expect(wsInfo.preferBinary).toBe(true);
    });

    it('should throw a clear error when Node.js TTS streaming has no ws implementation', async () => {
        const tts = new Tts(createMockClient() as any);

        vi.stubGlobal('WebSocket', undefined);
        (globalThis as TtsHookGlobal).__QINIU_AI_SDK_TTS_TEST_HOOKS__ = {
            loadOptionalWebSocket: vi.fn(async () => {
                throw new Error('missing ws');
            }),
        };

        await expect((tts as any).resolveWebSocketImpl()).rejects.toThrow(
            'WebSocket implementation "ws" is required in Node.js for TTS streaming. Install it with: npm install ws'
        );
    });

    it('should normalize bare-array voice lists from the official API', async () => {
        const client = createMockClient();
        client.get.mockResolvedValue([
            {
                voice_type: 'qiniu_zh_female_tmjxxy',
                voice_name: '通用女声',
                url: 'https://example.com/sample.mp3',
            },
        ]);

        const tts = new Tts(client as any);
        const voices = await tts.listVoices();

        expect(voices).toEqual([
            {
                id: 'qiniu_zh_female_tmjxxy',
                name: '通用女声',
                sample_url: 'https://example.com/sample.mp3',
                voice_type: 'qiniu_zh_female_tmjxxy',
                voice_name: '通用女声',
                url: 'https://example.com/sample.mp3',
            },
        ]);
    });

    it('should read duration from addition.duration when synthesizing', async () => {
        const client = createMockClient();
        client.post.mockResolvedValue({
            audio: 'YmFzZTY0',
            addition: {
                duration: '1530',
            },
            format: 'mp3',
        });

        const tts = new Tts(client as any);
        const result = await tts.synthesize({
            text: 'hello',
            voice_type: 'voice-1',
        });

        expect(result).toEqual({
            audio: 'YmFzZTY0',
            duration: 1530,
            format: 'mp3',
            sample_rate: undefined,
        });
    });

    it('should use getApiKey() instead of reading a private apiKey field for streaming auth', async () => {
        const client = createMockClient();
        delete (client as any).apiKey;
        const tts = new Tts(client as any);
        const loadOptionalWebSocket = vi.fn(async () => FakeNodeWebSocket as unknown as typeof WebSocket);

        vi.stubGlobal('WebSocket', undefined);
        (globalThis as TtsHookGlobal).__QINIU_AI_SDK_TTS_TEST_HOOKS__ = {
            loadOptionalWebSocket,
        };

        const wsInfo = await (tts as any).resolveWebSocketImpl();
        expect(wsInfo.supportsHeaders).toBe(true);
        expect((tts as any).apiKey).toBe('sk-test');
    });

    it('should reject when the websocket closes before the stream opens', async () => {
        const tts = new Tts(createMockClient() as any);
        const loadOptionalWebSocket = vi.fn(async () => FakeClosingWebSocket as unknown as typeof WebSocket);

        vi.stubGlobal('WebSocket', undefined);
        (globalThis as TtsHookGlobal).__QINIU_AI_SDK_TTS_TEST_HOOKS__ = {
            loadOptionalWebSocket,
        };

        await expect(async () => {
            for await (const _chunk of tts.stream('hello world', { voice_type: 'voice-1' })) {
                // noop
            }
        }).rejects.toThrow('WebSocket closed before stream started');
    });
});
