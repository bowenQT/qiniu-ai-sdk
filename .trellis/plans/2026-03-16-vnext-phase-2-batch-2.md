# vNext Phase 2 Batch 2

This document locks the second bounded package batch for Phase 2 after Batch 1 closed on the
stable `main` baseline at `68fdbce`.

## Batch Goal

Turn the Batch 1 checkpoint into a more durable operating baseline by:

- promoting MCP interoperability evidence into explicit policy and promotion paths
- reducing `live-verify.ts` complexity without regressing artifacts or gates
- fixing the highest-priority runtime hardening issues already identified in tracked audit/review
  artifacts

## Starting Point

- Batch 1 is closed:
  [`2026-03-16-vnext-phase-2-batch-1.md`](./2026-03-16-vnext-phase-2-batch-1.md)
- Batch 1 package review handoff:
  [`../integrations/2026-03-16-phase2-batch1-packages-3-5-review-handoff.md`](../integrations/2026-03-16-phase2-batch1-packages-3-5-review-handoff.md)

## Package Queue

### 1. `phase2/node-integrations/mcp-interop-evidence-policy`

- Goal: promote MCP interoperability evidence from package-level artifacts into an explicit policy
  and promotion decision path
- Why first:
  - Batch 1 established transport-required and host-optional evidence, but left policy promotion
    deferred
  - downstream package review should consume this policy rather than re-argue MCP evidence shape
    every time
- Expected branch: `codex/phase2/node-integrations/mcp-interop-evidence-policy`

### 2. `phase2/dx-validation/live-verify-module-split`

- Goal: split `live-verify.ts` into smaller bounded modules without regressing gate, artifact, or
  policy flows
- Why second:
  - Batch 1 review explicitly called out `live-verify.ts` complexity growth
  - this package should consume the MCP evidence policy boundary from package 1 instead of changing
    it ad hoc
- Expected branch: `codex/phase2/dx-validation/live-verify-module-split`

### 3. `phase2/runtime-hardening/audit-p1-p2-fixes`

- Goal: harden runtime behavior by fixing the highest-priority P1/P2 findings already identified in
  tracked audit and review artifacts
- Why third:
  - runtime bug-fix packages should consume the stabilized gate/report shape from packages 1 and 2
  - this package is intentionally `runtime-hardening`, not `runtime-audit`, because the audit has
    already happened and the work is implementation hardening
- Expected branch: `codex/phase2/runtime-hardening/audit-p1-p2-fixes`

## Parallelism Rules

- Package 1 starts first.
- Package 2 may start only after package 1 locks the MCP evidence-policy boundary.
- Package 3 may start after package 1 is stable; it does not need to wait for the module split as
  long as it does not reopen `live-verify` scope.
- No package in this batch should touch more than two owner-lane surfaces. If that happens, split
  it before coding.
- `runtime-hardening` is a package owner lane, not a worktree integration lane. It must continue to
  use the package-first flow rather than changing worktree lane semantics.

## Review Checkpoints

- `antigravity` checkpoint after package 1:
  - confirm whether MCP host interop should remain optional or become part of nightly-required
    evidence
- `antigravity` checkpoint after package 2:
  - confirm the live-verify split reduced complexity without weakening deterministic artifact
    generation
- `antigravity` checkpoint before closing package 3:
  - confirm each fix maps back to a tracked audit/review finding rather than opportunistic runtime
    expansion

## Deferred Beyond Batch 2

- broader merge queue adoption
- automatic external-doc scraping as the primary truth source
- reopening large multi-lane SDK surface work without new bounded package briefs
