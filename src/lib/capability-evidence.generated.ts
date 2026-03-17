import type { ModuleMaturityInfo } from './capability-types';

export const CAPABILITY_EVIDENCE_GENERATED_AT = "2026-03-17T13:10:00.000Z";
export const CAPABILITY_EVIDENCE_DECISION_FILES = [
  ".trellis/decisions/phase2/phase2-node-integrations-mcp-interop-evidence-policy.json",
  ".trellis/decisions/phase2/phase2-node-integrations-node-mcphost-promotion-readiness.json"
] as const;
export const LATEST_LIVE_VERIFY_GATE = null;
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
    "validationLevel": "unit"
  },
  {
    "name": "video",
    "maturity": "ga",
    "docsUrl": "https://apidocs.qnaigc.com/",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-15",
    "validationLevel": "unit",
    "notes": "Dedicated unit suites cover Veo/Kling normalization and task-handle behavior; live verification remains opt-in."
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
    "validationLevel": "unit"
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
    "trackedDecision": {
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
    "maturity": "experimental",
    "docsUrl": "https://apidocs.qnaigc.com/417773141e0",
    "sourceUpdatedAt": "2026-03-14",
    "validatedAt": "2026-03-15",
    "validationLevel": "unit",
    "notes": "Provider-only surface is covered by dedicated unit suites; live verification remains opt-in."
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
    "sourceUpdatedAt": "2026-03-14",
    "validationLevel": "unit"
  }
];
