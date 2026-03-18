# Phase 3 Batch 2 Review Handoff

Date: 2026-03-18

Status: checkpoint-ready

## Scope

- `phase3/foundation/nightly-evidence-ingestion`
- `phase3/cloud-surface/responseapi-evidence-hardening`
- `phase3/node-integrations/mcphost-oauth-boundary`
- `phase3/foundation/promoted-surface-docs-guard`

## What Changed

- Nightly promotion evidence is now a tracked input to capability truth instead of a workflow-only artifact.
- `ResponseAPI` keeps the same promoted core subset, but its beta narrative is now explicitly tied to fresh nightly `response-api` evidence.
- `NodeMCPHost` remains `beta (held)`, but the held basis is narrowed to OAuth token acquisition beyond already-resolved bearer tokens and cross-server routing.
- README, README.zh-CN, COOKBOOK, doctor output, capability scorecard, and verification report wording now match the latest tracked decisions.

## Key Tracked Files

- `.trellis/decisions/phase3/phase3-cloud-surface-responseapi-evidence-hardening.json`
- `.trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json`
- `.trellis/spec/sdk/live-verify-policy.json`
- `.trellis/spec/sdk/capability-evidence-baseline.json`
- `docs/capability-scorecard.md`

## Verification

- Focused verification:
  - `npm test -- tests/cli/init-doctor.test.ts tests/cli/capability-evidence.test.ts tests/cli/verification-report.test.ts tests/unit/modules/response.test.ts tests/node/mcp-host.test.ts`
- Docs and artifact smoke:
  - `npm run test:docs`
  - `npm run generate:review-packet`
  - `npm run generate:promotion-decisions`
  - `npm run generate:verification-report`
- Full gate:
  - `npm run prepublishOnly`

## Review Questions

1. Is the `ResponseAPI` narrative now narrow enough that “beta” clearly means the evidence-backed core subset only?
2. Is the `NodeMCPHost` OAuth boundary explicit enough to carry forward into the next held-risk package without transcript-only explanation?
3. Are the repo-facing docs and doctor/report surfaces aligned enough to treat Phase 3 Batch 2 as a stable mainline checkpoint?
