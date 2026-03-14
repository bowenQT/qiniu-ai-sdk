/**
 * Sandbox Module Types
 *
 * Dual-layer type system:
 * - Raw*  types → API JSON response 1:1 mapping (snake_case, string dates)
 * - Public types → SDK-facing (camelCase, normalized enums)
 */

// ============================================================================
// Public Types (SDK-facing)
// ============================================================================

/** Sandbox runtime state */
export type SandboxState = 'running' | 'paused';

/** Sandbox module configuration */
export interface SandboxConfig {
    /** Override API key (defaults to QiniuAI apiKey) */
    apiKey?: string;
    /** Sandbox API endpoint (default: https://cn-yangzhou-1-sandbox.qiniuapi.com) */
    endpoint?: string;
}

/** Parameters for creating a new sandbox */
export interface CreateSandboxParams {
    /** Template ID to create sandbox from */
    templateId: string;
    /** Sandbox lifetime in milliseconds (default: 300000 = 5 minutes) */
    timeoutMs?: number;
    /** Whether to auto-pause the sandbox when idle */
    autoPause?: boolean;
    /** Whether to allow internet access from the sandbox */
    allowInternetAccess?: boolean;
    /** Whether to enable secure mode */
    secure?: boolean;
    /** Environment variables to set in the sandbox */
    envVars?: Record<string, string>;
    /** Custom metadata key-value pairs */
    metadata?: Record<string, string>;
}

/** Sandbox instance info (normalized from API response) */
export interface SandboxInfo {
    sandboxId: string;
    templateId: string;
    clientId: string;
    alias?: string;
    domain?: string;
    state: SandboxState;
    cpuCount: number;
    memoryMB: number;
    diskSizeMB: number;
    envdVersion: string;
    /** ISO 8601 string */
    startedAt: string;
    /** ISO 8601 string */
    endAt: string;
    metadata?: Record<string, string>;
    /** Access token for envd agent authentication */
    envdAccessToken?: string;
}

/** Listed sandbox (subset of SandboxInfo returned by list API) */
export interface ListedSandbox {
    sandboxId: string;
    templateId: string;
    clientId: string;
    alias?: string;
    state: SandboxState;
    startedAt: string;
    endAt: string;
}

/** Parameters for listing sandboxes */
export interface ListSandboxParams {
    /** Filter by state */
    state?: SandboxState;
}

/** Command execution options */
export interface RunCommandOptions {
    /** Command execution timeout in milliseconds (default: 60000) */
    timeoutMs?: number;
    /** Working directory inside the sandbox */
    cwd?: string;
    /** Environment variables for this command */
    envs?: Record<string, string>;
    /** User to run the command as */
    user?: string;
}

/** Result of a command execution */
export interface CommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    error: string;
}

/** File system entry info */
export interface EntryInfo {
    name: string;
    type: 'file' | 'dir' | 'unknown';
    path: string;
    size: number;
    permissions: string;
    owner: string;
    group: string;
    /** ISO 8601 string */
    modifiedTime: string;
    symlinkTarget?: string;
}

/** Options for waitUntilReady */
export interface WaitUntilReadyOptions {
    /** Max wait time in ms (default: 30000) */
    timeoutMs?: number;
    /** Polling interval in ms (default: 500) */
    intervalMs?: number;
}

// ============================================================================
// Raw API DTO Types (1:1 JSON mapping)
// ============================================================================

/** Raw sandbox info from API response */
export interface RawSandboxInfo {
    sandboxID: string;
    templateID: string;
    clientID: string;
    alias?: string;
    domain?: string;
    state: string;
    cpuCount: number;
    memoryMB: number;
    diskSizeMB: number;
    envdVersion: string;
    startedAt: string;
    endAt: string;
    metadata?: Record<string, string>;
    envdAccessToken?: string;
}

/** Raw listed sandbox from list API */
export interface RawListedSandbox {
    sandboxID: string;
    templateID: string;
    clientID: string;
    alias?: string;
    state: string;
    startedAt: string;
    endAt: string;
}

/** Raw command result from envd */
export interface RawCommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
    error: string;
}

/** Raw file entry from envd */
export interface RawEntryInfo {
    name: string;
    type: string;
    path: string;
    size: number;
    permissions: string;
    owner: string;
    group: string;
    modifiedTime: string;
    symlinkTarget?: string;
}

// ============================================================================
// Normalizers (Raw DTO → Public Model)
// ============================================================================

/** Convert Raw API response to public SandboxInfo */
export function normalizeSandboxInfo(raw: RawSandboxInfo): SandboxInfo {
    return {
        sandboxId: raw.sandboxID,
        templateId: raw.templateID,
        clientId: raw.clientID,
        alias: raw.alias,
        domain: raw.domain,
        state: raw.state as SandboxState,
        cpuCount: raw.cpuCount,
        memoryMB: raw.memoryMB,
        diskSizeMB: raw.diskSizeMB,
        envdVersion: raw.envdVersion,
        startedAt: raw.startedAt,
        endAt: raw.endAt,
        metadata: raw.metadata,
        envdAccessToken: raw.envdAccessToken,
    };
}

/** Convert Raw API response to public ListedSandbox */
export function normalizeListedSandbox(raw: RawListedSandbox): ListedSandbox {
    return {
        sandboxId: raw.sandboxID,
        templateId: raw.templateID,
        clientId: raw.clientID,
        alias: raw.alias,
        state: raw.state as SandboxState,
        startedAt: raw.startedAt,
        endAt: raw.endAt,
    };
}

/** Convert Raw command result to public CommandResult */
export function normalizeCommandResult(raw: RawCommandResult): CommandResult {
    return {
        exitCode: raw.exitCode,
        stdout: raw.stdout,
        stderr: raw.stderr,
        error: raw.error,
    };
}

/** Convert Raw entry info to public EntryInfo */
export function normalizeEntryInfo(raw: RawEntryInfo): EntryInfo {
    const typeMap: Record<string, 'file' | 'dir' | 'unknown'> = {
        file: 'file',
        dir: 'dir',
        directory: 'dir',
    };
    return {
        name: raw.name,
        type: typeMap[raw.type] ?? 'unknown',
        path: raw.path,
        size: raw.size,
        permissions: raw.permissions,
        owner: raw.owner,
        group: raw.group,
        modifiedTime: raw.modifiedTime,
        symlinkTarget: raw.symlinkTarget,
    };
}

// ============================================================================
// Phase 2: Stream Command Types
// ============================================================================

/** Process event types from ConnectRPC server-streaming */
export type ProcessEventType = 'start' | 'data' | 'end';

/** Start event — process has started */
export interface ProcessStartEvent {
    type: 'start';
    pid: number;
}

/** Data event — stdout/stderr/pty output chunk */
export interface ProcessDataEvent {
    type: 'data';
    stdout?: string;
    stderr?: string;
    pty?: string;
}

/** End event — process has exited */
export interface ProcessEndEvent {
    type: 'end';
    exitCode: number;
    error?: string;
}

/** Union of all process events */
export type ProcessEvent = ProcessStartEvent | ProcessDataEvent | ProcessEndEvent;

/** Options for streaming command execution */
export interface StreamCommandOptions extends RunCommandOptions {
    /** Callback for stdout data chunks */
    onStdout?: (data: string) => void;
    /** Callback for stderr data chunks */
    onStderr?: (data: string) => void;
    /** Enable stdin for the process */
    stdin?: boolean;
    /** Process tag for identification */
    tag?: string;
}

/** Process info from list command */
export interface ProcessInfo {
    pid: number;
    tag?: string;
    cmd: string;
    args: string[];
    envs?: Record<string, string>;
    cwd?: string;
}

// ============================================================================
// Phase 2: PTY Types
// ============================================================================

/** PTY terminal size */
export interface PtySize {
    cols: number;
    rows: number;
}

/** PTY creation options */
export interface PtyOptions {
    /** Working directory */
    cwd?: string;
    /** Environment variables */
    envs?: Record<string, string>;
    /** User to run as */
    user?: string;
    /** Process tag */
    tag?: string;
    /** Callback for PTY data output */
    onData?: (data: string) => void;
}

// ============================================================================
// Phase 2: Template Types
// ============================================================================

/** Template build status */
export type TemplateBuildStatus = 'building' | 'ready' | 'error';

/** Template info */
export interface TemplateInfo {
    templateId: string;
    name: string;
    aliases?: string[];
    public: boolean;
    buildDescription: string;
    cpuCount: number;
    memoryMB: number;
    diskSizeMB: number;
    createdAt: string;
    updatedAt: string;
}

/** Template with build information */
export interface TemplateWithBuilds {
    template: TemplateInfo;
    builds: TemplateBuildInfo[];
}

/** Template build info */
export interface TemplateBuildInfo {
    buildId: string;
    templateId: string;
    status: TemplateBuildStatus;
    logs?: string;
    createdAt: string;
    finishedAt?: string;
}

/** Template build logs */
export interface TemplateBuildLogs {
    logs: TemplateBuildLogEntry[];
}

/** Individual build log entry */
export interface TemplateBuildLogEntry {
    line: string;
    timestamp: string;
}

/** Params for creating a template */
export interface CreateTemplateParams {
    /** Dockerfile content or alias to build from */
    dockerfile?: string;
    /** Template name */
    name?: string;
    /** CPU count for the template */
    cpuCount?: number;
    /** Memory in MB */
    memoryMB?: number;
    /** Disk size in MB */
    diskSizeMB?: number;
    /** Start command */
    startCmd?: string;
}

/** Params for updating a template */
export interface UpdateTemplateParams {
    /** Template name */
    name?: string;
    /** Whether the template is public */
    public?: boolean;
}

/** Params for listing templates */
export interface ListTemplatesParams {
    /** Team ID to filter by */
    teamId?: string;
}

/** Wait for build options */
export interface WaitForBuildOptions {
    /** Max wait time in ms */
    timeoutMs?: number;
    /** Polling interval in ms (default: 2000) */
    intervalMs?: number;
}

// ============================================================================
// Phase 2: Raw API DTO Types
// ============================================================================

/** Raw template info from API */
export interface RawTemplateInfo {
    templateID: string;
    name: string;
    aliases?: string[];
    public: boolean;
    buildDescription: string;
    cpuCount: number;
    memoryMB: number;
    diskSizeMB: number;
    createdAt: string;
    updatedAt: string;
}

/** Raw template build info */
export interface RawTemplateBuildInfo {
    buildID: string;
    templateID: string;
    status: string;
    logs?: string;
    createdAt: string;
    finishedAt?: string;
}

/** Raw template build log entry */
export interface RawTemplateBuildLogEntry {
    line: string;
    timestamp: string;
}

// ============================================================================
// Phase 2: Normalizers
// ============================================================================

/** Normalize raw template info */
export function normalizeTemplateInfo(raw: RawTemplateInfo): TemplateInfo {
    return {
        templateId: raw.templateID,
        name: raw.name,
        aliases: raw.aliases,
        public: raw.public,
        buildDescription: raw.buildDescription,
        cpuCount: raw.cpuCount,
        memoryMB: raw.memoryMB,
        diskSizeMB: raw.diskSizeMB,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    };
}

/** Normalize raw template build info */
export function normalizeTemplateBuildInfo(raw: RawTemplateBuildInfo): TemplateBuildInfo {
    return {
        buildId: raw.buildID,
        templateId: raw.templateID,
        status: raw.status as TemplateBuildStatus,
        logs: raw.logs,
        createdAt: raw.createdAt,
        finishedAt: raw.finishedAt,
    };
}

