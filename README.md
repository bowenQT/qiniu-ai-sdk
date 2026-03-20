# Qiniu AI SDK

<div align="center">

[![npm version](https://img.shields.io/npm/v/@bowenqt/qiniu-ai-sdk.svg?style=flat-square)](https://www.npmjs.com/package/@bowenqt/qiniu-ai-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org/)

**TypeScript SDK for Qiniu Cloud AI Services**

[English](./README.md) | [中文](./README.zh-CN.md) | [COOKBOOK](./COOKBOOK.md)

</div>

---

## ✨ Features

### Core AI Modules
- 🚀 **Chat Completions** — OpenAI-compatible interface with streaming support
- 🖼️ **Image Generation** — Kling, kling-image-o1, Gemini models with unified sync/async API
- 🎥 **Video Generation** — Kling, Sora, Veo, viduq models with first/last frame control
- 🔍 **Web Search** — Real-time web search integration
- 📝 **OCR** — High-precision text recognition for images and PDFs
- 🎤 **ASR** — Multi-language speech recognition (95%+ accuracy in noisy environments)
- 🔊 **TTS** — Text-to-speech synthesis with multiple voice options
- 🛡️ **Content Moderation** — Image and video censorship with scene-based detection

### Agentic Layer
- 🤖 **generateText** — Multi-step tool execution with Zod schema support
- 📊 **generateObject/streamObject** — Structured JSON output with streaming
- 🔄 **streamText** — Token-level streaming with fan-out cursors, abort bridging, SSE response (v0.40.0+)
- 🧠 **AgentGraph** — State machine-based graph execution
- 🏭 **createAgent** — Reusable agent factory with configurable behaviors

### Advanced Capabilities
- 🧭 **Capability Registry** — Query model capabilities and module maturity from the SDK
- 📋 **Skills Injection** — Markdown-based agent knowledge (Claude Skills compatible)
- 🏪 **Skill Marketplace** — Remote skill loading with SHA256 integrity verification (v0.32.0+)
- 🔐 **Security Hardening** — Atomic remote install, cumulative size limits, deny-first tool policy (v0.38.0+)
- ⚡ **MCP Tool Policy** — SDK-native timeout, progress reset, output truncation per server (v0.38.0+)
- 🔗 **MCP Host** — `NodeMCPHost` with stdio + HTTP transport + per-server tool policies
- 🖥️ **MCP Server** — Built-in Qiniu MCP server for OCR/Censor/Vframe tools
- 💾 **Checkpointer** — State persistence (Memory, Redis, PostgreSQL, Kodo)
- 🧠 **Memory Manager** — Short-term + long-term memory with LLM summarization
- ✅ **Tool Approval (HITL)** — Human-in-the-loop with deny-first source policy (v0.38.0+)
- ⏸️ **Interrupt/Resume** — Resumable execution with checkpoint-based restore
- 📊 **Structured Telemetry** — MetricsCollector with Prometheus format export (v0.32.0+)
- 📋 **Log Export** — Request log export with filtering and pagination (v0.36.0+)
- 📦 **Cloud Sandbox** — Secure code execution with commands, filesystem, and PTY (v0.37.0+)
- 🔌 **Vercel AI SDK Adapter** — Drop-in replacement for Vercel AI SDK

---

## 📦 Installation

```bash
npm install @bowenqt/qiniu-ai-sdk
```

### Choose Your Entry

| I want to... | Use |
|--------------|-----|
| Call Qiniu cloud APIs directly | `@bowenqt/qiniu-ai-sdk/qiniu` |
| Build agent/runtime workflows | `@bowenqt/qiniu-ai-sdk/qiniu` + `@bowenqt/qiniu-ai-sdk/core` |
| Add MCP, sandbox, skills, or non-memory checkpointers | `@bowenqt/qiniu-ai-sdk/qiniu` + `@bowenqt/qiniu-ai-sdk/core` + `@bowenqt/qiniu-ai-sdk/node` |

### Entry Guarantees

- `@bowenqt/qiniu-ai-sdk/node` is the only supported Node integration surface for MCP, sandbox, audit sinks, and non-memory checkpointers.
- `@bowenqt/qiniu-ai-sdk/core` and `@bowenqt/qiniu-ai-sdk/browser` are kept free of Node-only transitive dependencies.
- `ResponseAPI` is promoted to beta for the core subset only: `create`, `followUp`, `createTextResult`, and `followUpTextResult`; the stronger evidence-backed beta basis only applies when fresh nightly `response-api` evidence is present.
- Other `ResponseAPI` helpers remain deferred/provider-only in this phase, including stream, JSON/messages, reasoning, and chat-completion projection helpers. The recommended access path for that deferred surface is `client.response.experimental.*`; legacy direct helper methods remain compatibility aliases and are not part of the official beta surface.
- `NodeMCPHost` remains `beta (held)`; it only forwards already-resolved bearer tokens via `token` or `tokenProvider`, and the remaining deferred risks are OAuth token acquisition beyond that boundary plus cross-server routing.
- The runtime story smoke in this branch is intentionally local-first: it validates `createAgent` plus session/checkpointer, approval resume, and MCP host composition, while leaving the final runtime/node contract to the dedicated lane workers.
- The root entry remains a compatibility surface, not the recommended teaching surface for new projects.

```typescript
const text = await client.response.createTextResult({
  model: 'openai/gpt-5',
  input: 'Summarize the request.',
});

const json = await client.response.experimental.createJson({
  model: 'openai/gpt-5',
  input: 'Return {"ok":true}.',
});
```

### Cloud API Quickstart

```typescript
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

const client = new QiniuAI({
  apiKey: process.env.QINIU_API_KEY || '',
});

const result = await client.chat.create({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Introduce Qiniu AI SDK in one sentence.' }],
});

console.log(result.choices[0]?.message?.content ?? '');
```

### Agent Quickstart

```typescript
import { z } from 'zod';
import { zodToJsonSchema } from '@bowenqt/qiniu-ai-sdk/ai-tools';
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateText } from '@bowenqt/qiniu-ai-sdk/core';

const calculatorSchema = z.object({ a: z.number(), b: z.number() });

const client = new QiniuAI({
  apiKey: process.env.QINIU_API_KEY || '',
});

const result = await generateText({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'What is 42 multiplied by 17?',
  tools: {
    calculator: {
      description: 'Perform arithmetic',
      parameters: zodToJsonSchema(calculatorSchema),
      execute: async (args) => {
        const { a, b } = calculatorSchema.parse(args);
        return a * b;
      },
    },
  },
});

console.log(result.text);
```

### Node Agent Quickstart

```typescript
import { z } from 'zod';
import { zodToJsonSchema } from '@bowenqt/qiniu-ai-sdk/ai-tools';
import { createAgent } from '@bowenqt/qiniu-ai-sdk/core';
import { createNodeQiniuAI } from '@bowenqt/qiniu-ai-sdk/node';

const nowSchema = z.object({});

const client = createNodeQiniuAI({
  apiKey: process.env.QINIU_API_KEY || '',
});

const agent = createAgent({
  client,
  model: 'gemini-2.5-flash',
  tools: {
    now: {
      description: 'Return the current ISO timestamp',
      parameters: zodToJsonSchema(nowSchema),
      execute: async () => ({ now: new Date().toISOString() }),
    },
  },
});

const result = await agent.run({
  prompt: 'Use the now tool, then explain why ISO timestamps are useful.',
});

console.log(result.text);
```

### v0.46 Migration

| Removed from `@bowenqt/qiniu-ai-sdk` | Import from now |
|--------------------------------------|-----------------|
| `ResponseAPI` and response-related types | `@bowenqt/qiniu-ai-sdk/qiniu` |

### v0.44 Migration

| Removed from `@bowenqt/qiniu-ai-sdk` | Import from now |
|--------------------------------------|-----------------|
| `auditLogger`, `AuditLoggerCollector` | `@bowenqt/qiniu-ai-sdk/node` |
| `new QiniuAI({ sandbox })` | `createNodeQiniuAI({ sandbox })` from `@bowenqt/qiniu-ai-sdk/node` |
| `QiniuSandbox`, sandbox types | `@bowenqt/qiniu-ai-sdk/node` |
| `SkillLoader`, `SkillRegistry`, `RegistryProtocolStub` | `@bowenqt/qiniu-ai-sdk/node` |
| `MCPHttpTransport`, OAuth helpers, token stores, `QiniuMCPServer` | `@bowenqt/qiniu-ai-sdk/node` |
| `RedisCheckpointer`, `PostgresCheckpointer`, `KodoCheckpointer` | `@bowenqt/qiniu-ai-sdk/node` |
| `auditLogger({ sink: 'kodo://...' })` | `auditLogger({ sink: createKodoAuditSink(...) })` from `@bowenqt/qiniu-ai-sdk/node` |

| Removed model alias | Use instead |
|---------------------|-------------|
| `VIDEO_MODELS.VEO_3_0_GENERATE_PREVIEW` | `VIDEO_MODELS.VEO_3_0_GENERATE_001` |
| `VIDEO_MODELS.VEO_3_0_FAST_GENERATE_PREVIEW` | `VIDEO_MODELS.VEO_3_0_FAST_GENERATE_001` |

### Optional Peer Dependencies

```bash
# For Vercel AI SDK integration
npm install @ai-sdk/provider ai

# For Zod schema validation
npm install zod

# For Node.js TTS WebSocket streaming
npm install ws

# For Redis checkpointer
npm install ioredis

# For PostgreSQL checkpointer
npm install pg
```

### Capability Metadata

```typescript
import {
  getModelCapabilities,
  getModuleMaturity,
  listModels,
} from '@bowenqt/qiniu-ai-sdk/qiniu';

const featuredChatModels = listModels({ type: 'chat' }).slice(0, 3);
const responseApi = getModuleMaturity('ResponseAPI');
const gemini = getModelCapabilities('gemini-2.5-flash');

console.log(featuredChatModels.map((model) => model.id));
console.log(responseApi?.maturity); // beta
console.log(gemini?.capabilities);
```

### Worktree Delivery

```bash
# Create the integration worktree and default .worktrees/ layout
qiniu-ai worktree init

# Spawn a lane from codex/vnext-integration
qiniu-ai worktree spawn --lane foundation

# Inspect current worktrees and inferred lanes
qiniu-ai worktree status

# Merge a lane back into the integration branch
qiniu-ai worktree integrate --lane foundation

# Run the default live probe for a lane
qiniu-ai verify live --lane runtime
```

Use worktree lanes for broad SDK upgrades. Keep the root workspace focused on orchestration and integration, and let each lane own a single subsystem group.

### Kodo Audit Sink

```typescript
import { auditLogger } from '@bowenqt/qiniu-ai-sdk/node';
import { createKodoAuditSink } from '@bowenqt/qiniu-ai-sdk/node';

const logger = auditLogger({
  sink: createKodoAuditSink({
    bucket: 'my-audit-bucket',
    accessKey: process.env.QINIU_ACCESS_KEY!,
    secretKey: process.env.QINIU_SECRET_KEY!,
    region: 'z0',
    prefix: 'guardrail/audit',
  }),
});
```

## 🤖 Agentic Usage

### Tool Execution with generateText

```typescript
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateText } from '@bowenqt/qiniu-ai-sdk/core';
import { z } from 'zod';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const result = await generateText({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'What is 42 * 17?',
  tools: {
    calculate: {
      description: 'Perform calculation',
      parameters: z.object({
        operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
        a: z.number(),
        b: z.number(),
      }),
      execute: async ({ operation, a, b }) => {
        const ops = { add: a + b, subtract: a - b, multiply: a * b, divide: a / b };
        return ops[operation];
      },
    },
  },
  maxSteps: 3,
});

console.log(result.text);       // Final answer
console.log(result.toolCalls);  // Tool calls made
```

### Structured Output

```typescript
import { generateObject } from '@bowenqt/qiniu-ai-sdk/core';
import { z } from 'zod';

const result = await generateObject({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'Generate a product listing',
  schema: z.object({
    name: z.string(),
    price: z.number(),
    category: z.string(),
  }),
});

console.log(result.object); // Typed object
```

---

## 🖼️ Image & Video Generation

```typescript
// Image generation (async task)
const imageResult = await client.image.generate({
  model: 'kling-v2',
  prompt: 'A futuristic city at sunset',
});
const finalImage = await client.image.waitForResult(imageResult);
console.log(finalImage.data?.[0].url);

// Video generation with first/last frame
const videoTask = await client.video.create({
  model: 'kling-video-o1',
  prompt: 'A cat jumps from one ledge to another',
  frames: {
    first: { url: 'https://example.com/start.jpg' },
    last: { url: 'https://example.com/end.jpg' },
  },
  duration: '5',
});
const videoResult = await client.video.waitForCompletion(videoTask.id);
console.log(videoResult.task_result?.videos[0].url);

// viduq video generation (v0.36.0+)
const viduqTask = await client.video.create({
  model: 'viduq2',
  prompt: 'A serene mountain landscape with flowing clouds',
  movement_amplitude: 'medium',
});
// Use full handle for reliable polling
const viduqResult = await client.video.waitForCompletion(viduqTask);
console.log(viduqResult.task_result?.videos[0].url);

// kling-image-o1 high-quality image (v0.36.0+)
const klingImg = await client.image.generate({
  model: 'kling-image-o1',
  prompt: 'A photorealistic portrait in studio lighting',
  num_images: 2,
  resolution: '2K',
});
const klingResult = await client.image.waitForResult(klingImg);
console.log(klingResult.data?.map(d => d.url));
```

---

## 🔌 Vercel AI SDK Adapter

```typescript
import { createQiniu } from '@bowenqt/qiniu-ai-sdk/adapter';
import { streamText } from 'ai';

const qiniu = createQiniu({
  apiKey: process.env.QINIU_API_KEY,
});

const { textStream } = await streamText({
  model: qiniu.languageModel('gemini-2.5-flash'),
  prompt: 'Introduce Qiniu Cloud briefly.',
});

for await (const text of textStream) {
  process.stdout.write(text);
}
```

---

## 🧠 Advanced Features

### Skills Injection

```typescript
import { generateTextWithGraph } from '@bowenqt/qiniu-ai-sdk/core';
import { SkillLoader } from '@bowenqt/qiniu-ai-sdk/node';

const loader = new SkillLoader({ skillsDir: './skills' });
const skills = await loader.loadAll();

const result = await generateTextWithGraph({
  client,
  model: 'deepseek-v3',
  messages: [{ role: 'user', content: 'Help me with Git' }],
  skills,
  maxContextTokens: 32000,
});
```

### Skill Marketplace (v0.32.0+)

```typescript
import { SkillRegistry } from '@bowenqt/qiniu-ai-sdk/node';

const registry = new SkillRegistry({
  allowRemote: true,
  allowedDomains: ['skills.qiniu.com', '*.trusted.dev'],
});

// Remote skill with SHA256 integrity verification
await registry.registerRemote({
  url: 'https://skills.qiniu.com/git-workflow/skill.json',
  integrityHash: 'sha256:abc123...',
});

const skill = registry.get('git-workflow');
```

### Structured Telemetry (v0.32.0+)

```typescript
import { MetricsCollector, createMetricsHandler } from '@bowenqt/qiniu-ai-sdk/core';

const metrics = new MetricsCollector();
const handler = createMetricsHandler(metrics);
// GET /metrics → Prometheus format output
```

### MCP Host with Tool Policy (v0.38.0+)

```typescript
import { NodeMCPHost } from '@bowenqt/qiniu-ai-sdk/node';

const host = new NodeMCPHost({
  servers: [
    {
      name: 'github',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      toolPolicy: {
        timeout: 15000,              // SDK-native request timeout
        resetTimeoutOnProgress: true, // Reset on progress notifications
        maxTotalTimeout: 120000,      // Absolute ceiling
        maxOutputLength: 500_000,     // Output truncation
        requiresApproval: false,      // HITL per server
      },
    },
  ],
});

await host.connect();
const tools = host.getTools();
```

### Checkpointer (State Persistence)

```typescript
import { MemoryCheckpointer } from '@bowenqt/qiniu-ai-sdk/core';
import { RedisCheckpointer, KodoCheckpointer } from '@bowenqt/qiniu-ai-sdk/node';

// In-memory (dev/testing)
const memoryCheckpointer = new MemoryCheckpointer({ maxItems: 100 });

// Redis (production)
const redisCheckpointer = new RedisCheckpointer(redisClient, {
  keyPrefix: 'agent:',
  ttlSeconds: 86400,
});

// Kodo (cloud-native/serverless)
const kodoCheckpointer = new KodoCheckpointer({
  accessKey: process.env.QINIU_ACCESS_KEY!,
  secretKey: process.env.QINIU_SECRET_KEY!,
  bucket: 'checkpoints',
  region: 'z0',
});
```

### OpenTelemetry Tracing

```typescript
import { setGlobalTracer, OTelTracer } from '@bowenqt/qiniu-ai-sdk';
import { trace } from '@opentelemetry/api';

const otelTracer = new OTelTracer(trace.getTracerProvider());
setGlobalTracer(otelTracer);

// AgentGraph will now emit spans:
// - agent_graph.invoke
// - agent_graph.predict
// - agent_graph.execute
```

### Cloud Sandbox (v0.37.0+)

```typescript
import { createNodeQiniuAI } from '@bowenqt/qiniu-ai-sdk/node';

const client = createNodeQiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

// Create sandbox and wait for readiness
const instance = await client.sandbox.createAndWait(
  { templateId: 'base' },
  { timeoutMs: 60_000 },
);

// Run commands
const result = await instance.commands.run('echo hello', {
  cwd: '/tmp',
  envs: { MY_VAR: 'test' },
});
console.log(result.stdout); // 'hello\n'
console.log(result.exitCode); // 0

// File operations
await instance.files.write('/tmp/data.txt', 'Hello from SDK');
const content = await instance.files.readText('/tmp/data.txt');
const entries = await instance.files.list('/tmp');

// Cleanup
await instance.kill();
```

---

## 📚 Supported Models

### Chat & Reasoning (66+ models)

| Provider | Models |
|----------|--------|
| **Qwen** | qwen3-235b, qwen3-max, qwen3-32b, qwen-turbo |
| **Claude** | claude-4.5-opus/sonnet/haiku, claude-4.0-opus/sonnet, claude-3.7-sonnet, claude-3.5-sonnet/haiku |
| **Gemini** | gemini-3.0-flash/pro, gemini-2.5-flash/pro, gemini-2.0-flash |
| **DeepSeek** | deepseek-r1, deepseek-v3/v3.1/v3.2 |
| **Doubao** | doubao-seed-1.6, doubao-1.5-pro |
| **GLM** | glm-4.5/4.6/4.7 |
| **Grok** | grok-4-fast, grok-4.1-fast |
| **OpenAI** | gpt-5/5.2, gpt-oss-20b/120b |
| **Kimi** | kimi-k2 |
| **MiniMax** | minimax-m2/m2.1 |

### Image Generation

| Provider | Models |
|----------|--------|
| **Kling** | kling-v1, kling-v1-5, kling-v2, kling-v2-1, kling-image-o1 |
| **Gemini** | gemini-3.0-pro-image, gemini-2.5-flash-image |

### Video Generation

| Provider | Models |
|----------|--------|
| **Kling** | kling-video-o1, kling-v2-1, kling-v2-5-turbo, kling-v2-6, kling-v3, kling-v3-omni |
| **Sora** | sora-2, sora-2-pro |
| **Veo** | veo-2.0, veo-3.0, veo-3.1 |
| **viduq** | viduq1, viduq2, viduq2-pro, viduq2-turbo |

---

## 📁 Package Exports

| Entry Point | Description |
|-------------|-------------|
| `@bowenqt/qiniu-ai-sdk` | Compatibility entry for the common cross-platform surface |
| `@bowenqt/qiniu-ai-sdk/core` | Provider-agnostic agent/runtime APIs |
| `@bowenqt/qiniu-ai-sdk/qiniu` | Qiniu client and cloud API surface |
| `@bowenqt/qiniu-ai-sdk/node` | Node.js-only runtime integrations (MCP, OAuth, token stores, sandbox, checkpointers) |
| `@bowenqt/qiniu-ai-sdk/browser` | Browser-compatible subset |
| `@bowenqt/qiniu-ai-sdk/adapter` | Vercel AI SDK adapter |
| `@bowenqt/qiniu-ai-sdk/ai-tools` | Qiniu native cloud tools (OCR/Censor/Vframe) |

---

## 🛠️ CLI Tools

### Project Setup

```bash
npx qiniu-ai init --template chat
npx qiniu-ai init --template agent
npx qiniu-ai init --template node-agent
npx qiniu-ai doctor --template agent
```

### MCP Server

```bash
npx qiniu-mcp-server
```

### Skill Manager (v0.39.0+)

```bash
npx qiniu-ai doctor --template node-agent  # Validate env, peers, and import choices
npx qiniu-ai skill list          # List installed skills
npx qiniu-ai skill add <url>     # Install a remote skill from manifest URL
npx qiniu-ai skill add <url> --sha256 <hash>  # With integrity verification
npx qiniu-ai skill verify         # Verify integrity (path + hash)
npx qiniu-ai skill verify --fix   # Reconstruct lockfile from local dirs
npx qiniu-ai skill remove <name>  # Remove skill + lockfile entry
```

**Environment variables:**
- `QINIU_API_KEY` — API key for OCR/Censor operations
- `QINIU_ACCESS_KEY` / `QINIU_SECRET_KEY` — For Vframe/signed operations

---

## 📖 Documentation

- **[COOKBOOK.md](./COOKBOOK.md)** — Copy-ready code examples for all features
- **[Qiniu AI Developer Center](https://developer.qiniu.com/aitokenapi)** — Full API reference & pricing

---

## 📄 License

MIT © 2024-2026

---

<div align="center">
  <sub>Built with ❤️ for the Qiniu Cloud ecosystem</sub>
</div>
