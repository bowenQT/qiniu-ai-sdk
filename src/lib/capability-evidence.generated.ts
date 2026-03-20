import type { ModuleMaturityInfo } from './capability-types';

export const CAPABILITY_EVIDENCE_GENERATED_AT = "2026-03-20T00:00:00.000Z";
export const CAPABILITY_EVIDENCE_DECISION_FILES = [
  ".trellis/decisions/phase2/phase2-cloud-surface-responseapi-promotion-readiness.json",
  ".trellis/decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json",
  ".trellis/decisions/phase2/phase2-node-integrations-node-mcphost-promotion-readiness.json",
  ".trellis/decisions/phase3/phase3-cloud-surface-responseapi-beta-promotion.json",
  ".trellis/decisions/phase3/phase3-cloud-surface-responseapi-evidence-hardening.json",
  ".trellis/decisions/phase3/phase3-node-integrations-mcphost-held-risk-reduction.json",
  ".trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json"
] as const;
export const CAPABILITY_SURFACE_TRUTH_POLICY = {
  "firstClassSurfaceDefinition": [
    "User-facing package entrypoints and CLI bins are first-class surfaces.",
    "Named runtime APIs exported from root/core/qiniu/node/browser entrypoints are first-class surfaces when they have dedicated contract or unit evidence.",
    "Alias-only exports, type-only exports, generated artifacts, and internal glue remain excluded unless they widen the consumer-facing contract."
  ],
  "exclusionReasonSemantics": {
    "internal-only": "Implementation detail or transitive glue that is not intended for direct consumer use.",
    "type-only": "Type-only export with no runtime surface to audit.",
    "generated-artifact": "Derived build output, rendered docs, or evidence artifact rather than an SDK surface.",
    "duplicate-alias": "Alias that does not expand the consumer-facing contract beyond an already-tracked surface."
  },
  "gateBlankReasonSemantics": {
    "not-configured": "No live verify gate input was configured for the current snapshot.",
    "missing-artifact": "A live verify gate path was configured, but no artifact existed at that path.",
    "not-produced": "The package run is not expected to emit a live verify gate artifact.",
    "unavailable": "A live verify gate artifact is intentionally unavailable for this package or run."
  }
} as const;
export const CAPABILITY_PUBLIC_SURFACES = [
  {
    "name": "streamObject",
    "kind": "runtime-surface",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "contract",
    "evidenceBasis": [
      "src/ai/stream-object.ts",
      "tests/unit/ai/stream-object.test.ts",
      "src/index.ts",
      "src/core/index.ts",
      "src/browser/index.ts"
    ],
    "entrypointExports": {
      "root": [
        "streamObject"
      ],
      "core": [
        "streamObject"
      ],
      "browser": [
        "streamObject"
      ]
    }
  },
  {
    "name": "AgentGraph",
    "kind": "runtime-surface",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "contract",
    "evidenceBasis": [
      "src/ai/agent-graph.ts",
      "tests/unit/ai/agent-graph.test.ts",
      "tests/unit/ai/agent-graph-trace.test.ts",
      "src/index.ts",
      "src/core/index.ts",
      "src/browser/index.ts"
    ],
    "entrypointExports": {
      "root": [
        "AgentGraph"
      ],
      "core": [
        "AgentGraph"
      ],
      "browser": [
        "AgentGraph"
      ]
    }
  },
  {
    "name": "MemoryManager",
    "kind": "runtime-surface",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "unit",
    "evidenceBasis": [
      "src/ai/memory/index.ts",
      "tests/unit/ai/memory.test.ts",
      "src/index.ts",
      "src/core/index.ts",
      "src/browser/index.ts"
    ],
    "entrypointExports": {
      "root": [
        "MemoryManager"
      ],
      "core": [
        "MemoryManager"
      ],
      "browser": [
        "MemoryManager"
      ]
    }
  },
  {
    "name": "ControlPlane",
    "kind": "runtime-surface",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "contract",
    "evidenceBasis": [
      "src/ai/control-plane/index.ts",
      "tests/unit/ai/control-plane-contracts.test.ts",
      "tests/unit/ai/control-plane-runtime.test.ts",
      "tests/unit/ai/control-plane-revisions.test.ts",
      "tests/unit/ai/control-plane-optimizer.test.ts",
      "tests/unit/ai/control-plane-reflection.test.ts",
      "src/index.ts",
      "src/core/index.ts"
    ],
    "entrypointExports": {
      "root": [
        "runBoundedReflectionLoop",
        "DefaultOptimizerPolicy",
        "InMemoryCandidateStore"
      ],
      "core": [
        "runBoundedReflectionLoop",
        "DefaultOptimizerPolicy",
        "InMemoryCandidateStore"
      ]
    }
  },
  {
    "name": "ToolRegistry",
    "kind": "tooling-surface",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "unit",
    "evidenceBasis": [
      "src/lib/tool-registry.ts",
      "tests/unit/lib/tool-registry.test.ts",
      "src/index.ts",
      "src/core/index.ts",
      "src/browser/index.ts"
    ],
    "entrypointExports": {
      "root": [
        "ToolRegistry"
      ],
      "core": [
        "ToolRegistry"
      ],
      "browser": [
        "ToolRegistry"
      ]
    }
  },
  {
    "name": "Metrics",
    "kind": "tooling-surface",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "unit",
    "evidenceBasis": [
      "src/lib/metrics.ts",
      "tests/unit/lib/metrics.test.ts",
      "src/ai/agent-graph.ts",
      "src/index.ts",
      "src/core/index.ts"
    ],
    "entrypointExports": {
      "root": [
        "MetricsCollector",
        "createMetricsHandler"
      ],
      "core": [
        "MetricsCollector",
        "createMetricsHandler"
      ]
    }
  },
  {
    "name": "Tracing",
    "kind": "tooling-surface",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "static",
    "evidenceBasis": [
      "src/lib/tracer.ts",
      "src/lib/otel-tracer.ts",
      "src/ai/agent-graph.ts",
      "tests/unit/ai/agent-graph-trace.test.ts",
      "src/index.ts",
      "src/core/index.ts",
      "src/browser/index.ts"
    ],
    "entrypointExports": {
      "root": [
        "NoopTracer",
        "ConsoleTracer",
        "OTelTracer"
      ],
      "core": [
        "NoopTracer",
        "ConsoleTracer"
      ],
      "browser": [
        "NoopTracer",
        "ConsoleTracer"
      ]
    }
  },
  {
    "name": "PartialJsonParser",
    "kind": "tooling-surface",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "unit",
    "evidenceBasis": [
      "src/lib/partial-json-parser.ts",
      "tests/unit/lib/partial-json-parser.test.ts",
      "src/index.ts",
      "src/core/index.ts",
      "src/browser/index.ts"
    ],
    "entrypointExports": {
      "root": [
        "PartialJsonParser",
        "parsePartialJson"
      ],
      "core": [
        "PartialJsonParser",
        "parsePartialJson"
      ],
      "browser": [
        "PartialJsonParser",
        "parsePartialJson"
      ]
    }
  },
  {
    "name": "ParallelExecution",
    "kind": "runtime-surface",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "unit",
    "evidenceBasis": [
      "src/ai/graph/parallel-executor.ts",
      "tests/unit/ai/parallel-executor.test.ts",
      "src/index.ts",
      "src/core/index.ts"
    ],
    "entrypointExports": {
      "root": [
        "executeParallel"
      ],
      "core": [
        "executeParallel"
      ]
    }
  },
  {
    "name": "QINIU_TOOLS",
    "kind": "tooling-surface",
    "maturity": "experimental",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "unit",
    "evidenceBasis": [
      "src/ai-tools/qiniu-tools.ts",
      "tests/unit/ai-tools/index.test.ts",
      "src/index.ts",
      "src/browser/index.ts"
    ],
    "entrypointExports": {
      "root": [
        "QINIU_TOOLS",
        "getQiniuToolsArray"
      ],
      "browser": [
        "QINIU_TOOLS",
        "getQiniuToolsArray"
      ]
    }
  },
  {
    "name": "Anthropic",
    "kind": "protocol-surface",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "unit",
    "evidenceBasis": [
      "src/modules/anthropic/index.ts",
      "tests/unit/modules/anthropic.test.ts",
      "src/index.ts",
      "src/qiniu/index.ts"
    ],
    "entrypointExports": {
      "root": [
        "Anthropic"
      ],
      "qiniu": [
        "Anthropic"
      ]
    }
  },
  {
    "name": "SkillSuite",
    "kind": "node-surface",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "unit",
    "evidenceBasis": [
      "src/node/skills/index.ts",
      "tests/modules/skills/registry-wrapper.test.ts",
      "tests/modules/skills/registry-protocol.test.ts",
      "tests/modules/skills/installer-and-references.test.ts",
      "tests/modules/skills/validator.test.ts",
      "tests/modules/skills/install-remote.test.ts",
      "src/node/index.ts"
    ],
    "entrypointExports": {
      "node": [
        "SkillLoader",
        "SkillRegistry",
        "SkillValidator",
        "SkillInstaller"
      ]
    }
  },
  {
    "name": "QiniuMCPServer",
    "kind": "node-surface",
    "maturity": "experimental",
    "docsUrl": "https://modelcontextprotocol.io/specification/2025-11-25/basic/transports",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "unit",
    "evidenceBasis": [
      "src/node/mcp/server.ts",
      "tests/unit/modules/mcp-server.test.ts",
      "src/node/index.ts",
      "src/node/mcp/index.ts"
    ],
    "entrypointExports": {
      "node": [
        "QiniuMCPServer",
        "startFromEnv"
      ]
    }
  },
  {
    "name": "SandboxSuite",
    "kind": "node-surface",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "unit",
    "evidenceBasis": [
      "src/node/sandbox/index.ts",
      "src/node/sandbox/sandbox.ts",
      "src/node/sandbox/skill-trial.ts",
      "tests/unit/modules/sandbox.test.ts",
      "tests/integration/sandbox.e2e.test.ts",
      "src/node/index.ts"
    ],
    "entrypointExports": {
      "node": [
        "QiniuSandbox",
        "SandboxInstance",
        "QiniuSandboxTrialAdapter"
      ]
    }
  }
] as const;
export const CAPABILITY_SURFACE_EXCLUSIONS = [
  {
    "surface": "Internal glue exports",
    "reasonCode": "internal-only",
    "reason": "Implementation glue and transitive helpers are not first-class public surfaces.",
    "notes": "Examples include private call-chain helpers and source-only composition utilities that are only reachable through public wrappers."
  },
  {
    "surface": "Type-only declarations",
    "reasonCode": "type-only",
    "reason": "Type declarations do not add a runtime surface that can be validated separately.",
    "notes": "Type exports remain tracked indirectly through the runtime surface that owns them."
  },
  {
    "surface": "Generated evidence artifacts",
    "reasonCode": "generated-artifact",
    "reason": "Rendered markdown, JSON snapshots, and generated TS artifacts are support outputs, not SDK surfaces.",
    "notes": "These are tracked as verification inputs and outputs rather than product contracts."
  },
  {
    "surface": "Alias-only remaps",
    "reasonCode": "duplicate-alias",
    "reason": "Re-export aliases that do not widen the contract are excluded from the first-class surface ledger.",
    "notes": "Alias shims stay documented through their owning surface instead of duplicating scorecard rows."
  }
] as const;
export const LATEST_LIVE_VERIFY_GATE = {
  "path": "artifacts/live-verify-gate.json",
  "status": "unavailable",
  "promotionGateStatus": "unavailable",
  "blockingFailuresCount": 0,
  "heldEvidenceCount": 0,
  "unavailableEvidenceCount": 0,
  "reasonCode": "missing-artifact",
  "reason": "Live verify gate artifact was not found for the configured input path."
} as const;
export const TRACKED_PROMOTION_DECISIONS = [
  {
    "packageId": "phase2/node-integrations/mcp-interop-evidence-policy",
    "module": "NodeMCPHost",
    "oldMaturity": "beta",
    "newMaturity": "beta",
    "evidenceBasis": [
      ".trellis/spec/sdk/live-verify-policy.json#profiles.pr.lanePolicies.node-integrations",
      ".trellis/spec/sdk/live-verify-policy.json#profiles.nightly.lanePolicies.node-integrations",
      ".trellis/integrations/2026-03-16-phase2-batch1-packages-3-5-review-handoff.md"
    ],
    "decisionSource": "antigravity",
    "decisionAt": "2026-03-16T13:30:00.000Z",
    "trackedPath": ".trellis/decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json"
  },
  {
    "packageId": "phase2/cloud-surface/responseapi-promotion-readiness",
    "module": "ResponseAPI",
    "oldMaturity": "experimental",
    "newMaturity": "experimental",
    "evidenceBasis": [
      "src/modules/response/index.ts#RESPONSE_API_PROMOTION_READINESS_CONTRACT",
      ".trellis/spec/sdk/live-verify-policy.json#profiles.pr.lanePolicies.cloud-surface",
      ".trellis/spec/sdk/live-verify-policy.json#profiles.nightly.lanePolicies.cloud-surface",
      "tests/unit/modules/response.test.ts"
    ],
    "decisionSource": "codex",
    "decisionAt": "2026-03-17T12:30:00.000Z",
    "trackedPath": ".trellis/decisions/phase2/phase2-cloud-surface-responseapi-promotion-readiness.json"
  },
  {
    "packageId": "phase3/cloud-surface/responseapi-beta-promotion",
    "module": "ResponseAPI",
    "oldMaturity": "experimental",
    "newMaturity": "beta",
    "evidenceBasis": [
      "src/modules/response/index.ts#RESPONSE_API_PROMOTION_READINESS_CONTRACT",
      "tests/unit/modules/response.test.ts"
    ],
    "decisionSource": "codex",
    "decisionAt": "2026-03-17T13:02:32Z",
    "trackedPath": ".trellis/decisions/phase3/phase3-cloud-surface-responseapi-beta-promotion.json"
  },
  {
    "packageId": "phase2/node-integrations/node-mcphost-promotion-readiness",
    "module": "NodeMCPHost",
    "oldMaturity": "beta",
    "newMaturity": "beta",
    "evidenceBasis": [
      "src/node/mcp-host.ts#NODE_MCPHOST_PROMOTION_READINESS_CONTRACT",
      ".trellis/spec/sdk/live-verify-policy.json#profiles.pr.lanePolicies.node-integrations",
      ".trellis/spec/sdk/live-verify-policy.json#profiles.nightly.lanePolicies.node-integrations",
      "tests/node/mcp-host.test.ts"
    ],
    "decisionSource": "codex",
    "decisionAt": "2026-03-17T13:10:00.000Z",
    "trackedPath": ".trellis/decisions/phase2/phase2-node-integrations-node-mcphost-promotion-readiness.json"
  },
  {
    "packageId": "phase3/node-integrations/mcphost-held-risk-reduction",
    "module": "NodeMCPHost",
    "oldMaturity": "beta",
    "newMaturity": "beta",
    "evidenceBasis": [
      "src/node/mcp-host.ts#NODE_MCPHOST_PROMOTION_READINESS_CONTRACT",
      "src/node/mcp-host.ts#probeServerInterop",
      ".trellis/spec/sdk/live-verify-policy.json#profiles.pr.lanePolicies.node-integrations",
      ".trellis/spec/sdk/live-verify-policy.json#profiles.nightly.lanePolicies.node-integrations",
      "tests/node/mcp-host.test.ts"
    ],
    "decisionSource": "codex",
    "decisionAt": "2026-03-17T13:20:00.000Z",
    "trackedPath": ".trellis/decisions/phase3/phase3-node-integrations-mcphost-held-risk-reduction.json"
  },
  {
    "packageId": "phase3/node-integrations/mcphost-oauth-boundary",
    "module": "NodeMCPHost",
    "oldMaturity": "beta",
    "newMaturity": "beta",
    "evidenceBasis": [
      "src/node/mcp-host.ts#NODE_MCPHOST_PROMOTION_READINESS_CONTRACT",
      "src/node/mcp-host.ts#createTransport",
      "tests/node/mcp-host.test.ts"
    ],
    "decisionSource": "codex",
    "decisionAt": "2026-03-18T00:00:00.000Z",
    "trackedPath": ".trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json"
  },
  {
    "packageId": "phase3/cloud-surface/responseapi-evidence-hardening",
    "module": "ResponseAPI",
    "oldMaturity": "experimental",
    "newMaturity": "beta",
    "evidenceBasis": [
      "src/modules/response/index.ts#RESPONSE_API_PROMOTION_READINESS_CONTRACT",
      ".trellis/packages/phase3/cloud-surface-responseapi-evidence-hardening.json",
      ".trellis/spec/sdk/live-verify-policy.json#profiles.nightly.lanePolicies.cloud-surface",
      "artifacts/live-verify-gate-nightly.json",
      "tests/unit/modules/response.test.ts"
    ],
    "decisionSource": "codex",
    "decisionAt": "2026-03-18T00:00:00.000Z",
    "requirements": {
      "liveVerifyGate": {
        "path": "artifacts/live-verify-gate-nightly.json",
        "policyProfile": "nightly",
        "promotionGateStatus": "pass"
      }
    },
    "trackedPath": ".trellis/decisions/phase3/phase3-cloud-surface-responseapi-evidence-hardening.json"
  }
] as const;
export const MODULE_MATURITY_SOURCE: ModuleMaturityInfo[] = [
  {
    "name": "chat",
    "maturity": "ga",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-14",
    "validationLevel": "live"
  },
  {
    "name": "image",
    "maturity": "ga",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-14",
    "validationLevel": "unit",
    "notes": "Async image task handles expose cancel(), but current provider-backed handles fail fast because remote cancellation is not supported; AbortSignal only cancels local waiting/polling."
  },
  {
    "name": "video",
    "maturity": "ga",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-15",
    "validationLevel": "unit",
    "notes": "Dedicated unit suites cover Veo/Kling normalization and task-handle behavior. VideoTaskHandle.cancel() currently fails fast for provider-backed media jobs because remote cancellation is not supported; AbortSignal only cancels local waiting/polling. Live verification remains opt-in."
  },
  {
    "name": "ocr",
    "maturity": "ga",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "asr",
    "maturity": "ga",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "tts",
    "maturity": "ga",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "file",
    "maturity": "ga",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "log",
    "maturity": "ga",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-15",
    "validationLevel": "unit",
    "notes": "Absolute export contract is covered by unit tests; live verification remains opt-in."
  },
  {
    "name": "generateText",
    "maturity": "ga",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-14",
    "validationLevel": "contract"
  },
  {
    "name": "streamText",
    "maturity": "ga",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-14",
    "validationLevel": "contract"
  },
  {
    "name": "generateObject",
    "maturity": "ga",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-14",
    "validationLevel": "contract"
  },
  {
    "name": "createAgent",
    "maturity": "ga",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-14",
    "validationLevel": "contract"
  },
  {
    "name": "account",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-15",
    "validationLevel": "unit",
    "notes": "Usage auth signing and response handling are covered by unit tests; live verification remains opt-in."
  },
  {
    "name": "admin",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-15",
    "validationLevel": "unit"
  },
  {
    "name": "batch",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-15",
    "validationLevel": "unit",
    "notes": "Core task lifecycle and handle behavior are covered; live verification remains env-gated."
  },
  {
    "name": "censor",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-15",
    "validationLevel": "unit",
    "notes": "Video censor task handles expose cancel(), but current jobs fail fast because remote cancellation is not supported; callers should treat cancel() as an explicit unsupported contract today."
  },
  {
    "name": "adapter",
    "maturity": "beta",
    "docsUrl": "https://ai-sdk.dev/docs",
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "memory",
    "maturity": "beta",
    "docsUrl": "https://docs.langchain.com/oss/javascript/langgraph/persistence",
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "guardrails",
    "maturity": "beta",
    "docsUrl": "https://openai.github.io/openai-agents-js/guides/guardrails/",
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "NodeMCPHost",
    "maturity": "beta",
    "docsUrl": "https://modelcontextprotocol.io/specification/2025-11-25/basic/transports",
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "unit",
    "notes": "Beta is held on remaining deferred risks: NodeMCPHost only forwards already-resolved HTTP bearer tokens through `token` or `tokenProvider`; OAuth discovery, authorization, refresh, callback, and device-code flows remain out of scope for this package. HTTP interop evidence is collected per server; cross-server routing remains a higher-level integration concern.",
    "trackedDecision": {
      "packageId": "phase3/node-integrations/mcphost-oauth-boundary",
      "module": "NodeMCPHost",
      "oldMaturity": "beta",
      "newMaturity": "beta",
      "evidenceBasis": [
        "src/node/mcp-host.ts#NODE_MCPHOST_PROMOTION_READINESS_CONTRACT",
        "src/node/mcp-host.ts#createTransport",
        "tests/node/mcp-host.test.ts"
      ],
      "decisionSource": "codex",
      "decisionAt": "2026-03-18T00:00:00.000Z",
      "trackedPath": ".trellis/decisions/phase3/phase3-node-integrations-mcphost-oauth-boundary.json"
    }
  },
  {
    "name": "sandbox",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "skills",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "RedisCheckpointer",
    "maturity": "beta",
    "docsUrl": "https://docs.langchain.com/oss/javascript/langgraph/persistence",
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "PostgresCheckpointer",
    "maturity": "beta",
    "docsUrl": "https://docs.langchain.com/oss/javascript/langgraph/persistence",
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "KodoCheckpointer",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "auditLogger",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "ResponseAPI",
    "maturity": "beta",
    "docsUrl": "https://apidocs.qnaigc.com/417773141e0",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-15",
    "validationLevel": "unit",
    "notes": "Core subset (create/followUp/createTextResult/followUpTextResult) remains beta via tracked promotion, and the stronger evidence-backed beta basis only applies when fresh nightly response-api evidence is present; deferred stream, message, JSON, reasoning, and chat-completion helpers are recommended through response.experimental.* while legacy direct helper methods remain compatibility aliases.",
    "trackedDecision": {
      "packageId": "phase3/cloud-surface/responseapi-beta-promotion",
      "module": "ResponseAPI",
      "oldMaturity": "experimental",
      "newMaturity": "beta",
      "evidenceBasis": [
        "src/modules/response/index.ts#RESPONSE_API_PROMOTION_READINESS_CONTRACT",
        "tests/unit/modules/response.test.ts"
      ],
      "decisionSource": "codex",
      "decisionAt": "2026-03-17T13:02:32Z",
      "trackedPath": ".trellis/decisions/phase3/phase3-cloud-surface-responseapi-beta-promotion.json"
    }
  },
  {
    "name": "crew",
    "maturity": "experimental",
    "docsUrl": "https://openai.github.io/openai-agents-js/guides/handoffs/",
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "static"
  },
  {
    "name": "A2A",
    "maturity": "experimental",
    "docsUrl": "https://openai.github.io/openai-agents-js/guides/handoffs/",
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "ai-tools",
    "maturity": "experimental",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "unit"
  },
  {
    "name": "QiniuMCPServer",
    "maturity": "experimental",
    "docsUrl": "https://modelcontextprotocol.io/specification/2025-11-25/basic/transports",
    "sourceUpdatedAt": "2026-03-20",
    "validatedAt": "2026-03-20",
    "validationLevel": "unit",
    "notes": "Built-in stdio server currently exposes qiniu_chat, qiniu_ocr, qiniu_image_censor, qiniu_video_censor, and qiniu_image_generate. Frame extraction remains outside the server surface and stays available through ai-tools or asset resolver helpers."
  }
];
