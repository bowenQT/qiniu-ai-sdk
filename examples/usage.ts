import { QiniuAI } from '../src';

// Usage Example
// Run with: npx ts-node examples/usage.ts

const client = new QiniuAI({
    apiKey: process.env.QINIU_AI_API_KEY || 'Sk-xxxxxxxxxxxxxxxx',
});

async function main() {
    console.log('--- Chat Completion ---');
    try {
        const chat = await client.chat.create({
            model: 'gemini-2.5-flash',
            messages: [{ role: 'user', content: 'Hello, Qiniu AI!' }],
            // stream: true, // This will throw an error - streaming not supported yet
        });
        console.log('Chat Response:', chat.choices[0].message.content);
    } catch (error) {
        console.error('Chat Error:', error);
    }

    console.log('\n--- Image Generation ---');
    try {
        const task = await client.image.create({
            model: 'kling-v1',
            prompt: 'A futuristic city with flying cars',
        });
        console.log('Image Task ID:', task.task_id);

        // With new options: retry logic, cancellation support
        const controller = new AbortController();

        // Example: Cancel after 30 seconds
        setTimeout(() => controller.abort(), 30000);

        const result = await client.image.waitForCompletion(task.task_id, {
            intervalMs: 2000,
            timeoutMs: 120000,
            signal: controller.signal,
            maxRetries: 3,
        });

        if (result.status === 'succeed') {
            console.log('Image URL:', result.data?.[0].url);
        } else {
            console.error('Image generation failed:', result.error?.message);
        }
    } catch (error) {
        console.error('Image Error:', error);
    }

    console.log('\n--- Video Generation ---');
    try {
        const task = await client.video.create({
            model: 'kling-video-o1',
            prompt: 'A cat walking on the beach at sunset',
            duration: '5',
            mode: 'std',
        });
        console.log('Video Task ID:', task.id);

        const result = await client.video.waitForCompletion(task.id, {
            intervalMs: 5000,
            timeoutMs: 600000, // 10 minutes
        });

        if (result.status === 'completed') {
            console.log('Video URL:', result.task_result?.videos[0].url);
        } else {
            console.error('Video generation failed:', result.error?.message);
        }
    } catch (error) {
        console.error('Video Error:', error);
    }

    console.log('\n--- Web Search ---');
    try {
        const results = await client.sys.search({
            query: 'Qiniu Cloud AI',
            max_results: 5,
            search_type: 'web',
        });
        console.log('Search Results:', results);
    } catch (error) {
        console.error('Search Error:', error);
    }
}

// Uncomment to run if key is present
// main();

export { main };
