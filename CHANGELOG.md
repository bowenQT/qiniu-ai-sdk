# Changelog

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
