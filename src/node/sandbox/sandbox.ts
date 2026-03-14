/**
 * SandboxInstance — Represents a connected sandbox with command, file, and PTY operations.
 * SandboxCommands — Executes commands inside the sandbox via ConnectRPC JSON mode.
 * SandboxFilesystem — File operations via envd HTTP API.
 * SandboxPty — PTY terminal sessions.
 * CommandHandle — Handle for a running background command or PTY session.
 */
import type { ChildTransport } from '../../lib/child-transport';
import { pollUntilComplete } from '../../lib/poller';
import type { Logger } from '../../lib/logger';
import {
    SandboxInfo,
    RawSandboxInfo,
    RawCommandResult,
    RawEntryInfo,
    CommandResult,
    EntryInfo,
    RunCommandOptions,
    WaitUntilReadyOptions,
    StreamCommandOptions,
    ProcessEvent,
    ProcessInfo,
    PtySize,
    PtyOptions,
    normalizeSandboxInfo,
    normalizeCommandResult,
    normalizeEntryInfo,
} from './types';

// ============================================================================
// CommandHandle — Async handle for streaming commands & PTY
// ============================================================================

/**
 * Handle for a background process (command or PTY).
 * Provides access to output, completion, and process control.
 */
export class CommandHandle {
    /** Process ID (assigned after start event) */
    pid: number = 0;

    private transport: ChildTransport;
    private logger: Logger;
    private _result: CommandResult | null = null;
    private _done: Promise<CommandResult>;
    private _resolveDone!: (result: CommandResult) => void;
    private _rejectDone!: (err: Error) => void;

    constructor(transport: ChildTransport, logger: Logger) {
        this.transport = transport;
        this.logger = logger;
        this._done = new Promise<CommandResult>((resolve, reject) => {
            this._resolveDone = resolve;
            this._rejectDone = reject;
        });
    }

    /**
     * Wait for the command to complete and return the result.
     */
    async wait(): Promise<CommandResult> {
        return this._done;
    }

    /**
     * Get the result if already completed, or null if still running.
     */
    get result(): CommandResult | null {
        return this._result;
    }

    /**
     * Send data to the process's stdin.
     */
    async sendStdin(data: string): Promise<void> {
        if (this.pid === 0) throw new Error('Process not started yet');
        this.logger.debug('Sending stdin', { pid: this.pid });
        await this.transport.post('/process.Process/SendInput', {
            process: { pid: this.pid },
            input: { stdin: data },
        });
    }

    /**
     * Send data to PTY input.
     */
    async sendPtyInput(data: string): Promise<void> {
        if (this.pid === 0) throw new Error('Process not started yet');
        this.logger.debug('Sending PTY input', { pid: this.pid });
        await this.transport.post('/process.Process/SendInput', {
            process: { pid: this.pid },
            input: { pty: data },
        });
    }

    /**
     * Close stdin (send EOF to the process).
     */
    async closeStdin(): Promise<void> {
        if (this.pid === 0) throw new Error('Process not started yet');
        this.logger.debug('Closing stdin', { pid: this.pid });
        await this.transport.post('/process.Process/CloseStdin', {
            process: { pid: this.pid },
        });
    }

    /**
     * Kill the process.
     */
    async kill(): Promise<void> {
        if (this.pid === 0) throw new Error('Process not started yet');
        this.logger.debug('Killing process', { pid: this.pid });
        await this.transport.post('/process.Process/SendSignal', {
            process: { pid: this.pid },
            signal: 'SIGNAL_SIGKILL',
        });
    }

    /**
     * Feed a process event into this handle (used internally by stream parser).
     * @internal
     */
    _feedEvent(event: ProcessEvent): void {
        switch (event.type) {
            case 'start':
                this.pid = event.pid;
                break;
            case 'end':
                this._result = {
                    exitCode: event.exitCode,
                    stdout: '',
                    stderr: '',
                    error: event.error || '',
                };
                this._resolveDone(this._result);
                break;
        }
    }

    /**
     * Feed accumulated stdout/stderr into the final result.
     * @internal
     */
    _feedFinalResult(result: CommandResult): void {
        this._result = result;
        this._resolveDone(result);
    }

    /**
     * Feed error for aborted stream.
     * @internal
     */
    _feedError(err: Error): void {
        this._rejectDone(err);
    }
}

// ============================================================================
// ConnectRPC Connect Protocol Helpers
// ============================================================================

/**
 * Build a ConnectRPC Connect protocol envelope for a streaming request.
 * Format: 1 byte flags (0x00=data) + 4 bytes big-endian uint32 length + JSON payload.
 */
function buildConnectEnvelope(body: unknown): Uint8Array {
    const jsonPayload = JSON.stringify(body);
    const payloadBytes = new TextEncoder().encode(jsonPayload);
    const envelope = new Uint8Array(5 + payloadBytes.length);
    envelope[0] = 0x00; // flags: data frame
    envelope[1] = (payloadBytes.length >> 24) & 0xFF;
    envelope[2] = (payloadBytes.length >> 16) & 0xFF;
    envelope[3] = (payloadBytes.length >> 8) & 0xFF;
    envelope[4] = payloadBytes.length & 0xFF;
    envelope.set(payloadBytes, 5);
    return envelope;
}

/** Standard headers for ConnectRPC streaming requests. */
const CONNECT_STREAM_HEADERS = { 'Content-Type': 'application/connect+json' };

/**
 * Send a ConnectRPC streaming request: envelope-framed body + connect+json Content-Type.
 */
function postConnectStream(
    transport: ChildTransport,
    path: string,
    body: unknown,
    timeoutMs?: number,
): Promise<Response> {
    return transport.postRaw(path, buildConnectEnvelope(body), {
        timeout: timeoutMs,
        headers: CONNECT_STREAM_HEADERS,
    });
}

// ============================================================================
// ConnectRPC Server-Streaming Parser
// ============================================================================

/**
 * Decode a base64-encoded protobuf bytes field to UTF-8 string.
 * In ConnectRPC JSON mode, `bytes` fields are base64-encoded.
 */
function decodeBase64(input: string): string {
    try {
        return Buffer.from(input, 'base64').toString('utf-8');
    } catch {
        return input; // Fallback: return as-is if not valid base64
    }
}

/**
 * Parse a ConnectRPC server-streaming response (Connect protocol envelope format).
 *
 * ConnectRPC Connect protocol uses binary framing:
 * - Each message is preceded by a 5-byte envelope header
 * - Byte 0: flags (0x00 = data, 0x02 = end/trailer)
 * - Bytes 1-4: message length (big-endian uint32)
 * - Followed by the JSON-encoded message payload
 *
 * Data envelope JSON format:
 * {"event": {"start": {"pid": 123}}}
 * {"event": {"data": {"stdout": "base64...", "stderr": "", "pty": ""}}}
 * {"event": {"end": {"exitCode": 0, "error": null}}}
 *
 * Note: stdout/stderr/pty are protobuf `bytes` fields, base64-encoded in JSON mode.
 */
async function processStreamResponse(
    response: Response,
    handle: CommandHandle,
    onStdout?: (data: string) => void,
    onStderr?: (data: string) => void,
    onPtyData?: (data: string) => void,
): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
        handle._feedError(new Error('Response body is null'));
        return;
    }

    let buffer = new Uint8Array(0);
    let stdout = '';
    let stderr = '';
    const decoder = new TextDecoder();

    /**
     * Append new chunk to the buffer.
     */
    function appendToBuffer(chunk: Uint8Array): void {
        const newBuffer = new Uint8Array(buffer.length + chunk.length);
        newBuffer.set(buffer);
        newBuffer.set(chunk, buffer.length);
        buffer = newBuffer;
    }

    /**
     * Process a single ConnectRPC envelope message.
     */
    function processEnvelope(flags: number, payload: Uint8Array): void {
        if (flags === 0x02) {
            // End-of-stream trailer — may contain error info
            return;
        }

        const json = decoder.decode(payload);
        try {
            const msg = JSON.parse(json);
            const event = msg.event || msg.result?.event || msg;

            if (event.start) {
                handle._feedEvent({ type: 'start', pid: event.start.pid });
            } else if (event.data) {
                // Decode base64-encoded protobuf bytes fields
                const stdoutData = event.data.stdout ? decodeBase64(event.data.stdout) : '';
                const stderrData = event.data.stderr ? decodeBase64(event.data.stderr) : '';
                const ptyData = event.data.pty ? decodeBase64(event.data.pty) : '';

                if (stdoutData) {
                    stdout += stdoutData;
                    onStdout?.(stdoutData);
                }
                if (stderrData) {
                    stderr += stderrData;
                    onStderr?.(stderrData);
                }
                if (ptyData) {
                    onPtyData?.(ptyData);
                }
            } else if (event.end) {
                // envd returns: {exited: true, status: "exit status N"} or {exitCode: N}
                let exitCode = event.end.exitCode ?? -1;
                if (exitCode === -1 && event.end.status) {
                    // Parse "exit status 0" → 0
                    const match = String(event.end.status).match(/exit status (\d+)/);
                    if (match) exitCode = parseInt(match[1], 10);
                    else if (event.end.exited) exitCode = 0;
                }
                handle._feedFinalResult({
                    exitCode,
                    stdout,
                    stderr,
                    error: event.end.error || '',
                });
            }
        } catch {
            // Skip unparseable payloads
        }
    }

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            appendToBuffer(value);

            // Process complete envelopes from buffer
            while (buffer.length >= 5) {
                const flags = buffer[0];
                const length = (buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4];

                if (buffer.length < 5 + length) {
                    break; // Wait for more data
                }

                const payload = buffer.slice(5, 5 + length);
                buffer = buffer.slice(5 + length);

                processEnvelope(flags, payload);
            }
        }

        // Stream ended without End event
        if (!handle.result) {
            handle._feedFinalResult({
                exitCode: -1,
                stdout,
                stderr,
                error: 'Stream ended without End event',
            });
        }
    } catch (err) {
        handle._feedError(err instanceof Error ? err : new Error(String(err)));
    }
}

// ============================================================================
// SandboxInstance
// ============================================================================

/**
 * A running sandbox instance.
 */
export class SandboxInstance {
    readonly sandboxId: string;
    readonly templateId: string;
    readonly domain?: string;
    readonly commands: SandboxCommands;
    readonly files: SandboxFilesystem;
    readonly pty: SandboxPty;

    private transport: ChildTransport;
    private envdTransport: ChildTransport;
    private logger: Logger;

    constructor(
        info: SandboxInfo,
        transport: ChildTransport,
        envdTransport: ChildTransport,
        logger: Logger
    ) {
        this.sandboxId = info.sandboxId;
        this.templateId = info.templateId;
        this.domain = info.domain;
        this.transport = transport;
        this.envdTransport = envdTransport;
        this.logger = logger;
        this.commands = new SandboxCommands(this.envdTransport, this.logger);
        this.files = new SandboxFilesystem(this.envdTransport, this.logger);
        this.pty = new SandboxPty(this.envdTransport, this.logger);
    }

    /** Get current sandbox info from the API. */
    async getInfo(): Promise<SandboxInfo> {
        const raw = await this.transport.get<RawSandboxInfo>(`/sandboxes/${this.sandboxId}`);
        return normalizeSandboxInfo(raw);
    }

    /**
     * Check if the sandbox envd agent is running and reachable.
     * Unlike getInfo() which queries the control-plane, this probes
     * the envd `/health` endpoint directly (matches Go SDK behavior).
     */
    async isRunning(): Promise<boolean> {
        try {
            const response = await this.envdTransport.getRaw('/health');
            return response.status === 204 || response.ok;
        } catch {
            return false;
        }
    }

    /**
     * Wait until the sandbox envd agent is ready to accept commands.
     * Strategy: first wait for control-plane state to become 'running',
     * then probe envd `/health` until it responds 204.
     * This ensures both the control plane AND the envd agent are ready.
     */
    async waitUntilReady(opts?: WaitUntilReadyOptions): Promise<void> {
        const totalTimeoutMs = opts?.timeoutMs ?? 30_000;
        const intervalMs = opts?.intervalMs ?? 500;
        const deadline = Date.now() + totalTimeoutMs;

        this.logger.debug('Waiting for sandbox to be ready', {
            sandboxId: this.sandboxId, totalTimeoutMs, intervalMs,
        });

        // Phase 1: Wait for control-plane state to become 'running'
        await pollUntilComplete(this.sandboxId, {
            intervalMs,
            timeoutMs: totalTimeoutMs,
            isTerminal: (info: SandboxInfo) => info.state === 'running',
            getStatus: async () => this.getInfo(),
            logger: this.logger,
        });

        // Phase 2: Probe envd /health — use remaining budget, not full timeout
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
            throw new Error(`Sandbox ${this.sandboxId} timed out waiting for envd readiness`);
        }
        this.logger.debug('Control-plane ready, probing envd health', {
            sandboxId: this.sandboxId, remainingMs,
        });
        await pollUntilComplete(`${this.sandboxId}/envd`, {
            intervalMs,
            timeoutMs: remainingMs,
            isTerminal: (ready: boolean) => ready,
            getStatus: async () => this.isRunning(),
            logger: this.logger,
        });
    }

    /** Terminate the sandbox immediately. */
    async kill(): Promise<void> {
        this.logger.info('Killing sandbox', { sandboxId: this.sandboxId });
        await this.transport.delete(`/sandboxes/${this.sandboxId}`);
    }

    /** Pause the sandbox (can be resumed later). */
    async pause(): Promise<void> {
        this.logger.info('Pausing sandbox', { sandboxId: this.sandboxId });
        await this.transport.post(`/sandboxes/${this.sandboxId}/pause`, {});
    }

    /** Resume a paused sandbox. Delegates to connect API under the hood. */
    async resume(opts?: { timeoutMs?: number }): Promise<void> {
        this.logger.info('Resuming sandbox', { sandboxId: this.sandboxId });
        await this.transport.post(`/sandboxes/${this.sandboxId}/resume`, {
            timeout: opts?.timeoutMs ? Math.ceil(opts.timeoutMs / 1000) : undefined,
        });
    }

    /** Extend the sandbox lifetime. */
    async refresh(extensionMs?: number): Promise<void> {
        this.logger.debug('Refreshing sandbox timeout', { sandboxId: this.sandboxId, extensionMs });
        await this.transport.post(`/sandboxes/${this.sandboxId}/refreshes`, {
            duration: extensionMs ? Math.ceil(extensionMs / 1000) : undefined,
        });
    }

    /** Update sandbox timeout (total remaining lifetime). */
    async setTimeout(timeoutMs: number): Promise<void> {
        await this.transport.post(`/sandboxes/${this.sandboxId}/timeout`, {
            timeout: Math.ceil(timeoutMs / 1000),
        });
    }

    /** Get the hostname for accessing a specific port in the sandbox. */
    getHost(port: number): string {
        if (this.domain) {
            return `${port}-${this.domain}`;
        }
        return `${this.sandboxId}-${port}.sandbox.qiniuapi.com`;
    }
}

// ============================================================================
// SandboxCommands
// ============================================================================

/**
 * Command execution inside a sandbox via ConnectRPC JSON mode.
 */
export class SandboxCommands {
    private transport: ChildTransport;
    private logger: Logger;

    constructor(transport: ChildTransport, logger: Logger) {
        this.transport = transport;
        this.logger = logger;
    }

    /**
     * Execute a command and wait for completion (synchronous mode).
     * Delegates to start() + wait() to ensure unified request schema
     * (matches Go SDK: Run = Start + Wait).
     */
    async run(cmd: string, opts?: RunCommandOptions): Promise<CommandResult> {
        this.logger.debug('Running command in sandbox', { cmd, opts });

        const handle = await this.start(cmd, {
            timeoutMs: opts?.timeoutMs,
            cwd: opts?.cwd,
            envs: opts?.envs,
            user: opts?.user,
        });

        return handle.wait();
    }

    /**
     * Start a command in the background with streaming output.
     * Returns a CommandHandle for waiting, sending stdin, or killing.
     */
    async start(cmd: string, opts?: StreamCommandOptions): Promise<CommandHandle> {
        this.logger.debug('Starting streaming command', { cmd, opts });

        const body = {
            process: {
                cmd: '/bin/bash',
                args: ['-l', '-c', cmd],
                envs: opts?.envs,
                cwd: opts?.cwd,
            },
            user: opts?.user,
            stdin: opts?.stdin,
            tag: opts?.tag,
        };

        const response = await postConnectStream(
            this.transport, '/process.Process/Start', body, opts?.timeoutMs,
        );

        const handle = new CommandHandle(this.transport, this.logger);

        // Process stream in the background
        processStreamResponse(
            response,
            handle,
            opts?.onStdout,
            opts?.onStderr,
        ).catch(err => {
            this.logger.error('Stream processing error', { error: err });
        });

        return handle;
    }

    /**
     * Connect to a running process by PID.
     */
    async connect(pid: number, opts?: StreamCommandOptions): Promise<CommandHandle> {
        this.logger.debug('Connecting to process', { pid });

        const body = {
            process: { pid },
        };

        const response = await postConnectStream(
            this.transport, '/process.Process/Connect', body, opts?.timeoutMs,
        );

        const handle = new CommandHandle(this.transport, this.logger);
        handle.pid = pid;

        processStreamResponse(
            response,
            handle,
            opts?.onStdout,
            opts?.onStderr,
        ).catch(err => {
            this.logger.error('Connect stream processing error', { error: err });
        });

        return handle;
    }

    /**
     * List all running processes in the sandbox.
     */
    async listProcesses(): Promise<ProcessInfo[]> {
        const raw = await this.transport.post<{ processes: Array<{
            pid: number;
            tag?: string;
            config?: { cmd: string; args: string[]; envs?: Record<string, string>; cwd?: string };
        }>}>('/process.Process/List', {});

        return (raw.processes || []).map(p => ({
            pid: p.pid,
            tag: p.tag,
            cmd: p.config?.cmd || '',
            args: p.config?.args || [],
            envs: p.config?.envs,
            cwd: p.config?.cwd,
        }));
    }

    /**
     * Kill a process by PID.
     */
    async killProcess(pid: number): Promise<void> {
        this.logger.debug('Killing process', { pid });
        await this.transport.post('/process.Process/SendSignal', {
            process: { pid },
            signal: 'SIGNAL_SIGKILL',
        });
    }

    /**
     * Send stdin data to a process.
     */
    async sendStdin(pid: number, data: string): Promise<void> {
        await this.transport.post('/process.Process/SendInput', {
            process: { pid },
            input: { stdin: data },
        });
    }

    /**
     * Close stdin of a process (send EOF).
     */
    async closeStdin(pid: number): Promise<void> {
        await this.transport.post('/process.Process/CloseStdin', {
            process: { pid },
        });
    }
}

// ============================================================================
// SandboxPty
// ============================================================================

/**
 * PTY (Pseudo-Terminal) operations inside a sandbox.
 */
export class SandboxPty {
    private transport: ChildTransport;
    private logger: Logger;

    constructor(transport: ChildTransport, logger: Logger) {
        this.transport = transport;
        this.logger = logger;
    }

    /**
     * Create a new PTY terminal session.
     * PTY output is received via the onData callback.
     */
    async create(size: PtySize, opts?: PtyOptions): Promise<CommandHandle> {
        this.logger.debug('Creating PTY session', { size, opts });

        const envs = {
            TERM: 'xterm',
            LANG: 'C.UTF-8',
            LC_ALL: 'C.UTF-8',
            ...opts?.envs,
        };

        const body = {
            process: {
                cmd: '/bin/bash',
                args: ['-i', '-l'],
                envs,
                cwd: opts?.cwd,
            },
            pty: {
                size: { cols: size.cols, rows: size.rows },
            },
            tag: opts?.tag,
        };

        const response = await postConnectStream(
            this.transport, '/process.Process/Start', body,
        );

        const handle = new CommandHandle(this.transport, this.logger);

        processStreamResponse(
            response,
            handle,
            undefined,  // no stdout for PTY
            undefined,  // no stderr for PTY
            opts?.onData,
        ).catch(err => {
            this.logger.error('PTY stream processing error', { error: err });
        });

        return handle;
    }

    /**
     * Connect to an existing PTY session by PID.
     */
    async connect(pid: number, opts?: PtyOptions): Promise<CommandHandle> {
        this.logger.debug('Connecting to PTY session', { pid });

        const body = {
            process: { pid },
        };

        const response = await postConnectStream(
            this.transport, '/process.Process/Connect', body,
        );

        const handle = new CommandHandle(this.transport, this.logger);
        handle.pid = pid;

        processStreamResponse(
            response,
            handle,
            undefined,
            undefined,
            opts?.onData,
        ).catch(err => {
            this.logger.error('PTY connect stream error', { error: err });
        });

        return handle;
    }

    /**
     * Send input to a PTY session.
     */
    async sendInput(pid: number, data: string): Promise<void> {
        await this.transport.post('/process.Process/SendInput', {
            process: { pid },
            input: { pty: data },
        });
    }

    /**
     * Resize a PTY terminal.
     */
    async resize(pid: number, size: PtySize): Promise<void> {
        this.logger.debug('Resizing PTY', { pid, size });
        await this.transport.post('/process.Process/Update', {
            process: { pid },
            pty: { size: { cols: size.cols, rows: size.rows } },
        });
    }

    /**
     * Kill a PTY session.
     */
    async kill(pid: number): Promise<void> {
        this.logger.debug('Killing PTY session', { pid });
        await this.transport.post('/process.Process/SendSignal', {
            process: { pid },
            signal: 'SIGNAL_SIGKILL',
        });
    }
}

// ============================================================================
// SandboxFilesystem (Phase 1 — unchanged)
// ============================================================================

/**
 * Filesystem operations via envd HTTP API.
 */
export class SandboxFilesystem {
    private transport: ChildTransport;
    private logger: Logger;

    constructor(transport: ChildTransport, logger: Logger) {
        this.transport = transport;
        this.logger = logger;
    }

    /**
     * Read file content as binary (Uint8Array).
     * Uses HTTP GET /files?path={encodedPath}&user=user (Go SDK convention).
     */
    async read(path: string): Promise<Uint8Array> {
        this.logger.debug('Reading file', { path });
        const response = await this.transport.getRaw(
            `/files?path=${encodeURIComponent(path)}&user=user`
        );
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    }

    /**
     * Read file content as text.
     */
    async readText(path: string): Promise<string> {
        this.logger.debug('Reading text file', { path });
        const response = await this.transport.getRaw(
            `/files?path=${encodeURIComponent(path)}&user=user`
        );
        return response.text();
    }

    /**
     * Write file content.
     * Uses HTTP multipart POST /files?path={encodedPath}&user=user (Go SDK convention).
     */
    async write(path: string, data: string | Uint8Array): Promise<void> {
        this.logger.debug('Writing file', { path, dataType: typeof data });

        // Build multipart/form-data body
        const blob = typeof data === 'string'
            ? new Blob([data], { type: 'text/plain' })
            : new Blob([data], { type: 'application/octet-stream' });

        const formData = new FormData();
        const filename = path.split('/').pop() || 'file';
        formData.append('file', blob, filename);

        const response = await this.transport.postRaw(
            `/files?path=${encodeURIComponent(path)}&user=user`,
            formData
        );

        // Ensure response is consumed
        await response.text();
    }

    /**
     * List directory entries.
     * ConnectRPC unary: /filesystem.Filesystem/ListDir (not /List)
     */
    async list(path: string): Promise<EntryInfo[]> {
        this.logger.debug('Listing directory', { path });
        const raw = await this.transport.post<{ entries: RawEntryInfo[] }>(
            '/filesystem.Filesystem/ListDir',
            { path, depth: 1 }
        );
        return (raw.entries || []).map(normalizeEntryInfo);
    }

    async makeDir(path: string): Promise<void> {
        this.logger.debug('Creating directory', { path });
        await this.transport.post('/filesystem.Filesystem/MakeDir', { path });
    }

    async remove(path: string): Promise<void> {
        this.logger.debug('Removing', { path });
        await this.transport.post('/filesystem.Filesystem/Remove', { path });
    }

    /**
     * Check if a file or directory exists.
     * Only treats 404/not-found as "missing"; other errors (401, 500, network) are re-thrown.
     */
    async exists(path: string): Promise<boolean> {
        try {
            await this.transport.post('/filesystem.Filesystem/Stat', { path });
            return true;
        } catch (err: unknown) {
            // Only treat 404-like errors as "not found"
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
                return false;
            }
            throw err;
        }
    }
}
