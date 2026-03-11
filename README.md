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
- 🧠 **AgentGraph** — State machine-based graph execution
- 🏭 **createAgent** — Reusable agent factory with configurable behaviors

### Advanced Capabilities
- 📋 **Skills Injection** — Markdown-based agent knowledge (Claude Skills compatible)
- 🏪 **Skill Marketplace** — Remote skill loading with SHA256 integrity verification (v0.32.0+)
- 🔗 **MCP Client** — Model Context Protocol with stdio + HTTP + OAuth 2.0 support
- 🖥️ **MCP Server** — Built-in Qiniu MCP server for OCR/Censor/Vframe tools
- 💾 **Checkpointer** — State persistence (Memory, Redis, PostgreSQL, Kodo)
- 🧠 **Memory Manager** — Short-term + long-term memory with LLM summarization
- ✅ **Tool Approval (HITL)** — Human-in-the-loop for sensitive operations
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

### Optional Peer Dependencies

```bash
# For Vercel AI SDK integration
npm install @ai-sdk/provider ai

# For Zod schema validation
npm install zod

# For Redis checkpointer
npm install ioredis

# For PostgreSQL checkpointer
npm install pg
```

---

## 🚀 Quick Start

```typescript
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk';

const client = new QiniuAI({
  apiKey: 'Sk-xxxxxxxxxxxxxxxx',
});

// Chat completion
const chat = await client.chat.create({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Hello!' }],
});
console.log(chat.choices[0].message.content);

// Streaming chat
const stream = await client.chat.createStream({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Explain AI briefly' }],
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

---

## 🤖 Agentic Usage

### Tool Execution with generateText

```typescript
import { QiniuAI, generateText } from '@bowenqt/qiniu-ai-sdk';
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
import { generateObject } from '@bowenqt/qiniu-ai-sdk';
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
import { SkillLoader, generateTextWithGraph } from '@bowenqt/qiniu-ai-sdk';

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
import { SkillRegistry } from '@bowenqt/qiniu-ai-sdk';

const registry = new SkillRegistry({
  allowedDomains: ['skills.qiniu.com', '*.trusted.dev'],
});

// Remote skill with SHA256 integrity verification
await registry.registerRemote('https://skills.qiniu.com/git-workflow', {
  integrity: 'sha256:abc123...',
});

const skill = registry.get('git-workflow');
```

### Structured Telemetry (v0.32.0+)

```typescript
import { MetricsCollector, createMetricsHandler } from '@bowenqt/qiniu-ai-sdk';

const metrics = new MetricsCollector();
const handler = createMetricsHandler(metrics);
// GET /metrics → Prometheus format output
```

### MCP Client (stdio + HTTP)

```typescript
import { MCPClient } from '@bowenqt/qiniu-ai-sdk';

const mcpClient = new MCPClient({
  servers: [
    {
      name: 'github',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      token: process.env.GITHUB_TOKEN,
    },
  ],
});

await mcpClient.connect();
const tools = mcpClient.getAllTools();
```

### Checkpointer (State Persistence)

```typescript
import { MemoryCheckpointer, RedisCheckpointer, KodoCheckpointer } from '@bowenqt/qiniu-ai-sdk';

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
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

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
| `@bowenqt/qiniu-ai-sdk` | Main entry (universal) |
| `@bowenqt/qiniu-ai-sdk/node` | Node.js-only features (SkillLoader, MCPClient stdio) |
| `@bowenqt/qiniu-ai-sdk/browser` | Browser-compatible subset |
| `@bowenqt/qiniu-ai-sdk/adapter` | Vercel AI SDK adapter |
| `@bowenqt/qiniu-ai-sdk/ai-tools` | Qiniu native cloud tools (OCR/Censor/Vframe) |

---

## 🛠️ CLI: MCP Server

Run the built-in Qiniu MCP Server:

```bash
npx qiniu-mcp-server
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
