# Capability Scorecard

Last synced: 2026-03-14

This document is generated from the SDK capability registry and is intended to make product maturity auditable.

## Summary

- Validated models: 10
- Validated chat/image/video split: chat=5, image=2, video=3
- Module maturity split: ga=12, beta=14, experimental=5
- Evidence snapshot generated at: 2026-03-17T13:10:00.000Z
- Tracked promotion decisions: 3

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
| NodeMCPHost | beta | beta (held) | unit |  |  | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports |
| PostgresCheckpointer | beta |  | unit |  |  | https://docs.langchain.com/oss/javascript/langgraph/persistence |
| RedisCheckpointer | beta |  | unit |  |  | https://docs.langchain.com/oss/javascript/langgraph/persistence |
| sandbox | beta |  | unit |  |  | https://apidocs.qnaigc.com/ |
| skills | beta |  | unit |  |  | https://apidocs.qnaigc.com/ |
| A2A | experimental |  | unit |  |  | https://openai.github.io/openai-agents-js/guides/handoffs/ |
| ai-tools | experimental |  | unit |  |  | https://apidocs.qnaigc.com/ |
| crew | experimental |  | static |  |  | https://openai.github.io/openai-agents-js/guides/handoffs/ |
| QiniuMCPServer | experimental |  | unit |  |  | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports |
| ResponseAPI | experimental | experimental (held) | unit | 2026-03-15 | Provider-only surface is covered by dedicated unit suites; live verification remains opt-in. | https://apidocs.qnaigc.com/417773141e0 |

## Tracked Evidence Snapshot

| Field | Value |
| --- | --- |
| Generated At | 2026-03-17T13:10:00.000Z |
| Tracked Decision Files | 3 |
| Tracked Promotion Decisions | 3 |
| Latest Gate Artifact |  |
| Latest Gate Status |  |
| Latest Promotion Gate |  |
| Latest Gate Package |  |
