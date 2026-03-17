---
name: package-first-sdk-delivery
description: Use when executing repo-wide or lane-scoped SDK changes in this repository that must follow bounded change packages, qiniu-ai worktree/package commands, evidence bundles, review packets, promotion decisions, and integration-branch handoff. Trigger on requests to open a phase package, spawn or integrate a lane, prepare a review handoff, or land multi-subsystem SDK work without widening scope.
---

# Package-First SDK Delivery

Use this repository's package-first delivery model when work is bigger than a local feature branch.

## Default Rule

- Treat `phase/<lane>/<topic>` as the delivery unit.
- Keep the root workspace for orchestration and integration only.
- Execute the package in an isolated lane worktree.
- Create the package brief before coding.
- Produce evidence before asking for review or integration.

## Use This Skill When

Use this skill if any of these are true:

- the user mentions a phase, lane, package, review packet, promotion decision, handoff, or integration branch
- the change touches more than one subsystem group
- the change needs tracked evidence or live-verify status to justify promotion or landing
- the work must follow `codex/<phase>/<lane>/<topic>` branch naming

If the task is a narrow single-subsystem change with no package or lane semantics, use the normal worktree / planning flow instead.

## Core Workflow

### 1. Classify The Work

Decide whether the request is package-first:

- package-first: repo-wide, multi-lane, promotion-sensitive, or handoff-driven work
- generic branch work: small isolated feature or bugfix without package artifacts

Do not mix the two models mid-task.

Before opening a new package, read `.trellis/spec/sdk/phase-policy.json` and check the target phase:

- if `allowNewPackages` is `false`, stop and do not open a new package
- if the phase status is `frozen` or `closed`, treat package creation as blocked unless the tracked policy explicitly says otherwise
- if the work belongs to a different phase, move it instead of forcing it into the current one

### 2. Set Up Worktrees Through The Repo CLI

Prefer the repository commands over hand-written `git worktree` flows:

```bash
qiniu-ai worktree init --dir <repo-root>
qiniu-ai worktree spawn --lane <lane> --dir <repo-root>
qiniu-ai worktree status --dir <repo-root>
```

Conventions:

- integration branch: `codex/vnext-integration` unless the current phase docs say otherwise
- package branch: `codex/<phase>/<lane>/<topic>`
- worktree root: `.worktrees/`

### 3. Create The Package Brief Before Coding

Use the tracked package contract:

```bash
qiniu-ai package init \
  --lane <lane> \
  --topic <topic> \
  --goal <goal> \
  --phase <phase> \
  --category <standard|promotion-sensitive> \
  --success "<criterion>" \
  --surface "<touched-surface>" \
  --evidence "<required-evidence>" \
  --out-of-scope "<bounded-exclusion>" \
  --merge-target <branch>
```

Repeat `--success`, `--surface`, `--evidence`, and `--out-of-scope` until the brief is actually
bounded.

While creating the brief, make sure it captures:

- the exact package id
- success criteria
- touched surfaces
- required evidence
- explicit out-of-scope notes
- expected merge target

Tracked brief location:

```text
.trellis/packages/<phase>/<lane>-<topic>.json
```

### 4. Promote The Implementation Plan

After the package brief exists, save the durable plan under:

```text
.trellis/plans/YYYY-MM-DD-<topic>.md
```

Keep the plan aligned with the brief:

- same topic slug
- same owner lane
- same bounded goal
- same out-of-scope boundary

### 5. Execute Only The Current Package

- work inside the lane worktree, not the root workspace
- do not widen scope beyond the brief
- split follow-up work into a new package instead of silently extending the current one
- keep focused verification output as you go

### 6. Produce The Required Artifacts

Generate package artifacts from the repo CLI:

```bash
qiniu-ai package evidence --brief <brief-path> ...
qiniu-ai package review --brief <brief-path> --evidence <evidence-path> ...
qiniu-ai package decision --brief <brief-path> --module <name> --from <maturity> --to <maturity> --basis <text> --source <name>
```

Expected outputs:

- package brief
- evidence bundle
- review packet
- focused verification output
- live verification delta or status
- deferred risks
- promotion decision artifacts when maturity or readiness changes

Generated artifacts belong in `artifacts/`. Tracked decisions belong in `.trellis/decisions/`.

### 7. Prepare The Review Handoff

For bounded batches or integration checkpoints, prepare a concise tracked handoff under:

```text
.trellis/integrations/
```

The handoff should summarize:

- included packages
- commits and branches
- what changed
- focused verification
- deferred risks
- review questions

Prefer artifact links over transcript replay.

### 8. Integrate Through The Integration Branch

After the package is accepted:

```bash
qiniu-ai worktree integrate --lane <lane> --dir <repo-root>
```

Then:

- resolve conflicts in the integration worktree only
- rerun the repo verification gates
- update release docs or phase handoff docs only after integration is green

## Do Not

- hand-roll a generic `git worktree add` flow when the repo CLI already covers the task
- code before the package brief exists
- merge package branches straight to `main` when the active workflow requires integration first
- use transcript-only reasoning as the main review artifact
- widen a package because the adjacent work feels convenient

## Repo References

- workflow contract: `.agent/workflows/multi-agent-product-evolution.md`
- package contract: `.trellis/packages/README.md`
- CLI surface: `src/cli/skill-cli.ts`
- verification expectations: `.trellis/spec/sdk/verification-matrix.md`
- phase gate: `.trellis/spec/sdk/phase-policy.json`
