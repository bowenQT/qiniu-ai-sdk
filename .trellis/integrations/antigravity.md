# Antigravity Integration Notes

## Source Of Truth
- Antigravity artifacts own task state, task lists, and run evidence.
- Repository files own durable governance guidance and promoted plans.

## Repo Interaction Rules
- Do not mirror Antigravity task state into `.trellis/tasks/` or similar repo files.
- Promote a plan into `.trellis/plans/` only when it should remain useful across runs or contributors.
- Treat `AGENTS.md`, `.agent/workflows/**`, and `.trellis/spec/**` as the tracked repo-side guidance layer.

## Planning
- For this repository, the canonical durable plan path is `.trellis/plans/`.
- Runtime artifact plans can stay external unless intentionally promoted.

## Phase 2 Role Split
- Antigravity owns:
  - package brief review
  - review packet consumption
  - promotion and phase-boundary decisions
- Codex owns:
  - bounded package execution
  - evidence generation
  - focused verification before integration
- Antigravity should prefer tracked package briefs, review packets, and verification artifacts over raw transcript replay.
