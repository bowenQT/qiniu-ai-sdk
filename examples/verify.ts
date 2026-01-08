
import { QiniuAI, consoleLogger } from '../src';

/**
 * 验证脚本 / Verification Script
 * 
 * 环境变量 (Environment Variable):
 * export QINIU_AI_API_KEY="sk-..."
 * 
 * 运行方式 (Usage):
 * npx tsx examples/verify.ts
 */

const apiKey = process.env.QINIU_AI_API_KEY;

if (!apiKey) {
    console.error('❌ Error: Please set QINIU_AI_API_KEY environment variable.');
    console.error('Usage: export QINIU_AI_API_KEY="sk-xxxx" && npx tsx examples/verify.ts');
    process.exit(1);
}

// 初始化客户端
const client = new QiniuAI({
    apiKey,
    logger: consoleLogger,
    logLevel: 'info', // 改为 'debug' 可查看详细 HTTP 请求
});

async function main() {
    console.log('🚀 Starting SDK Verification (v0.2.2)...\n');

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

        // 2. Web Search (Tools Module)
        console.log('2️⃣  Testing Web Search...');
        const searchRes = await client.sys.search({
            query: 'Qiniu Cloud AI',
            max_results: 1
        });
        console.log(`   ✅ Search Result: Found ${searchRes.length} items.`);
        if (searchRes.length > 0) {
            console.log(`      Title: ${searchRes[0].title}`);
        }
        console.log('');

        // 3. OCR (New Generic Capability)
        // 验证 client.post<T>() 泛型方法是否能支持未封装的 API
        console.log('3️⃣  Testing OCR (via Generic POST)...');
        try {
            const ocrRes = await client.post<any>('/images/ocr', {
                model: 'ocr',
                url: 'https://static.qiniu.com/ai-inference/example-resources/ocr-example.png'
            });
            console.log('   ✅ OCR Request Success');

            // Debug: Inspect the response structure
            // console.log('DEBUG OCR Response:', JSON.stringify(ocrRes, null, 2).slice(0, 500));

            let text = 'Text not found';
            if (ocrRes?.data?.result?.text) text = ocrRes.data.result.text;
            else if (ocrRes?.result?.text) text = ocrRes.result.text; // Some APIs return result directly
            else if (ocrRes?.text) text = ocrRes.text;
            else {
                text = 'Structure: ' + Object.keys(ocrRes || {}).join(',');
            }
            console.log(`      Text: ${text.slice(0, 50).replace(/\n/g, ' ')}...`);
        } catch (e: any) {
            console.warn('   ⚠️ OCR test skipped/failed:', e.message);
        }
        console.log('');

        // 4. TTS Voice List (New Generic Capability)
        // 验证 client.get<T>() 泛型方法
        console.log('4️⃣  Testing TTS Voice List (via Generic GET)...');
        try {
            const voices = await client.get<any[]>('/voice/list');
            console.log(`   ✅ TTS Voices: Found ${voices?.length || 0} voices.`);
            if (voices && voices.length > 0) {
                console.log(`      Example: ${voices[0].voice_name} (${voices[0].voice_type})`);
            }
        } catch (e: any) {
            console.warn('   ⚠️ TTS list test skipped/failed:', e.message);
        }
        console.log('');

        // 5. Image Generation (Async Task)
        // 仅验证任务创建，不进行长轮询等待
        console.log('5️⃣  Testing Image Task Creation...');
        try {
            const imgTask = await client.image.create({
                model: 'kling-v1',
                prompt: 'A futuristic verified badge, 3d render, minimal',
            });
            console.log(`   ✅ Image Task Created: ${imgTask.task_id}`);
        } catch (e: any) {
            console.warn('   ⚠️ Image task test failed:', e.message);
        }
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
