# Verification Report

Generated at: 2026-03-20T15:00:53.614Z

This artifact combines tracked capability truth, package review artifacts, tracked promotion decisions, and the latest live verification evidence and policy boundaries produced in CI.

## Phase Policy

- Phase: phase3
- Status: closeout-candidate
- New packages allowed: no
- Closeout report: artifacts/phase3-closeout-report.md
- Closeout criteria: 3
- Override rules: 2

## Capability Scorecard

Last synced: 2026-03-20T00:00:00.000Z

This document is generated from the SDK capability registry and is intended to make product maturity auditable.

## Summary

- Validated models: 10
- Validated chat/image/video split: chat=5, image=2, video=3
- Public surfaces tracked: 14
- Surface exclusions tracked: 4
- Module maturity split: ga=12, beta=15, experimental=4
- Evidence snapshot generated at: 2026-03-20T00:00:00.000Z
- Tracked promotion decisions: 7

## Coverage Semantics

| Kind | Code | Meaning |
| --- | --- | --- |
| Surface inclusion | first-class | User-facing package entrypoints and CLI bins are first-class surfaces. Named runtime APIs exported from root/core/qiniu/node/browser entrypoints are first-class surfaces when they have dedicated contract or unit evidence. Alias-only exports, type-only exports, generated artifacts, and internal glue remain excluded unless they widen the consumer-facing contract. |
| Surface exclusion | internal-only | Implementation detail or transitive glue that is not intended for direct consumer use. |
| Surface exclusion | type-only | Type-only export with no runtime surface to audit. |
| Surface exclusion | generated-artifact | Derived build output, rendered docs, or evidence artifact rather than an SDK surface. |
| Surface exclusion | duplicate-alias | Alias that does not expand the consumer-facing contract beyond an already-tracked surface. |
| Gate blank reason | not-configured | No live verify gate input was configured for the current snapshot. |
| Gate blank reason | missing-artifact | A live verify gate path was configured, but no artifact existed at that path. |
| Gate blank reason | not-produced | The package run is not expected to emit a live verify gate artifact. |
| Gate blank reason | unavailable | A live verify gate artifact is intentionally unavailable for this package or run. |

## Validated Models

| Model | Provider | Type | Stability | Validation | Validated At | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| claude-3.5-sonnet | Anthropic | chat | ga | live | 2026-03-14 | https://apidocs.qnaigc.com/413432574e0 |
| deepseek-r1 | DeepSeek | chat | ga | live | 2026-03-14 | https://apidocs.qnaigc.com/ |
| gemini-2.5-flash | Google | chat | ga | live | 2026-03-14 | https://apidocs.qnaigc.com/ |
| openai/gpt-5.2 | OpenAI | chat | ga | live | 2026-03-14 | https://apidocs.qnaigc.com/ |
| qwen3-max | Alibaba | chat | ga | live | 2026-03-14 | https://apidocs.qnaigc.com/ |
| gemini-2.5-flash-image | Google | image | ga | unit | 2026-03-14 | https://apidocs.qnaigc.com/ |
| kling-v2 | Kuaishou | image | ga | unit | 2026-03-14 | https://apidocs.qnaigc.com/ |
| kling-video-o1 | Kuaishou | video | ga | unit | 2026-03-14 | https://apidocs.qnaigc.com/ |
| sora-2 | OpenAI | video | ga | unit | 2026-03-14 | https://apidocs.qnaigc.com/ |
| veo-3.0-generate-001 | Google | video | ga | unit | 2026-03-14 | https://apidocs.qnaigc.com/ |

## Public Surfaces

| Surface | Kind | Maturity | Validation | Validated At | Evidence | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| QiniuMCPServer | node-surface | experimental | unit | 2026-03-20 | src/node/mcp/server.ts; tests/unit/modules/mcp-server.test.ts; src/node/index.ts; src/node/mcp/index.ts | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports |
| SandboxSuite | node-surface | beta | unit | 2026-03-20 | src/node/sandbox/index.ts; src/node/sandbox/sandbox.ts; src/node/sandbox/skill-trial.ts; tests/unit/modules/sandbox.test.ts; tests/integration/sandbox.e2e.test.ts; src/node/index.ts | https://apidocs.qnaigc.com/ |
| SkillSuite | node-surface | beta | unit | 2026-03-20 | src/node/skills/index.ts; tests/modules/skills/registry-wrapper.test.ts; tests/modules/skills/registry-protocol.test.ts; tests/modules/skills/installer-and-references.test.ts; tests/modules/skills/validator.test.ts; tests/modules/skills/install-remote.test.ts; src/node/index.ts | https://apidocs.qnaigc.com/ |
| Anthropic | protocol-surface | beta | unit | 2026-03-20 | src/modules/anthropic/index.ts; tests/unit/modules/anthropic.test.ts; src/index.ts; src/qiniu/index.ts | https://apidocs.qnaigc.com/ |
| AgentGraph | runtime-surface | beta | contract | 2026-03-20 | src/ai/agent-graph.ts; tests/unit/ai/agent-graph.test.ts; tests/unit/ai/agent-graph-trace.test.ts; src/index.ts; src/core/index.ts; src/browser/index.ts | https://apidocs.qnaigc.com/ |
| ControlPlane | runtime-surface | beta | contract | 2026-03-20 | src/ai/control-plane/index.ts; tests/unit/ai/control-plane-contracts.test.ts; tests/unit/ai/control-plane-runtime.test.ts; tests/unit/ai/control-plane-revisions.test.ts; tests/unit/ai/control-plane-optimizer.test.ts; tests/unit/ai/control-plane-reflection.test.ts; src/index.ts; src/core/index.ts | https://apidocs.qnaigc.com/ |
| MemoryManager | runtime-surface | beta | unit | 2026-03-20 | src/ai/memory/index.ts; tests/unit/ai/memory.test.ts; src/index.ts; src/core/index.ts; src/browser/index.ts | https://apidocs.qnaigc.com/ |
| ParallelExecution | runtime-surface | beta | unit | 2026-03-20 | src/ai/graph/parallel-executor.ts; tests/unit/ai/parallel-executor.test.ts; src/index.ts; src/core/index.ts | https://apidocs.qnaigc.com/ |
| streamObject | runtime-surface | beta | contract | 2026-03-20 | src/ai/stream-object.ts; tests/unit/ai/stream-object.test.ts; src/index.ts; src/core/index.ts; src/browser/index.ts | https://apidocs.qnaigc.com/ |
| Metrics | tooling-surface | beta | unit | 2026-03-20 | src/lib/metrics.ts; tests/unit/lib/metrics.test.ts; src/ai/agent-graph.ts; src/index.ts; src/core/index.ts | https://apidocs.qnaigc.com/ |
| PartialJsonParser | tooling-surface | beta | unit | 2026-03-20 | src/lib/partial-json-parser.ts; tests/unit/lib/partial-json-parser.test.ts; src/index.ts; src/core/index.ts; src/browser/index.ts | https://apidocs.qnaigc.com/ |
| QINIU_TOOLS | tooling-surface | experimental | unit | 2026-03-20 | src/ai-tools/qiniu-tools.ts; tests/unit/ai-tools/index.test.ts; src/index.ts; src/browser/index.ts | https://apidocs.qnaigc.com/ |
| ToolRegistry | tooling-surface | beta | unit | 2026-03-20 | src/lib/tool-registry.ts; tests/unit/lib/tool-registry.test.ts; src/index.ts; src/core/index.ts; src/browser/index.ts | https://apidocs.qnaigc.com/ |
| Tracing | tooling-surface | beta | static | 2026-03-20 | src/lib/tracer.ts; src/lib/otel-tracer.ts; src/ai/agent-graph.ts; tests/unit/ai/agent-graph-trace.test.ts; src/index.ts; src/core/index.ts; src/browser/index.ts | https://apidocs.qnaigc.com/ |

## Surface Exclusions

| Surface | Code | Reason | Notes |
| --- | --- | --- | --- |
| Alias-only remaps | duplicate-alias | Re-export aliases that do not widen the contract are excluded from the first-class surface ledger. | Alias shims stay documented through their owning surface instead of duplicating scorecard rows. |
| Generated evidence artifacts | generated-artifact | Rendered markdown, JSON snapshots, and generated TS artifacts are support outputs, not SDK surfaces. | These are tracked as verification inputs and outputs rather than product contracts. |
| Internal glue exports | internal-only | Implementation glue and transitive helpers are not first-class public surfaces. | Examples include private call-chain helpers and source-only composition utilities that are only reachable through public wrappers. |
| Type-only declarations | type-only | Type declarations do not add a runtime surface that can be validated separately. | Type exports remain tracked indirectly through the runtime surface that owns them. |

## Module Maturity

| Module | Maturity | Decision | Validation | Validated At | Notes | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| asr | ga |  | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| chat | ga |  | live | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| createAgent | ga |  | contract | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| file | ga |  | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| generateObject | ga |  | contract | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| generateText | ga |  | contract | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| image | ga |  | unit | 2026-03-14 | Async image task handles expose cancel(), but current provider-backed handles fail fast because remote cancellation is not supported; AbortSignal only cancels local waiting/polling. | https://apidocs.qnaigc.com/ |
| log | ga |  | unit | 2026-03-15 | Absolute export contract is covered by unit tests; live verification remains opt-in. | https://apidocs.qnaigc.com/ |
| ocr | ga |  | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| streamText | ga |  | contract | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| tts | ga |  | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| video | ga |  | unit | 2026-03-15 | Dedicated unit suites cover Veo/Kling normalization and task-handle behavior. VideoTaskHandle.cancel() currently fails fast for provider-backed media jobs because remote cancellation is not supported; AbortSignal only cancels local waiting/polling. Live verification remains opt-in. | https://apidocs.qnaigc.com/ |
| account | beta |  | unit | 2026-03-15 | The current account surface is limited to usage() time-series queries; usage auth signing and response handling are covered by unit tests, and live verification remains opt-in. | https://apidocs.qnaigc.com/ |
| adapter | beta |  | unit |  |  | https://ai-sdk.dev/docs |
| admin | beta |  | unit | 2026-03-15 | The current admin surface is limited to API key CRUD (createKeys, listKeys, getKey, revokeKey); broader quota, billing, project, or tenant administration is not part of the shipped SDK surface. | https://apidocs.qnaigc.com/ |
| auditLogger | beta |  | unit |  |  | https://apidocs.qnaigc.com/ |
| batch | beta |  | unit | 2026-03-15 | Core task lifecycle and handle behavior are covered; live verification remains env-gated. | https://apidocs.qnaigc.com/ |
| censor | beta |  | unit | 2026-03-15 | Video censor task handles expose cancel(), but current jobs fail fast because remote cancellation is not supported; callers should treat cancel() as an explicit unsupported contract today. | https://apidocs.qnaigc.com/ |
| guardrails | beta |  | unit |  |  | https://openai.github.io/openai-agents-js/guides/guardrails/ |
| KodoCheckpointer | beta |  | unit |  |  | https://apidocs.qnaigc.com/ |
| memory | beta |  | unit |  |  | https://docs.langchain.com/oss/javascript/langgraph/persistence |
| NodeMCPHost | beta | beta (held) | unit |  | Beta is held on remaining deferred risks: NodeMCPHost only forwards already-resolved HTTP bearer tokens through `token` or `tokenProvider`; OAuth discovery, authorization, refresh, callback, and device-code flows remain out of scope for this package. HTTP interop evidence is collected per server; cross-server routing remains a higher-level integration concern. | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports |
| PostgresCheckpointer | beta |  | unit |  |  | https://docs.langchain.com/oss/javascript/langgraph/persistence |
| RedisCheckpointer | beta |  | unit |  |  | https://docs.langchain.com/oss/javascript/langgraph/persistence |
| ResponseAPI | beta | experimental -> beta | unit | 2026-03-15 | Core subset (create/followUp/createTextResult/followUpTextResult) remains beta via tracked promotion, and the stronger evidence-backed beta basis only applies when fresh nightly response-api evidence is present; deferred stream, message, JSON, reasoning, and chat-completion helpers are recommended through response.experimental.* while legacy direct helper methods remain compatibility aliases. | https://apidocs.qnaigc.com/417773141e0 |
| sandbox | beta |  | unit |  |  | https://apidocs.qnaigc.com/ |
| skills | beta |  | unit |  |  | https://apidocs.qnaigc.com/ |
| A2A | experimental |  | unit |  |  | https://openai.github.io/openai-agents-js/guides/handoffs/ |
| ai-tools | experimental |  | unit |  |  | https://apidocs.qnaigc.com/ |
| crew | experimental |  | static |  |  | https://openai.github.io/openai-agents-js/guides/handoffs/ |
| QiniuMCPServer | experimental |  | unit | 2026-03-20 | Built-in stdio server currently exposes qiniu_chat, qiniu_ocr, qiniu_image_censor, qiniu_video_censor, and qiniu_image_generate. Frame extraction remains outside the server surface and stays available through ai-tools or asset resolver helpers. | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports |

## Tracked Evidence Snapshot

| Field | Value |
| --- | --- |
| Generated At | 2026-03-20T00:00:00.000Z |
| Tracked Decision Files | 7 |
| Public Surfaces | 14 |
| Surface Exclusions | 4 |
| Tracked Promotion Decisions | 7 |
| Latest Gate Artifact | artifacts/live-verify-gate.json |
| Latest Gate Status | unavailable |
| Latest Promotion Gate | unavailable |
| Latest Gate Package | n/a |
| Latest Gate Reason | Live verify gate artifact was not found for the configured input path. |

## Capability Evidence Snapshot

Generated at: 2026-03-20T00:00:00.000Z
Tracked decision files: 7
Public surfaces tracked: 14
Surface exclusions tracked: 4

Decision files:
- .trellis/decisions/phase2/phase2-cloud-surface-responseapi-promotion-readiness.json
- .trellis/decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json
- .trellis/decisions/phase2/phase2-node-integrations-node-mcphost-promotion-readiness.json
- .trellis/decisions/phase3/phase3-cloud-surface-responseapi-beta-promotion.json
- .trellis/decisions/phase3/phase3-cloud-surface-responseapi-evidence-hardening.json
- .trellis/decisions/phase3/phase3-node-integrations-mcphost-held-risk-reduction.json
- .trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json

Tracked promotion decisions: 7

Decision records:
- NodeMCPHost: beta (held) [.trellis/decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json]
- ResponseAPI: experimental (held) [.trellis/decisions/phase2/phase2-cloud-surface-responseapi-promotion-readiness.json]
- ResponseAPI: experimental -> beta [.trellis/decisions/phase3/phase3-cloud-surface-responseapi-beta-promotion.json]
- NodeMCPHost: beta (held) [.trellis/decisions/phase2/phase2-node-integrations-node-mcphost-promotion-readiness.json]
- NodeMCPHost: beta (held) [.trellis/decisions/phase3/phase3-node-integrations-mcphost-held-risk-reduction.json]
- NodeMCPHost: beta (held) [.trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json]
- ResponseAPI: experimental -> beta [.trellis/decisions/phase3/phase3-cloud-surface-responseapi-evidence-hardening.json]

Public surface records:
- streamObject: runtime-surface / beta / contract @ 2026-03-20
- AgentGraph: runtime-surface / beta / contract @ 2026-03-20
- MemoryManager: runtime-surface / beta / unit @ 2026-03-20
- ControlPlane: runtime-surface / beta / contract @ 2026-03-20
- ToolRegistry: tooling-surface / beta / unit @ 2026-03-20
- Metrics: tooling-surface / beta / unit @ 2026-03-20
- Tracing: tooling-surface / beta / static @ 2026-03-20
- PartialJsonParser: tooling-surface / beta / unit @ 2026-03-20
- ParallelExecution: runtime-surface / beta / unit @ 2026-03-20
- QINIU_TOOLS: tooling-surface / experimental / unit @ 2026-03-20
- Anthropic: protocol-surface / beta / unit @ 2026-03-20
- SkillSuite: node-surface / beta / unit @ 2026-03-20
- QiniuMCPServer: node-surface / experimental / unit @ 2026-03-20
- SandboxSuite: node-surface / beta / unit @ 2026-03-20

Surface exclusions:
- Internal glue exports: internal-only (Implementation glue and transitive helpers are not first-class public surfaces.)
- Type-only declarations: type-only (Type declarations do not add a runtime surface that can be validated separately.)
- Generated evidence artifacts: generated-artifact (Rendered markdown, JSON snapshots, and generated TS artifacts are support outputs, not SDK surfaces.)
- Alias-only remaps: duplicate-alias (Re-export aliases that do not widen the contract are excluded from the first-class surface ledger.)

Surface truth policy:
- Inclusion: User-facing package entrypoints and CLI bins are first-class surfaces.
- Inclusion: Named runtime APIs exported from root/core/qiniu/node/browser entrypoints are first-class surfaces when they have dedicated contract or unit evidence.
- Inclusion: Alias-only exports, type-only exports, generated artifacts, and internal glue remain excluded unless they widen the consumer-facing contract.
- Exclusion internal-only: Implementation detail or transitive glue that is not intended for direct consumer use.
- Exclusion type-only: Type-only export with no runtime surface to audit.
- Exclusion generated-artifact: Derived build output, rendered docs, or evidence artifact rather than an SDK surface.
- Exclusion duplicate-alias: Alias that does not expand the consumer-facing contract beyond an already-tracked surface.
- Gate blank not-configured: No live verify gate input was configured for the current snapshot.
- Gate blank missing-artifact: A live verify gate path was configured, but no artifact existed at that path.
- Gate blank not-produced: The package run is not expected to emit a live verify gate artifact.
- Gate blank unavailable: A live verify gate artifact is intentionally unavailable for this package or run.

Latest gate artifact:
- Path: artifacts/live-verify-gate.json
- Status: unavailable
- Promotion gate: unavailable
- Blocking failures: 0
- Held evidence: 0
- Unavailable evidence: 0
- Reason: Live verify gate artifact was not found for the configured input path.

## Promotion Gate Summary

- Status: unavailable
- Blocking failures: 0
- Held evidence: 0
- Unavailable evidence: 0

## Gate Visibility Contract

- Latest gate path, status, package, and reason are tracked through the Capability Evidence Snapshot and generated scorecard.
- When a live verification markdown artifact is absent, this report must say so explicitly; absence never implies an unexplained blank gate state.
- Review packet, promotion decisions, and final promotion gate sections must render explicit fallback text whenever their artifacts are unavailable.

## Live Verification

Live verification artifact was not produced for this run.

## Review Packet

This handoff marks Phase 3 as a closeout candidate from the integrated Wave A/B/C baseline.

## Inputs

- Phase 3 execution plan:
  [`../plans/2026-03-20-phase3-worktree-multi-agent-execution.md`](../plans/2026-03-20-phase3-worktree-multi-agent-execution.md)
- Wave A launch and review handoff:
  [`2026-03-20-phase3-wave-a-launch.md`](./2026-03-20-phase3-wave-a-launch.md)
  [`2026-03-20-phase3-wave-a-review-handoff.md`](./2026-03-20-phase3-wave-a-review-handoff.md)
- Wave B launch:
  [`2026-03-20-phase3-wave-b-launch.md`](./2026-03-20-phase3-wave-b-launch.md)
- Wave C launch:
  [`2026-03-20-phase3-wave-c-launch.md`](./2026-03-20-phase3-wave-c-launch.md)
- Verification report artifact:
  `artifacts/verification-report.md`
- Review packet artifact:
  `artifacts/review-packet.md`
- Phase 3 closeout report artifact:
  `artifacts/phase3-closeout-report.md`

## Review Focus

- Confirm Phase 3 policy can stay in `closeout-candidate` with `allowNewPackages: false`.
- Confirm Wave A/B/C outputs are reflected consistently across capability truth, scorecard, verification report, and tracked wave handoffs.
- Confirm remaining deferred items are explicit rather than hidden behind ambiguous docs or blank gate fields.
- Confirm the closeout report is sufficient as the final review baseline before any mainline landing or reopen decision.

## Promotion Decisions

Promotion decision artifact was not produced for this run.

## Final Promotion Gate Summary

Final promotion gate summary was not produced for this run.
