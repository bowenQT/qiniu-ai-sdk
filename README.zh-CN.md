# Qiniu AI SDK

<div align="center">

[![npm version](https://img.shields.io/npm/v/@bowenqt/qiniu-ai-sdk.svg?style=flat-square)](https://www.npmjs.com/package/@bowenqt/qiniu-ai-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org/)

**七牛云 AI 服务 TypeScript SDK**

[English](./README.md) | [中文](./README.zh-CN.md) | [示例代码](./COOKBOOK.md)

</div>

---

## ✨ 功能特性

### 核心 AI 模块
- 🚀 **对话补全** — 兼容 OpenAI 接口，支持流式输出
- 🖼️ **图像生成** — 支持 Kling、kling-image-o1、Gemini 模型，统一的同步/异步 API
- 🎥 **视频生成** — 支持 Kling、Sora、Veo、viduq 模型，首尾帧控制
- 🔍 **网页搜索** — 实时网络搜索集成
- 📝 **OCR 文字识别** — 图片和 PDF 高精度文字识别
- 🎤 **ASR 语音识别** — 多语言语音识别（嘈杂环境 95%+ 准确率）
- 🔊 **TTS 语音合成** — 多音色文字转语音
- 🛡️ **内容审核** — 图片和视频场景化审核

### Agent 层
- 🤖 **generateText** — 多步骤工具执行，支持 Zod Schema
- 📊 **generateObject/streamObject** — 结构化 JSON 输出，支持流式
- 🔄 **streamText** — 逐 Token 流式输出，独立游标、中断桥接、SSE 响应（v0.40.0+）
- 🧠 **AgentGraph** — 基于状态机的图执行引擎
- 🏭 **createAgent** — 可复用的 Agent 工厂

### 高级能力
- 🧭 **能力注册表** — 通过 SDK 查询模型能力和模块成熟度
- 📋 **技能注入** — Markdown 格式的 Agent 知识库（兼容 Claude Skills）
- 🏪 **Skill 市场** — 远程技能加载 + SHA256 完整性验证 (v0.32.0+)
- 🔐 **安全加固** — 原子远程安装、累计大小限制、deny-first 工具策略 (v0.38.0+)
- ⚡ **MCP 工具策略** — SDK 原生 timeout、进度重置、输出截断，按服务器配置 (v0.38.0+)
- 🔗 **MCP Host** — `NodeMCPHost` 支持 stdio + HTTP 传输 + 按服务器工具策略
- 🖥️ **MCP 服务端** — 内置七牛 MCP Server（对话、OCR、图片/视频审核、图片生成）
- 💾 **Checkpointer** — 状态持久化（Memory、Redis、PostgreSQL、Kodo）
- 🧠 **Memory Manager** — 短期 + 长期记忆，LLM 自动摘要
- ✅ **工具审批 (HITL)** — 敏感操作人工确认 + deny-first 来源策略 (v0.38.0+)
- ⏸️ **中断/恢复** — 基于检查点的可恢复执行
- 📊 **结构化指标** — MetricsCollector + Prometheus 格式导出 (v0.32.0+)
- 📋 **日志导出** — 请求日志导出，支持筛选和分页 (v0.36.0+)
- 📦 **云沙箱** — 安全代码执行，支持命令、文件系统和 PTY 终端 (v0.37.0+)
- 🔌 **Vercel AI SDK 适配器** — 无缝对接 Vercel AI SDK

---

## 📦 安装

```bash
npm install @bowenqt/qiniu-ai-sdk
```

### 如何选择入口

| 我想做什么 | 使用哪个入口 |
|------------|--------------|
| 直接调用七牛云 API | `@bowenqt/qiniu-ai-sdk/qiniu` |
| 构建 agent/runtime 工作流 | `@bowenqt/qiniu-ai-sdk/qiniu` + `@bowenqt/qiniu-ai-sdk/core` |
| 接入 MCP、sandbox、skills 或非内存 checkpointer | `@bowenqt/qiniu-ai-sdk/qiniu` + `@bowenqt/qiniu-ai-sdk/core` + `@bowenqt/qiniu-ai-sdk/node` |

### 入口契约

- `@bowenqt/qiniu-ai-sdk/node` 是 MCP、sandbox、audit sink 以及非内存 checkpointer 的唯一正式 Node integration 入口。
- `@bowenqt/qiniu-ai-sdk/core` 和 `@bowenqt/qiniu-ai-sdk/browser` 保持不含 Node-only 传递依赖。
- `ResponseAPI` 仅核心子集晋级为 beta：`create`、`followUp`、`createTextResult`、`followUpTextResult`；只有在存在 fresh nightly `response-api` 证据时，才会启用更强的 evidence-backed beta 结论。
- 其余 `ResponseAPI` helpers 仍处于 deferred/provider-only（包括 stream、JSON/messages、reasoning、chat-completion projection）。
- `NodeMCPHost` 仍为 `beta (held)`；当前只负责透传已经解析好的 bearer token（`token` / `tokenProvider`），剩余 deferred risks 为超出该边界的 OAuth token acquisition 与 cross-server routing。
- 本分支的 runtime story smoke 保持本地优先：只验证 `createAgent` + session/checkpointer、approval resume、MCP host 组合，最终 runtime/node contract 仍由对应 lane worker 收敛。
- root 入口继续保留兼容性，但不再作为新项目的默认教学入口。

### Cloud API Quickstart

```typescript
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

const client = new QiniuAI({
  apiKey: process.env.QINIU_API_KEY || '',
});

const result = await client.chat.create({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: '用一句话介绍七牛 AI SDK。' }],
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
  prompt: '42 乘以 17 等于多少？',
  tools: {
    calculator: {
      description: '做乘法计算',
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
      description: '返回当前 ISO 时间戳',
      parameters: zodToJsonSchema(nowSchema),
      execute: async () => ({ now: new Date().toISOString() }),
    },
  },
});

const result = await agent.run({
  prompt: '先调用 now 工具，再说明为什么 ISO 时间戳适合做系统集成。',
});

console.log(result.text);
```

### v0.46 迁移表

| 从 `@bowenqt/qiniu-ai-sdk` 移除 | 现在改用 |
|--------------------------------|----------|
| `ResponseAPI` 及其相关类型 | `@bowenqt/qiniu-ai-sdk/qiniu` |

### v0.44 迁移表

| 从 `@bowenqt/qiniu-ai-sdk` 移除 | 现在改用 |
|--------------------------------|----------|
| `auditLogger`、`AuditLoggerCollector` | `@bowenqt/qiniu-ai-sdk/node` |
| `new QiniuAI({ sandbox })` | 从 `@bowenqt/qiniu-ai-sdk/node` 改用 `createNodeQiniuAI({ sandbox })` |
| `QiniuSandbox` 与 sandbox 相关类型 | `@bowenqt/qiniu-ai-sdk/node` |
| `SkillLoader`、`SkillRegistry`、`RegistryProtocolStub` | `@bowenqt/qiniu-ai-sdk/node` |
| `MCPHttpTransport`、OAuth 工具、token store、`QiniuMCPServer` | `@bowenqt/qiniu-ai-sdk/node` |
| `RedisCheckpointer`、`PostgresCheckpointer`、`KodoCheckpointer` | `@bowenqt/qiniu-ai-sdk/node` |
| `auditLogger({ sink: 'kodo://...' })` | 从 `@bowenqt/qiniu-ai-sdk/node` 改用 `auditLogger({ sink: createKodoAuditSink(...) })` |

| 被删除的模型别名 | 请改用 |
|------------------|--------|
| `VIDEO_MODELS.VEO_3_0_GENERATE_PREVIEW` | `VIDEO_MODELS.VEO_3_0_GENERATE_001` |
| `VIDEO_MODELS.VEO_3_0_FAST_GENERATE_PREVIEW` | `VIDEO_MODELS.VEO_3_0_FAST_GENERATE_001` |

### 可选依赖

```bash
# Vercel AI SDK 集成
npm install @ai-sdk/provider ai

# Zod Schema 验证
npm install zod

# Node.js TTS WebSocket 流式合成
npm install ws

# Redis Checkpointer
npm install ioredis

# PostgreSQL Checkpointer
npm install pg
```

### 能力元数据

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

### Worktree 交付流

```bash
# 初始化 integration worktree，并建立默认 .worktrees/ 目录
qiniu-ai worktree init

# 从 codex/vnext-integration 派生 lane
qiniu-ai worktree spawn --lane foundation

# 查看当前 worktree 与推断出来的 lane
qiniu-ai worktree status

# 把 lane 合流回 integration branch
qiniu-ai worktree integrate --lane foundation

# 运行该 lane 的默认 live probe
qiniu-ai verify live --lane runtime
```

适用于跨模块的大规模 SDK 演进：root 工作区只负责编排和集成，每个 lane 只负责一组子系统。

### Kodo 审计 Sink

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

## 🤖 Agent 使用

### 使用 generateText 执行工具

```typescript
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateText } from '@bowenqt/qiniu-ai-sdk/core';
import { z } from 'zod';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const result = await generateText({
  client,
  model: 'gemini-2.5-flash',
  prompt: '42 乘以 17 等于多少？',
  tools: {
    calculate: {
      description: '执行计算',
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

console.log(result.text);       // 最终答案
console.log(result.toolCalls);  // 工具调用记录
```

### 结构化输出

```typescript
import { generateObject } from '@bowenqt/qiniu-ai-sdk/core';
import { z } from 'zod';

const result = await generateObject({
  client,
  model: 'gemini-2.5-flash',
  prompt: '生成一个产品信息',
  schema: z.object({
    name: z.string().describe('产品名称'),
    price: z.number().describe('价格'),
    category: z.string().describe('分类'),
  }),
});

console.log(result.object); // 类型安全的对象
```

---

## 🖼️ 图像和视频生成

```typescript
// 图像生成（异步任务）
const imageResult = await client.image.generate({
  model: 'kling-v2',
  prompt: '日落时分的未来城市',
});
const finalImage = await client.image.waitForResult(imageResult);
console.log(finalImage.data?.[0].url);

// 视频生成（首尾帧控制）
const videoTask = await client.video.create({
  model: 'kling-video-o1',
  prompt: '一只猫从一个平台跳到另一个平台',
  frames: {
    first: { url: 'https://example.com/start.jpg' },
    last: { url: 'https://example.com/end.jpg' },
  },
  duration: '5',
});
const videoResult = await client.video.waitForCompletion(videoTask.id);
console.log(videoResult.task_result?.videos[0].url);

// viduq 视频生成 (v0.36.0+)
const viduqTask = await client.video.create({
  model: 'viduq2',
  prompt: '宁静的山水景观，云雾缭绕',
  movement_amplitude: 'medium',
});
// 使用完整句柄进行可靠轮询
const viduqResult = await client.video.waitForCompletion(viduqTask);
console.log(viduqResult.task_result?.videos[0].url);

// kling-image-o1 高质量图像 (v0.36.0+)
const klingImg = await client.image.generate({
  model: 'kling-image-o1',
  prompt: '影棚灯光下的写实人像照',
  num_images: 2,
  resolution: '2K',
});
const klingResult = await client.image.waitForResult(klingImg);
console.log(klingResult.data?.map(d => d.url));
```

---

## 🔌 Vercel AI SDK 适配器

```typescript
import { createQiniu } from '@bowenqt/qiniu-ai-sdk/adapter';
import { streamText } from 'ai';

const qiniu = createQiniu({
  apiKey: process.env.QINIU_API_KEY,
});

const { textStream } = await streamText({
  model: qiniu.languageModel('gemini-2.5-flash'),
  prompt: '简单介绍一下七牛云',
});

for await (const text of textStream) {
  process.stdout.write(text);
}
```

---

## 🧠 高级功能

### 技能注入

```typescript
import { generateTextWithGraph } from '@bowenqt/qiniu-ai-sdk/core';
import { SkillLoader } from '@bowenqt/qiniu-ai-sdk/node';

const loader = new SkillLoader({ skillsDir: './skills' });
const skills = await loader.loadAll();

const result = await generateTextWithGraph({
  client,
  model: 'deepseek-v3',
  messages: [{ role: 'user', content: '帮我处理 Git 问题' }],
  skills,
  maxContextTokens: 32000,
});
```

### Skill 市场 (v0.39.0+)

```typescript
import { SkillRegistry } from '@bowenqt/qiniu-ai-sdk/node';

const registry = new SkillRegistry({
  allowRemote: true,
  allowedDomains: ['skills.qiniu.com', '*.trusted.dev'],
});

// 远程技能加载 + SHA256 完整性验证
await registry.registerRemote({
  url: 'https://skills.qiniu.com/git-workflow/skill.json',
  integrityHash: 'sha256:abc123...',
});

const skill = registry.get('git-workflow');
```

### 结构化指标 (v0.32.0+)

```typescript
import { MetricsCollector, createMetricsHandler } from '@bowenqt/qiniu-ai-sdk/core';

const metrics = new MetricsCollector();
const handler = createMetricsHandler(metrics);
// GET /metrics → Prometheus 格式输出
```

### MCP 集成（NodeMCPHost）

```typescript
import { NodeMCPHost } from '@bowenqt/qiniu-ai-sdk/node';
import { createAgent } from '@bowenqt/qiniu-ai-sdk/core';
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const mcpHost = new NodeMCPHost({
  servers: [
    {
      name: 'github',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN || '' },
    },
  ],
});

const agent = createAgent({
  client,
  model: 'gemini-2.5-flash',
  hostProvider: mcpHost,
});

const result = await agent.run({ prompt: 'List my repos' });
console.log(result.text);

await mcpHost.dispose();
```

### Checkpointer（状态持久化）

```typescript
import { MemoryCheckpointer } from '@bowenqt/qiniu-ai-sdk/core';
import { RedisCheckpointer, KodoCheckpointer } from '@bowenqt/qiniu-ai-sdk/node';

// 内存存储（开发/测试）
const memoryCheckpointer = new MemoryCheckpointer({ maxItems: 100 });

// Redis（生产环境）
const redisCheckpointer = new RedisCheckpointer(redisClient, {
  keyPrefix: 'agent:',
  ttlSeconds: 86400,
});

// Kodo（云原生/Serverless）
const kodoCheckpointer = new KodoCheckpointer({
  accessKey: process.env.QINIU_ACCESS_KEY!,
  secretKey: process.env.QINIU_SECRET_KEY!,
  bucket: 'checkpoints',
  region: 'z0',
});
```

### OpenTelemetry 链路追踪

```typescript
import { setGlobalTracer, OTelTracer } from '@bowenqt/qiniu-ai-sdk';
import { trace } from '@opentelemetry/api';

const otelTracer = new OTelTracer(trace.getTracerProvider());
setGlobalTracer(otelTracer);

// AgentGraph 会自动生成以下 Span：
// - agent_graph.invoke
// - agent_graph.predict
// - agent_graph.execute
```

### 云沙箱 (v0.37.0+)

```typescript
import { createNodeQiniuAI } from '@bowenqt/qiniu-ai-sdk/node';

const client = createNodeQiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

// 创建沙箱并等待就绪
const instance = await client.sandbox.createAndWait(
  { templateId: 'base' },
  { timeoutMs: 60_000 },
);

// 执行命令
const result = await instance.commands.run('echo hello', {
  cwd: '/tmp',
  envs: { MY_VAR: 'test' },
});
console.log(result.stdout); // 'hello\n'
console.log(result.exitCode); // 0

// 文件操作
await instance.files.write('/tmp/data.txt', 'Hello from SDK');
const content = await instance.files.readText('/tmp/data.txt');
const entries = await instance.files.list('/tmp');

// 清理
await instance.kill();
```

---

## 📚 支持的模型

### 对话和推理模型（66+ 个）

| 厂商 | 模型 |
|------|------|
| **Qwen（通义）** | qwen3-235b, qwen3-max, qwen3-32b, qwen-turbo |
| **Claude** | claude-4.5-opus/sonnet/haiku, claude-4.0-opus/sonnet, claude-3.7-sonnet, claude-3.5-sonnet/haiku |
| **Gemini** | gemini-3.0-flash/pro, gemini-2.5-flash/pro, gemini-2.0-flash |
| **DeepSeek（深度求索）** | deepseek-r1, deepseek-v3/v3.1/v3.2 |
| **Doubao（豆包）** | doubao-seed-1.6, doubao-1.5-pro |
| **GLM（智谱）** | glm-4.5/4.6/4.7 |
| **Grok** | grok-4-fast, grok-4.1-fast |
| **OpenAI** | gpt-5/5.2, gpt-oss-20b/120b |
| **Kimi（月之暗面）** | kimi-k2 |
| **MiniMax** | minimax-m2/m2.1 |

### 图像生成模型

| 厂商 | 模型 |
|------|------|
| **Kling（可灵）** | kling-v1, kling-v1-5, kling-v2, kling-v2-1, kling-image-o1 |
| **Gemini** | gemini-3.0-pro-image, gemini-2.5-flash-image |

### 视频生成模型

| 厂商 | 模型 |
|------|------|
| **Kling（可灵）** | kling-video-o1, kling-v2-1, kling-v2-5-turbo, kling-v2-6, kling-v3, kling-v3-omni |
| **Sora** | sora-2, sora-2-pro |
| **Veo** | veo-2.0, veo-3.0, veo-3.1 |
| **viduq** | viduq1, viduq2, viduq2-pro, viduq2-turbo |

---

## 📁 导出路径

| 入口 | 说明 |
|------|------|
| `@bowenqt/qiniu-ai-sdk` | 兼容入口，只保留通用跨平台能力 |
| `@bowenqt/qiniu-ai-sdk/core` | 与 provider 解耦的 Agent / Runtime API |
| `@bowenqt/qiniu-ai-sdk/qiniu` | 七牛客户端与云能力 API |
| `@bowenqt/qiniu-ai-sdk/node` | Node.js 专用运行时集成（MCP、OAuth、token store、sandbox、checkpointer） |
| `@bowenqt/qiniu-ai-sdk/browser` | 浏览器兼容子集 |
| `@bowenqt/qiniu-ai-sdk/adapter` | Vercel AI SDK 适配器 |
| `@bowenqt/qiniu-ai-sdk/ai-tools` | 七牛原生云工具（OCR/审核/抽帧） |

---

## 🛠️ CLI

### 项目初始化与诊断

```bash
npx qiniu-ai init --template chat
npx qiniu-ai init --template agent
npx qiniu-ai init --template node-agent
npx qiniu-ai doctor --template agent
```

### MCP Server

运行内置的七牛 MCP Server：

当前内置 `QiniuMCPServer` 提供的 built-in tools 为：

- `qiniu_chat`
- `qiniu_ocr`
- `qiniu_image_censor`
- `qiniu_video_censor`
- `qiniu_image_generate`

当前不包含 `qiniu_vframe`。如果你需要抽帧，请直接使用 SDK 的 `@bowenqt/qiniu-ai-sdk/ai-tools` 或 asset resolver 能力。

```bash
npx qiniu-mcp-server
```

### Skill CLI

```bash
npx qiniu-ai doctor --template node-agent   # 检查环境、peer deps 与导入路径
npx qiniu-ai skill list                     # 列出已安装 skills
npx qiniu-ai skill add <url>                # 从 manifest URL 安装远端 skill
npx qiniu-ai skill add <url> --sha256 <hash>  # 附带完整性校验
npx qiniu-ai skill verify                   # 校验 lockfile 与本地文件
npx qiniu-ai skill verify --fix             # 从本地目录重建 lockfile
npx qiniu-ai skill remove <name>            # 删除 skill 与 lockfile 条目
```

**环境变量：**
- `QINIU_API_KEY` — 运行上述内置 MCP tools 所需的 API Key

---

## 📖 文档

- **[COOKBOOK.md](./COOKBOOK.md)** — 完整可复制的代码示例
- **[七牛 AI 开发者中心](https://developer.qiniu.com/aitokenapi)** — 完整 API 参考和定价

---

## 📄 许可证

MIT © 2024-2026

---

<div align="center">
  <sub>为七牛云生态用心打造 ❤️</sub>
</div>
