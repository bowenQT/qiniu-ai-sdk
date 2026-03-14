# Coding Guide

## Public Surface
- Preserve existing `package.json` exports unless the change explicitly intends to add or deprecate a public entrypoint.
- Treat `dist/` as build output, not a source of truth.
- Keep CommonJS and ESM output expectations aligned with `tsconfig.json` and `tsconfig.esm.json`.

## Repo Boundaries
- `src/lib/` is shared infrastructure; keep it runtime-neutral where possible.
- `src/node/` is Node-only; avoid leaking Node-only assumptions into browser-facing entries.
- `src/adapter/` must preserve compatibility expectations for AI SDK integration.
- `src/modules/` owns API-facing feature modules; prefer module-local changes over cross-cutting edits when possible.

## Governance
- Durable architectural rules belong in `.trellis/spec/**`, not in `AGENTS.md` or `.agent/agent.md`.
- Shared SOPs belong in `.agent/workflows/**`.
