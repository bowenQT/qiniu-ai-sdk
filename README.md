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

// Streaming Chat (New!)
const stream = await client.chat.createStream({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Explain quantum computing' }],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

## Vercel AI SDK Adapter

Use the adapter to integrate with the Vercel AI SDK (`streamText`, `generateText`).

```typescript
import { createQiniu } from '@bowenqt/qiniu-ai-sdk/adapter';
import { streamText } from 'ai';

const qiniu = createQiniu({
  apiKey: process.env.QINIU_API_KEY || process.env.OPENAI_API_KEY,
});

const { textStream } = await streamText({
  model: qiniu.languageModel('gemini-2.5-flash'),
  prompt: 'Introduce Qiniu Cloud in one sentence.',
});

for await (const text of textStream) {
  process.stdout.write(text);
}
```

Notes:
- If you already have a `QiniuAI` client, pass it via `createQiniu({ client })`.
- You can override `baseUrl` using `createQiniu({ baseUrl })` or `QINIU_BASE_URL`.

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
- `createStream(params: ChatCompletionRequest): AsyncGenerator<ChatCompletionChunk>` (New!)

**Streaming Example with Function Calling & Reasoning:**

```typescript
const stream = await client.chat.createStream({
  model: 'gemini-2.5-flash', // Models supporting reasoning
  messages: [{ role: 'user', content: 'Solve this puzzle...' }],
});

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
  
  // Text content
  if (delta?.content) {
    process.stdout.write(delta.content);
  }
  
  // Reasoning content (Gemini/Claude thinking process)
  if (delta?.reasoning_content) {
    console.log('[Thinking]:', delta.reasoning_content);
  }
  
  // Function calling arguments are also streamed incrementally
}
```

#### `client.image`

- `create(params: ImageGenerationRequest): Promise<{ task_id: string }>`
- `edit(params: ImageEditRequest): Promise<ImageEditResponse>`
- `get(taskId: string): Promise<ImageTaskResponse>`
- `waitForCompletion(taskId: string, options?: WaitOptions): Promise<ImageTaskResponse>`

**Image Edit (Kling/Gemini):**

```typescript
// Kling multi-image edit
const editTask = await client.image.edit({
  model: 'kling-v1',
  prompt: 'Make it watercolor style',
  image_reference: 'subject',
  subject_image_list: [{ image: 'https://example.com/subject.jpg', image_type: 'subject' }],
  scene_image: { image: 'https://example.com/scene.jpg', image_type: 'scene' },
  style_image: { image: 'https://example.com/style.jpg', image_type: 'style' },
});

// Gemini edit
const geminiEdit = await client.image.edit({
  model: 'gemini-3.0-pro-image-preview',
  prompt: 'Add a sunset sky',
  image_url: 'https://example.com/input.png',
  image_config: { aspect_ratio: '16:9', image_size: '2K' },
  mask: 'base64-mask-data',
});
```

#### `client.video`

- `create(params: VideoGenerationRequest): Promise<{ id: string }>`
- `get(id: string): Promise<VideoTaskResponse>`
- `remix(id: string, params: VideoRemixRequest): Promise<{ id: string }>`
- `waitForCompletion(id: string, options?: WaitOptions): Promise<VideoTaskResponse>`

**First & Last Frame Video Generation:**

The SDK provides a unified `frames` parameter that works across all models (Kling, Veo):

```typescript
// Kling first/last frame (multi-frame generation)
const klingTask = await client.video.create({
  model: 'kling-video-o1',
  prompt: '视频连贯在一起',
  frames: {
    first: { url: 'https://example.com/start.jpg' },
    last: { url: 'https://example.com/end.jpg' }
  },
  size: '1920x1080',
  mode: 'pro'
});

// Veo first/last frame
const veoTask = await client.video.create({
  model: 'veo-2.0-generate-001',
  prompt: 'A cat jumping from chair to table',
  frames: {
    first: { url: 'https://example.com/cat-chair.jpg' },
    last: { url: 'https://example.com/cat-table.jpg' }
  },
  generate_audio: true,
  resolution: '720p',
  seed: 12345,
  sample_count: 1
});

// Wait for completion (works with both Kling and Veo)
const result = await client.video.waitForCompletion(veoTask.id);
console.log(result.task_result?.videos[0].url);
```

**Video Reference Generation (Kling):**

```typescript
const task = await client.video.create({
  model: 'kling-video-o1',
  prompt: '融合视频风格生成新内容',
  video_list: [{
    video_url: 'https://example.com/reference.mp4',
    refer_type: 'base',
    keep_original_sound: 'yes'
  }]
});
```

**Kling Native Parameters:**

For backward compatibility, you can also use Kling's native parameters directly:

```typescript
// Using image_list directly (kling-video-o1)
const task = await client.video.create({
  model: 'kling-video-o1',
  prompt: '...',
  image_list: [
    { image: 'https://...', type: 'first_frame' },
    { image: 'https://...', type: 'end_frame' }
  ]
});

// Using image_tail (kling-v2-5-turbo)
const task = await client.video.create({
  model: 'kling-v2-5-turbo',
  prompt: '...',
  input_reference: 'https://example.com/start.jpg',
  image_tail: 'https://example.com/end.jpg'
});
```

**Video Remix (Sora):**

```typescript
const remixTask = await client.video.remix('videos-123...', {
  prompt: 'Make it cinematic',
});
console.log(remixTask.id);
```

#### `client.ocr`

- `detect(params: OcrRequest): Promise<OcrResponse>`

**OCR Example:**

```typescript
const ocrResult = await client.ocr.detect({
  url: 'https://static.qiniu.com/ai-inference/example-resources/ocr-example.png',
});
console.log(ocrResult.text);
```

#### `client.asr`

- `transcribe(params: AsrRequest): Promise<AsrResponse>`

**ASR Example:**

```typescript
const asrResult = await client.asr.transcribe({
  audio: {
    format: 'mp3',
    url: 'https://static.qiniu.com/ai-inference/example-resources/example.mp3',
  },
});
console.log(asrResult.text);
```

#### `client.account`

- `usage(params: UsageQuery): Promise<UsageResponse>`

**Account Usage Example (API Key):**

```typescript
const usage = await client.account.usage({
  granularity: 'day',
  start: '2024-01-01T00:00:00+08:00',
  end: '2024-01-31T23:59:59+08:00',
});
console.log(usage.data.length);
```

**Account Usage Example (AK/SK):**

```typescript
const usage = await client.account.usage({
  granularity: 'day',
  start: '2024-01-01T00:00:00+08:00',
  end: '2024-01-31T23:59:59+08:00',
  auth: {
    accessKey: 'your-ak',
    secretKey: 'your-sk',
  },
});
console.log(usage.data.length);
```

#### `client.sys`

- `search(params: WebSearchRequest): Promise<WebSearchResult[]>`

### Advanced Usage: Generic API Access

For features not yet fully wrapped in modules, use the generic `post` and `get` methods.

**OCR (Optical Character Recognition):**

```typescript
const response = await client.post<any>('/images/ocr', {
  model: 'ocr',
  url: 'https://example.com/image.png'
});
console.log(response.data.result.text);
```

**TTS (Text to Speech):**

```typescript
// Get Voice List
const voices = await client.get<any[]>('/voice/list');

// Synthesize Audio
const res = await client.post<any>('/voice/tts', {
  request: { text: 'Hello world' },
  audio: { voice_type: 'qiniu_zh_female_xxx' }
});
```

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

### Chat & Reasoning (66 models)

| Provider | Models |
|----------|--------|
| **Qwen** | `qwen3-235b-a22b-thinking-2507`, `qwen3-235b-a22b-instruct-2507`, `qwen3-235b-a22b`, `qwen3-max-preview`, `qwen3-max`, `qwen3-32b`, `qwen3-30b-a3b`, `qwen3-next-80b-a3b-thinking`, `qwen3-next-80b-a3b-instruct`, `qwen3-coder-480b-a35b-instruct`, `qwen-max-2025-01-25`, `qwen-turbo` |
| **Claude** | `claude-4.5-opus`, `claude-4.5-haiku`, `claude-4.5-sonnet`, `claude-4.1-opus`, `claude-4.0-opus`, `claude-4.0-sonnet`, `claude-3.7-sonnet`, `claude-3.5-sonnet`, `claude-3.5-haiku` |
| **Gemini** | `gemini-3.0-flash-preview`, `gemini-3.0-pro-preview`, `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash-lite`, `gemini-2.0-flash` |
| **DeepSeek** | `deepseek-r1-0528`, `deepseek-r1`, `deepseek-v3`, `deepseek-v3-0324`, `deepseek-v3.1`, `deepseek/deepseek-v3.2-251201`, `deepseek/deepseek-v3.2-exp-thinking`, `deepseek/deepseek-v3.2-exp`, `deepseek/deepseek-v3.1-terminus-thinking`, `deepseek/deepseek-v3.1-terminus` |
| **Doubao** | `doubao-seed-1.6-thinking`, `doubao-seed-1.6-flash`, `doubao-seed-1.6`, `doubao-1.5-thinking-pro`, `doubao-1.5-pro-32k` |
| **GLM** | `glm-4.5`, `glm-4.5-air`, `z-ai/glm-4.7`, `z-ai/glm-4.6` |
| **Grok** | `x-ai/grok-4-fast-reasoning`, `x-ai/grok-4-fast-non-reasoning`, `x-ai/grok-4-fast`, `x-ai/grok-4.1-fast-non-reasoning`, `x-ai/grok-4.1-fast-reasoning`, `x-ai/grok-4.1-fast`, `x-ai/grok-code-fast-1` |
| **OpenAI** | `openai/gpt-5.2`, `openai/gpt-5`, `gpt-oss-20b`, `gpt-oss-120b` |
| **Kimi** | `moonshotai/kimi-k2-thinking`, `moonshotai/kimi-k2-0905`, `kimi-k2` |
| **MiniMax** | `minimax/minimax-m2`, `minimax/minimax-m2.1`, `MiniMax-M1`, `mimo-v2-flash` |
| **Meituan** | `meituan/longcat-flash-chat` |
| **StepFun** | `stepfun-ai/gelab-zero-4b-preview` |
| **AutoGLM** | `z-ai/autoglm-phone-9b` |

### Image Generation & Vision

| Type | Models |
|------|--------|
| **Kling** | `kling-v1`, `kling-v1-5`, `kling-v2`, `kling-v2-new`, `kling-v2-1` |
| **Gemini** | `gemini-3.0-pro-image-preview`, `gemini-2.5-flash-image` |
| **Vision** | `doubao-1.5-vision-pro`, `qwen2.5-vl-7b-instruct`, `qwen2.5-vl-72b-instruct`, `qwen-vl-max-2025-01-25` |

### Video Generation

| Provider | Models |
|----------|--------|
| **Kling** | `kling-video-o1`, `kling-v2-1`, `kling-v2-5-turbo` |
| **Sora** | `sora-2` |
| **Veo** | `veo-2.0-generate-001`, `veo-3.0-generate-001`, `veo-3.0-fast-generate-001`, `veo-3.0-generate-preview`, `veo-3.0-fast-generate-preview`, `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview` |
| **Other** | `minimax/minimax-m2`, `mimo-v2-flash` |

### OCR (文字识别)

| Model | Description |
|-------|-------------|
| `ocr` | 图片/PDF文档高精度文字识别，支持 PNG、JPG、PDF 等格式 |

### ASR (语音识别)

| Model | Description |
|-------|-------------|
| `asr` | 中英等多语种语音识别，嘈杂环境识别准确率超95%，支持 raw/wav/mp3/ogg 格式 |

### TTS (语音合成)

通过 `/voice/list` 接口获取完整音色列表，使用 `voice_type` 参数指定音色：

| Voice Type | Description |
|------------|-------------|
| `qiniu_zh_female_tmjxxy` | 甜美教学小源 |
| `qiniu_zh_female_wwxkjx` | 温婉小课堂 |
| ... | 更多音色请通过 API 获取 |

---

**Summary**: 66 Chat models, 11 Image models, 12 Video models, OCR, ASR, TTS

For the full list and pricing, check [Qiniu AI Developer Center](https://developer.qiniu.com/aitokenapi).

## License

MIT
