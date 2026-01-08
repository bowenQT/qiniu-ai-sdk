# Qiniu AI SDK

TypeScript SDK for Qiniu Cloud AI Token API.

## Features

- 🚀 **Chat Completions** - OpenAI-compatible interface
- 🖼️ **Image Generation** - Kling, Gemini models
- 🎥 **Video Generation** - Kling, Sora, Veo models
- 🔍 **Web Search** - Real-time web search API
- ⏱️ **Built-in Polling** - Async task management with retry and cancellation
- 📦 **TypeScript First** - Full type definitions included

## Requirements

- Node.js >= 18.0.0 (uses native `fetch`)

## Installation

```bash
npm install @bowenqt/qiniu-ai-sdk
```

## Quick Start

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

// Image generation (async)
const imageTask = await client.image.create({
  model: 'kling-v1',
  prompt: 'A futuristic city',
});
const imageResult = await client.image.waitForCompletion(imageTask.task_id);
console.log(imageResult.data?.[0].url);

// Video generation (async)
const videoTask = await client.video.create({
  model: 'kling-video-o1',
  prompt: 'A cat walking on the beach',
  duration: '5',
});
const videoResult = await client.video.waitForCompletion(videoTask.id);
console.log(videoResult.task_result?.videos[0].url);

// Web search
const results = await client.sys.search({
  query: 'Latest AI news',
  max_results: 5,
});
console.log(results);
```

## API Reference

### Client Initialization

```typescript
import { QiniuAI, consoleLogger } from '@bowenqt/qiniu-ai-sdk';

const client = new QiniuAI({
  apiKey: string;           // Required: Your Qiniu AI API key
  baseUrl?: string;         // Optional: API base URL (default: https://api.qnaigc.com/v1)
  timeout?: number;         // Optional: Request timeout in ms (default: 60000)
  logger?: Logger;          // Optional: Custom logger (use consoleLogger for debug output)
  logLevel?: LogLevel;      // Optional: 'debug' | 'info' | 'warn' | 'error' | 'silent' (default: 'info')
});
```

### Logging

Enable debug logging to see request/response details:

```typescript
import { QiniuAI, consoleLogger } from '@bowenqt/qiniu-ai-sdk';

const client = new QiniuAI({
  apiKey: 'Sk-xxx',
  logger: consoleLogger,
  logLevel: 'debug',
});

// Now you'll see logs like:
// [QiniuAI:DEBUG] HTTP Request { requestId: 'req_123...', method: 'POST', url: '...', timeout: 60000 }
// [QiniuAI:DEBUG] HTTP Response { requestId: 'req_123...', status: 200, duration: 1234 }
```

Use a custom logger (e.g., pino, winston):

```typescript
import { QiniuAI, Logger } from '@bowenqt/qiniu-ai-sdk';
import pino from 'pino';

const pinoLogger = pino();

const customLogger: Logger = {
  debug: (msg, meta) => pinoLogger.debug(meta, msg),
  info: (msg, meta) => pinoLogger.info(meta, msg),
  warn: (msg, meta) => pinoLogger.warn(meta, msg),
  error: (msg, meta) => pinoLogger.error(meta, msg),
};

const client = new QiniuAI({
  apiKey: 'Sk-xxx',
  logger: customLogger,
});
```

### Middleware

Use middleware to intercept and modify requests/responses:

```typescript
import { QiniuAI, Middleware, retryMiddleware, headersMiddleware } from '@bowenqt/qiniu-ai-sdk';

// Built-in retry middleware (retries on 5xx errors)
const retry = retryMiddleware({ maxRetries: 3, retryDelay: 1000 });

// Built-in headers middleware (adds custom headers)
const customHeaders = headersMiddleware({
  'X-Custom-Header': 'my-value',
});

// Custom middleware
const loggingMiddleware: Middleware = async (request, next) => {
  console.log('Request:', request.method, request.url);
  const response = await next(request);
  console.log('Response:', response.status, response.duration + 'ms');
  return response;
};

const client = new QiniuAI({
  apiKey: 'Sk-xxx',
  middleware: [retry, customHeaders, loggingMiddleware],
});
```

### Custom HTTP Adapter

Replace the default `fetch` with a custom HTTP client:

```typescript
import { QiniuAI, FetchAdapter } from '@bowenqt/qiniu-ai-sdk';
import axios from 'axios';

const axiosAdapter: FetchAdapter = {
  async fetch(url, init) {
    const response = await axios({
      url,
      method: init.method as any,
      headers: init.headers as Record<string, string>,
      data: init.body,
      signal: init.signal,
      validateStatus: () => true, // Don't throw on non-2xx
    });
    
    return new Response(JSON.stringify(response.data), {
      status: response.status,
      headers: response.headers as any,
    });
  },
};

const client = new QiniuAI({
  apiKey: 'Sk-xxx',
  adapter: axiosAdapter,
});
```

### Modules

#### `client.chat`

- `create(params: ChatCompletionRequest): Promise<ChatCompletionResponse>`

#### `client.image`

- `create(params: ImageGenerationRequest): Promise<{ task_id: string }>`
- `get(taskId: string): Promise<ImageTaskResponse>`
- `waitForCompletion(taskId: string, options?: WaitOptions): Promise<ImageTaskResponse>`

#### `client.video`

- `create(params: VideoGenerationRequest): Promise<{ id: string }>`
- `get(id: string): Promise<VideoTaskResponse>`
- `waitForCompletion(id: string, options?: WaitOptions): Promise<VideoTaskResponse>`

#### `client.sys`

- `search(params: WebSearchRequest): Promise<WebSearchResult[]>`

### Wait Options

For `waitForCompletion` methods:

```typescript
interface WaitOptions {
  intervalMs?: number;    // Polling interval (default: 2000 for image, 3000 for video)
  timeoutMs?: number;     // Max wait time (default: 120000 for image, 600000 for video)
  signal?: AbortSignal;   // For cancellation support
  maxRetries?: number;    // Max retries for transient errors (default: 3)
}
```

### Error Handling

```typescript
import { QiniuAI, APIError } from '@bowenqt/qiniu-ai-sdk';

try {
  await client.chat.create({ ... });
} catch (error) {
  if (error instanceof APIError) {
    console.log(error.status);  // HTTP status code
    console.log(error.code);    // API error code (if any)
    console.log(error.message); // Error message
  }
}
```

### Cancellation

```typescript
const controller = new AbortController();

// Cancel after 10 seconds
setTimeout(() => controller.abort(), 10000);

try {
  const result = await client.image.waitForCompletion(taskId, {
    signal: controller.signal,
  });
} catch (error) {
  if (error.message === 'Operation cancelled') {
    console.log('Task was cancelled');
  }
}
```

## Supported Models

### Chat / Text Completion

**OpenAI**
- `openai/gpt-5`, `openai/gpt-5.2`, `gpt-oss-20b`, `gpt-oss-120b`

**Anthropic Claude**
- `claude-4.5-opus`, `claude-4.5-sonnet`, `claude-4.5-haiku`
- `claude-4.1-opus`, `claude-4.0-opus`, `claude-4.0-sonnet`
- `claude-3.7-sonnet`, `claude-3.5-sonnet`, `claude-3.5-haiku`

**Google Gemini**
- `gemini-3.0-pro-preview`, `gemini-3.0-pro-image-preview`, `gemini-3.0-flash-preview`
- `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-flash-image`
- `gemini-2.0-flash`, `gemini-2.0-flash-lite`

**DeepSeek**
- `deepseek-v3`, `deepseek-v3-0324`, `deepseek-v3.1`
- `deepseek/deepseek-v3.1-terminus`, `deepseek/deepseek-v3.1-terminus-thinking`
- `deepseek/deepseek-v3.2-exp`, `deepseek/deepseek-v3.2-exp-thinking`, `deepseek/deepseek-v3.2-251201`
- `deepseek-r1`, `deepseek-r1-0528`

**Alibaba Qwen**
- `qwen3-max`, `qwen3-max-preview`, `qwen3-32b`, `qwen3-30b-a3b`
- `qwen3-235b-a22b`, `qwen3-235b-a22b-instruct`, `qwen3-235b-a22b-thinking-2507`
- `qwen3-next-80b-a3b-instruct`, `qwen3-next-80b-a3b-thinking`
- `qwen3-coder-480b-a35b-instruct`
- `qwen-max-2025-01-25`, `qwen-turbo`
- `qwen2.5-vl-7b-instruct`, `qwen2.5-vl-72b-instruct`, `qwen-vl-max-2025-01-25`

**ByteDance Doubao**
- `doubao-seed-1.6`, `doubao-seed-1.6-flash`, `doubao-seed-1.6-thinking`
- `doubao-1.5-pro-32k`, `doubao-1.5-thinking-pro`, `doubao-1.5-vision-pro`

**Zhipu GLM**
- `glm-4.5`, `glm-4.5-air`
- `z-ai/glm-4.6`, `z-ai/glm-4.7`
- `z-ai/autoglm-phone-9b`

**Moonshot Kimi**
- `kimi-k2`, `moonshotai/kimi-k2-0905`, `moonshotai/kimi-k2-thinking`

**xAI Grok**
- `x-ai/grok-4-fast`, `x-ai/grok-4-fast-reasoning`, `x-ai/grok-4-fast-non-reasoning`
- `x-ai/grok-4.1-fast`, `x-ai/grok-4.1-fast-reasoning`, `x-ai/grok-4.1-fast-non-reasoning`
- `x-ai/grok-code-fast-1`

**MiniMax**
- `MiniMax-M1`, `minimax/minimax-m2`, `minimax/minimax-m2.1`

**Others**
- `mimo-v2-flash`, `meituan/longcat-flash-chat`, `stepfun-ai/gelab-zero-4b-preview`

### Image Generation
- `kling-v1`, `kling-v1-5`, `kling-v2`, `kling-v2-1`

### Video Generation
- `kling-video-o1`, `kling-v2-1`, `kling-v2-5-turbo`

For the full list, check [Qiniu Model Plaza](https://www.qiniu.com/ai/models).

## License

MIT
