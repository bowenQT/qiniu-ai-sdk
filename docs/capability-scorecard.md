# Capability Scorecard

Last synced: 2026-03-14

This document is generated from the SDK capability registry and is intended to make product maturity auditable.

## Summary

- Validated models: 10
- Validated chat/image/video split: chat=5, image=2, video=3
- Module maturity split: ga=12, beta=13, experimental=5

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

| Module | Maturity | Validation | Validated At | Notes | Docs |
| --- | --- | --- | --- | --- | --- |
| asr | ga | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| chat | ga | live | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| createAgent | ga | contract | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| file | ga | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| generateObject | ga | contract | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| generateText | ga | contract | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| image | ga | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| log | ga | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| ocr | ga | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| streamText | ga | contract | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| tts | ga | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| video | ga | unit | 2026-03-14 |  | https://apidocs.qnaigc.com/ |
| account | beta | unit |  |  | https://apidocs.qnaigc.com/ |
| adapter | beta | unit |  |  | https://ai-sdk.dev/docs |
| admin | beta | static |  | Direct module validation is still being expanded. | https://apidocs.qnaigc.com/ |
| auditLogger | beta | unit |  |  | https://apidocs.qnaigc.com/ |
| censor | beta | static |  | Direct module validation is still being expanded. | https://apidocs.qnaigc.com/ |
| guardrails | beta | unit |  |  | https://openai.github.io/openai-agents-js/guides/guardrails/ |
| KodoCheckpointer | beta | unit |  |  | https://apidocs.qnaigc.com/ |
| memory | beta | unit |  |  | https://docs.langchain.com/oss/javascript/langgraph/persistence |
| NodeMCPHost | beta | unit |  |  | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports |
| PostgresCheckpointer | beta | unit |  |  | https://docs.langchain.com/oss/javascript/langgraph/persistence |
| RedisCheckpointer | beta | unit |  |  | https://docs.langchain.com/oss/javascript/langgraph/persistence |
| sandbox | beta | unit |  |  | https://apidocs.qnaigc.com/ |
| skills | beta | unit |  |  | https://apidocs.qnaigc.com/ |
| A2A | experimental | unit |  |  | https://openai.github.io/openai-agents-js/guides/handoffs/ |
| ai-tools | experimental | unit |  |  | https://apidocs.qnaigc.com/ |
| crew | experimental | static |  |  | https://openai.github.io/openai-agents-js/guides/handoffs/ |
| QiniuMCPServer | experimental | unit |  |  | https://modelcontextprotocol.io/specification/2025-11-25/basic/transports |
| ResponseAPI | experimental | static |  |  | https://apidocs.qnaigc.com/417773141e0 |
