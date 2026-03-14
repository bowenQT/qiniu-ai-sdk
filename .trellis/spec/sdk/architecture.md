# SDK Architecture

## Overview

`@bowenqt/qiniu-ai-sdk` is a TypeScript SDK that combines API modules, an agentic execution layer, Node-only integrations, and shared infrastructure.

```
Qiniu AI SDK
|- API modules: chat, image, video, ocr, asr, tts, censor, account, log, sandbox
|- Agentic layer: generateText, AgentGraph, object/stream helpers, crew/A2A
|- Integrations: NodeMCPHost, MCP server, adapter entrypoints
`- Utilities: tool registry, approval, memory, checkpointers, metrics
```

## Source Structure

| Area | Purpose |
| --- | --- |
| `src/core`, `src/index.ts` | public surface and type-safe exports |
| `src/modules/**` | feature modules and service-facing API clients |
| `src/ai/**` | agentic orchestration, memory, approval, checkpointing |
| `src/node/**` | Node-specific capabilities such as MCP hosting |
| `src/adapter/**` | AI SDK adapter compatibility |
| `src/lib/**` | shared infrastructure used across layers |

## Design Principles
- Keep public exports stable and intentional.
- Keep runtime-specific behavior behind the correct entrypoint.
- Keep durable repo knowledge here, not in runtime prompt files.
