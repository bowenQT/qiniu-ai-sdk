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

### Chat
- `gemini-2.5-flash`, `gemini-pro`, `deepseek-v3`, `claude-*`, etc.

### Image Generation
- `kling-v1`, `kling-v1-5`, `kling-v2`, `kling-v2-1`

### Video Generation
- `kling-video-o1`, `kling-v2-1`, `kling-v2-5-turbo`

For the full list, check [Qiniu Model Plaza](https://www.qiniu.com/ai/models).

## License

MIT
