# Changelog

## [0.49.2] - 2026-03-21

### 🐛 Fixes

- Fixed non-LLM cloud capability integrations for `censor`, `admin`, `file`, `tts`, `asr`, and `ocr`, including official Qiniu auth support, current file-ingestion contract compatibility, and safer response normalization.

### 🔧 Improvements

- Closed cloud capability evidence and live-verify gaps by updating capability evidence/scorecard output and extending env-gated probes for `file` source-url workflow plus signed `censor` and `admin` paths.

## [0.49.1] - 2026-03-16

### 📚 Documentation

- Removed stale Capability Scorecard reference from README and README.zh-CN — the scorecard remains a generated artifact under `docs/` but is no longer linked as user-facing documentation

## [0.49.0] - 2026-03-14

### ✨ New Features

- Added capability metadata APIs: `listModels()`, `getModelCapabilities()`, `listModuleMaturities()`, and `getModuleMaturity()`
- Added `qiniu-ai worktree <init|spawn|status|integrate>` for lane-based `git worktree` orchestration

### 🔧 Improvements

- `doctor` now understands worktree lanes and reports maturity-aware warnings for experimental surfaces
- Added repo-tracked workflow guidance for multi-agent product evolution with an integration branch
- Added `.worktrees/` ignore support and CLI coverage for integration/lane worktree creation and merge flow
- Added release-gate coverage for capability metadata exports and worktree CLI behavior

### 📚 Notes

- This release establishes the foundation for lane-based product evolution without adding new npm entry points
- `ResponseAPI`, `crew`, `A2A`, and `QiniuMCPServer` remain experimental surfaces

## [0.48.0] - 2026-03-14

### ✨ New Features

- Added `qiniu-ai init --template <chat|agent|node-agent>` for first-run project scaffolding
- Added `qiniu-ai doctor [--template <chat|agent|node-agent>]` for environment, peer dependency, and import-path diagnostics

### 🔧 Improvements

- Added published starter templates for `chat`, `agent`, and `node-agent`
- Reworked README and cookbook around the three recommended product paths: cloud API, agent runtime, and Node agent integrations
- Added docs contract and template smoke scripts to the release gate so starter assets and import guidance cannot drift silently

### 📚 Notes

- This release stays minor-safe: no new npm entry points and no breaking runtime API changes
- `ResponseAPI` remains experimental and provider-specific

## [0.47.0] - 2026-03-14

### 🔧 Improvements

- Moved all Node-only MCP, sandbox, skills, audit, and non-memory checkpointer implementations into `src/node/*` so the source tree now mirrors the published entry contracts
- Reduced shared `src/modules/skills/index.ts` to a shared-safe barrel (`types`, `manifest`, `reference-mode`) and kept Node-only skill runtime/install registry code under `src/node/skills/*`
- Simplified entry-boundary contract tests so `root/core/browser/qiniu` only need to guard against reaching `src/node/*`, with a repo-level scan that verifies legacy Node-only implementation paths are gone

### 📚 Notes

- This release is internal-structure only: public npm entry points remain `@bowenqt/qiniu-ai-sdk`, `/core`, `/qiniu`, `/node`, and `/browser`

## [0.46.0] - 2026-03-14

### 📦 Breaking Changes

- Removed `ResponseAPI` and its related types from the root entry. Import them from `@bowenqt/qiniu-ai-sdk/qiniu` instead, or access the feature via `QiniuAI#response`.

### 🔧 Improvements

- Extended entry-point contract coverage so `root/core/browser/qiniu` cannot reach Node-only implementation paths such as MCP, sandbox, skill loading, or non-memory checkpointers

### 📚 Notes

- `@bowenqt/qiniu-ai-sdk/node` remains the only supported Node integration surface
- `ResponseAPI` remains experimental and provider-specific

### 📚 Migration

| Before | After |
|--------|-------|
| `import { ResponseAPI } from '@bowenqt/qiniu-ai-sdk'` | `import { ResponseAPI } from '@bowenqt/qiniu-ai-sdk/qiniu'` |

## [0.45.0] - 2026-03-14

### 🔧 Improvements

- Split shared-safe graph exports from Node-only checkpointers: `src/ai/graph/index.ts` now exposes only cross-platform graph/runtime APIs
- Added `src/node/checkpointers.ts` as the single Node-only checkpointer barrel for Redis, Postgres, and Kodo
- Moved the shared Kodo storage client into `src/node/internal/*` so Node integrations can reuse it without leaking into shared barrels
- Added recursive entry-graph contract tests to prevent `root/core/browser/qiniu` from reaching `src/node/*`, Node builtins, or Node-only checkpointer implementations

### 📚 Notes

- `@bowenqt/qiniu-ai-sdk/node` remains the only supported Node integration surface
- `ResponseAPI` remains experimental and provider-specific

## [0.44.0] - 2026-03-13

### ✨ New Features

- Added `createKodoAuditSink()` to `@bowenqt/qiniu-ai-sdk/node` for explicit Kodo-backed audit logging

### 🔧 Improvements

- `auditLogger` now accepts explicit sink objects in addition to `console` and `file://...` string sinks
- `kodo://...` string sinks remain unsupported and now emit a migration message directing callers to `createKodoAuditSink()`
- `KodoCheckpointer` and Kodo audit sink now share a Node-only Kodo client for upload token generation, retries, and object operations
- `QiniuMCPServer` now defaults its reported version to `SDK_VERSION`
- Added guardrail and Node-boundary regression coverage for explicit Kodo audit sinks and root-client import bans inside Node-only integrations

### 📚 Migration

| Before | After |
|--------|-------|
| `auditLogger({ sink: 'kodo://bucket/prefix' })` | `auditLogger({ sink: createKodoAuditSink({ bucket, prefix, accessKey, secretKey, region }) })` from `@bowenqt/qiniu-ai-sdk/node` |

## [0.43.0] - 2026-03-13

### 📦 Breaking Changes

- Root-entry Node-only exports have been removed. Import these from `@bowenqt/qiniu-ai-sdk/node` instead:
  - `auditLogger`, `AuditLoggerCollector`
  - `new QiniuAI({ sandbox })` → `createNodeQiniuAI({ sandbox })`
  - sandbox exports and types
  - `SkillLoader`, `SkillRegistry`, `RegistryProtocolStub`
  - MCP HTTP/OAuth/token store/server exports
  - `RedisCheckpointer`, `PostgresCheckpointer`, `KodoCheckpointer`
- Removed sunset Veo aliases:
  - `VIDEO_MODELS.VEO_3_0_GENERATE_PREVIEW` → `VIDEO_MODELS.VEO_3_0_GENERATE_001`
  - `VIDEO_MODELS.VEO_3_0_FAST_GENERATE_PREVIEW` → `VIDEO_MODELS.VEO_3_0_FAST_GENERATE_001`

### 🔧 Improvements

- Locked the root entry to a cross-platform compatibility surface while keeping `@bowenqt/qiniu-ai-sdk/node` as the sole Node-only integration entry
- Added regression coverage for `account.usage({ auth })` AK/SK signing with explicit missing-API failures
- Added regression coverage for TTS WebSocket environment resolution:
  - browser global `WebSocket`
  - Node.js optional `ws` loader
  - missing `ws` dependency error path
- Fixed browser TTS streaming construction to avoid passing Node-only WebSocket options to browser runtimes

### 📚 Migration

| Before | After |
|--------|-------|
| `import { auditLogger } from '@bowenqt/qiniu-ai-sdk'` | `import { auditLogger } from '@bowenqt/qiniu-ai-sdk/node'` |
| `import { SkillLoader } from '@bowenqt/qiniu-ai-sdk'` | `import { SkillLoader } from '@bowenqt/qiniu-ai-sdk/node'` |
| `import { MCPHttpTransport } from '@bowenqt/qiniu-ai-sdk'` | `import { MCPHttpTransport } from '@bowenqt/qiniu-ai-sdk/node'` |
| `import { RedisCheckpointer } from '@bowenqt/qiniu-ai-sdk'` | `import { RedisCheckpointer } from '@bowenqt/qiniu-ai-sdk/node'` |

## [0.42.0] - 2026-03-13

### ✨ New Features

- `createNodeQiniuAI()` factory from `@bowenqt/qiniu-ai-sdk/node` — returns a `QiniuAI` with Sandbox attached, replacing root-entry sandbox access
- `QiniuAI` provider class extracted to `src/qiniu/client.ts` — browser-safe, no Node.js dependencies

### 🔧 Improvements

- **Platform decoupling**: `account` module uses Web Crypto API (`crypto.subtle`) instead of `require('crypto')`
- **Platform decoupling**: `tts` module uses `TextEncoder`/`ArrayBuffer.isView` instead of `Buffer`; optional `ws` peer dependency loaded via bundler-safe dynamic import
- **Platform decoupling**: `video` module uses `atob`+`Uint8Array` instead of `Buffer.from`
- Root-entry Node-only exports (`auditLogger`, MCP, Sandbox, SkillLoader`, Redis/Postgres/Kodo Checkpointers) marked `@deprecated` — migrate to `@bowenqt/qiniu-ai-sdk/node`
- Root `src/client.ts` reduced to 52-line compatibility layer extending provider `QiniuAI`
- Added `ws` as optional peer dependency for Node.js TTS WebSocket streaming

### 📦 Breaking Changes

- `Account.generateAccessToken` is now `async` (Web Crypto API requirement) — internal only, no public API change

## [0.41.0] - 2026-03-13

### ✨ New Features

- Added `@bowenqt/qiniu-ai-sdk/core` as the preferred entry for reusable agent/runtime APIs
- Added `@bowenqt/qiniu-ai-sdk/qiniu` as the preferred entry for Qiniu client and cloud API exports
- Added Node-only re-exports to `@bowenqt/qiniu-ai-sdk/node` for MCP HTTP transport, OAuth helpers, token stores, sandbox, and Node checkpointers
- `auditLogger` now supports `file://` sinks in Node.js and writes newline-delimited JSON entries

### 🔧 Improvements

- Core agent/runtime types now depend on a minimal `LanguageModelClient` protocol instead of `QiniuAI`
- Added regression coverage for `createAgent` lazy-connect parity and `toDataStreamResponse()` reader cancel behavior
- Clarified root entry as a compatibility surface and documented the new preferred subpath imports

## [0.40.0] - 2026-03-13

### ✨ New Features

**streamText — Token-level Streaming (Phase 6)**
- `streamText()` — Stream text from LLM with token-level granularity:
  - Synchronous return of `StreamTextResult`; background task drives `generateTextWithGraph`
  - `textStream` / `reasoningStream` / `fullStream` — Independent async iterables with fan-out cursors
  - `text` / `reasoning` / `usage` / `steps` — Deferred promises resolve on completion
  - `toDataStreamResponse()` — SSE-formatted `Response` for HTTP endpoints
  - Consumer-driven abort: all consumers complete → background task aborted
  - Error event yield-then-throw semantics for observable error handling
- `agent.stream()` / `agent.streamWithThread()` — Agent-level streaming API:
  - Async return (`Promise<StreamTextResult>`) with MCP lazy-connect
  - Full parity with `run()`/`runWithThread()` options (toolChoice, memory, callbacks, etc.)
  - `streamWithThread` passes threadId/checkpointer/resumeFromCheckpoint

**Token Event Infrastructure**
- `PredictChunk` — Low-level onChunk callback in predict-node (`text-delta`, `reasoning-delta`, `tool-call-delta`)
- `TokenEvent` — Mid-level event type in AgentGraph:
  - `tool-call` emitted after approval, before execution (uses repaired `parsedArgs`)
  - `tool-result` with `isError`/`isRejected` distinction
  - `step-finish`, `finish`, `error` terminal events
- `ToolExecutionResult.parsedArgs` — Exposes repaired arguments (post-`parseToolArguments`)

### 🔧 Improvements

- **Node 18 compatibility**: `combineAbortSignals()` polyfill for `AbortSignal.any()`
- **Lazy consumer counting**: `activeConsumers` incremented on iteration start, not stream creation
- **Fault isolation**: `onChunk` and `onTokenEvent` callbacks wrapped in try-catch

### 📦 Exports

```typescript
// New exports
export { streamText } from './ai/stream-text';
export type { StreamTextOptions, StreamTextResult } from './ai/stream-text';
export type { TokenEvent } from './ai/agent-graph';
export type { AgentStreamOptions, AgentStreamWithThreadOptions } from './ai/create-agent';
```

### ⚠️ Breaking Changes

**MCPClient removed** — The deprecated `MCPClient` and its adapter layer have been removed. Use `NodeMCPHost` (from `@bowenqt/qiniu-ai-sdk/node`) with `createAgent({ hostProvider })` instead.

Removed exports:
- `MCPClient`, `MCPClientError` — replaced by `NodeMCPHost`
- `adaptMCPToolsToRegistry`, `getAllMCPToolsAsRegistered` — replaced by `hostProvider` auto-discovery
- `MCPClientConfig`, `MCPConnectionState` — no longer needed

Migration:
```typescript
// Before (v0.39)
import { MCPClient, adaptMCPToolsToRegistry } from '@bowenqt/qiniu-ai-sdk';
const mcpClient = new MCPClient({ servers: [...] });
await mcpClient.connect();
const tools = adaptMCPToolsToRegistry(mcpClient.getAllTools(), 'fs', mcpClient);

// After (v0.40)
import { NodeMCPHost } from '@bowenqt/qiniu-ai-sdk/node';
const mcpHost = new NodeMCPHost({ servers: [...] });
const agent = createAgent({ client, model, hostProvider: mcpHost });
```

### 🏗️ Architecture Hardening

- **streamText zero-any**: All 7 `any` types in `StreamTextOptions` replaced with strong types (`QiniuAI`, `ChatMessage[]`, `Record<string, Tool>`, `Skill[]`, `ApprovalConfig`, `ResponseFormat`, `MemoryManager`)
- **postStream abort listener cleanup**: Named `onAbort` reference + `finally` block `removeEventListener` prevents memory leak on long-lived `AbortController`
- **auditLogger sink enforcement**: `flushLogs()` now throws for unimplemented `kodo://` and `file://` sinks instead of silently falling back to console. Errors are handled by `onError: 'warn' | 'block'` semantics

---

## [0.39.0] - 2026-03-12

### ✨ New Features

**Skill CLI `add` Command (Phase 5A)**
- `qiniu-ai skill add <manifest-url>` — Install a remote skill from URL:
  - Trust model: explicit URL = allow any domain (CLI = user's explicit trust intent)
  - `--sha256 <hash>` — Optional manifest integrity verification
  - `--auth <token>` — Authorization header for private manifests
  - `--allow-actions` — Opt-in to installing skill actions
  - Dependencies warn: notifies about unresolved dependencies (no fake install instructions)
  - Argument validation: rejects flag-like values for `--sha256`/`--auth`, bails before install

**MCP `abortSignal` Propagation (Phase 5C)**
- `NodeMCPHost` now bridges `context.abortSignal` to MCP SDK `callTool` `RequestOptions.signal`
- `_context` type upgraded from `any` to `RegisteredToolContext` for type safety

### 🔧 Improvements

- **`SkillRegistry.registerRemoteAndGetName()`**: New wrapper that returns `manifest.name` after registering. Uses shared `_registerRemoteInternal()` private helper — single fetch, no double registration
- **`SkillRegistry`**: Now exported from package root (was only available via deep import)
- **README**: Fixed `registerRemote()` example — correct call shape, added `allowRemote: true`, `integrityHash` field name
- **CLI help**: Updated to show `add` command with all options, removed "Planned" status
- **CLI `getArgValue()`**: Rejects flag-like values (e.g., `--sha256 --allow-actions`)

### 📦 Exports

```typescript
// Newly exported from package root
export { SkillRegistry } from './modules/skills';
export { RegistryProtocolStub } from './modules/skills';
export type { SkillRegistryConfig, RemoteSkillSource } from './modules/skills';
export type { SkillRegistryProtocol, RegistrySkillEntry, RegistrySearchOptions } from './modules/skills';
```

---

## [0.38.0] - 2026-03-12

### ✨ New Features

**Security Hardening (Phase 3)**
- `installRemote()` — End-to-end remote skill installation with:
  - Atomic backup-swap: `target→backup → temp→target → delete backup` (rollback on failure)
  - Cumulative byte limit enforcement (actual downloaded bytes, not manifest-declared)
  - Binary-safe download via `fetchBinaryWithTimeout()` (handles non-text payloads)
  - Lockfile graceful degradation: directory swap succeeds even if lockfile write fails
  - Empty `skillsDir` guard: explicit error when no install root is configured
- `MCPToolPolicy` — SDK-native timeout and output controls for MCP tools:
  - `timeout` → Passed to SDK `RequestOptions.timeout` (default: 30000ms)
  - `resetTimeoutOnProgress` → SDK resets timeout on progress notifications
  - `maxTotalTimeout` → Absolute ceiling regardless of progress resets
  - `maxOutputLength` → Host-layer output truncation (default: 1MB)
  - `requiresApproval` → Per-server HITL requirement
- `denySources` — Deny-first source policy for tool approval (`deny > autoApprove > handler > fail-closed`)
- `SkillManifest.signature` — Type reservation for future trust chain verification

**CLI / Ecosystem (Phase 4)**
- `qiniu-ai` CLI — New bin for skill management:
  - `skill list` — List installed skills from lockfile (with MISSING/directory status)
  - `skill verify` — Full validation: path traversal + extension whitelist + SHA256 hash
  - `skill verify --fix` — Reconstruct lockfile from local directories (no remote access)
  - `skill remove` — Remove skill directory + lockfile entry (handles untracked skills)
- `RegistryProtocolStub` — Interface + stub for future registry protocol v2

### 🔧 Improvements

- **ToolSource.namespace**: Fixed double-prefix bug (`mcp:mcp:server` → `mcp:server`)
- **SkillLoader**: Unified `isWithinRoot()` delegation to `SkillValidator` (removed duplicate)
- **SkillRegistry**: Added `fetcher` DI, `remoteBaseUrl` and `remoteAuthorization` persistence
- **SkillLockEntry**: Added `allowActions` field for action permission tracking

### ⚠️ Deprecation

- **`MCPClient`**: Deprecated in favor of `NodeMCPHost`. Will be removed in v0.40.0.

### 📦 Exports

```typescript
// New CLI bin
"qiniu-ai": "./bin/qiniu-ai.mjs"

// New types
export type { MCPToolPolicy } from './lib/mcp-host-types';
export type { SkillRegistryProtocol, RegistrySkillEntry } from './modules/skills/registry-protocol';
export { RegistryProtocolStub } from './modules/skills/registry-protocol';
```

---

## [0.37.0] - 2026-03-11

### ✨ New Features

**Cloud Sandbox — Secure Code Execution**
- Full lifecycle management: `create`, `createAndWait`, `pause`, `resume`, `kill`
- Command execution with streaming output, env vars, cwd, and user selection
- Filesystem operations: `read`, `readText`, `write`, `list`, `makeDir`, `remove`, `exists`
- PTY terminal sessions with resize support for interactive use cases
- Process management: `listProcesses`, `killProcess`, `sendInput`
- Template management: `templates.list`, `templates.get`
- ConnectRPC Connect protocol with proper binary envelope framing
- `waitUntilReady()` — two-phase readiness check (control-plane + envd health probe)

**ChildTransport Enhancements**
- `postRaw()` supports `Uint8Array`, `ArrayBuffer`, and `FormData` body types
- Automatic Content-Type handling for multipart file uploads

### 📦 Exports

```typescript
// New modules
export { Sandbox, SandboxConfig } from './modules/sandbox';
export type {
  SandboxInstance, SandboxInfo, SandboxCommands, SandboxFilesystem,
  SandboxPty, CommandHandle, CommandResult, EntryInfo,
} from './modules/sandbox';
```

---

## [0.36.0] - 2026-03-11

### ✨ New Features

**viduq Video Models (fal-ai queue routing)**
- Full support for `viduq1`, `viduq2`, `viduq2-pro`, `viduq2-turbo` models
- Auto-detect input type (text-to-video / image-to-video) and route to correct fal-ai endpoint
- `VideoTaskHandle` return type with `statusUrl`/`responseUrl` for reliable async polling
- Internal statusUrl cache for seamless `get(id)` / `waitForCompletion(id)` workflows
- New fields: `movement_amplitude`, `audio`, `voice_id`, `is_rec`

**kling-image-o1 (fal-ai queue routing)**
- Route `kling-image-o1` to `/queue/fal-ai/kling-image/o1` endpoint
- Auto-detect `qimage-` prefix in `get()` for status polling via fal-ai
- Response normalization: `COMPLETED/FAILED` → `succeed/failed`, `result.images[]` → `data[]`
- New fields: `image_urls` (reference images), `num_images`, `resolution`
- Both `generate()` and `create()` support fal-ai routing

**Log Export API**
- New `client.log.export()` for `GET /v2/stat/export_log_file`
- Runtime validation: 35-day window, size 1-500, page ≥ 1, RFC3339 dates
- Supports model/apikey/code filtering and pagination

**Absolute URL Request Methods**
- `IQiniuClient.getAbsolute()` / `postAbsolute()` — skip baseUrl prepend, inherit auth/middleware
- Enables clean access to non-v1 API endpoints

### 🔧 Improvements

- **account.usage()**: Migrated `/../v2/stat/usage` path hack to use `getAbsolute()`
- **truncateHistory**: Added token cost estimates for video (200), file (100), audio (100), thinking (text-based) content parts; unknown types default to 50 tokens instead of 0

### 📦 Exports

```typescript
// New modules
export { Log, LogExportRequest, LogEntry } from './modules/log';
export type { VideoTaskHandle } from './modules/video';
```

---

## [0.32.0] - 2026-02-04

### ✨ New Features

**Skill Marketplace Protocol**
- `SkillManifest` schema for machine-readable skill.json discovery
- `SkillRegistry` for local/remote skill registration with:
  - SHA256 integrity verification (`sha256:` prefix)
  - Domain allowlist security policy
  - Semver compatibility checks (^, ~, >=, >, <, <= operators)
- Fuzzy search by name, tags, and description

**Dual Histories Pattern**
- `AgentState.internalMessages` as new source of truth
- `messages` getter alias for backwards compatibility
- Auto-migration of legacy checkpoints on deserialize
- All graph nodes (predict, execute, parallel) updated

**Structured Telemetry Export** (from alpha)
- `MetricsCollector` with Prometheus format export
- Per-instance metrics isolation (steps, tokens, errors, latency)
- `createMetricsHandler()` for host-managed HTTP endpoint

**MCP Dynamic Schema Validation** (from alpha)
- `validateAgainstSchema()` for dynamic tool input validation
- Strict subset of JSON Schema (type, properties, required, etc.)
- `RecoverableError` for unsupported keywords

### 🔧 API Changes

**AgentState**
- Added: `internalMessages: InternalMessage[]` (source of truth)
- Changed: `messages` is now a readonly getter returning `internalMessages`

**SerializedAgentState (Checkpoints)**
- Added: `internalMessages` field (v0.32.0+)
- Deprecated: `messages` field (auto-migrated on load)

### 📦 Exports

```typescript
// New from src/modules/skills
export { SkillManifest, SkillRegistry, SkillRegistryConfig, RemoteSkillSource };
export { parseManifest, parseManifestStrict, checkCompatibility };
```

---

## 0.32.0-alpha

### Features

- **Structured Telemetry Export**: New `MetricsCollector` class for instance-level metrics with Prometheus export.
  - Records steps, tokens, errors, guardrail blocks, and tool latency.
  - Host-managed HTTP lifecycle via `createMetricsHandler`.
- **MCP Schema Validation**: Dynamic JSON Schema validation for MCP tool inputs.
  - `validateAgainstSchema()` with explicit supported/unsupported keyword sets.
  - Integrated into `QiniuMCPServer.executeTool()` for dynamic tools.

### Breaking Changes

- None (additive features only).

## 0.9.0

- Added `image.generate` and `image.waitForResult` to unify sync/async image responses.
- Added image usage types and response normalization for Gemini/Kling differences.
- Deprecated `image.create` and `image.waitForCompletion` in favor of unified APIs.

## 0.8.0

- Added native `generateText` with tool-call loop, reasoning capture, and step tracking.
- Added `ai-tools` subpath with `tool()` helper and Zod-to-JSON schema conversion.
- Added message helpers and new error types for tool execution and max steps.

## 0.7.0

- Added message utilities and native text generation helpers.
- Added examples and unit tests for tool-call execution loop.

## 0.6.0

- Documented advanced usage examples and adapter installation guidance.
- Added cookbook examples and JSDoc audit notes.
- Switched adapter types to official Vercel AI SDK types.
