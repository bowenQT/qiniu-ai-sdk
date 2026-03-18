# Skill Layer Rationalization

## Goal

Reduce drift between tracked repo runtime assets and shared skills, while promoting the package-first
delivery model into an explicit triggerable skill.

## Decisions Promoted In This Pass

1. Add a tracked repo-specific skill: `package-first-sdk-delivery`.
2. Update tracked skills that were still assuming generic branch delivery:
   - `using-git-worktrees`
   - `writing-plans`
   - `finishing-a-development-branch`
3. Update the tracked index/workflow layer to reference the new skill for repo-wide lane work.

## Why A New Repo Skill Exists

Recent Phase 2 delivery stabilized around a repeated lifecycle:

- lane worktree setup
- bounded package brief
- promoted plan
- focused verification
- evidence bundle
- review packet
- promotion decision
- tracked handoff
- integration-branch merge

This flow is now durable repo knowledge, not just transcript habit.

## Shared-Layer Promotion Candidates

These are strong candidates to move into the shared skill layer after wording cleanup and broader
validation across repositories:

- `gap-analysis`
- `receiving-code-review`

## De-Dupe Candidates

The repository still carries tracked copies of skills that overlap with shared skills:

- `systematic-debugging`
- `verification-before-completion`

Treat the shared layer as the long-term source of truth unless this repository develops a deliberate
fork with repo-specific behavior that the shared version should not absorb.

This pass executes the non-breaking version of that plan:

- keep portable tracked copies in the repository
- align their trigger wording with the shared skills
- mark them as synchronized shared-skill copies instead of repo-specific doctrine

## Not Worth A Standalone Skill

Do not split Phase 2 governance mechanics into separate skills for each artifact family. Keep these
as repo tooling, policy, and references inside the package-first skill:

- live-verify promotion gating
- capability truth compilation
- module-specific promotion-readiness decisions

## Follow-Up

1. Periodically resync the tracked debugging / verification copies against the shared layer, or drop
   them later if the repository no longer needs portable local copies.
2. Validate `gap-analysis` and `receiving-code-review` outside this repository before promoting
   them globally.
3. Keep future package-first delivery changes centered in the new skill instead of scattering the
   rules across multiple generic branch skills.
