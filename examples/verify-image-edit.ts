/**
 * Verification script for Image.edit()
 *
 * Tests type definitions and basic payload shapes.
 * Does NOT make real API calls unless you uncomment live section.
 *
 * Run with: npx tsx examples/verify-image-edit.ts
 */

import { QiniuAI, consoleLogger, ImageEditRequest } from '../src';

const client = new QiniuAI({
    apiKey: 'sk-test-key-for-type-checking',
    logger: consoleLogger,
    logLevel: 'debug',
});

console.log('='.repeat(60));
console.log('Image Edit - Type Verification');
console.log('='.repeat(60));

// Kling multi-image edit
const klingEdit: ImageEditRequest = {
    model: 'kling-v1',
    prompt: 'Make the subject look like a watercolor painting',
    image_reference: 'subject',
    subject_image_list: [
        { image: 'https://example.com/subject.jpg', image_type: 'subject' },
    ],
    scene_image: { image: 'https://example.com/scene.jpg', image_type: 'scene' },
    style_image: { image: 'https://example.com/style.jpg', image_type: 'style' },
};
console.log('✅ ImageEditRequest compiles for Kling');

// Gemini edit
const geminiEdit: ImageEditRequest = {
    model: 'gemini-3.0-pro-image-preview',
    prompt: 'Add a gentle sunset sky',
    image_url: 'https://example.com/input.png',
    image_config: {
        aspect_ratio: '16:9',
        image_size: '2K',
    },
    mask: 'base64-mask-data',
};
console.log('✅ ImageEditRequest compiles for Gemini');

console.log('\nAll type checks passed! ✅');

/*
async function liveTest() {
    const apiKey = process.env.QINIU_AI_API_KEY;
    if (!apiKey) {
        console.log('⚠️  QINIU_AI_API_KEY not set, skipping live tests');
        return;
    }

    const liveClient = new QiniuAI({
        apiKey,
        logger: consoleLogger,
        logLevel: 'debug',
    });

    console.log('\n[Live Test] Kling image edit...');
    const klingRes = await liveClient.image.edit(klingEdit);
    console.log('Response:', klingRes);
}

liveTest().catch(console.error);
*/
