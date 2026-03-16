# vNext Phase 2 Seed Plan

Phase 2 starts only after Phase 1 is closed and treated as a stable baseline.

## Priority 1: Verification Hardening

- move live verification from env-gated optional evidence toward repository/CI hard gates
- define which GA/Beta modules must have live probes on every PR
- define nightly-only probes separately from PR-blocking probes
- connect verification report artifacts to promotion decisions

## Priority 2: Capability Truth Automation

- reduce manual capability-source maintenance
- align capability truth with `apidocs.qnaigc.com` more directly
- define how live verification evidence updates maturity notes / validated dates
- keep scorecard and verification report aligned without hand edits

## Priority 3: Runtime Productization

- continue `/core` replay / restore / resumable thread product surface
- clarify which runtime contracts are GA vs Beta
- strengthen session persistence behavior beyond current helper surface

## Priority 4: Node / MCP Interop

- deepen real MCP interoperability evidence, not just unit coverage
- continue protocol conformance against the chosen MCP spec baseline
- separate generic node platform guarantees from Qiniu-specific integrations

## Priority 5: Surface Promotion Review

- review which Phase 1 additions are ready for promotion
- avoid expanding public storytelling faster than validation evidence
- explicitly keep incomplete surfaces in Beta / Experimental until evidence catches up

## Guardrails

- no unbounded continuation of `vNext` work without a scoped phase goal
- each phase must have:
  - explicit exit criteria
  - bounded scope
  - merge/readiness review point
