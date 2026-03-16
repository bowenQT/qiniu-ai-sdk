import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

const client = new QiniuAI({
  apiKey: process.env.QINIU_API_KEY || '',
});

const result = await client.chat.create({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Introduce Qiniu AI SDK in one sentence.' }],
});

console.log(result.choices[0]?.message?.content ?? '');
