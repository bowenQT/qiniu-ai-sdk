# Qiniu AI SDK Cookbook

This cookbook provides focused, copy‑ready examples for common workflows.

---

## Table of Contents

1. [Basic Chat (Sync)](#1-basic-chat-sync)
2. [Streaming Chat (SSE)](#2-streaming-chat-sse)
3. [Tool Calls (Agentic Loop)](#3-tool-calls-agentic-loop)
4. [Tool Calls with Zod Schema](#4-tool-calls-with-zod-schema)
5. [JSON Mode (Structured Output)](#5-json-mode-structured-output)
6. [JSON Schema Mode (Strict Schema)](#6-json-schema-mode-strict-schema)
7. [Cancellable Requests](#7-cancellable-requests)
8. [Vercel AI SDK Integration](#8-vercel-ai-sdk-integration)
9. [Image Generation + Polling](#9-image-generation--polling)
10. [Image-to-Image Generation](#10-image-to-image-generation)
11. [Video Generation](#11-video-generation)
12. [Multi-Step Agent with Step Callbacks](#12-multi-step-agent-with-step-callbacks)

**Advanced Features:**

13. [createAgent - Reusable Agent Factory](#13-createagent---reusable-agent-factory)
14. [Memory Manager - Conversation Memory](#14-memory-manager---conversation-memory)
15. [Vector Store - Long-term Episodic Memory](#15-vector-store---long-term-episodic-memory)
16. [Skills Injection](#16-skills-injection)
16b. [Skill Marketplace - Remote Registry (v0.32.0+)](#16b-skill-marketplace---remote-registry-v0320)
17. [Checkpointer - State Persistence](#17-checkpointer---state-persistence)
18. [Tool Approval (HITL)](#18-tool-approval-hitl)
19. [Interrupt/Resume - Resumable Execution](#19-interruptresume---resumable-execution)
20. [NodeMCPHost Integration](#20-nodemcphost-integration)
21. [Asset Resolver - Qiniu URI Resolution](#21-asset-resolver---qiniu-uri-resolution)
22. [Built-in Cloud Tools (OCR/Censor/Vframe)](#22-built-in-cloud-tools-ocrcensorvframe)
23. [OpenTelemetry Tracing](#23-opentelemetry-tracing)
23b. [Structured Telemetry - Prometheus Export (v0.32.0+)](#23b-structured-telemetry---prometheus-export-v0320)
24. [Full Agent Example - Combining All Features](#24-full-agent-example---combining-all-features)
25. [Guardrails - Content Safety](#25-guardrails---content-safety)
26. [Multi-Agent Crew - Orchestration](#26-multi-agent-crew---orchestration)
27. [Cloud Sandbox - Code Execution (v0.37.0+)](#27-cloud-sandbox---code-execution-v0370)
28. [MCP Tool Policy & Skill CLI (v0.38.0+)](#28-mcp-tool-policy--skill-cli-v0380)
29. [streamText — Token-level Streaming (v0.40.0+)](#29-streamtext--token-level-streaming-v0400)

---

## Start Here

### Product Surface Notes (Phase 3)

- `ResponseAPI` is treated as beta only for the core subset: `create`, `followUp`, `createTextResult`, and `followUpTextResult`; the stronger evidence-backed beta basis only applies when fresh nightly `response-api` evidence is present.
- Other `ResponseAPI` helpers remain deferred/provider-only in this phase, including stream, JSON/messages, reasoning, and chat-completion projection helpers.
- `NodeMCPHost` remains `beta (held)`; it only forwards already-resolved bearer tokens via `token` or `tokenProvider`, and the remaining deferred risks are OAuth token acquisition beyond that boundary plus cross-server routing.

## 1. Basic Chat (Sync)

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const result = await client.chat.create({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.choices[0].message.content);
```

## 2. Streaming Chat (SSE)

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const stream = client.chat.createStream({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Explain SSE in one sentence.' }],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

## 3. Tool Calls (Agentic Loop)

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateText } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const tools = {
  getWeather: {
    description: 'Get weather for a city',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
      },
      required: ['city'],
    },
    execute: async ({ city }) => ({ 
      temperature: 25, 
      condition: 'sunny',
      city,
    }),
  },
};

const result = await generateText({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'What is the weather in Beijing?',
  tools,
  maxSteps: 3,
  temperature: 0.7,
});

console.log(result.text);
console.log('Steps:', result.steps.length);
```

## 4. Tool Calls with Zod Schema

The SDK auto-converts Zod schemas to JSON Schema:

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateText } from '@bowenqt/qiniu-ai-sdk/core';
import { z } from 'zod';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const tools = {
  calculate: {
    description: 'Perform arithmetic calculation',
    parameters: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      a: z.number(),
      b: z.number(),
    }),
    execute: async ({ operation, a, b }) => {
      switch (operation) {
        case 'add': return a + b;
        case 'subtract': return a - b;
        case 'multiply': return a * b;
        case 'divide': return a / b;
      }
    },
  },
};

const result = await generateText({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'What is 42 multiplied by 17?',
  tools,
  maxSteps: 2,
});

console.log(result.text);
```

## 5. JSON Mode (Structured Output)

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateText } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const result = await generateText({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'List 3 famous scientists as JSON array with name, field, and year_born',
  responseFormat: { type: 'json_object' },
  temperature: 0,
});

const scientists = JSON.parse(result.text);
console.log(scientists);
```

## 6. JSON Schema Mode (Strict Schema)

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateText } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const result = await generateText({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'Generate a product listing',
  responseFormat: {
    type: 'json_schema',
    json_schema: {
      name: 'product',
      description: 'A product listing',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          price: { type: 'number' },
          category: { type: 'string' },
        },
        required: ['name', 'price', 'category'],
      },
    },
  },
});

const product = JSON.parse(result.text);
console.log(product);
```

## 7. Cancellable Requests

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateText } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  const result = await generateText({
    client,
    model: 'gemini-2.5-flash',
    prompt: 'Write a very long essay about AI...',
    abortSignal: controller.signal,
  });
  console.log(result.text);
} catch (error) {
  if (error.code === 'CANCELLED') {
    console.log('Request was cancelled');
  } else if (error.code === 'TIMEOUT') {
    console.log('Request timed out');
  } else {
    throw error;
  }
}
```

## 8. Vercel AI SDK Integration

```ts
import { createQiniu } from '@bowenqt/qiniu-ai-sdk/adapter';
import { streamText, generateText } from 'ai';

const qiniu = createQiniu({ apiKey: process.env.QINIU_API_KEY || '' });

// Streaming
const { textStream } = await streamText({
  model: qiniu.languageModel('gemini-2.5-flash'),
  prompt: 'Introduce Qiniu Cloud in one sentence.',
});

for await (const text of textStream) {
  process.stdout.write(text);
}

// JSON Mode with Vercel AI SDK
const { text } = await generateText({
  model: qiniu.languageModel('gemini-2.5-flash'),
  prompt: 'Return a JSON object with a greeting',
  experimental_responseFormat: { type: 'json' },
});

console.log(JSON.parse(text));
```

## Common Workflows

## 9. Image Generation + Polling

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const result = await client.image.generate({
  model: 'kling-v2',
  prompt: 'A futuristic city at sunset',
});

const finalResult = await client.image.waitForResult(result);
console.log(finalResult.data?.[0]?.url || finalResult.data?.[0]?.b64_json);
```

## 10. Image-to-Image Generation

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const result = await client.image.generate({
  model: 'kling-v2',
  prompt: 'Transform into anime style',
  image: 'https://example.com/photo.jpg', // Source image URL
  image_fidelity: 0.7, // How much to preserve original
});

const finalResult = await client.image.waitForResult(result);
console.log(finalResult.data?.[0]?.url);
```

## 11. Video Generation

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const task = await client.video.create({
  model: 'kling-video-o1',
  prompt: 'A cat playing piano',
  duration: '5',
});

const result = await client.video.waitForCompletion(task.id);
console.log(result.task_result?.videos[0].url);
```

## 11b. viduq Video Generation (v0.36.0+)

viduq models use the fal-ai queue system. `create()` returns a `VideoTaskHandle` for reliable async polling.

viduq 模型使用 fal-ai 队列系统，`create()` 返回 `VideoTaskHandle` 句柄用于可靠的异步轮询。

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

// Text-to-video / 文字转视频
const handle = await client.video.create({
  model: 'viduq2',
  prompt: 'A serene mountain landscape with flowing clouds',
  movement_amplitude: 'medium', // 'auto' | 'small' | 'medium' | 'large'
  audio: true,                  // Enable audio generation / 开启音频生成
});

// Poll with full handle (recommended) / 使用完整句柄轮询（推荐）
const result = await client.video.waitForCompletion(handle);
console.log(result.task_result?.videos[0].url);

// Image-to-video / 图转视频
const i2vHandle = await client.video.create({
  model: 'viduq2-pro', // pro/turbo require image input / pro/turbo 必须提供图片
  prompt: 'The person in the image walks into a garden',
  image_url: 'https://example.com/portrait.jpg',
});
const i2vResult = await client.video.waitForCompletion(i2vHandle);
console.log(i2vResult.task_result?.videos[0].url);
```

**Supported models / 支持的模型:** `viduq1`, `viduq2`, `viduq2-pro`, `viduq2-turbo`

> `viduq2-pro` and `viduq2-turbo` require image input (`image_url`, `image`, or `frames.first`).

## 11c. kling-image-o1 High-Quality Image (v0.36.0+)

`kling-image-o1` uses the fal-ai queue system with reference image support.

`kling-image-o1` 使用 fal-ai 队列系统，支持参考图。

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

// Basic generation / 基础生成
const result = await client.image.generate({
  model: 'kling-image-o1',
  prompt: 'A photorealistic portrait in studio lighting',
  num_images: 2,    // 1-9 images / 1-9 张图
  resolution: '2K', // '1K' or '2K'
});

const final = await client.image.waitForResult(result);
console.log(final.data?.map(d => d.url));

// With reference images / 使用参考图
const refResult = await client.image.generate({
  model: 'kling-image-o1',
  prompt: 'A <<<image_1>>> style cat sitting on a throne',
  image_urls: ['https://example.com/art-style.jpg'], // Up to 10 / 最多 10 张
  resolution: '2K',
});
const refFinal = await client.image.waitForResult(refResult);
console.log(refFinal.data?.[0]?.url);
```

## 11d. Log Export (v0.36.0+)

Export request logs for monitoring and analysis.

导出请求日志用于监控和分析。

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const logs = await client.log.export({
  start: '2025-12-01T00:00:00Z',
  end: '2025-12-31T00:00:00Z',
  model: 'deepseek/deepseek-v3.1', // Optional filter / 可选过滤
  size: 100,                        // Per page, 1-500 / 每页条数
  page: 1,
});

for (const entry of logs) {
  console.log(`${entry.model_id} | ${entry.state} | ${entry.usage?.input}→${entry.usage?.output}`);
}
```

> **Limits / 限制:** Time range ≤ 35 days, size 1-500, page ≥ 1.

## 12. Multi-Step Agent with Step Callbacks

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateText } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const tools = {
  search: {
    description: 'Search the web',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
    execute: async ({ query }) => `Results for: ${query}`,
  },
  calculate: {
    description: 'Calculate math',
    parameters: { type: 'object', properties: { expr: { type: 'string' } } },
    execute: async ({ expr }) => eval(expr),
  },
};

const result = await generateText({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'Search for the population of Tokyo and calculate 10% of it',
  tools,
  maxSteps: 5,
  onStepFinish: (step) => {
    console.log(`Step ${step.type}:`, step.content?.slice(0, 50));
  },
});

console.log('Final:', result.text);
```

---

# Advanced Features

## Advanced Integrations

## 13. createAgent - Reusable Agent Factory

Create a reusable agent with pre-configured settings:

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { createAgent, MemoryCheckpointer } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });
const checkpointer = new MemoryCheckpointer({ maxItems: 100 });

const tools = {
  searchKnowledge: {
    description: 'Search internal knowledge base',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
    execute: async ({ query }) => `Found results for: ${query}`,
  },
};

// Create reusable agent
const assistant = createAgent({
  client,
  model: 'gemini-2.5-flash',
  system: 'You are a helpful AI assistant with access to a knowledge base.',
  tools,
  maxSteps: 5,
  temperature: 0.7,
  checkpointer, // Enable state persistence
});

// Single run (no persistence)
const result1 = await assistant.run({
  prompt: 'What is quantum computing?',
  onStepFinish: (step) => console.log('Step:', step.type),
});
console.log('Response:', result1.text);

// Persistent conversation (with checkpointing)
const result2 = await assistant.runWithThread({
  threadId: 'user-123-session-1',
  prompt: 'Tell me more about qubits',
  resumeFromCheckpoint: true, // Continue previous conversation
});
console.log('Response:', result2.text);
```

## 14. Memory Manager - Conversation Memory

Manage conversation memory with sliding window, automatic summarization, and token budgeting:

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateTextWithGraph, MemoryManager } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

// Create memory manager with LLM-based summarization
const memory = new MemoryManager({
  // Short-term: Keep last N messages
  shortTerm: {
    maxMessages: 20,
  },
  // Summarizer: Auto-summarize when exceeding threshold
  summarizer: {
    enabled: true,
    threshold: 15, // Summarize when > 15 messages
    type: 'llm', // Use LLM for summarization (vs 'simple')
    client,
    model: 'gemini-2.5-flash',
    systemPrompt: 'Summarize the conversation concisely, preserving key facts.',
  },
  // Token budget: Fine-grained token allocation
  tokenBudget: {
    summary: 500,   // Max tokens for summary
    context: 2000,  // Max tokens for retrieved context
    active: 4000,   // Max tokens for recent messages
  },
});

const result = await generateTextWithGraph({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'Continue our discussion about the project timeline',
  memory, // Inject memory manager
  maxContextTokens: 8000,
  onStepFinish: (step) => {
    console.log(`[${step.type}] ${step.content?.slice(0, 100)}...`);
  },
});

console.log('Response:', result.text);

// Check if summarization occurred
if (result.graphInfo?.compaction?.occurred) {
  console.log('Compaction occurred:', {
    droppedMessages: result.graphInfo.compaction.droppedMessages,
    droppedSkills: result.graphInfo.compaction.droppedSkills,
  });
}
```

## 15. Vector Store - Long-term Episodic Memory

Use vector store for semantic search over past conversations:

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { MemoryManager, InMemoryVectorStore, generateTextWithGraph } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

// Create vector store with LRU eviction
const vectorStore = new InMemoryVectorStore({
  maxEntries: 1000,
  evictionPolicy: 'lru', // or 'fifo'
  warnThreshold: 0.8, // Warn at 80% capacity
  onWarn: (usage, max) => {
    console.warn(`Vector store ${(usage * 100).toFixed(0)}% full (${max} max)`);
  },
});

// Add documents to the store
await vectorStore.add([
  {
    id: 'doc-1',
    content: 'The project deadline is December 15th, 2024.',
    metadata: { type: 'deadline', project: 'alpha' },
  },
  {
    id: 'doc-2',
    content: 'Budget approved: $50,000 for Q1 development.',
    metadata: { type: 'budget', quarter: 'Q1' },
  },
]);

// Create memory with long-term retrieval
const memory = new MemoryManager({
  shortTerm: { maxMessages: 10 },
  longTerm: {
    store: vectorStore,
    retrieveLimit: 3, // Retrieve top 3 relevant documents
  },
});

const result = await generateTextWithGraph({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'What is our project deadline?',
  memory,
});

console.log('Response:', result.text); // Will retrieve and use the deadline document
console.log('Vector store size:', vectorStore.size());
console.log('Vector store usage:', (vectorStore.usage() * 100).toFixed(1) + '%');
```

## 16. Skills Injection

Load and inject agent skills (Markdown-based knowledge):

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateTextWithGraph } from '@bowenqt/qiniu-ai-sdk/core';
import { SkillLoader } from '@bowenqt/qiniu-ai-sdk/node';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

// Initialize skill loader with security settings
const loader = new SkillLoader({
  skillsDir: './skills',          // Base directory for skills
  maxFileSize: 64 * 1024,         // 64KB limit per file
  allowedExtensions: ['.md', '.txt'],
  maxReferenceDepth: 3,           // Max nested reference depth
});

// Load all skills
const skills = await loader.loadAll();
console.log('Loaded skills:', skills.map(s => `${s.name} (${s.tokenCount} tokens)`));

// Or load specific skill
const gitSkill = await loader.load('git-workflow');
console.log('Loaded:', gitSkill.name, 'References:', gitSkill.references.length);

// Use skills with generateTextWithGraph
const result = await generateTextWithGraph({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'How should I structure my git commits?',
  skills, // Inject skills as system context
  maxContextTokens: 32000, // Auto-compact if exceeds
  onStepFinish: (step) => console.log('Step:', step.type),
});

console.log('Response:', result.text);
console.log('Skills injected:', result.graphInfo?.skillsInjected);

// Check compaction (skills are dropped by priority when context exceeds budget)
if (result.graphInfo?.compaction?.occurred) {
  console.log('Dropped skills:', result.graphInfo.compaction.droppedSkills);
}
```

**Skill file format** (`skills/git-workflow/SKILL.md`):

```markdown
---
name: git-workflow
description: Git best practices for commit messages and branching
---

# Git Workflow Guidelines

## Commit Messages
- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- Keep subject line under 50 characters
- Use imperative mood: "Add feature" not "Added feature"

## Branching
- `main` for production-ready code
- `develop` for integration
- `feature/*` for new features

[Reference](./patterns/branching.md)
```

## 16b. Skill Marketplace - Remote Registry (v0.32.0+)

Manage skills from local and remote sources with integrity verification:

```ts
import { generateTextWithGraph } from '@bowenqt/qiniu-ai-sdk/core';
import { SkillRegistry } from '@bowenqt/qiniu-ai-sdk/node';

// Create registry with security settings
const registry = new SkillRegistry({
  allowedDomains: [
    'skills.qiniu.com',    // Exact domain
    '*.trusted.dev',       // Wildcard subdomain
  ],
});

// Register local skill
await registry.registerLocal('./skills/git-workflow');

// Register remote skill with SHA256 integrity verification
await registry.registerRemote('https://skills.qiniu.com/code-review', {
  integrity: 'sha256:a3b4c5d6e7f8...',  // Required for security
});

// Search skills by name, tags, or description
const results = registry.search('git');
console.log('Found skills:', results.map(s => s.name));

// Get skill for injection
const skill = registry.get('git-workflow');
if (skill) {
  const result = await generateTextWithGraph({
    client,
    model: 'deepseek-v3',
    prompt: 'How should I structure my commits?',
    skills: [skill],
  });
}

// List all registered skills
const allSkills = registry.list();
console.log('Registered skills:', allSkills.length);

// Refresh remote skills (re-download and verify)
await registry.refreshSkill('code-review');
```

**skill.json Manifest Format:**

```json
{
  "name": "code-review",
  "version": "1.2.0",
  "description": "Code review best practices",
  "sdkVersion": "^0.32.0",
  "priority": 10,
  "droppable": true,
  "tags": ["development", "review"],
  "entryPoint": "SKILL.md"
}
```

## 17. Checkpointer - State Persistence

Save and restore agent state across sessions:

### Memory Checkpointer (Testing/Short-lived)

```ts
import { MemoryCheckpointer, deserializeCheckpoint } from '@bowenqt/qiniu-ai-sdk/core';

const checkpointer = new MemoryCheckpointer({ maxItems: 100 });

// Save checkpoint
const metadata = await checkpointer.save('thread-123', agentState, {
  status: 'active',
  custom: { userId: 'user-456', topic: 'quantum-physics' },
});
console.log('Saved checkpoint:', metadata.id);

// Load latest checkpoint
const checkpoint = await checkpointer.load('thread-123');
if (checkpoint) {
  console.log('Status:', checkpoint.metadata.status);
  console.log('Steps:', checkpoint.metadata.stepCount);
  
  // Deserialize state
  const restored = deserializeCheckpoint(checkpoint, toolsMap);
  console.log('Messages:', restored.messages.length);
}

// List all checkpoints
const list = await checkpointer.list('thread-123');
console.log('Checkpoints:', list.length);

// Clear all checkpoints for a thread
const cleared = await checkpointer.clear('thread-123');
console.log('Cleared:', cleared, 'checkpoints');
```

### Redis Checkpointer (Production)

```ts
import { RedisCheckpointer } from '@bowenqt/qiniu-ai-sdk/node';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const checkpointer = new RedisCheckpointer(redis, {
  keyPrefix: 'agent:checkpoints:',
  ttlSeconds: 86400, // 24 hours
});

// Usage is identical to MemoryCheckpointer
await checkpointer.save('thread-123', agentState);
const checkpoint = await checkpointer.load('thread-123');
```

### PostgreSQL Checkpointer (Production)

```ts
import { PostgresCheckpointer } from '@bowenqt/qiniu-ai-sdk/node';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const checkpointer = new PostgresCheckpointer(pool, {
  tableName: 'agent_checkpoints',
  autoCreateTable: true, // Creates table if not exists
});

// Usage is identical to MemoryCheckpointer
await checkpointer.save('thread-123', agentState);
const checkpoint = await checkpointer.load('thread-123');
```

### Kodo Checkpointer (Cloud-Native/Serverless)

```ts
import { KodoCheckpointer } from '@bowenqt/qiniu-ai-sdk/node';

const checkpointer = new KodoCheckpointer({
  accessKey: process.env.QINIU_ACCESS_KEY!,
  secretKey: process.env.QINIU_SECRET_KEY!,
  bucket: 'my-checkpoints-bucket',
  region: 'z0', // Qiniu region
  prefix: 'agents/', // Object key prefix
  downloadDomain: 'https://cdn.example.com', // Optional CDN domain
});

// Usage is identical to MemoryCheckpointer
await checkpointer.save('thread-123', agentState);
const checkpoint = await checkpointer.load('thread-123');
```

## 18. Tool Approval (HITL)

Implement Human-in-the-Loop approval for sensitive tool calls:

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateText, type ApprovalConfig, type ApprovalContext } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

// Define tools with approval requirements
const tools = {
  readFile: {
    description: 'Read file contents',
    parameters: { type: 'object', properties: { path: { type: 'string' } } },
    execute: async ({ path }) => `Contents of ${path}`,
    requiresApproval: false, // Safe operation, no approval needed
  },
  deleteFile: {
    description: 'Delete a file',
    parameters: { type: 'object', properties: { path: { type: 'string' } } },
    execute: async ({ path }) => `Deleted ${path}`,
    requiresApproval: true, // Destructive operation, needs approval
    // Optional: Tool-specific approval handler
    approvalHandler: async (ctx: ApprovalContext) => {
      // Custom logic for this specific tool
      if (ctx.args.path.startsWith('/tmp/')) {
        return { approved: true }; // Auto-approve temp files
      }
      return { approved: false, rejectionMessage: 'Cannot delete non-temp files' };
    },
  },
};

// Global approval configuration
const approvalConfig: ApprovalConfig = {
  // Global approval handler (called if tool has requiresApproval: true)
  onApprovalRequired: async (ctx: ApprovalContext) => {
    console.log('Approval requested for:', ctx.toolName);
    console.log('Arguments:', ctx.args);
    console.log('Conversation context:', ctx.messages.slice(-3));
    
    // Simulated user prompt (in real app, show UI dialog)
    const userApproved = await promptUser(
      `Allow ${ctx.toolName}(${JSON.stringify(ctx.args)})?`
    );
    
    if (userApproved) {
      return { approved: true };
    } else {
      return { 
        approved: false, 
        rejectionMessage: 'User declined the operation',
      };
    }
    
    // Or defer to async approval (see Interrupt/Resume)
    // return { approved: false, deferred: true };
  },
  
  // Auto-approve tools from trusted sources
  autoApproveSources: ['builtin', 'mcp://trusted-server/*'],
};

const result = await generateText({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'Delete the old backup file at /tmp/backup.old',
  tools,
  approvalConfig,
  maxSteps: 3,
});

console.log('Result:', result.text);
```

## 19. Interrupt/Resume - Resumable Execution

Implement asynchronous approval flows with checkpoint-based resume:

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { AgentGraph, MemoryCheckpointer, type ApprovalConfig, type PendingApproval } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });
const checkpointer = new MemoryCheckpointer();

const tools = {
  sendEmail: {
    description: 'Send email',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
    },
    execute: async ({ to, subject }) => `Email sent to ${to}: ${subject}`,
    requiresApproval: true,
  },
};

// Register tools for approval
const registeredTools = Object.fromEntries(
  Object.entries(tools).map(([name, tool]) => [
    name,
    { ...tool, name, source: { type: 'inline' as const } },
  ])
);

const approvalConfig: ApprovalConfig = {
  onApprovalRequired: async (ctx) => {
    // Defer approval - this will interrupt execution
    console.log('Deferring approval for:', ctx.toolName);
    return { approved: false, deferred: true };
  },
};

const graph = new AgentGraph({
  client,
  model: 'gemini-2.5-flash',
  tools: registeredTools,
  approvalConfig,
  maxSteps: 5,
});

// --- Initial execution (will interrupt) ---
const threadId = 'email-task-001';
const messages = [{ role: 'user' as const, content: 'Send welcome email to alice@example.com' }];

const result1 = await graph.invokeResumable(messages, {
  threadId,
  checkpointer,
});

if (result1.interrupted) {
  console.log('Execution interrupted! Pending approval:');
  console.log('Tool:', result1.pendingApproval?.toolCalls);
  console.log('Deferred tools:', result1.pendingApproval?.deferredTools);
  
  // Store pendingApproval in DB for async UI approval
  await savePendingApproval(threadId, result1.pendingApproval!);
}

// --- Later: Resume after user approval ---
async function resumeWithUserApproval(threadId: string, approved: boolean) {
  const result2 = await graph.invokeResumable([], {
    threadId,
    checkpointer,
    resume: true, // Resume from checkpoint
    approvalDecision: approved, // User's decision
    toolExecutor: async (toolName, args) => {
      // Provide tool executor for approved tools
      return tools[toolName].execute(args);
    },
  });

  if (result2.interrupted) {
    console.log('Still needs more approvals...');
  } else {
    console.log('Completed:', result2);
  }
}

// User approved in UI
await resumeWithUserApproval('email-task-001', true);
```

## 20. MCP Integration (NodeMCPHost)

Connect to Model Context Protocol servers via `NodeMCPHost`:

### Stdio Transport

```ts
import { NodeMCPHost } from '@bowenqt/qiniu-ai-sdk/node';
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { createAgent } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

// Create MCP host with stdio transport
const mcpHost = new NodeMCPHost({
  servers: [
    {
      name: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
    },
    {
      name: 'github',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN || '' },
    },
  ],
});

// Use with createAgent — hostProvider handles connect/disconnect lifecycle
const agent = createAgent({
  client,
  model: 'gemini-2.5-flash',
  system: 'You are a helpful assistant with access to files and GitHub.',
  hostProvider: mcpHost,
});

const result = await agent.run({
  prompt: 'List all TypeScript files in the project',
});
console.log(result.text);

// Cleanup when done
await mcpHost.dispose();
```

### HTTP Transport

```ts
import { NodeMCPHost } from '@bowenqt/qiniu-ai-sdk/node';
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { createAgent } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const mcpHost = new NodeMCPHost({
  servers: [
    {
      name: 'remote-mcp',
      transport: 'http',
      url: 'https://mcp.example.com/api/mcp',
    },
  ],
});

const agent = createAgent({
  client,
  model: 'gemini-2.5-flash',
  hostProvider: mcpHost,
});

const result = await agent.run({
  prompt: 'What tools are available on the remote server?',
});
console.log(result.text);

await mcpHost.dispose();
```

## 21. Asset Resolver - Qiniu URI Resolution

Resolve `qiniu://` URIs to signed URLs:

```ts
import { parseQiniuUri, resolveAsset, resolveAssets, CachedSigner, type QiniuSigner } from '@bowenqt/qiniu-ai-sdk/qiniu';

// Create signer (in browser, delegate to backend)
const signer: QiniuSigner = {
  sign: async (bucket, key, options) => {
    // In Node.js: use Qiniu SDK directly
    // In Browser: call your backend API
    const res = await fetch(`/api/sign?bucket=${bucket}&key=${key}&fop=${options?.fop || ''}`);
    return res.json(); // { url: '...', expiresAt: ... }
  },
};

// Wrap with cache for efficiency
const cachedSigner = new CachedSigner(signer, {
  maxSize: 100,
  ttlSafetyMargin: 0.8, // Expire cache at 80% of actual TTL
});

// Parse URI
const asset = parseQiniuUri('qiniu://my-bucket/videos/demo.mp4');
console.log('Parsed:', asset); // { bucket: 'my-bucket', key: 'videos/demo.mp4' }

// Resolve single asset
const resolved = await resolveAsset(asset!, cachedSigner, {
  allowedBuckets: ['my-bucket', 'trusted-bucket'], // Security whitelist
  expiry: 3600, // 1 hour
});
console.log('Signed URL:', resolved.url);
console.log('Expires at:', new Date(resolved.expiresAt));

// Resolve with fop (e.g., video frame extraction)
const frame = await resolveAsset(asset!, cachedSigner, {
  fop: 'vframe/jpg/offset/5/w/640', // Extract frame at 5s
});
console.log('Frame URL:', frame.url);

// Batch resolution (efficient parallel processing)
const assets = [
  parseQiniuUri('qiniu://bucket/video1.mp4')!,
  parseQiniuUri('qiniu://bucket/video2.mp4')!,
  parseQiniuUri('qiniu://bucket/video3.mp4')!,
];
const resolvedAll = await resolveAssets(assets, cachedSigner);
console.log('Resolved:', resolvedAll.length, 'assets');
console.log('Cache size:', cachedSigner.cacheSize);
```

## 22. Built-in Cloud Tools (OCR/Censor/Vframe)

Use pre-built Qiniu cloud tools in your agent:

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateText } from '@bowenqt/qiniu-ai-sdk/core';
import { QINIU_TOOLS, getQiniuToolsArray, getQiniuToolSchemas, type QiniuToolContext } from '@bowenqt/qiniu-ai-sdk';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

// Tool context (required for cloud tools)
const toolContext: QiniuToolContext = {
  client,
  signer: mySigner, // Optional: for qiniu:// URI resolution
  allowedBuckets: ['my-bucket'],
};

// Use individual tools
const ocrResult = await QINIU_TOOLS.qiniu_ocr.execute(
  { image_url: 'https://example.com/document.png' },
  toolContext
);
console.log('OCR Text:', ocrResult.text);

const censorResult = await QINIU_TOOLS.qiniu_image_censor.execute(
  { 
    image_url: 'https://example.com/image.jpg',
    scenes: ['pulp', 'terror'], // 鉴黄、暴恐
  },
  toolContext
);
console.log('Censor Result:', censorResult.suggestion); // 'pass' | 'review' | 'block'

const vframeResult = await QINIU_TOOLS.qiniu_vframe.execute(
  {
    video_url: 'qiniu://my-bucket/video.mp4',
    count: 5,
    duration: 60,
    width: 640,
  },
  toolContext
);
console.log('Extracted frames:', vframeResult.frames.map(f => f.url));

// --- Use with generateText ---

// Convert to generateText format
const qiniuTools = Object.fromEntries(
  Object.entries(QINIU_TOOLS).map(([name, tool]) => [
    name,
    {
      description: tool.description,
      parameters: tool.parameters,
      execute: (args: unknown) => tool.execute(args as any, toolContext),
    },
  ])
);

const result = await generateText({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'Extract text from this document: https://example.com/receipt.png',
  tools: qiniuTools,
  maxSteps: 3,
});

console.log('Agent response:', result.text);

// Get tool schemas for OpenAI function calling format
const schemas = getQiniuToolSchemas();
console.log('Tool schemas:', schemas);
```

## 23. OpenTelemetry Tracing

Integrate with OpenTelemetry for distributed tracing:

```ts
import { 
  setGlobalTracer, 
  ConsoleTracer, 
  OTelTracer,
  DEFAULT_TRACER_CONFIG,
  PRODUCTION_TRACER_CONFIG,
  redactAttributes,
} from '@bowenqt/qiniu-ai-sdk';
import { trace } from '@opentelemetry/api';

// --- Development: Console Tracer ---
setGlobalTracer(new ConsoleTracer({
  enabled: true,
  logLevel: 'debug',
  redactPII: true, // Mask sensitive data
}));

// --- Production: OpenTelemetry ---
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';

const provider = new NodeTracerProvider();
provider.addSpanProcessor(
  new SimpleSpanProcessor(new OTLPTraceExporter({ url: 'http://jaeger:4317' }))
);
provider.register();

setGlobalTracer(new OTelTracer(trace.getTracerProvider(), {
  ...PRODUCTION_TRACER_CONFIG,
  serviceName: 'my-agent-service',
}));

// Now all AgentGraph operations are automatically traced:
// - agent_graph.invoke (top-level span)
// - agent_graph.predict (per LLM call)
// - agent_graph.execute (per tool execution round)
// - agent_graph.checkpoint (state save/load)

const result = await generateTextWithGraph({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'Analyze this data',
  tools,
});

// Spans are automatically exported to your tracing backend
```

## 23b. Structured Telemetry - Prometheus Export (v0.32.0+)

Export structured metrics in Prometheus format for monitoring:

```ts
import { MetricsCollector, createMetricsHandler, AgentGraph } from '@bowenqt/qiniu-ai-sdk/core';

// Create metrics collector
const metrics = new MetricsCollector();

// Create HTTP handler for /metrics endpoint
const handler = createMetricsHandler(metrics);

// Use with Express/Hono/native HTTP
import { createServer } from 'http';
createServer(handler).listen(9090);

// Metrics are automatically recorded during AgentGraph execution
const graph = new AgentGraph({
  client,
  model: 'gemini-2.5-flash',
  tools,
  metricsCollector: metrics, // Inject collector
});

const result = await graph.invoke([
  { role: 'user', content: 'Hello' },
]);

// Access metrics programmatically
const snapshot = metrics.toPrometheus();
console.log(snapshot);
// Output:
// # HELP agent_steps_total Total number of agent steps
// # TYPE agent_steps_total counter
// agent_steps_total{status="success"} 3
// # HELP agent_tokens_total Total tokens used
// # TYPE agent_tokens_total counter
// agent_tokens_total{type="prompt"} 150
// agent_tokens_total{type="completion"} 45
// ...

// Reset metrics for new instance
metrics.reset();
```

## 24. Full Agent Example - Combining All Features

A complete example combining multiple advanced features:

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { createAgent, MemoryManager, InMemoryVectorStore, MemoryCheckpointer, setGlobalTracer, ConsoleTracer, type ApprovalConfig } from '@bowenqt/qiniu-ai-sdk/core';
import { QINIU_TOOLS } from '@bowenqt/qiniu-ai-sdk';
import { SkillLoader, NodeMCPHost } from '@bowenqt/qiniu-ai-sdk/node';

// --- Setup ---
const client = new QiniuAI({ 
  apiKey: process.env.QINIU_API_KEY || '',
  logLevel: 'info',
});

// Enable tracing
setGlobalTracer(new ConsoleTracer({ redactPII: true }));

// Load skills
const skillLoader = new SkillLoader({ skillsDir: './skills' });
const skills = await skillLoader.loadAll();

// Setup memory
const vectorStore = new InMemoryVectorStore({ maxEntries: 500 });
const memory = new MemoryManager({
  shortTerm: { maxMessages: 20 },
  longTerm: { store: vectorStore, retrieveLimit: 5 },
  summarizer: { enabled: true, threshold: 15, type: 'llm', client, model: 'gemini-2.5-flash' },
});

// Setup checkpointer
const checkpointer = new MemoryCheckpointer({ maxItems: 100 });

// Setup MCP (NodeMCPHost replaces MCPClient since v0.40.0)
const mcpHost = new NodeMCPHost({
  servers: [
    { name: 'fs', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
  ],
});

// Approval config
const approvalConfig: ApprovalConfig = {
  autoApproveSources: ['builtin'],
  onApprovalRequired: async (ctx) => {
    console.log(`[APPROVAL] ${ctx.toolName}:`, ctx.args);
    return { approved: true }; // Auto-approve for demo
  },
};

// --- Wrap QINIU_TOOLS with client context ---
const qiniuTools = Object.fromEntries(
  Object.entries(QINIU_TOOLS).map(([name, tool]) => [
    name,
    {
      ...tool,
      name,
      source: { type: 'builtin' as const },
      execute: (args: unknown) => tool.execute(args as any, { client }),
    },
  ])
);

// --- Create Agent ---
const agent = createAgent({
  client,
  model: 'gemini-2.5-flash',
  system: 'You are a helpful AI assistant with access to files, cloud tools, and domain knowledge.',
  tools: qiniuTools,
  skills,
  memory,
  checkpointer,
  approvalConfig,
  hostProvider: mcpHost, // MCP tools auto-discovered via hostProvider
  maxSteps: 10,
  maxContextTokens: 32000,
  temperature: 0.7,
});

// --- Run Agent ---
const result = await agent.runWithThread({
  threadId: 'user-123-session-1',
  prompt: 'List the TypeScript files in the current directory and analyze their structure',
  resumeFromCheckpoint: true,
  onNodeEnter: (node) => console.log(`[ENTER] ${node}`),
  onNodeExit: (node) => console.log(`[EXIT] ${node}`),
  onStepFinish: (step) => console.log(`[STEP] ${step.type}:`, step.content?.slice(0, 80)),
});

console.log('\n=== Final Response ===');
console.log(result.text);
console.log('\n=== Stats ===');
console.log('Steps:', result.steps.length);
console.log('Skills injected:', result.graphInfo?.skillsInjected);
console.log('Compaction:', result.graphInfo?.compaction);

// Cleanup
await mcpHost.dispose();
```

---

## Tips & Best Practices

### Error Handling

```ts
import { AIError, NetworkError, AuthenticationError } from '@bowenqt/qiniu-ai-sdk';

try {
  const result = await generateText({ ... });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof NetworkError) {
    console.error('Network issue:', error.message);
  } else if (error instanceof AIError) {
    console.error('AI error:', error.code, error.message);
  } else {
    throw error;
  }
}
```

### Token Estimation

```ts
import { estimateMessageTokens, estimateTokens } from '@bowenqt/qiniu-ai-sdk/core';

// Estimate tokens for text
const tokenCount = estimateTokens('Hello, world!');

// Estimate tokens for messages (includes images, tool calls, etc.)
const messageTokens = estimateMessageTokens([
  { role: 'user', content: 'Analyze this image' },
  { role: 'user', content: [{ type: 'image_url', image_url: { url: '...' } }] },
]);
```

### Environment Variables

```bash
# Core
QINIU_API_KEY=Sk-xxxxxxxxxxxxxxxx
QINIU_BASE_URL=https://api.qnaigc.com/v1  # Optional

# For Kodo Checkpointer
QINIU_ACCESS_KEY=your-access-key
QINIU_SECRET_KEY=your-secret-key

# For MCP with OAuth
MCP_BEARER_TOKEN=xxx  # For stdio transport

# For Redis Checkpointer
REDIS_URL=redis://localhost:6379

# For PostgreSQL Checkpointer
DATABASE_URL=postgresql://user:pass@localhost:5432/db
```

## 25. Guardrails - Content Safety

Implement pre-request and post-response content filtering:

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import {
  createAgent,
  inputFilter,
  outputFilter,
  type Guardrail,
} from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const piiRedactor: Guardrail = {
  name: 'pii-redactor',
  phase: 'post-response',
  execute: async (content) => ({
    blocked: false,
    modified: true,
    content
      .replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, '[REDACTED_EMAIL]')
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[REDACTED_PHONE]'),
  }),
};

const guardrails: Guardrail[] = [
  inputFilter({
    blockedPatterns: [/jailbreak/i, /ignore instructions/i],
    maxInputLength: 10000,
  }),
  outputFilter({
    blockedPatterns: [/confidential/i, /password:\s*\S+/i],
  }),
  piiRedactor,
  {
    name: 'custom-check',
    phase: 'post-response',
    execute: async (content) => {
      if (content.includes('secret')) {
        return {
          blocked: false,
          modified: true,
          content: content.replace(/secret/gi, '[FILTERED]'),
          reason: 'Filtered sensitive word',
        };
      }
      return { blocked: false, content };
    },
  },
];

// Create agent with guardrails
const agent = createAgent({
  client,
  model: 'gemini-2.5-flash',
  system: 'You are a helpful assistant.',
  guardrails, // Guardrails auto-run on every request/response
});

try {
  const result = await agent.run({
    prompt: 'Tell me about quantum computing',
  });
  console.log(result.text); // PII will be redacted
} catch (error) {
  if (error.name === 'GuardrailBlockedError') {
    console.log('Blocked by guardrail:', error.guardrailName);
    console.log('Reason:', error.reason);
  } else {
    throw error;
  }
}
```

### Guardrail with Checkpoint Redaction

When using checkpointer with guardrails, sensitive content is automatically redacted from saved checkpoints:

```ts
import { createAgent, MemoryCheckpointer } from '@bowenqt/qiniu-ai-sdk/core';

const checkpointer = new MemoryCheckpointer();
const piiRedactor = {
  name: 'pii-redactor',
  phase: 'post-response',
  execute: async (content) => ({
    blocked: false,
    modified: true,
    content: content.replace(/\b[\w.-]+@[\w.-]+\.\w+\b/g, '[REDACTED_EMAIL]'),
  }),
};

const agent = createAgent({
  client,
  model: 'gemini-2.5-flash',
  checkpointer,
  guardrails: [piiRedactor],
});

// Run with thread - checkpoint will contain redacted content
const result = await agent.runWithThread({
  threadId: 'user-123',
  prompt: 'My email is john@example.com',
});

// Checkpoint will have "[REDACTED]" instead of actual email
const checkpoint = await checkpointer.load('user-123');
console.log(checkpoint.state.output); // Email replaced with [REDACTED]
```

## Experimental

## 26. Multi-Agent Crew - Orchestration

Orchestrate multiple agents working together:

### Sequential Crew

Agents execute in order, passing output as context to the next:

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { createAgent, createSequentialCrew } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

// Create specialized agents
const researcher = createAgent({
  client,
  model: 'gemini-2.5-flash',
  system: 'You are a research analyst. Gather facts and data.',
});

const writer = createAgent({
  client,
  model: 'gemini-2.5-flash',
  system: 'You are a technical writer. Create clear documentation.',
});

const reviewer = createAgent({
  client,
  model: 'gemini-2.5-flash',
  system: 'You are an editor. Review and improve content.',
});

// Create sequential crew
const crew = createSequentialCrew({
  agents: [researcher, writer, reviewer],
});

// Kickoff the crew
const result = await crew.kickoff({
  prompt: 'Create a guide about GraphQL best practices',
  context: { targetAudience: 'backend developers' },
});

console.log('Final output:', result.finalOutput);
console.log('Agent results:', result.results.length);
result.results.forEach((r, i) => {
  console.log(`Agent ${i + 1}: ${r.output.slice(0, 100)}...`);
});
```

### Parallel Crew

Agents execute concurrently, results are aggregated:

```ts
import { createParallelCrew } from '@bowenqt/qiniu-ai-sdk/core';

const crew = createParallelCrew({
  agents: [securityAnalyst, performanceAnalyst, codeReviewer],
  aggregator: (results) => {
    // Custom aggregation logic
    return results.map(r => `## ${r.agentId}\n${r.output}`).join('\n\n');
  },
});

const result = await crew.kickoff({
  prompt: 'Review this code for issues',
  context: { code: sourceCode },
  abortSignal: controller.signal, // Optional: abort all agents
});

console.log('Aggregated output:', result.finalOutput);
console.log('Errors:', result.errors); // Partial failures captured
```

### Hierarchical Crew

Manager agent delegates tasks to worker agents:

```ts
import { createHierarchicalCrew } from '@bowenqt/qiniu-ai-sdk/core';

const manager = createAgent({
  client,
  model: 'claude-sonnet-4-20250514',
  system: `You are a project manager. Delegate tasks to your team.
Output JSON: { "delegations": [{ "agent": "agentId", "task": "description" }] }`,
});

const crew = createHierarchicalCrew({
  manager,
  workers: [frontendDev, backendDev, designer],
});

const result = await crew.kickoff({
  prompt: 'Build a login page with authentication',
});

// Manager automatically delegates and aggregates results
console.log('Final output:', result.finalOutput);
```

### Crew with Abort Signal

Cancel all agents mid-execution:

```ts
const controller = new AbortController();

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30000);

try {
  const result = await crew.kickoff({
    prompt: 'Complex multi-step task',
    abortSignal: controller.signal,
  });
} catch (error) {
  if (error.code === 'CANCELLED') {
    console.log('Crew execution cancelled');
  }
}
```

## 27. Cloud Sandbox - Code Execution (v0.37.0+)

Securely execute code in isolated cloud sandboxes.

在隔离的云沙箱中安全执行代码。

### Lifecycle Management

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

// Create and wait for sandbox to be fully ready
const instance = await client.sandbox.createAndWait(
  { templateId: 'base' },
  { timeoutMs: 60_000 },
);
console.log('Sandbox ready:', instance.sandboxId);

// Pause / Resume
await instance.pause();
await instance.resume();

// Cleanup
await instance.kill();
```

### Command Execution

```ts
// Run a command and wait for result
const result = await instance.commands.run('echo $MY_VAR', {
  cwd: '/tmp',
  envs: { MY_VAR: 'hello' },
  user: 'user',
});
console.log(result.exitCode); // 0
console.log(result.stdout);   // 'hello\n'

// Streaming output
const handle = await instance.commands.start('for i in 1 2 3; do echo $i; sleep 1; done', {
  onStdout: (data) => process.stdout.write(data),
  onStderr: (data) => process.stderr.write(data),
});
const final = await handle.wait();
console.log('Exit code:', final.exitCode);

// Process management
const procs = await instance.commands.listProcesses();
await instance.commands.killProcess(handle.pid);
```

### Filesystem Operations

```ts
// Write file
await instance.files.write('/tmp/data.txt', 'Hello from SDK');

// Read file
const text = await instance.files.readText('/tmp/data.txt');
const binary = await instance.files.read('/tmp/image.png');

// List directory
const entries = await instance.files.list('/tmp');
for (const entry of entries) {
  console.log(`${entry.name} (${entry.type}, ${entry.size} bytes)`);
}

// Check existence
const exists = await instance.files.exists('/tmp/data.txt');

// Directory operations
await instance.files.makeDir('/tmp/output');
await instance.files.remove('/tmp/data.txt');
```

### PTY Terminal Sessions

```ts
// Create interactive terminal
const pty = await instance.pty.create(
  { cols: 80, rows: 24 },
  {
    onData: (data) => process.stdout.write(data),
    envs: { TERM: 'xterm-256color' },
  },
);

// Send input to terminal
await pty.sendInput('ls -la\n');

// Resize terminal
await instance.pty.resize(pty.pid, { cols: 120, rows: 40 });

// Cleanup
await pty.kill();
```

### Templates

```ts
// List available sandbox templates
const templates = await client.sandbox.templates.list();
for (const tpl of templates) {
  console.log(`${tpl.name} (${tpl.templateId})`);
}
```

---

## 28. MCP Tool Policy & Skill CLI (v0.38.0+)

### MCP Tool Policy — Per-Server Timeout & Output Control

```ts
import { NodeMCPHost } from '@bowenqt/qiniu-ai-sdk/node';

const host = new NodeMCPHost({
  servers: [
    {
      name: 'code-search',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      toolPolicy: {
        timeout: 15000,               // SDK-native request timeout (ms)
        resetTimeoutOnProgress: true,  // Reset timeout on progress notifications
        maxTotalTimeout: 120000,       // Absolute ceiling (ms)
        maxOutputLength: 500_000,      // Host-layer output truncation (chars)
        requiresApproval: true,        // Require HITL approval per tool call
      },
    },
    {
      name: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      // Uses defaults: timeout=30s, no approval
    },
  ],
});

await host.connect();
const tools = host.getTools();
console.log(tools.map(t => `${t.name} (approval: ${t.requiresApproval})`));
```

### Deny-First Tool Approval

```ts
import { generateText } from '@bowenqt/qiniu-ai-sdk/core';

const result = await generateText({
  client,
  model: 'deepseek-v3',
  prompt: 'Search the codebase for auth bugs',
  tools: myTools,
  approval: {
    denySources: ['mcp:untrusted-server'],
    autoApproveSources: ['mcp:filesystem'],
    // deny > autoApprove > handler > fail-closed
  },
});
```

### Skill CLI

```bash
npx qiniu-ai skill list           # List installed skills
npx qiniu-ai skill add <url>      # Install a remote skill from manifest URL
npx qiniu-ai skill add <url> --sha256 <hash>  # With integrity verification
npx qiniu-ai skill add <url> --auth <token>   # With private manifest auth
npx qiniu-ai skill verify          # Verify integrity (path + hash)
npx qiniu-ai skill verify --fix    # Reconstruct lockfile from local dirs
npx qiniu-ai skill remove <name>   # Remove skill + lockfile entry
```

---

## 29. streamText — Token-level Streaming (v0.40.0+)

Stream text from LLM with token-level granularity. Unlike `generateText()` which returns after full completion, `streamText()` returns immediately and delivers tokens as they arrive.

### Basic Usage

```typescript
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { streamText } from '@bowenqt/qiniu-ai-sdk/core';

const client = new QiniuAI({ apiKey: 'your-key' });

const result = streamText({
    client,
    model: 'deepseek-v3',
    prompt: 'Explain quantum computing in simple terms',
});

// Stream text deltas as they arrive
for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
}

// Or await the final aggregated result
const finalText = await result.text;
```

### Agent Streaming

```typescript
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { createAgent } from '@bowenqt/qiniu-ai-sdk/core';

const agent = createAgent({
    client: new QiniuAI({ apiKey: 'your-key' }),
    model: 'deepseek-v3',
    tools: { /* ... */ },
});

// agent.stream() returns Promise<StreamTextResult>
const result = await agent.stream({ prompt: 'Search the web for latest AI news' });

for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
}
```

### SSE Endpoint (Express / Hono / Next.js)

```typescript
// Next.js App Router example
export async function POST(req: Request) {
    const { prompt } = await req.json();

    const result = streamText({
        client,
        model: 'deepseek-v3',
        prompt,
    });

    // Convert to SSE Response with one call
    return result.toDataStreamResponse();
}
```

### Full Event Stream (Tool Calls + Results)

```typescript
const result = streamText({
    client,
    model: 'deepseek-v3',
    prompt: 'What is the weather in Tokyo?',
    tools: weatherTools,
    maxSteps: 5,
});

for await (const event of result.fullStream) {
    switch (event.type) {
        case 'text-delta':
            process.stdout.write(event.textDelta);
            break;
        case 'tool-call':
            console.log(`Calling ${event.toolName}(${JSON.stringify(event.args)})`);
            break;
        case 'tool-result':
            console.log(`Result: ${event.result}`);
            break;
        case 'finish':
            console.log(`Done: ${event.finishReason}`);
            break;
        case 'error':
            console.error('Stream error:', event.error);
            break;
    }
}
```

### Abort Handling

```typescript
const controller = new AbortController();

const result = streamText({
    client,
    model: 'deepseek-v3',
    prompt: 'Write a long story',
    abortSignal: controller.signal,
});

// Abort after 5 seconds
setTimeout(() => controller.abort(), 5000);

for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
}
// Consumer break/return also aborts the background task automatically
```
