# Phase 3 Batch 2 Direction Review

Status: adopted

Entry baseline: `2cb6bba`

## Why Batch 2 Exists

Phase 3 Batch 1 completed the first promotion-backed productization pass, but the remaining gaps are now operational rather than surface-level:

- the nightly promotion workflow exists, but its latest artifacts are not yet compiled into tracked capability truth
- `ResponseAPI` is now `beta`, but the promotion basis still needs a stable nightly evidence path instead of relying mainly on tracked unit-backed decisions
- `NodeMCPHost` remains `beta (held)` with two explicit deferred risks: OAuth token acquisition and multi-server routing

Batch 2 should therefore prioritize turning nightly evidence into a first-class tracked input before attempting any further maturity change.

## Proposed Package Queue

1. `phase3/foundation/nightly-evidence-ingestion`
   - compile the latest nightly gate artifact into capability truth, verification report, and scorecard metadata
   - fail clearly when nightly evidence is stale, missing, or schema-incompatible
2. `phase3/cloud-surface/responseapi-evidence-hardening`
   - tighten `ResponseAPI` beta basis around actual nightly evidence freshness
   - make report/doctor output explicit when the beta subset is evidence-backed vs temporarily unverified
3. `phase3/node-integrations/mcphost-oauth-boundary`
   - reduce ambiguity around the remaining OAuth token acquisition held risk
   - either add evidence for the supported OAuth boundary or formalize the non-goal as a tracked contract
4. `phase3/foundation/promoted-surface-docs-guard`
   - final narrative sync package if the first three packages change product-facing wording or decision basis

## Package Constraints

- no package may expand `ResponseAPI` or `NodeMCPHost` public surface
- no package may change PR verify semantics unless a new tracked promotion policy package is opened first
- Batch 2 packages must consume the existing nightly workflow; they must not redesign the workflow schema from Batch 1

## Expected Review Questions

- Is nightly evidence ingestion strong enough to support future maturity changes without transcript-only justification?
- Should `ResponseAPI` remain `beta` if nightly evidence is temporarily absent, or should report output downgrade it to held/unverified until the next nightly run?
- Is OAuth token acquisition the next highest-leverage `NodeMCPHost` risk, or should multi-server routing be clarified first?

## Adopted Batch 2 Queue

1. `phase3/foundation/nightly-evidence-ingestion`
2. `phase3/cloud-surface/responseapi-evidence-hardening`
3. `phase3/node-integrations/mcphost-oauth-boundary`
4. `phase3/foundation/promoted-surface-docs-guard`
