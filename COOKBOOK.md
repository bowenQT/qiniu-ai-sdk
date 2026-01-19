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
17. [Checkpointer - State Persistence](#17-checkpointer---state-persistence)
18. [Tool Approval (HITL)](#18-tool-approval-hitl)
19. [Interrupt/Resume - Resumable Execution](#19-interruptresume---resumable-execution)
20. [MCP Client Integration](#20-mcp-client-integration)
21. [Asset Resolver - Qiniu URI Resolution](#21-asset-resolver---qiniu-uri-resolution)
22. [Built-in Cloud Tools (OCR/Censor/Vframe)](#22-built-in-cloud-tools-ocrcensorvframe)
23. [OpenTelemetry Tracing](#23-opentelemetry-tracing)
24. [Full Agent Example - Combining All Features](#24-full-agent-example---combining-all-features)

---

## 1. Basic Chat (Sync)

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const result = await client.chat.create({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(result.choices[0].message.content);
```

## 2. Streaming Chat (SSE)

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk';

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
import { QiniuAI, generateText } from '@bowenqt/qiniu-ai-sdk';

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
import { QiniuAI, generateText } from '@bowenqt/qiniu-ai-sdk';
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
import { QiniuAI, generateText } from '@bowenqt/qiniu-ai-sdk';

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
import { QiniuAI, generateText } from '@bowenqt/qiniu-ai-sdk';

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
import { QiniuAI, generateText } from '@bowenqt/qiniu-ai-sdk';

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

## 9. Image Generation + Polling

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk';

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
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk';

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
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const task = await client.video.create({
  model: 'kling-video-o1',
  prompt: 'A cat playing piano',
  duration: '5',
});

const result = await client.video.waitForCompletion(task.id);
console.log(result.task_result?.videos[0].url);
```

## 12. Multi-Step Agent with Step Callbacks

```ts
import { QiniuAI, generateText } from '@bowenqt/qiniu-ai-sdk';

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

## 13. createAgent - Reusable Agent Factory

Create a reusable agent with pre-configured settings:

```ts
import { QiniuAI, createAgent, MemoryCheckpointer } from '@bowenqt/qiniu-ai-sdk';

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
import { 
  QiniuAI, 
  generateTextWithGraph, 
  MemoryManager,
} from '@bowenqt/qiniu-ai-sdk';

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
import { 
  QiniuAI, 
  MemoryManager, 
  InMemoryVectorStore,
  generateTextWithGraph,
} from '@bowenqt/qiniu-ai-sdk';

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
import { 
  QiniuAI, 
  SkillLoader, 
  generateTextWithGraph,
} from '@bowenqt/qiniu-ai-sdk';

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

## 17. Checkpointer - State Persistence

Save and restore agent state across sessions:

### Memory Checkpointer (Testing/Short-lived)

```ts
import { 
  MemoryCheckpointer, 
  deserializeCheckpoint,
} from '@bowenqt/qiniu-ai-sdk';

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
import { RedisCheckpointer } from '@bowenqt/qiniu-ai-sdk';
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
import { PostgresCheckpointer } from '@bowenqt/qiniu-ai-sdk';
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
import { KodoCheckpointer } from '@bowenqt/qiniu-ai-sdk';

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
import { 
  QiniuAI, 
  generateText,
  type ApprovalConfig,
  type ApprovalContext,
} from '@bowenqt/qiniu-ai-sdk';

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
import { 
  QiniuAI, 
  AgentGraph, 
  MemoryCheckpointer,
  type ApprovalConfig,
  type PendingApproval,
} from '@bowenqt/qiniu-ai-sdk';

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

## 20. MCP Client Integration

Connect to Model Context Protocol servers:

### Stdio Transport

```ts
import { 
  MCPClient, 
  adaptMCPToolsToRegistry,
  generateTextWithGraph,
} from '@bowenqt/qiniu-ai-sdk';

const mcpClient = new MCPClient({
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
      token: process.env.GITHUB_TOKEN, // Injected as MCP_BEARER_TOKEN env
    },
  ],
  requestTimeout: 30000, // 30s timeout per request
});

// Connect to all servers
await mcpClient.connect();
console.log('Connection states:', mcpClient.getConnectionStates());

// Get all available tools
const tools = mcpClient.getAllTools();
console.log('Available tools:', tools.map(t => t.name));

// Convert to SDK format for use with generateText
const registeredTools = adaptMCPToolsToRegistry(tools, 'filesystem', mcpClient);

// Use with graph
const result = await generateTextWithGraph({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'List all TypeScript files in the project',
  tools: registeredTools,
});

console.log('Result:', result.text);

// Cleanup
await mcpClient.disconnect();
```

### HTTP Transport with OAuth

```ts
import { 
  MCPClient, 
  PKCEFlow, 
  TokenManager, 
  MemoryTokenStore,
  generateState,
} from '@bowenqt/qiniu-ai-sdk';

// OAuth configuration
const oauthConfig = {
  clientId: 'my-app-id',
  scopes: ['mcp:read', 'mcp:write'],
  authorizationUrl: 'https://auth.example.com/authorize',
  tokenUrl: 'https://auth.example.com/token',
};

// --- Step 1: OAuth flow (typically in a separate auth route) ---
const pkceFlow = new PKCEFlow(oauthConfig);
const state = generateState();
const authUrl = pkceFlow.buildAuthorizationUrl('http://localhost:3000/callback', state);
console.log('Redirect user to:', authUrl);

// After OAuth callback:
const { code } = await pkceFlow.waitForCallback({ 
  expectedState: state, 
  timeoutMs: 300000,
});
const tokens = await pkceFlow.exchangeCode(code, 'http://localhost:3000/callback');

// --- Step 2: Store tokens ---
const tokenManager = new TokenManager(new MemoryTokenStore(), oauthConfig);
await tokenManager.setTokens(tokens);

// --- Step 3: Connect with tokenProvider ---
const mcpClient = new MCPClient({
  servers: [
    {
      name: 'remote-mcp',
      transport: 'http',
      url: 'https://mcp.example.com/api/mcp',
      tokenProvider: () => tokenManager.getAccessToken(),
      oauth: oauthConfig, // Required: validates auth is configured
    },
  ],
});

await mcpClient.connect();
const tools = mcpClient.getAllTools();
console.log('Remote tools:', tools.map(t => t.name));
```

## 21. Asset Resolver - Qiniu URI Resolution

Resolve `qiniu://` URIs to signed URLs:

```ts
import { 
  parseQiniuUri, 
  resolveAsset, 
  resolveAssets,
  CachedSigner,
  type QiniuSigner,
} from '@bowenqt/qiniu-ai-sdk';

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
import { 
  QiniuAI, 
  generateText,
  QINIU_TOOLS,
  getQiniuToolsArray,
  getQiniuToolSchemas,
  type QiniuToolContext,
} from '@bowenqt/qiniu-ai-sdk';

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

## 24. Full Agent Example - Combining All Features

A complete example combining multiple advanced features:

```ts
import {
  QiniuAI,
  createAgent,
  MemoryManager,
  InMemoryVectorStore,
  MemoryCheckpointer,
  SkillLoader,
  MCPClient,
  adaptMCPToolsToRegistry,
  QINIU_TOOLS,
  setGlobalTracer,
  ConsoleTracer,
  type ApprovalConfig,
} from '@bowenqt/qiniu-ai-sdk';

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

// Setup MCP
const mcpClient = new MCPClient({
  servers: [
    { name: 'fs', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
  ],
});
await mcpClient.connect();
const mcpTools = adaptMCPToolsToRegistry(mcpClient.getAllTools(), 'fs', mcpClient);

// Combine tools
const allTools = {
  ...mcpTools,
  ...Object.fromEntries(
    Object.entries(QINIU_TOOLS).map(([name, tool]) => [
      name,
      {
        ...tool,
        name,
        source: { type: 'builtin' as const },
        execute: (args: any) => tool.execute(args, { client }),
      },
    ])
  ),
};

// Approval config
const approvalConfig: ApprovalConfig = {
  autoApproveSources: ['builtin'],
  onApprovalRequired: async (ctx) => {
    console.log(`[APPROVAL] ${ctx.toolName}:`, ctx.args);
    return { approved: true }; // Auto-approve for demo
  },
};

// --- Create Agent ---
const agent = createAgent({
  client,
  model: 'gemini-2.5-flash',
  system: 'You are a helpful AI assistant with access to files, cloud tools, and domain knowledge.',
  tools: allTools,
  skills,
  memory,
  checkpointer,
  approvalConfig,
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
await mcpClient.disconnect();
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
import { estimateMessageTokens, estimateTokens } from '@bowenqt/qiniu-ai-sdk';

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
