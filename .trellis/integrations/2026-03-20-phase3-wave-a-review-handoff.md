# Phase 3 Wave A Review Handoff

Date: 2026-03-20
Landing branch: `codex/vnext-integration`
Merge target: `main`
Main baseline: `5067a8d`
Wave gate: `Wave A integrated, Wave B blocked pending antigravity review`

## Packages

- `phase3/foundation/capability-ledger-completion`
  - Branch: `codex/phase3/foundation/capability-ledger-completion`
  - Commit: `ce8148e`
  - Integration merge: `613169f`
  - Review packet: `.worktrees/foundation/artifacts/phase3-foundation-capability-ledger-completion-review-packet.md`
  - Evidence: `.worktrees/foundation/artifacts/phase3-foundation-capability-ledger-completion-evidence.json`
- `phase3/runtime/runtime-mainline-contract`
  - Branch: `codex/phase3/runtime/runtime-mainline-contract`
  - Commit: `611d6df`
  - Integration merge: `83e57f4`
  - Review packet: `.worktrees/runtime/artifacts/phase3-runtime-runtime-mainline-contract-review-packet.md`
  - Evidence: `.worktrees/runtime/artifacts/phase3-runtime-runtime-mainline-contract-evidence.json`
- `phase3/node-integrations/mcphost-held-risk-closure`
  - Branch: `codex/phase3/node-integrations/mcphost-held-risk-closure`
  - Commit: `9a7b82f`
  - Integration merge: `f66de44`
  - Review packet: `.worktrees/node-integrations/artifacts/phase3-node-integrations-mcphost-held-risk-closure-review-packet.md`
  - Evidence: `.worktrees/node-integrations/artifacts/phase3-node-integrations-mcphost-held-risk-closure-evidence.json`
- `phase3/dx-validation/runtime-story-smoke`
  - Branch: `codex/phase3/dx-validation/runtime-story-smoke`
  - Commit: `32d36a3`
  - Integration merge: `7832bd9`
  - Review packet: `.worktrees/dx-validation/artifacts/phase3-dx-validation-runtime-story-smoke-review-packet.md`
  - Evidence: `.worktrees/dx-validation/artifacts/phase3-dx-validation-runtime-story-smoke-evidence.json`

## Scope Summary

- Complete the Phase 3 `P0` baseline before any new `P1/P2` packages open.
- Expand capability truth so public first-class surfaces, exclusions, and gate blank reasons are auditable from tracked files.
- Clarify the runtime mainline contract around `createAgent + sessionStore/checkpointer + approval interrupt/resume`.
- Narrow the held `NodeMCPHost` boundary to explicit bearer-token forwarding and record the remaining OAuth and cross-server routing exclusions.
- Add one repo-tracked runtime story smoke path and remove known docs/examples API drift.

## Expected Outcomes

- Capability coverage can be reviewed as a tracked contract instead of an incomplete scorecard slice.
- Runtime resumable behavior no longer depends on implicit `unknown as` assumptions inside `createAgent`.
- `NodeMCPHost` held status remains unchanged, but the held basis is explicit and narrower.
- Docs/examples now align with the recommended mainline path closely enough for a repo smoke test.

## Focused Verification

- Integration baseline
  - `npm run build`
  - `npm test`
  - `npm run test:docs`
  - `npm run test:package-smoke`
  - `npm run test:template-smoke`
- Foundation package
  - `npm run build`
  - `npm test -- tests/cli/capability-evidence.test.ts tests/cli/verification-report.test.ts tests/unit/lib/capability-registry.test.ts`
  - `npm run test:docs`
- Runtime package
  - `npm run build`
  - `npm test -- tests/unit/ai/create-agent.test.ts tests/unit/ai/create-agent-runtime-parity.test.ts tests/unit/ai/session-store.test.ts tests/unit/entries.test.ts`
- Node package
  - `npm run build`
  - `npm test -- tests/node/mcp-host.test.ts tests/node/mcp-http-transport.test.ts`
- DX package
  - `npm run build`
  - `npm run test:runtime-story-smoke`
  - `npm run test:docs`

## Review Focus

- Confirm the new capability ledger semantics are strong enough to serve as the gating baseline for Wave B export coverage enforcement.
- Confirm the runtime session/checkpointer contract clarifies behavior without introducing a breaking public API shift.
- Confirm the `NodeMCPHost` held notes match the implementation boundary exactly and do not imply host-owned OAuth flows.
- Confirm the runtime story smoke and docs updates reduce drift without silently raising the default dependency floor for basic cloud SDK usage.

## Deferred Risks

- Capability coverage is still curated rather than export-derived, so Wave B still needs a coverage guard to stop future drift.
- Runtime contract is clearer, but the user-facing mainline narrative still depends on docs and examples rather than a single new facade.
- `NodeMCPHost` remains `beta (held)` on OAuth acquisition/refresh and cross-server routing.
- Wave A did not change `ResponseAPI`, `task cancel`, or `admin/account` product truth; those stay queued in later waves.

## Artifacts

- Integration launch sheet: `.trellis/integrations/2026-03-20-phase3-wave-a-launch.md`
- Integration execution plan: `.trellis/plans/2026-03-20-phase3-worktree-multi-agent-execution.md`
- Integration verification report: `artifacts/verification-report.md`
- Integration review packet: `artifacts/review-packet.md`
