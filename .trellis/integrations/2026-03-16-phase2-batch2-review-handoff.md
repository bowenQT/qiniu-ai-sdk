# Phase 2 Batch 2 Review Handoff

## Purpose

This handoff closes the second bounded package batch defined in
[`2026-03-16-vnext-phase-2-batch-2.md`](../plans/2026-03-16-vnext-phase-2-batch-2.md).

`antigravity` should review this checkpoint from the tracked package briefs, this handoff, and the
referenced local review-packet artifacts rather than replaying the full implementation transcript.

## Included Package Chain

The landing branch includes the three Batch 2 packages in the planned order:

1. `phase2/node-integrations/mcp-interop-evidence-policy`
2. `phase2/dx-validation/live-verify-module-split`
3. `phase2/runtime-hardening/audit-p1-p2-fixes`

Relevant package commits:

- `b8e8daf` `phase2: codify mcp interop evidence policy`
- `8b8da18` `phase2: split live verify orchestration modules`
- `9d35545` `phase2: harden stream text and checkpoint restore`

Landing verification was rerun after merging the full chain:

- `npm run prepublishOnly`
- `90` test files
- `994` tests passed

## Package 1: MCP Interop Evidence Policy

- Brief:
  [`../packages/phase2/node-integrations-mcp-interop-evidence-policy.json`](../packages/phase2/node-integrations-mcp-interop-evidence-policy.json)
- Branch: `codex/phase2/node-integrations/mcp-interop-evidence-policy`
- Commit: `b8e8daf`
- Goal: promote MCP interoperability evidence into explicit policy and tracked decision artifacts

### What Changed

- `live-verify` policy now carries lane-level MCP metadata:
  - required probes
  - optional probes
  - tracked decision paths
  - promotion modules
  - deferred risks
- Added tracked decision file:
  [`../decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json`](../decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json)
- Verification reports now surface held promotion decisions instead of burying them in transcript-only
  rationale.

### Key Files

- `src/cli/live-verify.ts`
- `src/cli/package-workflow.ts`
- `src/cli/verification-report.ts`
- `.trellis/spec/sdk/live-verify-policy.json`
- `.trellis/decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json`

### Focused Verification

- `npm test -- tests/cli/live-verify-gate.test.ts tests/cli/package-workflow.test.ts tests/cli/capability-evidence.test.ts tests/cli/verification-report.test.ts`
- `npm run build`
- `npm run prepublishOnly`

### Deferred Risks

- Host interop remains policy-visible but not nightly-required.
- OAuth acquisition, server notifications, and multi-server routing remain explicitly deferred.

### Local Review Packet

- `/Users/zhongbowen/Desktop/claude-project/qiniu_ai_sdk/.worktrees/phase2-mcp-policy/artifacts/phase2-node-integrations-mcp-interop-evidence-policy-review-packet.md`

## Package 2: Live Verify Module Split

- Brief:
  [`../packages/phase2/dx-validation-live-verify-module-split.json`](../packages/phase2/dx-validation-live-verify-module-split.json)
- Branch: `codex/phase2/dx-validation/live-verify-module-split`
- Commit: `8b8da18`
- Goal: split `live-verify` into smaller bounded modules without weakening gate or artifact behavior

### What Changed

- `src/cli/live-verify.ts` is now a façade only.
- Implementation is split into:
  - `src/cli/live-verify.internal.ts`
  - `src/cli/live-verify-gate.ts`
  - `src/cli/live-verify-render.ts`
- Landing merge preserved Package 1 policy behavior while keeping the split boundaries intact.

### Key Files

- `src/cli/live-verify.ts`
- `src/cli/live-verify.internal.ts`
- `src/cli/live-verify-gate.ts`
- `src/cli/live-verify-render.ts`
- `tests/cli/live-verify.test.ts`
- `tests/cli/live-verify-gate.test.ts`

### Focused Verification

- `npm test -- tests/cli/live-verify.test.ts tests/cli/live-verify-gate.test.ts tests/cli/verification-report.test.ts tests/cli/package-workflow.test.ts`
- `npm run build`
- `npm run prepublishOnly`

### Deferred Risks

- Lane probe logic is still concentrated in `live-verify.internal.ts`.
- This package did not attempt a deeper functional decomposition of every probe family.

### Local Review Packet

- `/Users/zhongbowen/Desktop/claude-project/qiniu_ai_sdk/.worktrees/phase2-live-split/artifacts/phase2-dx-validation-live-verify-module-split-review-packet.md`

## Package 3: Runtime Audit P1/P2 Hardening

- Brief:
  [`../packages/phase2/runtime-hardening-audit-p1-p2-fixes.json`](../packages/phase2/runtime-hardening-audit-p1-p2-fixes.json)
- Branch: `codex/phase2/runtime-hardening/audit-p1-p2-fixes`
- Commit: `9d35545`
- Goal: fix the bounded runtime hardening issues called out by audit/review without reopening runtime
  product scope

### What Changed

- `streamText().toDataStreamResponse()` now stops its SSE consumer cleanly on `reader.cancel()`.
- `createFilteredStream()` now releases pending waiters immediately when a consumer returns.
- `resumeWithApproval()` now validates batch tool-call argument JSON before executor invocation.
- Malformed checkpoint tool args produce an execution error result without falsely marking the tool
  as executed.

### Key Files

- `src/ai/stream-text.ts`
- `src/ai/graph/checkpointer.ts`
- `tests/ai/stream-text.test.ts`
- `tests/unit/ai/checkpointer-pending.test.ts`

### Focused Verification

- `npm test -- tests/ai/stream-text.test.ts tests/unit/ai/checkpointer-pending.test.ts`
- `npm run build`
- `npm run prepublishOnly`

### Deferred Risks

- Other runtime audit items remain deferred to later hardening packages.
- This package intentionally does not broaden runtime replay/agent product surfaces.

### Local Review Packet

- `/Users/zhongbowen/Desktop/claude-project/qiniu_ai_sdk/.worktrees/phase2-runtime-hardening/artifacts/phase2-runtime-hardening-audit-p1-p2-fixes-review-packet.md`

## Review Focus For antigravity

Please review this checkpoint with these questions:

1. Is the MCP evidence-policy layer now explicit enough to keep later MCP promotion work bounded?
2. Did the `live-verify` split preserve policy/gate semantics while actually reducing coupling?
3. Do the runtime hardening fixes map cleanly back to tracked P1/P2 audit findings without leaking
   into broader runtime expansion?

## Recommended Decision

If review passes:

- close Batch 2 at these three packages
- keep this landing branch as the Batch 2 checkpoint baseline
- plan Batch 3 from the resulting main baseline instead of extending Batch 2

If review does not pass:

- stop before landing on `main`
- adjust the package-first governance or hardening boundaries before opening new packages
