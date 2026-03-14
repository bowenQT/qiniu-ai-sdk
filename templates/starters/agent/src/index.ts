import { z } from 'zod';
import { zodToJsonSchema } from '@bowenqt/qiniu-ai-sdk/ai-tools';
import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';
import { generateText } from '@bowenqt/qiniu-ai-sdk/core';

const calculatorSchema = z.object({
  a: z.number(),
  b: z.number(),
});

const client = new QiniuAI({
  apiKey: process.env.QINIU_API_KEY || '',
});

const result = await generateText({
  client,
  model: 'gemini-2.5-flash',
  prompt: 'What is 42 multiplied by 17?',
  tools: {
    calculator: {
      description: 'Perform basic arithmetic',
      parameters: zodToJsonSchema(calculatorSchema),
      execute: async (args) => {
        const { a, b } = calculatorSchema.parse(args);
        return a * b;
      },
    },
  },
  maxSteps: 2,
});

console.log(result.text);
