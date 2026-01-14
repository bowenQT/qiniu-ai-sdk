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
