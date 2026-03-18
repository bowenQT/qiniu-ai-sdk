# Phase 2 Operating Model

Phase 2 keeps the successful Phase 1 repo-side mechanics, but changes the unit of delivery from
long-lived lane work to bounded change packages.

## Control Split

- `Codex` executes a bounded change package.
- `antigravity` reviews the package brief, audit packet, deferred risks, and phase checkpoints.
- `repo/CI` produces deterministic evidence artifacts and verification reports.

`antigravity` is not the primary code executor for Phase 2. It is the planning, review, and light
automation layer.

## Package-First Delivery

Lanes still exist, but only as ownership labels:

- `foundation`
- `cloud-surface`
- `runtime`
- `runtime-hardening`
- `node-integrations`
- `dx-validation`

The delivery unit is a change package with a fixed identifier format:

- `phase2/<lane>/<topic>`

The expected branch format for the package is:

- `codex/<phase>/<lane>/<topic>`

Packages are created through the CLI:

```bash
qiniu-ai package init --lane runtime --topic resumable-checkpoints --goal "Tighten resumable persistence"
qiniu-ai package evidence --brief .trellis/packages/phase2/runtime-resumable-checkpoints.json
qiniu-ai package review --brief <brief> --evidence <evidence>
qiniu-ai package decision --brief <brief> --module runtime --from beta --to ga --basis "verification-report.md" --source antigravity
```

## Required Artifacts

Each package must produce:

- a change package brief
- an evidence bundle
- a review packet
- optional promotion decisions when maturity changes are proposed

These artifacts live under tracked `.trellis/packages/**` and generated `artifacts/**`.

## Package Lifecycle

1. `Ask/Plan`
   Lock a single goal, success criteria, touched surfaces, and out-of-scope list.
2. `Execute`
   Implement only the current package in an isolated branch/worktree.
3. `Evidence`
   Produce focused verification, gate status, live-verify delta, and deferred risks.
4. `Review`
   Hand `antigravity` the review packet and artifact links instead of a full transcript.
5. `Integrate`
   Merge only when the package artifacts and repo gates are green.

## Phase Stop Protocol

The tracked phase policy in [phase-policy.json](./phase-policy.json) controls whether new packages
may be opened. When a phase reaches its exit criteria:

- new package creation must stop
- only closeout, release, and next-phase planning work may continue

This rule lives in tracked repo policy, not only in chat instructions.

Phase stop states are tracked as:

- `active`: normal bounded-package delivery
- `closeout-candidate`: closeout evidence is being assembled and should not be mixed with new
  strategic direction changes without an explicit override
- `frozen`: no new packages by default; only closeout, release, and next-phase planning may
  continue
- `closed`: all new work moves to the next phase

## Evidence Rules

Evidence is a first-class input. Package-level artifacts, live verify output, and the verification
report must agree on:

- what changed
- what was verified
- what remains deferred
- why any maturity change is justified

## Future Merge Queue Support

If the repository later adopts merge queues, CI must continue to run the same package artifacts and
verification report flow on `merge_group` or an equivalent queue event.
