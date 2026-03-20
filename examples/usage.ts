import { QiniuAI } from '@bowenqt/qiniu-ai-sdk/qiniu';

// Usage Example
// Run with: npx tsx examples/usage.ts

const apiKey = process.env.QINIU_API_KEY;
const client = new QiniuAI({
    apiKey: apiKey || '',
});

async function main() {
    if (!apiKey) {
        console.log('Set QINIU_API_KEY to run this example.');
        return;
    }

    console.log('--- Chat Completion ---');
    const chat = await client.chat.create({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'Hello, Qiniu AI!' }],
    });
    console.log('Chat Response:', chat.choices[0].message.content);

    console.log('\n--- Image Generation ---');
    const task = await client.image.generate({
        model: 'kling-image-o1',
        prompt: 'A futuristic city with flying cars',
    });
    console.log('Image Task ID:', task.task_id);

    const result = await client.image.waitForResult(task);
    console.log('Image URL:', result.data?.[0]?.url ?? result.data?.[0]?.b64_json ?? '');
}

export { main };
