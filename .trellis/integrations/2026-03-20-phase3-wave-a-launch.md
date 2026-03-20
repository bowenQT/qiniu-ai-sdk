# Phase 3 Wave A Launch

Date: 2026-03-20

Status: launched

## Scope

- `phase3/foundation/capability-ledger-completion`
- `phase3/runtime/runtime-mainline-contract`
- `phase3/node-integrations/mcphost-held-risk-closure`
- `phase3/dx-validation/runtime-story-smoke`

## Worktree Routing

- foundation
  - branch: `codex/phase3/foundation/capability-ledger-completion`
  - worktree: `.worktrees/foundation`
  - worker: `019d0b7c-d682-78e1-9dc1-13ef51555415`
- runtime
  - branch: `codex/phase3/runtime/runtime-mainline-contract`
  - worktree: `.worktrees/runtime`
  - worker: `019d0b7c-d74b-7761-a001-068a8b8d78de`
- node-integrations
  - branch: `codex/phase3/node-integrations/mcphost-held-risk-closure`
  - worktree: `.worktrees/node-integrations`
  - worker: `019d0b7c-d817-7a22-ab1a-a9af3614f478`
- dx-validation
  - branch: `codex/phase3/dx-validation/runtime-story-smoke`
  - worktree: `.worktrees/dx-validation`
  - worker: `019d0b7c-d911-7b41-8f62-6c1d31cf6cdf`

## Merge Order

1. `phase3/foundation/capability-ledger-completion`
2. `phase3/runtime/runtime-mainline-contract`
3. `phase3/node-integrations/mcphost-held-risk-closure`
4. `phase3/dx-validation/runtime-story-smoke`

Packages 2 through 4 may develop in parallel, but integration stays blocked on package 1.

## Live Verify Stance

- `capability-ledger-completion`: unavailable
- `runtime-mainline-contract`: unavailable
- `mcphost-held-risk-closure`: env-gated
- `runtime-story-smoke`: unavailable

## Review Gates

- antigravity review after Wave A packages are complete
- no package merges to integration without:
  - brief
  - focused verification
  - full gate status
  - deferred risks
  - docs impact summary
  - artifact links

## Notes

- `runtime-hardening` lane worktree now exists and is reserved for Wave B package `phase3/runtime-hardening/agent-resume-e2e-contract`
- Wave B and Wave C remain queued only; they do not launch until Wave A lands on `codex/vnext-integration`
