# vNext Phase 2 Batch 1

This document locks the first bounded package batch that should execute under the Phase 2
package-first operating model.

## Batch Goal

Turn the new Phase 2 governance layer into an immediately usable execution queue without reopening
Phase 1 style unbounded continuation.

## Package Queue

### 1. `phase2/dx-validation/live-verify-hard-gate`

- Goal: move live verify from optional evidence to a policy-enforced repository gate
- Why first:
  - it defines what later packages must prove
  - it reduces ambiguity around PR-blocking versus nightly-only probes
- Expected branch: `codex/phase2/dx-validation/live-verify-hard-gate`

### 2. `phase2/foundation/capability-evidence-sync`

- Goal: make capability truth updates flow from tracked evidence artifacts
- Why second:
  - it makes later maturity or promotion discussions traceable
  - it prevents `foundation` from reverting to hand-maintained truth drift
- Expected branch: `codex/phase2/foundation/capability-evidence-sync`

### 3. `phase2/cloud-surface/response-batch-contract`

- Goal: tighten `ResponseAPI` and `batch` promotion boundaries around explicit contract and
  evidence rules
- Why third:
  - it is the highest-leverage cloud-surface package after Phase 1
  - it should consume the gate/truth rules established by packages 1 and 2
- Expected branch: `codex/phase2/cloud-surface/response-batch-contract`

### 4. `phase2/runtime/runtime-replay-contract`

- Goal: tighten replay, restore, and resumable-thread contracts into a bounded runtime package
- Why fourth:
  - it continues the Phase 1 runtime work without reopening scope
  - it should follow the same evidence and promotion contract as package 3
- Expected branch: `codex/phase2/runtime/runtime-replay-contract`

### 5. `phase2/node-integrations/mcp-live-interop`

- Goal: deepen real MCP interoperability evidence without reopening the whole node platform surface
- Why fifth:
  - it is important, but depends on the gate and evidence rules being explicit first
  - it can then reuse the same review packet and promotion path as the other packages
- Expected branch: `codex/phase2/node-integrations/mcp-live-interop`

## Parallelism Rules

- Packages 1 and 2 should start first.
- Packages 3, 4, and 5 may run in parallel only after package 1 defines the live-gate boundary and
  package 2 defines the evidence-to-truth path.
- No package in this batch should touch more than two owner-lane surfaces. If that happens, split it
  before coding.

## Review Checkpoints

- `antigravity` review checkpoint after packages 1 and 2:
  - confirm the gate and truth model are stable enough for downstream packages
- `antigravity` review checkpoint before any maturity change in packages 3, 4, or 5:
  - require a review packet and promotion decision artifact

## Deferred Beyond Batch 1

- merge queue adoption
- automatic external-doc scraping as the primary truth source
- broad new SDK surface expansion without a bounded package brief
