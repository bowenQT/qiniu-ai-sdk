# Phase 3 Batch 1 Review Handoff

Date: 2026-03-17
Landing branch: `codex/landing-phase3-batch1`
Merge target: `main`
Main baseline: `2cb6bba`

## Packages

- `phase3/dx-validation/nightly-promotion-matrix`
  - Branch: `codex/phase3/dx-validation/nightly-promotion-matrix`
  - Commit: `f826272`
- `phase3/cloud-surface/responseapi-beta-promotion`
  - Branch: `codex/phase3/cloud-surface/responseapi-beta-promotion`
  - Commit: `c468dde`
- `phase3/node-integrations/mcphost-held-risk-reduction`
  - Branch: `codex/phase3/node-integrations/mcphost-held-risk-reduction`
  - Commit: `f0caf2d`
- `phase3/foundation/product-surface-docs-sync`
  - Branch: `codex/phase3/foundation/product-surface-docs-sync`
  - Commit: `ab33406`

## Scope Summary

- Establish a dedicated nightly promotion workflow without changing PR verify semantics.
- Promote only the minimum `ResponseAPI` subset that the repository is willing to recommend publicly.
- Reduce one held `NodeMCPHost` risk by adding notifications/list_changed live evidence to interop probing.
- Align README, COOKBOOK, doctor, scorecard, and verification report with the promoted subset and the remaining held basis.

## Expected Outcomes

- Nightly promotion-sensitive evidence now has a dedicated workflow and stable artifact paths.
- `ResponseAPI` is promoted to `beta` only for `create`, `followUp`, `createTextResult`, and `followUpTextResult`.
- `NodeMCPHost` remains `beta (held)` with deferred risks narrowed to OAuth token acquisition and multi-server routing.
- Repo-facing docs and doctor output distinguish promoted subset versus deferred/provider-only surface consistently.

## Focused Verification

- Landing baseline
  - `npm run prepublishOnly`
  - `npm run generate:review-packet`
  - `npm run generate:promotion-decisions`
  - `npm run generate:verification-report`
- Package 1
  - `npm test -- tests/cli/package-workflow.test.ts tests/cli/verification-report.test.ts`
  - `npm run build`
  - nightly artifact smoke via `.github/workflows/promotion-nightly.yml` paths
- Package 2
  - `npm test -- tests/unit/modules/response.test.ts tests/cli/live-verify.test.ts tests/cli/init-doctor.test.ts`
  - `npm run build`
- Package 3
  - `npm test -- tests/node/mcp-host.test.ts tests/cli/live-verify.test.ts`
  - `npm run build`
- Package 4
  - `npm run test:docs`

## Review Focus

- Confirm `ResponseAPI` beta status is limited to the tracked core subset and does not implicitly promote deferred helpers.
- Confirm `NodeMCPHost` remains explicitly held, with the notifications/list_changed risk removed from the held basis.
- Confirm Batch 2 should prioritize consuming real nightly evidence into truth/report artifacts before any further promotion work.

## Deferred Risks

- `ResponseAPI` beta promotion is still backed primarily by unit evidence and tracked decisions; latest nightly gate evidence is not yet compiled into the tracked capability snapshot.
- `ResponseAPI` stream, JSON, messages, reasoning, and chat-completion helper surfaces remain deferred/provider-only.
- `NodeMCPHost` still has two held risks: OAuth token acquisition and multi-server routing.
