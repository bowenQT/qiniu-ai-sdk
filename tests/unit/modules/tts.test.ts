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

    it('should use the global browser WebSocket without passing node-only options', async () => {
        const tts = new Tts(createMockClient() as any);

        vi.stubGlobal('process', undefined);
        vi.stubGlobal('WebSocket', FakeBrowserWebSocket as unknown as typeof WebSocket);

        const chunks: Uint8Array[] = [];
        for await (const chunk of tts.stream('hello world', { voice_type: 'voice-1' })) {
            chunks.push(chunk);
        }

        expect(chunks).toHaveLength(0);
        expect(FakeBrowserWebSocket.instances).toHaveLength(1);
        expect(FakeBrowserWebSocket.instances[0].args).toEqual([
            'wss://api.qnaigc.com/v1/voice/tts',
        ]);
        expect(FakeBrowserWebSocket.instances[0].sent).toHaveLength(1);
        expect(typeof FakeBrowserWebSocket.instances[0].sent[0]).toBe('string');
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
});
