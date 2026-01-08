/**
 * Streaming Chat Verification Script
 * 
 * Tests the new createStream() functionality:
 * - Regular text streaming
 * - reasoning_content (if model supports it)
 * 
 * Usage:
 * export QINIU_AI_API_KEY="sk-..."
 * npx tsx examples/verify-streaming.ts
 */

import { QiniuAI, consoleLogger } from '../src';

const apiKey = process.env.QINIU_AI_API_KEY;

if (!apiKey) {
    console.error('❌ Error: Please set QINIU_AI_API_KEY environment variable.');
    process.exit(1);
}

const client = new QiniuAI({
    apiKey,
    logger: consoleLogger,
    logLevel: 'debug',
});

async function testBasicStreaming() {
    console.log('\n=== Test 1: Basic Text Streaming ===\n');

    const stream = client.chat.createStream({
        model: 'gemini-2.5-flash',
        messages: [
            { role: 'user', content: 'Count from 1 to 5, one number per line.' }
        ],
        temperature: 0.1,
    });

    let fullContent = '';
    let chunkCount = 0;

    process.stdout.write('Response: ');

    for await (const chunk of stream) {
        chunkCount++;
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
            fullContent += delta.content;
            process.stdout.write(delta.content);
        }

        // Check for reasoning_content (some models provide this)
        if (delta?.reasoning_content) {
            console.log('\n[Reasoning]: ', delta.reasoning_content.slice(0, 100) + '...');
        }
    }

    console.log('\n');
    console.log(`✅ Received ${chunkCount} chunks`);
    console.log(`✅ Total content length: ${fullContent.length} chars`);
}

async function testStreamWithAccumulator() {
    console.log('\n=== Test 2: Stream with Accumulator (Final Result) ===\n');

    const stream = client.chat.createStream({
        model: 'gemini-2.5-flash',
        messages: [
            { role: 'user', content: 'What is 2 + 2? Answer in one word.' }
        ],
    });

    // Consume stream but focus on final result
    let result;
    for await (const chunk of stream) {
        // Just consume...
    }

    // The generator returns StreamResult when done
    // Note: In JS, you need to capture the return value differently
    // For now, we'll just verify the stream completes
    console.log('✅ Stream completed successfully');
}

async function testStreamCancellation() {
    console.log('\n=== Test 3: Stream Cancellation ===\n');

    const controller = new AbortController();

    const stream = client.chat.createStream(
        {
            model: 'gemini-2.5-flash',
            messages: [
                { role: 'user', content: 'Write a very long story about a robot.' }
            ],
        },
        { signal: controller.signal }
    );

    let chunks = 0;

    try {
        for await (const chunk of stream) {
            chunks++;
            if (chunks >= 3) {
                console.log(`Cancelling after ${chunks} chunks...`);
                controller.abort();
            }
        }
    } catch (error: any) {
        if (error.message.includes('cancelled') || error.message.includes('abort')) {
            console.log('✅ Stream was cancelled as expected');
        } else {
            throw error;
        }
    }
}

async function main() {
    console.log('🚀 Streaming Chat Verification\n');

    try {
        await testBasicStreaming();
        await testStreamWithAccumulator();
        await testStreamCancellation();

        console.log('\n🎉 All streaming tests passed!');
    } catch (error: any) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

main();
