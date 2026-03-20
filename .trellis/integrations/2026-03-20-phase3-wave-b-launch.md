# Phase 3 Wave B Launch

Date: 2026-03-20

Status: conditionally released

## Gate Recommendation

- Review outcome: no blocking findings identified in Wave A integration artifacts.
- Recommendation: conditionally release Wave B.
- Rationale: the new capability ledger is materially better, but coverage remains curated rather than export-derived. Wave B should therefore start with `foundation/export-coverage-guard` before other Wave B packages are allowed to land.

## Release Decision

- Released now:
  - `phase3/foundation/export-coverage-guard`
- Queued behind Wave B package 1:
  - `phase3/cloud-surface/responseapi-surface-split`
  - `phase3/node-integrations/qiniu-mcp-server-truth-sync`
  - `phase3/runtime-hardening/agent-resume-e2e-contract`
  - `phase3/dx-validation/docs-api-drift-cleanup`

## Conditions

- `phase3/foundation/export-coverage-guard` must:
  - add a tracked guard that fails when new formal first-class public surfaces are not reflected in capability truth
  - keep existing exclusion semantics explicit instead of silently broadening exclusions
  - pass its focused verification and integration verification on `codex/vnext-integration`
- Only after package 1 lands may the remaining Wave B packages begin integration review.

## Notes

- This is a narrower release than the original parallel plan.
- The narrower release is intentional and follows the Wave A review focus around capability coverage reliability.
