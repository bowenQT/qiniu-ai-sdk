# Phase 2 Batch 1 Packages 3-5 Review Handoff

## Purpose

This handoff closes the execution checkpoint for the remaining Batch 1 packages defined in
[`2026-03-16-vnext-phase-2-batch-1.md`](../plans/2026-03-16-vnext-phase-2-batch-1.md).

`antigravity` should review this checkpoint from the tracked briefs, this handoff, and the
referenced local review-packet artifacts rather than replaying the implementation transcript.

## Included Package Chain

The landing branch includes the three downstream Batch 1 packages after the gate/truth-model
checkpoint already passed:

1. `phase2/cloud-surface/response-batch-contract`
2. `phase2/runtime/runtime-replay-contract`
3. `phase2/node-integrations/mcp-live-interop`

Relevant package commits:

- `623276d` `cloud: codify response and batch contract boundaries`
- `0b91782` `runtime: classify thread restore contracts`
- `44c5751` `node: deepen mcp live interop evidence`

Landing verification was rerun after merging all three packages together:

- `npm run prepublishOnly`
- `90` test files
- `989` tests passed

## Package 3: Response / Batch Contract Boundaries

- Brief:
  [`../packages/phase2/cloud-surface-response-batch-contract.json`](../packages/phase2/cloud-surface-response-batch-contract.json)
- Branch: `codex/phase2/cloud-surface/response-batch-contract`
- Commit: `623276d`
- Goal: tighten `ResponseAPI` and `batch` promotion boundaries around explicit contract and
  evidence rules

### What Changed

- `ResponseAPI` now exports a machine-readable helper contract:
  `RESPONSE_API_HELPER_CONTRACT`
- `batch` now exports a parallel contract:
  `BATCH_HELPER_CONTRACT`
- Both contracts encode:
  - helper surface
  - promotion candidates
  - deferred gaps
  - verification evidence
  - default behaviors
- Provider entry exports were updated so the contracts are consumable from `/qiniu`.

### Key Files

- `src/modules/response/index.ts`
- `src/modules/batch/index.ts`
- `src/qiniu/index.ts`
- `tests/unit/modules/response.test.ts`
- `tests/unit/modules/batch.test.ts`

### Focused Verification

- `npm test -- tests/unit/modules/response.test.ts tests/unit/modules/batch.test.ts`
- `npm test -- tests/cli/init-doctor.test.ts tests/cli/skill-add.test.ts tests/modules/phase3c-4.test.ts tests/unit/modules/censor.test.ts`
- `npm run build`
- `npm run prepublishOnly`

### Deferred Risks

- Contract boundaries are explicit, but no maturity promotion was executed in this package.
- Shared CLI/polling timeout budgets were widened to restore deterministic full-gate evidence.

### Local Review Packet

- `/Users/zhongbowen/Desktop/claude-project/qiniu_ai_sdk/.worktrees/phase2-response-batch/artifacts/phase2-cloud-surface-response-batch-contract-review-packet.md`

## Package 4: Runtime Replay / Restore Contract

- Brief:
  [`../packages/phase2/runtime-runtime-replay-contract.json`](../packages/phase2/runtime-runtime-replay-contract.json)
- Branch: `codex/phase2/runtime/runtime-replay-contract`
- Commit: `0b91782`
- Goal: tighten replay, restore, and resumable-thread contracts into a bounded runtime package

### What Changed

- `SessionRecord` now encodes explicit restore semantics:
  - `source`
  - `restoreMode`
  - `checkpointStatus`
- `MemorySessionStore`, `CheckpointerSessionStore`, and `createAgent.loadThread()` now preserve
  that contract instead of implying it.
- Runtime exports now surface the classification helpers for downstream tooling and review.

### Key Files

- `src/ai/session-store.ts`
- `src/ai/create-agent.ts`
- `src/core/index.ts`
- `src/index.ts`
- `tests/unit/ai/session-store.test.ts`
- `tests/unit/ai/create-agent.test.ts`

### Focused Verification

- `npm test -- tests/unit/ai/session-store.test.ts tests/unit/ai/create-agent.test.ts`
- `npm test -- tests/cli/init-doctor.test.ts tests/cli/skill-add.test.ts tests/modules/phase3c-4.test.ts tests/unit/modules/censor.test.ts`
- `npm run build`
- `npm run prepublishOnly`

### Deferred Risks

- This package tightened restore semantics, but did not promote runtime maturity.
- Shared CLI/polling timeout budgets were widened to restore deterministic full-gate evidence.

### Local Review Packet

- `/Users/zhongbowen/Desktop/claude-project/qiniu_ai_sdk/.worktrees/phase2-runtime-replay/artifacts/phase2-runtime-runtime-replay-contract-review-packet.md`

## Package 5: MCP Live Interop

- Brief:
  [`../packages/phase2/node-integrations-mcp-live-interop.json`](../packages/phase2/node-integrations-mcp-live-interop.json)
- Branch: `codex/phase2/node-integrations/mcp-live-interop`
- Commit: `44c5751`
- Goal: deepen real MCP interoperability evidence without reopening the whole node platform surface

### What Changed

- `MCPHttpTransport.probe()` now emits machine-readable connection metadata.
- `NodeMCPHost` now exposes `probeServerInterop()` and a tracked deferred-risk list:
  `DEFAULT_MCP_INTEROP_DEFERRED_RISKS`
- `verify live --lane node-integrations` now supports an env-gated host interoperability probe in
  addition to the existing transport probe.
- Live verify JSON/Markdown artifacts now preserve structured MCP probe details, so host and
  transport evidence can feed future review packets and promotion decisions.

### Key Files

- `src/node/mcp/http-transport.ts`
- `src/node/mcp-host.ts`
- `src/node/index.ts`
- `src/cli/live-verify.ts`
- `tests/node/mcp-http-transport.test.ts`
- `tests/node/mcp-host.test.ts`
- `tests/cli/live-verify.test.ts`
- `tests/cli/live-verify-gate.test.ts`

### Focused Verification

- `npm test -- tests/node/mcp-http-transport.test.ts tests/node/mcp-host.test.ts tests/cli/live-verify.test.ts tests/cli/live-verify-gate.test.ts`
- `npm run build`
- `npm run prepublishOnly`

### Deferred Risks

- MCP host interoperability probing is still opt-in and is not yet required by the nightly policy.
- The tracked deferred-risk list still includes:
  - server-initiated notifications
  - OAuth token acquisition flows
  - multi-server routing

### Local Review Packet

- `/Users/zhongbowen/Desktop/claude-project/qiniu_ai_sdk/.worktrees/phase2-mcp-interop/artifacts/phase2-node-integrations-mcp-live-interop-review-packet.md`

## Review Focus For antigravity

Please review this checkpoint with these questions:

1. Are the explicit helper/restore/interop contracts bounded enough to count as Phase 2 packages,
   rather than reopened Phase 1 scope?
2. Is the current “transport required, host optional” MCP live-evidence boundary acceptable for
   Batch 1, or should host interop become a nightly-required probe before the next package wave?
3. Are packages 3, 4, and 5 ready to stay on `main` as the current Phase 2 Batch 1 baseline?

## Recommended Decision

If review passes:

- keep Batch 1 closed at packages 1-5
- retain these packages on `main`
- plan the next package batch instead of extending Batch 1

If review does not pass:

- stop opening new packages
- adjust the package-first policy/gate/report chain before continuing Phase 2 execution
