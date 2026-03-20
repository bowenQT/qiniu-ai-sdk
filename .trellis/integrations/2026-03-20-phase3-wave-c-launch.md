# Phase 3 Wave C Launch

Date: 2026-03-20

Status: packages 1 and 3 integrated; cloud-surface/admin-account and foundation closeout queued

## Launch Decision

- Wave B is integrated and green on `codex/vnext-integration`.
- Wave C starts with the packages that can execute without violating single-lane ownership.
- `cloud-surface/admin-account-surface-truth` stays queued behind `cloud-surface/task-cancel-contract-truth`.
- `foundation/release-scorecard-closure` stays last as the release-closeout package.

## Active Packages

- `phase3/cloud-surface/task-cancel-contract-truth`
  - package branch head: `e31d7bf`
  - integration merge: `b667379`
  - worktree: `.worktrees/cloud-surface`
  - review packet: `.worktrees/cloud-surface/artifacts/phase3-cloud-surface-task-cancel-contract-truth-review-packet.md`
  - evidence: `.worktrees/cloud-surface/artifacts/phase3-cloud-surface-task-cancel-contract-truth-evidence.json`
- `phase3/dx-validation/examples-smoke-and-gate-visibility`
  - package branch head: `c0f0c3e`
  - integration merge: `f2dba9a`
  - worktree: `.worktrees/dx-validation`
  - review packet: `.worktrees/dx-validation/artifacts/phase3-dx-validation-examples-smoke-and-gate-visibility-review-packet.md`
  - evidence: `.worktrees/dx-validation/artifacts/phase3-dx-validation-examples-smoke-and-gate-visibility-evidence.json`

## Queued Packages

- `phase3/cloud-surface/admin-account-surface-truth`
  - queue reason: same-lane serialization; starts after `task-cancel-contract-truth`
- `phase3/foundation/release-scorecard-closure`
  - queue reason: release closeout package; must land last

## Verification Spine

- cloud-surface package:
  - `npm run build`
  - `npm test -- tests/unit/modules/image.test.ts tests/unit/modules/video.test.ts tests/unit/modules/censor.test.ts`
  - `npm run test:docs`
- dx-validation package:
  - `npm run build`
  - `npm run test:docs`
  - targeted examples smoke

## Current Verification State

- integration verification after packages 1 and 3:
  - `npm run build`
  - `npm test`
  - `npm run test:docs`
  - `npm run test:package-smoke`
  - `npm run test:template-smoke`
  - result: pass
