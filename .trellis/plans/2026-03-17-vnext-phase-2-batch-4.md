# vNext Phase 2 Batch 4

This document locks the fourth bounded package batch for Phase 2 from the stable `main` baseline at
`3f9f5fe`.

## Batch Goal

Close Phase 2 by turning promotion evidence, tracked truth, phase policy, and release-owner
handoff into a deterministic closeout system.

## Starting Point

- Phase 2 plan:
  [`2026-03-16-vnext-phase-2-plan.md`](./2026-03-16-vnext-phase-2-plan.md)
- Batch 3 checkpoint handoff:
  [`../integrations/2026-03-17-phase2-batch3-review-handoff.md`](../integrations/2026-03-17-phase2-batch3-review-handoff.md)

## Package Queue

### 1. `phase2/dx-validation/promotion-gate-hardening`

- Goal: freeze promotion-sensitive gate semantics into `pass / held / block / unavailable`
- Why first:
  - later packages must consume a stable closeout-oriented gate schema
  - this package defines the machine-readable promotion decision summary used by truth compilation
    and closeout reporting
- Expected branch: `codex/phase2/dx-validation/promotion-gate-hardening`
- Worktree: `.worktrees/phase2-promotion-gate-hardening`

### 2. `phase2/foundation/phase2-closeout-policy`

- Goal: make Phase 2 stop/freeze/close behavior a tracked repo policy
- Why second:
  - closeout state must be policy-backed before the release/report package declares Phase 2 ready to
    stop
  - package workflow should stop creating new Phase 2 packages once the phase is frozen or closed
- Expected branch: `codex/phase2/foundation/phase2-closeout-policy`
- Worktree: `.worktrees/phase2-closeout-policy`

### 3. `phase2/foundation/evidence-drift-enforcement`

- Goal: make capability truth drift a hard CI failure
- Why third:
  - it consumes the gate schema from package 1 and the tracked closeout semantics from package 2
  - it ensures scorecard, generated truth, and verification report cannot silently diverge during
    closeout
- Expected branch: `codex/phase2/foundation/evidence-drift-enforcement`
- Worktree: `.worktrees/phase2-evidence-drift`

### 4. `phase2/dx-validation/phase2-closeout-report`

- Goal: produce a single Phase 2 closeout artifact for release owner / antigravity review
- Why fourth:
  - it should consume the stable outputs from packages 1-3 instead of redefining them
  - it turns the closeout decision into a tracked artifact rather than transcript-only judgment
- Expected branch: `codex/phase2/dx-validation/phase2-closeout-report`
- Worktree: `.worktrees/phase2-closeout-report`

## Parallelism Rules

- **Stage A**
  - start package 1 only
  - freeze promotion gate JSON/markdown/report fields before any other package lands
- **Stage B**
  - start packages 2 and 3 in parallel after package 1 lands
  - package 2 owns phase-state policy only
  - package 3 owns truth compiler and drift checks only
- **Stage C**
  - start package 4 after packages 1-3 are merged or otherwise available in the landing baseline
- No Batch 4 package may expand `ResponseAPI`, `NodeMCPHost`, or other SDK runtime surface. Such work
  moves to Phase 3.

## Review Checkpoints

- `antigravity` checkpoint after package 1:
  - confirm promotion gate semantics are decision-complete for closeout use
- `antigravity` checkpoint after packages 2 and 3:
  - confirm phase-state policy and truth-drift enforcement are sufficient to freeze Phase 2 without
    transcript-only rules
- `antigravity` checkpoint before closing package 4:
  - confirm the closeout report is sufficient as the Phase 3 planning baseline

## Deferred Beyond Batch 4

- any new SDK feature surface
- promotion of `ResponseAPI` or `NodeMCPHost` beyond their current held status without new evidence
- merge queue / Mergify / Graphite rollout
