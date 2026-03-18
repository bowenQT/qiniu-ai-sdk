---
description: Orchestrate broad SDK upgrades with git worktrees, lane ownership, bounded change packages, and an integration branch
---

# Multi-Agent Product Evolution Workflow

Use this workflow for repo-wide SDK evolution that spans multiple subsystems.

## Goals

- Keep the root workspace focused on orchestration and integration only.
- Execute bounded change packages in isolated git worktrees.
- Keep lanes as ownership labels, not long-lived delivery containers.
- Merge package branches into `codex/vnext-integration` before landing on main.
- Require package evidence and live-validation evidence for affected GA/Beta modules before integration.

## Setup

1. Create or reuse the integration worktree:
   `qiniu-ai worktree init --dir <repo-root>`
2. Create a bounded package brief before coding:
   `qiniu-ai package init --lane <lane> --topic <topic> --goal <goal> --success <criterion>`
3. Execute the package on a short-lived branch:
   `codex/<phase>/<lane>/<topic>`
4. Save the promoted plan under `.trellis/plans/YYYY-MM-DD-<topic>.md`.

## Lane Ownership

- `foundation`: capability registry, docs/source sync, doctor rules, maturity tables
- `cloud-surface`: `/qiniu`, cloud modules, model surface alignment
- `runtime`: `/core`, sessions, memory, guardrails, adapter, orchestration
- `node-integrations`: `/node`, MCP, sandbox, skills, audit, non-memory checkpointers
- `dx-validation`: docs, starters, package smoke, eval/live verification, release gates

Lanes remain useful, but they are ownership labels. A package should not become an unbounded lane
branch.

## Role Split

- `Codex`
  - executes the current package only
  - does not expand scope beyond the approved package brief
  - produces evidence before requesting review
- `antigravity`
  - reviews the package brief and review packet
  - owns phase-boundary and promotion judgments
  - prefers artifact links over raw transcript review
- `repo/CI`
  - owns deterministic gates and generated evidence artifacts

## Orchestrator Responsibilities

- Keep the durable plan, package queue, and merge order current.
- Ensure `.worktrees/` stays ignored and package branches use the `codex/<phase>/<lane>/<topic>` format.
- Review package evidence before integrating:
  - package brief
  - evidence bundle
  - review packet
  - focused tests
  - build result
  - docs impact
  - live validation evidence for touched GA/Beta surfaces
- Merge package branches into `codex/vnext-integration` after the package is accepted.

## Package Completion Checklist

Each package must provide:

- a concise package brief
- an evidence bundle
- a review packet
- focused verification output
- explicit live-validation status
- unresolved risks or deferred items

The orchestrator then:

1. integrates the package branch
2. resolves conflicts only in the integration worktree
3. runs full repo verification
4. records any promotion decision artifacts
5. updates release docs/version after integration is green

## Release Gate

Before merging `codex/vnext-integration` back to main:

- `npm run build`
- `npm test`
- `npm run test:docs`
- `npm run test:package-smoke`
- `npm run test:template-smoke`
- `npm run test:ci` in repository CI, with `QINIU_ENABLE_LIVE_VERIFY_GATE=1` when live credentials are available
- package-specific review packet and promotion decision artifacts when applicable
- package-specific live verification evidence for changed GA/Beta modules

## Notes

- Do not use ignored `.claude/agents` as the shared team contract.
- Keep shared SOPs in tracked `.agent/workflows/**`.
- Keep durable implementation plans in tracked `.trellis/plans/**`.
- Keep durable package briefs in tracked `.trellis/packages/**`.
- Stop creating new packages once the active phase policy says the phase is frozen or closed.
