# vNext Lane Briefs

This file is the durable contract for the first parallel delivery wave.

## Foundation

- Scope: capability registry source data, maturity tables, docs sync rules, doctor rules
- Inputs: `apidocs.qnaigc.com` snapshots, current `models.ts`, current README/COOKBOOK maturity story
- Deliverables:
  - tracked capability source file
  - generated-or-derived registry surface with explicit validation semantics
  - docs/source sync guardrails
- Verification:
  - targeted registry tests
  - docs contract checks
  - package smoke

## Cloud Surface

- Scope: `/qiniu`, chat/anthropic/response shapes, multimodal request/response alignment
- Inputs: capability registry, qnaigc docs, current chat/image/video modules
- Deliverables:
  - request/response gap list
  - first-pass alignment for chat/anthropic/response message shapes
  - richer file/media references where docs already support them
- Verification:
  - contract tests
  - touched-module live smoke

## Runtime

- Scope: `/core`, sessions, memory, guardrails, handoff, adapter contract alignment
- Inputs: foundation maturity data, current agent runtime, current adapter tests
- Deliverables:
  - session-store proposal and first implementation slice
  - runtime guardrail layering plan
  - adapter contract gap matrix
- Verification:
  - runtime parity tests
  - adapter contract tests

## Node Integrations

- Scope: `/node`, MCP, sandbox, skills, audit, non-memory checkpointers
- Inputs: MCP 2025-11-25 spec, current node surface, current live-verify hooks
- Deliverables:
  - Node-only capability matrix
  - MCP transport/auth gap list
  - prioritized implementation order for sandbox/skills/audit/persistence
- Verification:
  - node integration tests
  - touched-module live smoke

## DX Validation

- Scope: docs, starters, package smoke, eval/live verification, release gates
- Inputs: foundation registry/maturity outputs, current CLI starter/doctor flows
- Deliverables:
  - registry-aware docs rendering plan
  - live verification lane contract
  - release-gate matrix tied to module maturity
- Verification:
  - docs lint
  - template smoke
  - package smoke

## Merge Order

1. Foundation
2. DX Validation
3. Cloud Surface
4. Runtime
5. Node Integrations

The order is strict for the first wave because capability truth and validation policy must land before higher-level product promises.
