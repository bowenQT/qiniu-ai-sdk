# Phase 3 Worktree Multi-Agent Execution

Status: Wave A integrated, Wave B in progress

Main baseline: `5067a8d`

## Objective

Execute the Phase 3 full-route remediation as bounded change packages using lane worktrees,
with `P0` packages landing first and all package branches merging into
`codex/vnext-integration` before mainline release.

## Lane Topology

- orchestration root: main workspace, orchestration only
- integration: `.worktrees/integration` on `codex/vnext-integration`
- foundation: `.worktrees/foundation` on `codex/vnext/foundation`
- runtime: `.worktrees/runtime` on `codex/vnext/runtime`
- runtime-hardening: `.worktrees/runtime-hardening` on `codex/vnext/runtime-hardening`
- node-integrations: `.worktrees/node-integrations` on `codex/vnext/node-integrations`
- cloud-surface: `.worktrees/cloud-surface` on `codex/vnext/cloud-surface`
- dx-validation: `.worktrees/dx-validation` on `codex/vnext/dx-validation`

## Package Queue

### Wave A / P0 Baseline

1. `phase3/foundation/capability-ledger-completion`
2. `phase3/runtime/runtime-mainline-contract`
3. `phase3/node-integrations/mcphost-held-risk-closure`
4. `phase3/dx-validation/runtime-story-smoke`

Rules:

- package 1 must merge first
- packages 2, 3, and 4 may develop in parallel
- packages 2, 3, and 4 may only merge after package 1 lands on integration

### Wave B / P1 Surface And Narrative Convergence

1. `phase3/foundation/export-coverage-guard`
2. `phase3/cloud-surface/responseapi-surface-split`
3. `phase3/node-integrations/qiniu-mcp-server-truth-sync`
4. `phase3/runtime-hardening/agent-resume-e2e-contract`
5. `phase3/dx-validation/docs-api-drift-cleanup`

Rules:

- package 1 freezes the new capability coverage contract
- packages 2 through 5 may start only after Wave A is integrated
- package 1 must land before final verification of packages 2 through 5

### Wave C / P2 Product Truth Closure

1. `phase3/cloud-surface/task-cancel-contract-truth`
2. `phase3/cloud-surface/admin-account-surface-truth`
3. `phase3/dx-validation/examples-smoke-and-gate-visibility`
4. `phase3/foundation/release-scorecard-closure`

Rules:

- packages 1 through 3 may run in parallel
- package 4 lands last as the release closeout package

## Evidence Requirements

Each package brief must declare:

- touched surfaces
- success criteria
- explicit out-of-scope items
- required evidence
- live verify status as `required`, `env-gated`, or `unavailable`

Each completed package must provide:

- focused verification
- build result
- docs impact
- deferred risks
- artifact links

## Verification Spine

- lane package verification follows the package-specific minimum checks from the execution plan
- integration verification runs:
  - `npm run build`
  - `npm test`
  - `npm run test:docs`
  - `npm run test:package-smoke`
  - `npm run test:template-smoke`

## Acceptance Targets

- capability truth covers all formal first-class public surfaces
- runtime mainline contract is singular and smoke-tested
- `ResponseAPI` official vs deferred surface is explicit
- docs/examples contain no known API drift
- gate/artifact/status outputs never render unexplained blanks

## Current Launch State

- `runtime-hardening` lane worktree was created for this execution set
- Wave A package branches, briefs, artifacts, and integration merges are complete
- integration merge chain:
  - foundation: `613169f`
  - runtime: `83e57f4`
  - node-integrations: `f66de44`
  - dx-validation: `7832bd9`
  - snapshot refresh: `d42bb1b`
- integration verification passed:
  - `npm run build`
  - `npm test`
  - `npm run test:docs`
  - `npm run test:package-smoke`
  - `npm run test:template-smoke`
- Wave B remains queued pending antigravity review of Wave A outputs
- Wave B release recommendation after Wave A review:
  - no blocking findings in Wave A integration verification
  - release `phase3/foundation/export-coverage-guard` first
  - keep the other Wave B packages queued until package 1 lands
- Wave B package 1 landed on `codex/vnext-integration` as `23e8fb9`
- Remaining Wave B packages are now released for execution:
  - `phase3/cloud-surface/responseapi-surface-split`
  - `phase3/node-integrations/qiniu-mcp-server-truth-sync`
  - `phase3/runtime-hardening/agent-resume-e2e-contract`
  - `phase3/dx-validation/docs-api-drift-cleanup`
- Wave B package 4 landed on `codex/vnext-integration` as `495594d`
- Wave B package 5 landed on `codex/vnext-integration` as `3778502`
- integration verification stayed green after packages 4 and 5:
  - `npm run build`
  - `npm test`
  - `npm run test:docs`
  - `npm run test:package-smoke`
  - `npm run test:template-smoke`
- Active Wave B execution is now narrowed to:
  - `phase3/cloud-surface/responseapi-surface-split`
  - `phase3/node-integrations/qiniu-mcp-server-truth-sync`
