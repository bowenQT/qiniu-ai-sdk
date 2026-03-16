# vNext Phase 2 Plan

Phase 2 starts from the stable Phase 1 baseline and moves the repository to a package-first
operating model.

Batch 1 is closed on the current `main` baseline:
[2026-03-16-vnext-phase-2-batch-1.md](./2026-03-16-vnext-phase-2-batch-1.md)

The next execution queue for this phase is tracked in:
[2026-03-16-vnext-phase-2-batch-2.md](./2026-03-16-vnext-phase-2-batch-2.md)

## Phase Goal

Make bounded change packages, deterministic evidence flow, and tracked phase boundaries the default
way Codex and antigravity collaborate in this repository.

## Scope

### Priority 1: Package-First Delivery
- replace "continue until vNext is done" with bounded change packages
- make `phase/<lane>/<topic>` the durable package identifier
- require package briefs, evidence bundles, review packets, and optional promotion decisions

### Priority 2: Evidence As A First-Class Input
- keep capability scorecard, live verify summary, review packet, promotion decisions, and the
  verification report aligned
- ensure maturity changes can be traced back to explicit artifacts

### Priority 3: Phase Stop Protocol
- keep tracked entry criteria, exit criteria, freeze triggers, and deferred rules in repo policy
- stop opening new packages automatically once exit criteria are met

### Priority 4: CI / Review Consumption
- make repository CI publish the package artifacts needed for antigravity and release review
- prefer review packets and artifact links over replaying raw transcripts

## Out Of Scope

- replacing Codex execution with antigravity execution
- removing `worktree + integration` mechanics proven in Phase 1
- expanding SDK surface area just to keep Phase 2 busy

## Exit Criteria

- package-first workflow is documented and implemented in tracked repo assets
- review packet and promotion decision artifacts are generated through repo scripts
- CI can publish a verification report that references both tracked truth and latest evidence
- new package creation can be frozen by tracked phase policy instead of transcript-only instructions
