# Capability Scorecard

Last synced: 2026-03-20T00:00:00.000Z

This document is generated from the SDK capability registry and is intended to make product maturity auditable.

## Summary

- Validated models: 10
- Validated chat/image/video split: chat=5, image=2, video=3
- Public surfaces tracked: 13
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
| image | ga |  | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| log | ga |  | unit | 2026-03-15 | Absolute export contract is covered by unit tests; live verification remains opt-in. | https://apidocs.qnaigc.com/ |
| ocr | ga |  | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| streamText | ga |  | contract | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| tts | ga |  | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| video | ga |  | unit | 2026-03-15 | Dedicated unit suites cover Veo/Kling normalization and task-handle behavior; live verification remains opt-in. | https://apidocs.qnaigc.com/ |
| account | beta |  | unit | 2026-03-15 | Usage auth signing and response handling are covered by unit tests; live verification remains opt-in. | https://apidocs.qnaigc.com/ |
| adapter | beta |  | unit |  |  | https://ai-sdk.dev/docs |
| admin | beta |  | unit | 2026-03-15 |  | https://apidocs.qnaigc.com/ |
| auditLogger | beta |  | unit |  |  | https://apidocs.qnaigc.com/ |
| batch | beta |  | unit | 2026-03-15 | Core task lifecycle and handle behavior are covered; live verification remains env-gated. | https://apidocs.qnaigc.com/ |
| censor | beta |  | unit | 2026-03-15 |  | https://apidocs.qnaigc.com/ |
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
| QiniuMCPServer | experimental |  | unit |  |  | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports |

## Tracked Evidence Snapshot

| Field | Value |
| --- | --- |
| Generated At | 2026-03-20T00:00:00.000Z |
| Tracked Decision Files | 7 |
| Public Surfaces | 13 |
| Surface Exclusions | 4 |
| Tracked Promotion Decisions | 7 |
| Latest Gate Artifact | artifacts/live-verify-gate.json |
| Latest Gate Status | unavailable |
| Latest Promotion Gate | unavailable |
| Latest Gate Package | n/a |
| Latest Gate Reason | Live verify gate artifact was not found for the configured input path. |
