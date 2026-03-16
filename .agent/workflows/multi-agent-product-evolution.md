---
description: Orchestrate broad SDK upgrades with git worktrees, lane ownership, and an integration branch
---

# Multi-Agent Product Evolution Workflow

Use this workflow for repo-wide SDK evolution that spans multiple subsystems.

## Goals

- Keep the root workspace focused on orchestration and integration only.
- Execute lane work in isolated git worktrees.
- Merge all lane branches into `codex/vnext-integration` before landing on main.
- Require live-validation evidence for affected GA/Beta modules before integration.

## Setup

1. Create or reuse the integration worktree:
   `qiniu-ai worktree init --dir <repo-root>`
2. Create lane worktrees from the integration branch:
   - `qiniu-ai worktree spawn --lane foundation`
   - `qiniu-ai worktree spawn --lane cloud-surface`
   - `qiniu-ai worktree spawn --lane runtime`
   - `qiniu-ai worktree spawn --lane node-integrations`
   - `qiniu-ai worktree spawn --lane dx-validation`
3. Save the promoted plan under `.trellis/plans/YYYY-MM-DD-<topic>.md`.

## Lane Ownership

- `foundation`: capability registry, docs/source sync, doctor rules, maturity tables
- `cloud-surface`: `/qiniu`, cloud modules, model surface alignment
- `runtime`: `/core`, sessions, memory, guardrails, adapter, orchestration
- `node-integrations`: `/node`, MCP, sandbox, skills, audit, non-memory checkpointers
- `dx-validation`: docs, starters, package smoke, eval/live verification, release gates

## Orchestrator Responsibilities

- Keep the durable plan, lane checklist, and merge order current.
- Ensure `.worktrees/` stays ignored and lane branches use the `codex/vnext/*` prefix.
- Review lane evidence before integrating:
  - focused tests
  - build result
  - docs impact
  - live validation evidence for touched GA/Beta surfaces
- Merge lane branches into `codex/vnext-integration` with:
  `qiniu-ai worktree integrate --lane <lane>`

## Lane Completion Checklist

Each lane must provide:

- a concise change summary
- focused verification output
- explicit live-validation status
- unresolved risks or deferred items

The orchestrator then:

1. integrates the lane branch
2. resolves conflicts only in the integration worktree
3. runs full repo verification
4. updates release docs/version after integration is green

## Release Gate

Before merging `codex/vnext-integration` back to main:

- `npm run build`
- `npm test`
- `npm run test:docs`
- `npm run test:package-smoke`
- `npm run test:template-smoke`
- `npm run test:ci` in repository CI, with `QINIU_ENABLE_LIVE_VERIFY_GATE=1` when live credentials are available
- lane-specific live verification evidence for changed GA/Beta modules

## Notes

- Do not use ignored `.claude/agents` as the shared team contract.
- Keep shared SOPs in tracked `.agent/workflows/**`.
- Keep durable implementation plans in tracked `.trellis/plans/**`.
