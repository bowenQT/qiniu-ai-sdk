# Phase 2 Batch 3 Review Handoff

Date: 2026-03-17
Landing branch: `codex/landing-phase2-batch3`
Merge target: `main`

## Packages

- `phase2/dx-validation/live-verify-promotion-gate`
  - Branch: `codex/phase2/dx-validation/live-verify-promotion-gate`
  - Commit: `07f3d14`
- `phase2/foundation/capability-truth-automation`
  - Branch: `codex/phase2/foundation/capability-truth-automation`
  - Commit: `62384c2`
- `phase2/cloud-surface/responseapi-promotion-readiness`
  - Branch: `codex/phase2/cloud-surface/responseapi-promotion-readiness`
  - Commit: `12b3b6d`
- `phase2/node-integrations/node-mcphost-promotion-readiness`
  - Branch: `codex/phase2/node-integrations/node-mcphost-promotion-readiness`
  - Commit: `e5c963c`

## Scope Summary

- Freeze promotion-sensitive live-verify semantics for package-scoped gates.
- Compile capability truth from tracked decisions and latest gate evidence.
- Record a held promotion-readiness decision for `ResponseAPI`.
- Record a held promotion-readiness decision for `NodeMCPHost`.

## Expected Outcomes

- `verify gate` can distinguish standard vs promotion-sensitive packages.
- `capability-evidence.json`, generated truth, and `docs/capability-scorecard.md` are derived from the same tracked decision set.
- `doctor`, scorecard, and verification report can explain why `ResponseAPI` and `NodeMCPHost` remain held.

## Focused Verification

- `phase2-live-promotion`
  - `npm test -- tests/cli/live-verify-gate.test.ts tests/cli/package-workflow.test.ts`
  - `npm run build`
  - `node bin/qiniu-ai.mjs verify gate --brief .trellis/packages/phase2/cloud-surface-responseapi-promotion-readiness.json --profile pr --policy .trellis/spec/sdk/live-verify-policy.json --json`
  - `npm run prepublishOnly`
- `phase2-truth-automation`
  - `npm test -- tests/cli/capability-evidence.test.ts tests/cli/verification-report.test.ts`
  - `node scripts/render-capability-evidence-snapshot.mjs && npm run build && node scripts/render-capability-scorecard.mjs && npm run test:docs`
  - `npm run prepublishOnly`
- `phase2-response-readiness`
  - `npm test -- tests/unit/modules/response.test.ts tests/cli/init-doctor.test.ts`
  - `npm run build`
  - `node scripts/render-capability-evidence-snapshot.mjs && node scripts/render-capability-scorecard.mjs && npm run test:docs`
  - `npm run prepublishOnly`
- `phase2-mcp-readiness`
  - `npm test -- tests/node/mcp-host.test.ts tests/cli/capability-evidence.test.ts`
  - `npm run build`
  - `node scripts/render-capability-evidence-snapshot.mjs && node scripts/render-capability-scorecard.mjs && npm run test:docs`
  - `npm run prepublishOnly`

## Deferred Risks

- `ResponseAPI` stream/projection helper expansion remains provider-only and is still outside the official promotion basis.
- `NodeMCPHost` remains held at beta until stronger host-level live interop evidence exists for notifications, OAuth token acquisition, and multi-server routing.
