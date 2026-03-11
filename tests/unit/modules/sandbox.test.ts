import { describe, it, expect } from 'vitest';
import { QiniuAI } from '../../../src/client';
import { createStaticMockFetch, createMockFetch, createBinaryMockFetch } from '../../mocks/fetch';
import {
    normalizeSandboxInfo,
    normalizeListedSandbox,
    normalizeCommandResult,
    normalizeEntryInfo,
    normalizeTemplateInfo,
    normalizeTemplateBuildInfo,
} from '../../../src/modules/sandbox/types';
import type {
    RawSandboxInfo,
    RawListedSandbox,
    RawCommandResult,
    RawEntryInfo,
    RawTemplateInfo,
    RawTemplateBuildInfo,
} from '../../../src/modules/sandbox/types';
import { CommandHandle } from '../../../src/modules/sandbox/sandbox';
import { noopLogger } from '../../../src/lib/logger';

// ============================================================================
// Type normalizer unit tests
// ============================================================================
describe('Sandbox Type Normalizers', () => {
    const rawSandbox: RawSandboxInfo = {
        sandboxID: 'sb-123',
        templateID: 'tpl-base',
        clientID: 'client-456',
        alias: 'my-sandbox',
        domain: 'sb123.sandbox.qiniuapi.com',
        state: 'running',
        cpuCount: 2,
        memoryMB: 512,
        diskSizeMB: 1024,
        envdVersion: '1.0.0',
        startedAt: '2026-03-11T00:00:00Z',
        endAt: '2026-03-11T00:05:00Z',
        metadata: { env: 'test' },
    };

    it('should normalize SandboxInfo from raw API response', () => {
        const result = normalizeSandboxInfo(rawSandbox);

        expect(result.sandboxId).toBe('sb-123');
        expect(result.templateId).toBe('tpl-base');
        expect(result.clientId).toBe('client-456');
        expect(result.state).toBe('running');
        expect(result.startedAt).toBe('2026-03-11T00:00:00Z');
        // Verify it's a string, not a Date
        expect(typeof result.startedAt).toBe('string');
    });

    it('should normalize ListedSandbox', () => {
        const raw: RawListedSandbox = {
            sandboxID: 'sb-789',
            templateID: 'tpl-node',
            clientID: 'client-abc',
            state: 'paused',
            startedAt: '2026-03-11T01:00:00Z',
            endAt: '2026-03-11T01:05:00Z',
        };
        const result = normalizeListedSandbox(raw);
        expect(result.sandboxId).toBe('sb-789');
        expect(result.state).toBe('paused');
    });

    it('should normalize CommandResult', () => {
        const raw: RawCommandResult = { exitCode: 0, stdout: 'hello\n', stderr: '', error: '' };
        const result = normalizeCommandResult(raw);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('hello\n');
    });

    it('should normalize EntryInfo with type mapping', () => {
        const raw: RawEntryInfo = {
            name: 'test.txt',
            type: 'file',
            path: '/tmp/test.txt',
            size: 42,
            permissions: '0644',
            owner: 'root',
            group: 'root',
            modifiedTime: '2026-03-11T02:00:00Z',
        };
        const result = normalizeEntryInfo(raw);
        expect(result.type).toBe('file');
        expect(result.modifiedTime).toBe('2026-03-11T02:00:00Z');
        expect(typeof result.modifiedTime).toBe('string');
    });

    it('should map unknown type to "unknown"', () => {
        const raw: RawEntryInfo = {
            name: 'socket',
            type: 'socket',
            path: '/tmp/socket',
            size: 0,
            permissions: '0777',
            owner: 'root',
            group: 'root',
            modifiedTime: '2026-03-11T00:00:00Z',
        };
        const result = normalizeEntryInfo(raw);
        expect(result.type).toBe('unknown');
    });

    // Phase 2: Template normalizers
    it('should normalize TemplateInfo', () => {
        const raw: RawTemplateInfo = {
            templateID: 'tpl-001',
            name: 'Python Base',
            aliases: ['python', 'py'],
            public: true,
            buildDescription: 'Python 3.12 base image',
            cpuCount: 2,
            memoryMB: 512,
            diskSizeMB: 1024,
            createdAt: '2026-03-10T00:00:00Z',
            updatedAt: '2026-03-11T00:00:00Z',
        };
        const result = normalizeTemplateInfo(raw);
        expect(result.templateId).toBe('tpl-001');
        expect(result.name).toBe('Python Base');
        expect(result.aliases).toEqual(['python', 'py']);
    });

    it('should normalize TemplateBuildInfo', () => {
        const raw: RawTemplateBuildInfo = {
            buildID: 'bld-001',
            templateID: 'tpl-001',
            status: 'ready',
            createdAt: '2026-03-11T00:00:00Z',
            finishedAt: '2026-03-11T00:05:00Z',
        };
        const result = normalizeTemplateBuildInfo(raw);
        expect(result.buildId).toBe('bld-001');
        expect(result.status).toBe('ready');
        expect(result.finishedAt).toBe('2026-03-11T00:05:00Z');
    });
});

// ============================================================================
// Sandbox class integration tests
// ============================================================================
describe('Sandbox Module', () => {
    const rawSandboxResponse: RawSandboxInfo = {
        sandboxID: 'sb-test-001',
        templateID: 'tpl-base',
        clientID: 'client-001',
        domain: 'sb-test.example.com',
        state: 'running',
        cpuCount: 2,
        memoryMB: 512,
        diskSizeMB: 1024,
        envdVersion: '1.0.0',
        startedAt: '2026-03-11T00:00:00Z',
        endAt: '2026-03-11T00:05:00Z',
    };

    describe('Sandbox.create()', () => {
        it('should create a sandbox and return SandboxInstance', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: rawSandboxResponse });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const instance = await client.sandbox.create({ templateId: 'tpl-base' });

            expect(instance.sandboxId).toBe('sb-test-001');
            expect(instance.templateId).toBe('tpl-base');
            expect(instance.domain).toBe('sb-test.example.com');
        });

        it('should send X-API-Key header, not Bearer', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: rawSandboxResponse });
            const client = new QiniuAI({ apiKey: 'sk-test-key', adapter: mockFetch.adapter });

            await client.sandbox.create({ templateId: 'tpl-base' });

            const headers = mockFetch.calls[0].init?.headers as Record<string, string>;
            expect(headers['X-API-Key']).toBe('sk-test-key');
        });

        it('should convert timeoutMs to seconds in request body', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: rawSandboxResponse });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await client.sandbox.create({ templateId: 'tpl-base', timeoutMs: 300_000 });

            const body = JSON.parse(mockFetch.calls[0].init?.body as string);
            expect(body.timeout).toBe(300); // 300000ms -> 300s
        });
    });

    describe('Sandbox.list()', () => {
        it('should list sandboxes', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: [
                    { sandboxID: 'sb-1', templateID: 'tpl-a', clientID: 'c1', state: 'running', startedAt: '2026-03-11T00:00:00Z', endAt: '2026-03-11T00:05:00Z' },
                    { sandboxID: 'sb-2', templateID: 'tpl-b', clientID: 'c2', state: 'paused', startedAt: '2026-03-11T00:00:00Z', endAt: '2026-03-11T00:05:00Z' },
                ],
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const list = await client.sandbox.list();

            expect(list).toHaveLength(2);
            expect(list[0].sandboxId).toBe('sb-1');
            expect(list[1].state).toBe('paused');
        });

        it('should handle empty list', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: [] });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const list = await client.sandbox.list();
            expect(list).toHaveLength(0);
        });
    });

    describe('SandboxInstance lifecycle', () => {
        it('should get sandbox info', async () => {
            // First call: create; Second call: getInfo
            const mockFetch = createMockFetch([
                { status: 200, body: rawSandboxResponse },
                { status: 200, body: { ...rawSandboxResponse, state: 'paused' } },
            ]);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            const info = await instance.getInfo();

            expect(info.state).toBe('paused');
        });

        it('should check isRunning', async () => {
            const mockFetch = createMockFetch([
                { status: 200, body: rawSandboxResponse },
                { status: 200, body: rawSandboxResponse }, // state: running
            ]);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            const running = await instance.isRunning();
            expect(running).toBe(true);
        });

        it('should kill sandbox', async () => {
            const mockFetch = createMockFetch([
                { status: 200, body: rawSandboxResponse },
                { status: 200, body: {} }, // kill response
            ]);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            await instance.kill();

            // Verify DELETE was called
            expect(mockFetch.calls[1].init?.method).toBe('DELETE');
        });

        it('should pause and resume (symmetric API)', async () => {
            const mockFetch = createMockFetch([
                { status: 200, body: rawSandboxResponse },
                { status: 200, body: {} }, // pause
                { status: 200, body: {} }, // resume
            ]);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            await instance.pause();
            await instance.resume();

            // pause and resume should both be POST
            expect(mockFetch.calls[1].init?.method).toBe('POST');
            expect(mockFetch.calls[2].init?.method).toBe('POST');
        });

        it('should expose pty property', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: rawSandboxResponse });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            expect(instance.pty).toBeDefined();
        });
    });

    describe('SandboxCommands', () => {
        /**
         * Helper: create a mock fetch that returns a NDJSON streaming response
         * for the start() call (used by run() which delegates to start()+wait()).
         */
        /**
         * Create a mock ConnectRPC server-streaming response with envelope format.
         * Each event is wrapped in a 5-byte header (flags=0x00 + big-endian uint32 length).
         */
        function createNdjsonStreamResponse(events: Array<Record<string, unknown>>): Response {
            const encoder = new TextEncoder();
            // Build ConnectRPC envelopes
            const envelopes: Uint8Array[] = [];
            for (const event of events) {
                const jsonBytes = encoder.encode(JSON.stringify(event));
                const header = new Uint8Array(5);
                header[0] = 0x00; // data frame
                header[1] = (jsonBytes.length >> 24) & 0xFF;
                header[2] = (jsonBytes.length >> 16) & 0xFF;
                header[3] = (jsonBytes.length >> 8) & 0xFF;
                header[4] = jsonBytes.length & 0xFF;
                const envelope = new Uint8Array(5 + jsonBytes.length);
                envelope.set(header);
                envelope.set(jsonBytes, 5);
                envelopes.push(envelope);
            }
            // Add trailer frame
            const trailerJson = encoder.encode('{}');
            const trailerHeader = new Uint8Array(5);
            trailerHeader[0] = 0x02; // trailer frame
            trailerHeader[1] = (trailerJson.length >> 24) & 0xFF;
            trailerHeader[2] = (trailerJson.length >> 16) & 0xFF;
            trailerHeader[3] = (trailerJson.length >> 8) & 0xFF;
            trailerHeader[4] = trailerJson.length & 0xFF;
            const trailerEnvelope = new Uint8Array(5 + trailerJson.length);
            trailerEnvelope.set(trailerHeader);
            trailerEnvelope.set(trailerJson, 5);
            envelopes.push(trailerEnvelope);

            // Concatenate all envelopes
            const totalLen = envelopes.reduce((sum, e) => sum + e.length, 0);
            const allData = new Uint8Array(totalLen);
            let offset = 0;
            for (const e of envelopes) {
                allData.set(e, offset);
                offset += e.length;
            }

            const body = new ReadableStream({
                start(controller) {
                    controller.enqueue(allData);
                    controller.close();
                },
            });
            return new Response(body, { status: 200 });
        }

        it('should run a command and return result via streaming', async () => {
            // Base64-encode "hello\n" for proto bytes field
            const helloB64 = Buffer.from('hello\n').toString('base64');

            let callCount = 0;
            const adapter = {
                fetch: async (url: string, init?: RequestInit) => {
                    callCount++;
                    if (callCount === 1) {
                        // create sandbox
                        return new Response(JSON.stringify(rawSandboxResponse), { status: 200 });
                    }
                    // start() => NDJSON stream
                    return createNdjsonStreamResponse([
                        { result: { event: { start: { pid: 10 } } } },
                        { result: { event: { data: { stdout: helloB64, stderr: '' } } } },
                        { result: { event: { end: { exitCode: 0 } } } },
                    ]);
                },
            };
            const client = new QiniuAI({ apiKey: 'sk-test', adapter });
            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            const result = await instance.commands.run('echo hello');

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('hello\n');
        });

        it('should pass env vars and cwd in command request', async () => {
            const capturedBodies: unknown[] = [];
            let callCount = 0;
            const adapter = {
                fetch: async (url: string, init?: RequestInit) => {
                    callCount++;
                    if (init?.body) capturedBodies.push(init.body);
                    if (callCount === 1) {
                        return new Response(JSON.stringify(rawSandboxResponse), { status: 200 });
                    }
                    return createNdjsonStreamResponse([
                        { result: { event: { start: { pid: 11 } } } },
                        { result: { event: { end: { exitCode: 0 } } } },
                    ]);
                },
            };
            const client = new QiniuAI({ apiKey: 'sk-test', adapter });
            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            await instance.commands.run('ls', { cwd: '/home', envs: { PATH: '/usr/bin' } });

            // Body is ConnectRPC envelope: 5-byte header + JSON payload
            const envBody = capturedBodies[1] as Uint8Array;
            const payload = new TextDecoder().decode(envBody.slice(5));
            const body = JSON.parse(payload);
            expect(body.process.cmd).toBe('/bin/bash');
            expect(body.process.args).toEqual(['-l', '-c', 'ls']);
            expect(body.process.envs).toEqual({ PATH: '/usr/bin' });
            expect(body.process.cwd).toBe('/home');
        });

        it('should pass timeoutMs to start() options', async () => {
            const capturedBodies: unknown[] = [];
            let callCount = 0;
            const adapter = {
                fetch: async (url: string, init?: RequestInit) => {
                    callCount++;
                    if (init?.body) capturedBodies.push(init.body);
                    if (callCount === 1) {
                        return new Response(JSON.stringify(rawSandboxResponse), { status: 200 });
                    }
                    return createNdjsonStreamResponse([
                        { result: { event: { start: { pid: 12 } } } },
                        { result: { event: { end: { exitCode: 0 } } } },
                    ]);
                },
            };
            const client = new QiniuAI({ apiKey: 'sk-test', adapter });
            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            await instance.commands.run('sleep 5', { timeoutMs: 10_000 });

            // Body is now ConnectRPC envelope (Uint8Array): 5-byte header + JSON payload
            const envBody = capturedBodies[1] as Uint8Array;
            const payload = new TextDecoder().decode(envBody.slice(5));
            const body = JSON.parse(payload);
            expect(body.process.cmd).toBe('/bin/bash');
            expect(body.process.args).toEqual(['-l', '-c', 'sleep 5']);
        });

        it('should list processes', async () => {
            const mockFetch = createMockFetch([
                { status: 200, body: rawSandboxResponse },
                {
                    status: 200,
                    body: {
                        processes: [
                            { pid: 1, config: { cmd: '/bin/bash', args: ['-l'], envs: {}, cwd: '/' } },
                            { pid: 2, tag: 'worker', config: { cmd: 'node', args: ['server.js'] } },
                        ],
                    },
                },
            ]);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            const procs = await instance.commands.listProcesses();

            expect(procs).toHaveLength(2);
            expect(procs[0].pid).toBe(1);
            expect(procs[1].tag).toBe('worker');
            expect(procs[1].cmd).toBe('node');
        });

        it('should send start request with bash wrapping', async () => {
            const mockFetch = createMockFetch([
                { status: 200, body: rawSandboxResponse },
                // start() calls postRaw, which goes through adapter directly
                { status: 200, body: '' },
            ]);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const instance = await client.sandbox.create({ templateId: 'tpl-base' });

            // start returns a CommandHandle, but the response isn't a real stream
            // so we just verify the request format
            try {
                await instance.commands.start('echo hi', { tag: 'test-tag' });
            } catch {
                // Expected: stream parsing will fail on non-streaming response
            }

            // Body is ConnectRPC envelope: 5-byte header + JSON payload
            const envBody = mockFetch.calls[1].init?.body as Uint8Array;
            const payload = new TextDecoder().decode(envBody.slice(5));
            const body = JSON.parse(payload);
            expect(body.process.cmd).toBe('/bin/bash');
            expect(body.process.args).toEqual(['-l', '-c', 'echo hi']);
            expect(body.tag).toBe('test-tag');
        });
    });

    describe('SandboxFilesystem', () => {
        it('should write text to a file', async () => {
            const mockFetch = createMockFetch([
                { status: 200, body: rawSandboxResponse },
                { status: 200, body: {} }, // write response
            ]);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            await instance.files.write('/tmp/test.txt', 'hello world');

            // Write now uses multipart FormData POST to /files?path=...&user=user
            const writeUrl = mockFetch.calls[1].url;
            expect(writeUrl).toContain('/files?path=');
            expect(writeUrl).toContain('user=user');
            expect(mockFetch.calls[1].init?.body).toBeInstanceOf(FormData);
        });

        it('should list directory entries', async () => {
            const mockFetch = createMockFetch([
                { status: 200, body: rawSandboxResponse },
                {
                    status: 200,
                    body: {
                        entries: [
                            { name: 'file.txt', type: 'file', path: '/tmp/file.txt', size: 100, permissions: '0644', owner: 'root', group: 'root', modifiedTime: '2026-03-11T00:00:00Z' },
                        ],
                    },
                },
            ]);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            const entries = await instance.files.list('/tmp');

            expect(entries).toHaveLength(1);
            expect(entries[0].name).toBe('file.txt');
            expect(entries[0].type).toBe('file');
            // Verify ListDir path (not List)
            expect(mockFetch.calls[1].url).toContain('/filesystem.Filesystem/ListDir');
        });

        it('should make directory', async () => {
            const mockFetch = createMockFetch([
                { status: 200, body: rawSandboxResponse },
                { status: 200, body: {} },
            ]);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            await instance.files.makeDir('/tmp/newdir');

            const body = JSON.parse(mockFetch.calls[1].init?.body as string);
            expect(body.path).toBe('/tmp/newdir');
        });

        it('should check file exists (true)', async () => {
            const mockFetch = createMockFetch([
                { status: 200, body: rawSandboxResponse },
                { status: 200, body: { name: 'test.txt', type: 'file' } },
            ]);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            const exists = await instance.files.exists('/tmp/test.txt');
            expect(exists).toBe(true);
        });

        it('should check file exists (false)', async () => {
            const mockFetch = createMockFetch([
                { status: 200, body: rawSandboxResponse },
                { status: 404, body: { message: 'Not found' } },
            ]);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const instance = await client.sandbox.create({ templateId: 'tpl-base' });
            const exists = await instance.files.exists('/tmp/nope');
            expect(exists).toBe(false);
        });
    });

    describe('Templates', () => {
        it('should list templates', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: [
                    { templateID: 'tpl-1', name: 'Python', public: true, buildDescription: '', cpuCount: 2, memoryMB: 512, diskSizeMB: 1024, createdAt: '2026-03-11T00:00:00Z', updatedAt: '2026-03-11T00:00:00Z' },
                ],
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const templates = await client.sandbox.templates.list();
            expect(templates).toHaveLength(1);
            expect(templates[0].templateId).toBe('tpl-1');
            expect(templates[0].name).toBe('Python');
        });

        it('should create a template', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { templateID: 'tpl-new', buildID: 'bld-001' },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const result = await client.sandbox.templates.create({
                name: 'My Template',
                dockerfile: 'FROM python:3.12',
            });

            expect(result.templateId).toBe('tpl-new');
            expect(result.buildId).toBe('bld-001');
        });

        it('should delete a template', async () => {
            const mockFetch = createMockFetch([
                { status: 200, body: {} },
            ]);
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            await client.sandbox.templates.delete('tpl-old');

            expect(mockFetch.calls[0].init?.method).toBe('DELETE');
            expect(mockFetch.calls[0].url).toContain('/templates/tpl-old');
        });

        it('should get build status', async () => {
            const mockFetch = createStaticMockFetch({
                status: 200,
                body: { buildID: 'bld-001', templateID: 'tpl-001', status: 'ready', createdAt: '2026-03-11T00:00:00Z', finishedAt: '2026-03-11T00:05:00Z' },
            });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const build = await client.sandbox.templates.getBuildStatus('tpl-001', 'bld-001');
            expect(build.status).toBe('ready');
            expect(build.buildId).toBe('bld-001');
        });
    });

    describe('CommandHandle', () => {
        it('should feed events and resolve wait', async () => {
            // Create a mock transport (won't be used for events)
            const mockFetch = createStaticMockFetch({ status: 200, body: {} });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });
            const transport = client.createChildTransport('https://test.example.com', {});

            const handle = new CommandHandle(transport, noopLogger);

            // Feed start event
            handle._feedEvent({ type: 'start', pid: 42 });
            expect(handle.pid).toBe(42);

            // Feed end event via final result
            handle._feedFinalResult({
                exitCode: 0,
                stdout: 'output',
                stderr: '',
                error: '',
            });

            const result = await handle.wait();
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('output');
        });

        it('should reject on error', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: {} });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });
            const transport = client.createChildTransport('https://test.example.com', {});

            const handle = new CommandHandle(transport, noopLogger);
            handle._feedError(new Error('Stream broken'));

            await expect(handle.wait()).rejects.toThrow('Stream broken');
        });
    });

    describe('Edge cases', () => {
        it('should use custom sandbox config endpoint', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: rawSandboxResponse });
            const client = new QiniuAI({
                apiKey: 'sk-test',
                adapter: mockFetch.adapter,
                sandbox: { endpoint: 'https://custom-sandbox.example.com' },
            });

            await client.sandbox.create({ templateId: 'tpl-base' });

            expect(mockFetch.calls[0].url).toContain('https://custom-sandbox.example.com');
        });

        it('should handle null metadata in list response', async () => {
            const mockFetch = createStaticMockFetch({ status: 200, body: null });
            const client = new QiniuAI({ apiKey: 'sk-test', adapter: mockFetch.adapter });

            const list = await client.sandbox.list();
            expect(list).toHaveLength(0);
        });
    });
});
