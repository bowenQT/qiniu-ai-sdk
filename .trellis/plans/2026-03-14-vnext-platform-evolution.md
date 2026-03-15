# vNext Platform Evolution

This promoted plan tracks the SDK's next delivery model and product foundation.

## Delivery Model

- `git worktree` + lane branches + `codex/vnext-integration`
- root workspace stays orchestration-only
- lane work happens in `.worktrees/<lane>`

## Lanes

- foundation
- cloud-surface
- runtime
- node-integrations
- dx-validation

Lane briefs: `.trellis/plans/2026-03-14-vnext-lane-briefs.md`

## Core Outcomes

- capability registry becomes the single source of truth for models and maturity
- doctor becomes maturity-aware and lane-aware
- public metadata APIs expose model capabilities and module maturity
- repo-tracked workflows document multi-agent product evolution

## Release Gate

- `npm run build`
- `npm test`
- `npm run test:docs`
- `npm run test:package-smoke`
- `npm run test:template-smoke`
- `npm run test:ci` in repository CI, with `QINIU_ENABLE_LIVE_VERIFY_GATE=1` when live credentials are available
- lane-specific live verification evidence for affected GA/Beta surfaces
