/**
 * Level 2: 研究助手 Agent（多工具 + 状态持久化）
 * 
 * 学习目标：
 * - 多工具协同工作
 * - Checkpointer 状态持久化
 * - generateTextWithGraph 进阶用法
 * 
 * 运行方式：
 * npx tsx examples/02-research-assistant.ts
 */

import {
    QiniuAI,
    generateTextWithGraph,
    MemoryCheckpointer,
    type Tool,
} from '@bowenqt/qiniu-ai-sdk';

// ============================================================================
// 配置
// ============================================================================

const client = new QiniuAI({
    apiKey: process.env.QINIU_API_KEY || '',
});

const MODEL = 'deepseek-v3';

// 创建内存检查点存储（生产环境可替换为 RedisCheckpointer 或 PostgresCheckpointer）
const checkpointer = new MemoryCheckpointer({ maxItems: 100 });

// ============================================================================
// 模拟数据存储
// ============================================================================

const notesStorage: Map<string, { title: string; content: string; timestamp: Date }> = new Map();

// ============================================================================
// 工具定义（使用 JSON Schema）
// ============================================================================

const tools: Record<string, Tool> = {
    // 工具 1: 网络搜索
    webSearch: {
        description: '搜索互联网获取最新信息',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '搜索关键词' },
                maxResults: { type: 'number', description: '返回结果数量，默认 5' },
            },
            required: ['query'],
        },
        execute: async (args: unknown) => {
            const { query, maxResults = 5 } = args as { query: string; maxResults?: number };
            console.log(`  🔍 搜索: "${query}"`);
            await new Promise(resolve => setTimeout(resolve, 800));

            // 模拟搜索结果
            return {
                query,
                results: [
                    { title: 'AI Agent 发展趋势报告 2026', snippet: '多智能体协作成为主流...', url: 'https://example.com/1' },
                    { title: '企业级 Agent 落地实践', snippet: 'RAG + Agent 组合拳...', url: 'https://example.com/2' },
                    { title: 'Agent 安全与治理', snippet: '工具审批、Guardrails 成标配...', url: 'https://example.com/3' },
                ].slice(0, maxResults),
            };
        },
    },

    // 工具 2: 内容分析
    analyzeContent: {
        description: '分析和总结文本内容，提取关键信息',
        parameters: {
            type: 'object',
            properties: {
                content: { type: 'string', description: '要分析的文本内容' },
                focusAreas: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '关注的重点领域'
                },
            },
            required: ['content'],
        },
        execute: async (args: unknown) => {
            const { focusAreas } = args as { content: string; focusAreas?: string[] };
            console.log(`  📊 分析内容 (关注: ${focusAreas?.join(', ') || '全部'})`);
            await new Promise(resolve => setTimeout(resolve, 600));

            return {
                summary: '分析完成：发现 3 个核心趋势',
                keyPoints: [
                    '多智能体协作成为 2026 年主要发展方向',
                    '工具审批和安全治理日益重要',
                    'RAG + Agent 组合提升企业落地效果',
                ],
                confidence: 0.85,
            };
        },
    },

    // 工具 3: 保存笔记
    saveNote: {
        description: '将研究成果保存为笔记',
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: '笔记标题' },
                content: { type: 'string', description: '笔记内容' },
            },
            required: ['title', 'content'],
        },
        execute: async (args: unknown) => {
            const { title, content } = args as { title: string; content: string };
            console.log(`  💾 保存笔记: "${title}"`);

            const noteId = `note_${Date.now()}`;
            notesStorage.set(noteId, {
                title,
                content,
                timestamp: new Date(),
            });

            return {
                success: true,
                noteId,
                message: `笔记已保存，共 ${content.length} 字`,
            };
        },
    },

    // 工具 4: 列出已有笔记
    listNotes: {
        description: '列出所有已保存的研究笔记',
        parameters: {
            type: 'object',
            properties: {},
        },
        execute: async () => {
            console.log(`  📋 列出笔记`);

            const notes = Array.from(notesStorage.entries()).map(([id, note]) => ({
                id,
                title: note.title,
                preview: note.content.slice(0, 100) + '...',
                timestamp: note.timestamp.toISOString(),
            }));

            return { count: notes.length, notes };
        },
    },
};

// ============================================================================
// 演示 1: 基础多工具协作
// ============================================================================

async function demoBasicMultiTool() {
    console.log('\n📚 演示 1: 多工具协作\n');
    console.log('-'.repeat(50));

    const result = await generateTextWithGraph({
        client,
        model: MODEL,
        prompt: '帮我研究一下 AI Agent 的发展趋势，搜索相关资料，分析后保存一份笔记。',
        tools,
        maxSteps: 10,
        onStepFinish: (step) => {
            if (step.type === 'tool_call') {
                const toolName = step.toolCalls?.[0]?.function.name;
                console.log(`  🔧 → ${toolName}`);
            }
        },
    });

    console.log('\n' + '-'.repeat(50));
    console.log(`🤖 Agent: ${result.text}`);
    console.log(`📊 步数: ${result.steps.length}`);
}

// ============================================================================
// 演示 2: 断点续跑（Checkpointer）
// ============================================================================

async function demoCheckpointerResume() {
    console.log('\n\n💾 演示 2: 断点续跑\n');
    console.log('-'.repeat(50));

    const threadId = 'research-session-001';

    // 第一次对话
    console.log('👤 [对话 1] 用户: 帮我搜索 AI Agent 相关资料');

    const result1 = await generateTextWithGraph({
        client,
        model: MODEL,
        prompt: '帮我搜索 AI Agent 相关资料',
        tools,
        maxSteps: 5,
        checkpointer,
        threadId,
        onStepFinish: (step) => {
            if (step.type === 'tool_call') {
                console.log(`  🔧 → ${step.toolCalls?.[0]?.function.name}`);
            }
        },
    });

    console.log(`🤖 Agent: ${result1.text.slice(0, 100)}...`);

    // 模拟用户离开
    console.log('\n⏸️  [用户离开，会话中断...]\n');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 恢复对话（自动从检查点恢复）
    console.log('▶️  [用户返回，恢复会话]\n');
    console.log('👤 [对话 2] 用户: 基于刚才的搜索结果，帮我保存一份笔记');

    const result2 = await generateTextWithGraph({
        client,
        model: MODEL,
        prompt: '基于刚才的搜索结果，帮我保存一份笔记，标题叫"AI Agent 调研"',
        tools,
        maxSteps: 5,
        checkpointer,
        threadId,
        resumeFromCheckpoint: true,  // 关键：启用检查点恢复
        onStepFinish: (step) => {
            if (step.type === 'tool_call') {
                console.log(`  🔧 → ${step.toolCalls?.[0]?.function.name}`);
            }
        },
    });

    console.log(`🤖 Agent: ${result2.text}`);
    console.log('\n✅ 成功从检查点恢复上下文，Agent 记得之前的搜索结果！');
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
    console.log('🔬 Level 2: 研究助手 Agent');
    console.log('='.repeat(50));

    await demoBasicMultiTool();
    await demoCheckpointerResume();

    console.log('\n\n📋 最终笔记存储:');
    notesStorage.forEach((note, id) => {
        console.log(`  - [${id}] ${note.title}`);
    });
}

// ============================================================================
// 运行
// ============================================================================

main().catch(console.error);
