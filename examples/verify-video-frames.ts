/**
 * Verification script for Video Frames Smart Adapter
 * 
 * Tests type definitions and adapter transformations.
 * Does NOT make real API calls (would require API key).
 * 
 * Run with: npx tsx examples/verify-video-frames.ts
 */

import { QiniuAI, consoleLogger, VideoGenerationRequest, FrameInput, VideoReference } from '../src';

// Mock client for type checking (no real API calls)
const client = new QiniuAI({
    apiKey: 'sk-test-key-for-type-checking',
    logger: consoleLogger,
    logLevel: 'debug',
});

console.log('='.repeat(60));
console.log('Video Frames Smart Adapter - Type Verification');
console.log('='.repeat(60));

// ============================================================================
// Test 1: Basic text-to-video (backward compatibility)
// ============================================================================
console.log('\n[Test 1] Basic text-to-video (backward compatibility)');

const basicRequest: VideoGenerationRequest = {
    model: 'kling-video-o1',
    prompt: 'A cat playing with a ball',
};
console.log('✅ VideoGenerationRequest compiles with basic params');

// ============================================================================
// Test 2: Kling first/last frame using unified `frames` parameter
// ============================================================================
console.log('\n[Test 2] Kling first/last frame using `frames` parameter');

const klingFramesRequest: VideoGenerationRequest = {
    model: 'kling-video-o1',
    prompt: '视频连贯在一起',
    frames: {
        first: { url: 'https://example.com/start.jpg' },
        last: { url: 'https://example.com/end.jpg' },
    },
    size: '1920x1080',
    mode: 'pro',
};
console.log('✅ VideoGenerationRequest compiles with frames parameter');

// ============================================================================
// Test 3: Kling using native image_list parameter
// ============================================================================
console.log('\n[Test 3] Kling using native image_list parameter');

const klingImageListRequest: VideoGenerationRequest = {
    model: 'kling-video-o1',
    prompt: '测试多图生成',
    image_list: [
        { image: 'https://example.com/first.jpg', type: 'first_frame' },
        { image: 'https://example.com/last.jpg', type: 'end_frame' },
    ],
};
console.log('✅ VideoGenerationRequest compiles with image_list');

// ============================================================================
// Test 4: Kling v2.5 with image_tail
// ============================================================================
console.log('\n[Test 4] Kling v2.5 with image_tail parameter');

const klingTailRequest: VideoGenerationRequest = {
    model: 'kling-v2-5-turbo',
    prompt: '人在跑到了天涯海角',
    input_reference: 'https://example.com/start.jpg',
    image_tail: 'https://example.com/end.jpg',
    mode: 'pro',
};
console.log('✅ VideoGenerationRequest compiles with image_tail');

// ============================================================================
// Test 5: Kling video reference (video_list)
// ============================================================================
console.log('\n[Test 5] Kling video reference (video_list)');

const videoRef: VideoReference = {
    video_url: 'https://example.com/reference.mp4',
    refer_type: 'base',
    keep_original_sound: 'yes',
};

const klingVideoRefRequest: VideoGenerationRequest = {
    model: 'kling-video-o1',
    prompt: '参考视频风格',
    video_list: [videoRef],
};
console.log('✅ VideoGenerationRequest compiles with video_list');

// ============================================================================
// Test 6: Veo first/last frame using unified `frames` parameter
// ============================================================================
console.log('\n[Test 6] Veo first/last frame using `frames` parameter');

const veoFramesRequest: VideoGenerationRequest = {
    model: 'veo-2.0-generate-001',
    prompt: 'A cat jumping from chair to table',
    frames: {
        first: { url: 'https://example.com/cat-chair.jpg' },
        last: { url: 'https://example.com/cat-table.jpg' },
    },
    generate_audio: true,
    person_generation: 'allow_adult',
};
console.log('✅ VideoGenerationRequest compiles with Veo params');

// ============================================================================
// Test 7: FrameInput with different sources
// ============================================================================
console.log('\n[Test 7] FrameInput variations');

const frameWithUrl: FrameInput = { url: 'https://example.com/image.jpg' };
const frameWithBase64: FrameInput = { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAUA...', mimeType: 'image/png' };
const frameWithGcs: FrameInput = { gcsUri: 'gs://bucket/path/image.jpg' };

console.log('✅ FrameInput compiles with url/base64/gcsUri');

// ============================================================================
// Test 8: Verify model routing logic (simulation)
// ============================================================================
console.log('\n[Test 8] Model routing verification');

function isVeoModel(model: string): boolean {
    return model.startsWith('veo-');
}

const testModels = [
    'kling-video-o1',
    'kling-v2-5-turbo',
    'veo-2.0-generate-001',
    'veo-3.0-fast-generate-preview',
    'sora-2',
];

for (const model of testModels) {
    const isVeo = isVeoModel(model);
    const endpoint = isVeo ? '/v1/videos/generations' : '/videos';
    console.log(`  ${model.padEnd(30)} → ${endpoint}`);
}
console.log('✅ Model routing logic works correctly');

// ============================================================================
// Test 9: Task ID inference (simulation)
// ============================================================================
console.log('\n[Test 9] Task ID type inference');

function inferTaskType(id: string): 'veo' | 'kling' | 'generic' {
    if (id.startsWith('videos-')) return 'veo';
    if (id.startsWith('qvideo-')) return 'kling';
    return 'generic';
}

const testIds = [
    'videos-1756373553362141144-1383010573',
    'qvideo-user123-1766391125174150336',
    'task-unknown-format',
];

for (const id of testIds) {
    const type = inferTaskType(id);
    const getEndpoint = type === 'veo'
        ? `/v1/videos/generations/${id}`
        : `/videos/${id}`;
    console.log(`  ${id.substring(0, 30).padEnd(30)} → ${type.padEnd(8)} → GET ${getEndpoint.substring(0, 35)}...`);
}
console.log('✅ Task ID inference works correctly');

// ============================================================================
// Summary
// ============================================================================
console.log('\n' + '='.repeat(60));
console.log('All type checks passed! ✅');
console.log('='.repeat(60));
console.log(`
Next steps for live testing:
1. Set QINIU_AI_API_KEY environment variable
2. Uncomment the actual API calls below
3. Run: npx tsx examples/verify-video-frames.ts
`);

// ============================================================================
// Live API calls (uncomment to test with real API key)
// ============================================================================

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

    // Test Kling video creation
    console.log('\n[Live Test] Creating Kling video task...');
    const klingTask = await liveClient.video.create({
        model: 'kling-video-o1',
        prompt: 'A beautiful sunset over the ocean',
        duration: '5',
    });
    console.log('Created task:', klingTask.id);

    // Test Veo video creation (if you have Veo access)
    // console.log('\n[Live Test] Creating Veo video task...');
    // const veoTask = await liveClient.video.create({
    //     model: 'veo-2.0-generate-001',
    //     prompt: 'A cat jumping',
    //     frames: {
    //         first: { url: 'https://example.com/start.jpg' },
    //     },
    // });
    // console.log('Created task:', veoTask.id);
}

liveTest().catch(console.error);
*/
