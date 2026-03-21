import { QiniuAI, consoleLogger } from '@bowenqt/qiniu-ai-sdk';

/**
 * 验证脚本 / Verification Script
 * 
 * 环境变量 (Environment Variable):
 * export QINIU_API_KEY="sk-..."
 * 
 * 运行方式 (Usage):
 * npx tsx examples/verify.ts
 */

const apiKey = process.env.QINIU_API_KEY;

if (!apiKey) {
    console.error('❌ Error: Please set QINIU_API_KEY environment variable.');
    console.error('Usage: export QINIU_API_KEY="sk-xxxx" && npx tsx examples/verify.ts');
    process.exit(1);
}

// 初始化客户端
const client = new QiniuAI({
    apiKey,
    logger: consoleLogger,
    logLevel: 'info', // 改为 'debug' 可查看详细 HTTP 请求
});

async function main() {
    console.log('🚀 Starting SDK Verification (v0.49.2)...\n');

    try {
        // 1. Chat Completion (Core Feature)
        console.log('1️⃣  Testing Chat Completion...');
        const chatRes = await client.chat.create({
            model: 'gemini-2.5-flash',
            messages: [{ role: 'user', content: 'Hello, please reply with "SDK Verified".' }],
            temperature: 0.1,
        });
        const content = chatRes.choices[0].message.content;
        const contentStr = typeof content === 'string'
            ? content
            : JSON.stringify(content);
        console.log('   ✅ Chat Response:', contentStr?.trim(), '\n');

        // 2. Image Generation (Async Task)
        console.log('2️⃣  Testing Image Task Creation...');
        const imgTask = await client.image.generate({
            model: 'kling-image-o1',
            prompt: 'A futuristic verified badge, 3d render, minimal',
        });
        console.log(`   ✅ Image Task Created: ${imgTask.task_id}`);
        const imgResult = await client.image.waitForResult(imgTask);
        console.log(`      Image URL: ${imgResult.data?.[0]?.url ?? imgResult.data?.[0]?.b64_json ?? ''}`);
        console.log('');

        // 3. Video Generation
        console.log('3️⃣  Testing Video Task Creation...');
        const videoTask = await client.video.create({
            model: 'kling-video-o1',
            prompt: 'A futuristic verified badge rotating in space',
            duration: '5',
            mode: 'std',
        });
        const videoResult = await client.video.waitForCompletion(videoTask);
        console.log(`   ✅ Video Result: ${videoResult.task_result?.videos?.[0]?.url ?? ''}`);
        console.log('');

        console.log('🎉 Verification Finished!');

    } catch (error: any) {
        console.error('\n❌ Fatal Verification Error:', error.message);
        if (error.response) {
            console.error('   Status:', error.status);
        }
        process.exit(1);
    }
}

main();
