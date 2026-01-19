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
- 🖼️ **图像生成** — 支持 Kling、Gemini 模型，统一的同步/异步 API
- 🎥 **视频生成** — 支持 Kling、Sora、Veo 模型，首尾帧控制
- 🔍 **网页搜索** — 实时网络搜索集成
- 📝 **OCR 文字识别** — 图片和 PDF 高精度文字识别
- 🎤 **ASR 语音识别** — 多语言语音识别（嘈杂环境 95%+ 准确率）
- 🔊 **TTS 语音合成** — 多音色文字转语音
- 🛡️ **内容审核** — 图片和视频场景化审核

### Agent 层
- 🤖 **generateText** — 多步骤工具执行，支持 Zod Schema
- 📊 **generateObject/streamObject** — 结构化 JSON 输出，支持流式
- 🧠 **AgentGraph** — 基于状态机的图执行引擎
- 🏭 **createAgent** — 可复用的 Agent 工厂

### 高级能力
- 📋 **技能注入** — Markdown 格式的 Agent 知识库（兼容 Claude Skills）
- 🔗 **MCP 客户端** — 支持 stdio + HTTP + OAuth 2.0 传输协议
- 🖥️ **MCP 服务端** — 内置七牛 MCP Server（OCR/审核/抽帧）
- 💾 **Checkpointer** — 状态持久化（Memory、Redis、PostgreSQL、Kodo）
- 🧠 **Memory Manager** — 短期 + 长期记忆，LLM 自动摘要
- ✅ **工具审批 (HITL)** — 敏感操作人工确认
- ⏸️ **中断/恢复** — 基于检查点的可恢复执行
- 📊 **OpenTelemetry 链路追踪** — 分布式追踪，节点级 Span
- 🔌 **Vercel AI SDK 适配器** — 无缝对接 Vercel AI SDK

---

## 📦 安装

```bash
npm install @bowenqt/qiniu-ai-sdk
```

### 可选依赖

```bash
# Vercel AI SDK 集成
npm install @ai-sdk/provider ai

# Zod Schema 验证
npm install zod

# Redis Checkpointer
npm install ioredis

# PostgreSQL Checkpointer
npm install pg
```

---

## 🚀 快速开始

```typescript
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk';

const client = new QiniuAI({
  apiKey: 'Sk-xxxxxxxxxxxxxxxx',
});

// 对话补全
const chat = await client.chat.create({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: '你好！' }],
});
console.log(chat.choices[0].message.content);

// 流式对话
const stream = await client.chat.createStream({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: '简单介绍一下 AI' }],
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

---

## 🤖 Agent 使用

### 使用 generateText 执行工具

```typescript
import { QiniuAI, generateText } from '@bowenqt/qiniu-ai-sdk';
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
import { generateObject } from '@bowenqt/qiniu-ai-sdk';
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
import { SkillLoader, generateTextWithGraph } from '@bowenqt/qiniu-ai-sdk';

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

### MCP 客户端（stdio + HTTP）

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

### Checkpointer（状态持久化）

```typescript
import { MemoryCheckpointer, RedisCheckpointer, KodoCheckpointer } from '@bowenqt/qiniu-ai-sdk';

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
| **Kling（可灵）** | kling-v1, kling-v1-5, kling-v2, kling-v2-1 |
| **Gemini** | gemini-3.0-pro-image, gemini-2.5-flash-image |

### 视频生成模型

| 厂商 | 模型 |
|------|------|
| **Kling（可灵）** | kling-video-o1, kling-v2-1, kling-v2-5-turbo |
| **Sora** | sora-2 |
| **Veo** | veo-2.0, veo-3.0, veo-3.1 |

---

## 📁 导出路径

| 入口 | 说明 |
|------|------|
| `@bowenqt/qiniu-ai-sdk` | 主入口（通用） |
| `@bowenqt/qiniu-ai-sdk/node` | Node.js 专用（SkillLoader、MCPClient stdio） |
| `@bowenqt/qiniu-ai-sdk/browser` | 浏览器兼容子集 |
| `@bowenqt/qiniu-ai-sdk/adapter` | Vercel AI SDK 适配器 |
| `@bowenqt/qiniu-ai-sdk/ai-tools` | 七牛原生云工具（OCR/审核/抽帧） |

---

## 🛠️ CLI：MCP Server

运行内置的七牛 MCP Server：

```bash
npx qiniu-mcp-server
```

**环境变量：**
- `QINIU_API_KEY` — OCR/审核操作的 API Key
- `QINIU_ACCESS_KEY` / `QINIU_SECRET_KEY` — 抽帧/签名操作的密钥对

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
