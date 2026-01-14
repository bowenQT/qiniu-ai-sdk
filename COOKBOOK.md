# Qiniu AI SDK Cookbook

This cookbook provides focused, copy‑ready examples for common workflows.

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

## 3. Tool Calls (Sync Loop)

```ts
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk';
import { generateText, serializeToolResult } from '@bowenqt/qiniu-ai-sdk';

const client = new QiniuAI({ apiKey: process.env.QINIU_API_KEY || '' });

const tools = {
  getTime: {
    description: 'Get the current UTC time',
    parameters: { type: 'object', properties: {}, required: [] },
    execute: async () => ({ now: new Date().toISOString() }),
  },
};

const result = await generateText({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'What time is it now? Call the tool.',
  tools,
  maxSteps: 2,
});

console.log(result.text);
```

## 4. Vercel AI SDK Integration

```ts
import { createQiniu } from '@bowenqt/qiniu-ai-sdk/adapter';
import { streamText } from 'ai';

const qiniu = createQiniu({ apiKey: process.env.QINIU_API_KEY || '' });

const { textStream } = await streamText({
  model: qiniu.languageModel('gemini-2.5-flash'),
  prompt: 'Introduce Qiniu Cloud in one sentence.',
});

for await (const text of textStream) {
  process.stdout.write(text);
}
```

## 5. Image Generation + Polling

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
