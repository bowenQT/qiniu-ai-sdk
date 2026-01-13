import { createQiniu } from '@bowenqt/qiniu-ai-sdk/adapter';
import { streamText } from 'ai';

async function main() {
    const qiniu = createQiniu({
        apiKey: process.env.QINIU_API_KEY || process.env.OPENAI_API_KEY || '',
    });

    const { textStream } = await streamText({
        model: qiniu.languageModel('gemini-2.5-flash'),
        prompt: 'Introduce Qiniu Cloud in one sentence.',
    });

    for await (const text of textStream) {
        process.stdout.write(text);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
