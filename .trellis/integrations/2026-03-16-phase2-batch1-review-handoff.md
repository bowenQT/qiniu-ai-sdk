# Phase 2 Batch 1 Review Handoff

## Purpose

This handoff closes the first review checkpoint defined in
[`2026-03-16-vnext-phase-2-batch-1.md`](../plans/2026-03-16-vnext-phase-2-batch-1.md).

`antigravity` should review this checkpoint using tracked package briefs, this handoff, and the
referenced local review-packet artifacts instead of replaying the entire implementation transcript.

## Included Package Chain

The landing branch includes the Phase 2 batch-1 planning baseline plus the first two bounded
packages:

1. `phase2/dx-validation/live-verify-hard-gate`
2. `phase2/foundation/capability-evidence-sync`

The resulting commit chain is linear:

- `1733a41` `plan: seed phase2 batch1 packages`
- `f80d915` `dx: add policy-based live verify gate`
- `0caacc4` `foundation: sync capability truth to tracked evidence`

## Package 1: Live Verify Hard Gate

- Brief:
  [`../packages/phase2/dx-validation-live-verify-hard-gate.json`](../packages/phase2/dx-validation-live-verify-hard-gate.json)
- Branch: `codex/phase2/dx-validation/live-verify-hard-gate`
- Commit: `f80d915`
- Goal: promote live verify from optional evidence to a policy-enforced repository gate

### What Changed

- Added tracked live-verify policy profiles:
  [`../spec/sdk/live-verify-policy.json`](../spec/sdk/live-verify-policy.json)
- `verify gate` now supports policy-backed required probes and blocking failures.
- The verify workflow now runs against the tracked live-verify policy file.

### Key Files

- `src/cli/live-verify.ts`
- `src/cli/skill-cli.ts`
- `scripts/run-live-verify-gate.mjs`
- `.github/workflows/verify.yml`
- `.trellis/spec/sdk/live-verify-policy.json`

### Focused Verification

- `npm test -- tests/cli/live-verify.test.ts tests/cli/live-verify-gate.test.ts`
- `npm run build`
- `npm run test:docs`
- `env QINIU_ENABLE_LIVE_VERIFY_GATE=1 QINIU_LIVE_VERIFY_PROFILE=pr QINIU_LIVE_VERIFY_POLICY_PATH=.trellis/spec/sdk/live-verify-policy.json QINIU_LIVE_VERIFY_GATE_LANES=foundation QINIU_LIVE_VERIFY_OUTPUT=artifacts/live-verify-gate.json QINIU_LIVE_VERIFY_SUMMARY_OUTPUT=artifacts/live-verify-gate.md node scripts/run-live-verify-gate.mjs`
- `npm run prepublishOnly`

### Deferred Risks

- Nightly profile still covers only the currently validated probe matrix.
- Live verify remains secret-gated in CI for repositories without live credentials.

### Local Review Packet

- `/Users/zhongbowen/Desktop/claude-project/qiniu_ai_sdk/.worktrees/phase2-live-gate/artifacts/phase2-dx-validation-live-verify-hard-gate-review-packet.md`

## Package 2: Capability Evidence Sync

- Brief:
  [`../packages/phase2/foundation-capability-evidence-sync.json`](../packages/phase2/foundation-capability-evidence-sync.json)
- Branch: `codex/phase2/foundation/capability-evidence-sync`
- Commit: `0caacc4`
- Goal: make capability truth updates flow from tracked evidence artifacts instead of ad hoc manual sync

### What Changed

- Added a tracked capability evidence baseline:
  [`../spec/sdk/capability-evidence-baseline.json`](../spec/sdk/capability-evidence-baseline.json)
- Added a generated capability evidence snapshot:
  [`../spec/sdk/capability-evidence.json`](../spec/sdk/capability-evidence.json)
- Added a generated module source consumed by the registry:
  `src/lib/capability-evidence.generated.ts`
- `package decision` now writes a tracked promotion-decision JSON under `.trellis/decisions/<phase>/`.
- Capability scorecard and verification report both consume the same evidence snapshot.

### Key Files

- `src/lib/capability-source.ts`
- `src/cli/package-workflow.ts`
- `src/cli/skill-cli.ts`
- `src/cli/verification-report.ts`
- `scripts/lib/capability-evidence.mjs`
- `scripts/render-capability-evidence-snapshot.mjs`
- `scripts/render-capability-scorecard.mjs`
- `scripts/render-verification-report.mjs`

### Focused Verification

- `npm test -- tests/cli/capability-evidence.test.ts tests/cli/package-workflow.test.ts tests/cli/verification-report.test.ts tests/unit/lib/capability-registry.test.ts`
- `npm run build`
- `npm run test:docs`
- `npm run prepublishOnly`

### Deferred Risks

- Promotion decisions still require an explicit capability-evidence render step before registry data refreshes.
- External docs scraping is still deferred; the baseline remains a tracked override file.

### Local Review Packet

- `/Users/zhongbowen/Desktop/claude-project/qiniu_ai_sdk/.worktrees/phase2-evidence-sync/artifacts/phase2-foundation-capability-evidence-sync-review-packet.md`

## Review Focus For antigravity

Please review this checkpoint with these questions:

1. Is the `pr` versus `nightly` live-verify boundary now explicit enough for downstream packages?
2. Is the tracked `baseline -> decisions -> snapshot -> generated source` chain acceptable as the
   temporary source of truth until automatic docs/evidence sync arrives?
3. Are packages 3, 4, and 5 now allowed to proceed under the batch-1 plan without reopening scope?

## Recommended Decision

If review passes, keep batch-1 sequencing unchanged and allow these next packages to start:

- `phase2/cloud-surface/response-batch-contract`
- `phase2/runtime/runtime-replay-contract`
- `phase2/node-integrations/mcp-live-interop`

If review does not pass, stop here and adjust the package-first governance layer before opening
more Phase 2 execution packages.
