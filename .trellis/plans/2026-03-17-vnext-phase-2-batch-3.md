# vNext Phase 2 Batch 3

This document locks the third bounded package batch for Phase 2 from the stable `main` baseline at
`6348e81`.

## Batch Goal

Close the remaining promotion/governance gaps without reopening broad SDK surface work by:

- upgrading live verify from evidence artifact to promotion-sensitive gate
- compiling capability truth from tracked baseline, promotion decisions, and latest gate evidence
- defining explicit promotion-readiness boundaries for `ResponseAPI` and `NodeMCPHost`

## Starting Point

- Phase 2 plan:
  [`2026-03-16-vnext-phase-2-plan.md`](./2026-03-16-vnext-phase-2-plan.md)
- Batch 2 checkpoint handoff:
  [`../integrations/2026-03-16-phase2-batch2-review-handoff.md`](../integrations/2026-03-16-phase2-batch2-review-handoff.md)

## Package Queue

### 1. `phase2/dx-validation/live-verify-promotion-gate`

- Goal: upgrade `live verify` from artifact-only evidence into a deterministic promotion-sensitive
  gate
- Why first:
  - later packages must consume a stable gate schema instead of each redefining what blocks or
    holds promotion
  - this package freezes the promotion/evidence vocabulary for the rest of Batch 3
- Expected branch: `codex/phase2/dx-validation/live-verify-promotion-gate`
- Worktree: `.worktrees/phase2-live-promotion`

### 2. `phase2/foundation/capability-truth-automation`

- Goal: compile capability truth from tracked baseline, promotion decisions, and latest gate
  evidence
- Why second:
  - it depends on the gate vocabulary from package 1
  - it should make scorecard drift a deterministic CI failure before module-specific readiness
    packages start landing
- Expected branch: `codex/phase2/foundation/capability-truth-automation`
- Worktree: `.worktrees/phase2-truth-automation`

### 3. `phase2/cloud-surface/responseapi-promotion-readiness`

- Goal: define an explicit official boundary for `ResponseAPI` and record a tracked readiness
  decision
- Why third:
  - `ResponseAPI` already has wide helper surface but still carries `experimental + unit`
  - readiness should consume the gate semantics from package 1 and the truth compiler from package 2
- Expected branch: `codex/phase2/cloud-surface/responseapi-promotion-readiness`
- Worktree: `.worktrees/phase2-response-readiness`

### 4. `phase2/node-integrations/node-mcphost-promotion-readiness`

- Goal: turn `NodeMCPHost` from held beta into an explicit promotion-readiness checklist
- Why fourth:
  - package 1 already established policy boundaries, but package 4 should convert them into the next
    tracked decision basis
  - it should consume the truth compiler output rather than patching scorecard text manually
- Expected branch: `codex/phase2/node-integrations/node-mcphost-promotion-readiness`
- Worktree: `.worktrees/phase2-mcp-readiness`

## Parallelism Rules

- **Stage A**
  - start package 1 only
  - freeze gate JSON/markdown/report promotion fields before any parallel package merges
- **Stage B**
  - start packages 2, 3, and 4 in parallel after package 1 freezes the schema
  - package 2 owns truth compiler and drift checks only
  - packages 3 and 4 own module-specific readiness contracts and tracked decisions only
- No package may touch more than two owner-lane surfaces.
- If packages 3 or 4 need to change core live-verify semantics after package 1, they must be split
  into a new package rather than expanding scope in place.

## Review Checkpoints

- `antigravity` checkpoint after package 1:
  - confirm the promotion-sensitive gate semantics are decision-complete
- `antigravity` checkpoint after package 2:
  - confirm truth compilation removes manual scorecard patch-up
- `antigravity` checkpoint before closing packages 3 and 4:
  - confirm each module can explain held/promotion state from tracked evidence only

## Deferred Beyond Batch 3

- broader cloud-surface feature expansion
- runtime productization outside governance-triggered fixes
- merge queue/Mergify/Graphite rollout
