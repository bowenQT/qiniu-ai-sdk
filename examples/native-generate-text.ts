import { QiniuAI, generateText } from '@bowenqt/qiniu-ai-sdk';

async function main() {
    const client = new QiniuAI({
        apiKey: process.env.QINIU_API_KEY || '',
    });

    const result = await generateText({
        client,
        model: 'gemini-2.5-flash',
        prompt: 'Introduce Qiniu Cloud in one sentence.',
    });

    console.log(result.text);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
