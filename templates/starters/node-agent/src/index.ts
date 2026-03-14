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
      description: 'Return the current ISO timestamp',
      parameters: zodToJsonSchema(nowSchema),
      execute: async () => ({ now: new Date().toISOString() }),
    },
  },
});

const result = await agent.run({
  prompt: 'Tell me the current time using the now tool, then explain why timestamps should be ISO 8601.',
});

console.log(result.text);
