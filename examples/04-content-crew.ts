/**
 * Level 4: 内容创作团队（Crew 多智能体编排）
 * 
 * 学习目标：
 * - createCrew 多智能体编排
 * - 顺序编排模式（sequential）
 * - 智能体间消息传递
 * - 任务分解与聚合
 * 
 * 运行方式：
 * npx tsx examples/04-content-crew.ts
 */

import {
    QiniuAI,
    createCrew,
    createAgent,
    MemoryCheckpointer,
} from '@bowenqt/qiniu-ai-sdk';
import { z } from 'zod';

// ============================================================================
// 配置
// ============================================================================

const client = new QiniuAI({
    apiKey: process.env.QINIU_API_KEY || '',
});

const MODEL = 'deepseek-v3';
const FAST_MODEL = 'gemini-2.5-flash';

// ============================================================================
// 共享存储（模拟团队协作空间）
// ============================================================================

interface ResearchData {
    topic: string;
    sources: Array<{ title: string; summary: string; url: string }>;
    keyPoints: string[];
}

interface DraftArticle {
    title: string;
    sections: Array<{ heading: string; content: string }>;
    wordCount: number;
}

const teamWorkspace = {
    research: null as ResearchData | null,
    draft: null as DraftArticle | null,
    finalArticle: null as string | null,
};

// ============================================================================
// Agent 1: Researcher（研究员）
// ============================================================================

const researcherTools = {
    webSearch: {
        description: '搜索互联网获取资料',
        parameters: z.object({
            query: z.string(),
            maxResults: z.number().default(5),
        }),
        execute: async ({ query, maxResults }: { query: string; maxResults: number }) => {
            console.log(`    🔍 搜索: "${query}"`);
            await new Promise(r => setTimeout(r, 500));

            return {
                results: [
                    { title: '量子计算基础原理', summary: '量子比特与叠加态...', url: 'https://example.com/1' },
                    { title: '量子计算商业应用', summary: '金融、制药、密码学...', url: 'https://example.com/2' },
                    { title: '量子计算发展现状', summary: 'IBM、Google、阿里巴巴...', url: 'https://example.com/3' },
                ].slice(0, maxResults),
            };
        },
    },

    saveResearch: {
        description: '保存研究成果到团队空间',
        parameters: z.object({
            topic: z.string(),
            sources: z.array(z.object({
                title: z.string(),
                summary: z.string(),
                url: z.string(),
            })),
            keyPoints: z.array(z.string()),
        }),
        execute: async (data: ResearchData) => {
            console.log(`    💾 保存研究成果: ${data.keyPoints.length} 个要点`);
            teamWorkspace.research = data;
            return { success: true, message: '研究成果已保存' };
        },
    },
};

const researcher = createAgent({
    client,
    model: MODEL,
    system: `你是一位资深研究员，擅长快速搜集和整理资料。
    
你的工作流程：
1. 搜索相关资料
2. 提取关键信息
3. 总结要点并保存到团队空间

输出要求：结构化、客观、引用来源。`,
    tools: researcherTools,
    maxSteps: 8,
    temperature: 0.3,
});

// ============================================================================
// Agent 2: Writer（撰稿人）
// ============================================================================

const writerTools = {
    getResearch: {
        description: '获取研究员的研究成果',
        parameters: z.object({}),
        execute: async () => {
            console.log(`    📖 读取研究成果`);
            return teamWorkspace.research || { error: '暂无研究成果' };
        },
    },

    saveDraft: {
        description: '保存文章草稿到团队空间',
        parameters: z.object({
            title: z.string(),
            sections: z.array(z.object({
                heading: z.string(),
                content: z.string(),
            })),
        }),
        execute: async (data: { title: string; sections: Array<{ heading: string; content: string }> }) => {
            console.log(`    ✍️  保存草稿: "${data.title}"`);
            const wordCount = data.sections.reduce((sum, s) => sum + s.content.length, 0);
            teamWorkspace.draft = { ...data, wordCount };
            return { success: true, wordCount, message: `草稿已保存，共 ${wordCount} 字` };
        },
    },
};

const writer = createAgent({
    client,
    model: MODEL,
    system: `你是一位科普作家，擅长将复杂概念用通俗易懂的语言解释。

你的工作流程：
1. 获取研究员的研究成果
2. 基于研究成果撰写科普文章
3. 保存草稿到团队空间

写作风格：
- 开篇引人入胜
- 使用类比解释复杂概念
- 结构清晰，层次分明
- 字数 800-1500 字`,
    tools: writerTools,
    maxSteps: 10,
    temperature: 0.7,
});

// ============================================================================
// Agent 3: Editor（编辑）
// ============================================================================

const editorTools = {
    getDraft: {
        description: '获取撰稿人的草稿',
        parameters: z.object({}),
        execute: async () => {
            console.log(`    📄 读取草稿`);
            return teamWorkspace.draft || { error: '暂无草稿' };
        },
    },

    publishArticle: {
        description: '发布最终文章',
        parameters: z.object({
            title: z.string(),
            content: z.string(),
            publishNotes: z.string().optional(),
        }),
        execute: async (data: { title: string; content: string; publishNotes?: string }) => {
            console.log(`    🚀 发布文章: "${data.title}"`);
            teamWorkspace.finalArticle = `# ${data.title}\n\n${data.content}`;
            return {
                success: true,
                message: '文章已发布',
                url: 'https://example.com/articles/quantum-computing-101',
            };
        },
    },
};

const editor = createAgent({
    client,
    model: FAST_MODEL,
    system: `你是一位资深编辑，负责文章的最终审核和润色。

你的工作流程：
1. 获取撰稿人的草稿
2. 进行润色和改进（保持原意，提升可读性）
3. 发布最终文章

审核重点：
- 标题吸引力
- 内容准确性
- 语言流畅度
- 结构完整性`,
    tools: editorTools,
    maxSteps: 6,
    temperature: 0.5,
});

// ============================================================================
// 主函数
// ============================================================================

async function main() {
    console.log('👥 Level 4: 内容创作团队 (Crew 多智能体编排)');
    console.log('='.repeat(60));
    console.log('\n🎯 任务: 写一篇关于量子计算的科普文章\n');
    console.log('┌────────────────────────────────────────────────────────┐');
    console.log('│  Researcher  ──→  Writer  ──→  Editor                 │');
    console.log('│  (搜索资料)      (撰写初稿)    (润色发布)               │');
    console.log('└────────────────────────────────────────────────────────┘\n');

    const topic = '量子计算';

    // ========== Stage 1: Researcher ==========
    console.log('📍 Stage 1: Researcher (研究员)');
    console.log('-'.repeat(50));

    const researchResult = await researcher.run({
        prompt: `请研究以下主题并保存研究成果: "${topic}"
        
要求：
1. 搜索 3-5 个可靠来源
2. 提取 5 个核心要点
3. 保存到团队空间`,
        onStepFinish: step => {
            if (step.type === 'tool_call') {
                console.log(`  🔧 ${step.toolCalls?.[0]?.function.name}`);
            }
        },
    });

    console.log(`  ✅ 研究完成: ${teamWorkspace.research?.keyPoints.length || 0} 个要点\n`);

    // ========== Stage 2: Writer ==========
    console.log('📍 Stage 2: Writer (撰稿人)');
    console.log('-'.repeat(50));

    const writeResult = await writer.run({
        prompt: `基于研究员的成果，撰写一篇关于 "${topic}" 的科普文章。

要求：
1. 先获取研究成果
2. 撰写 800-1500 字的科普文章
3. 保存草稿到团队空间`,
        onStepFinish: step => {
            if (step.type === 'tool_call') {
                console.log(`  🔧 ${step.toolCalls?.[0]?.function.name}`);
            }
        },
    });

    console.log(`  ✅ 撰稿完成: ${teamWorkspace.draft?.wordCount || 0} 字\n`);

    // ========== Stage 3: Editor ==========
    console.log('📍 Stage 3: Editor (编辑)');
    console.log('-'.repeat(50));

    const editResult = await editor.run({
        prompt: `审核并发布撰稿人的文章草稿。

要求：
1. 获取草稿
2. 进行必要的润色
3. 发布最终版本`,
        onStepFinish: step => {
            if (step.type === 'tool_call') {
                console.log(`  🔧 ${step.toolCalls?.[0]?.function.name}`);
            }
        },
    });

    console.log(`  ✅ 发布完成\n`);

    // ========== 最终成果 ==========
    console.log('='.repeat(60));
    console.log('📰 最终发布的文章:\n');
    console.log(teamWorkspace.finalArticle || '(文章生成失败)');
    console.log('\n' + '='.repeat(60));

    // 统计
    console.log('\n📊 团队协作统计:');
    console.log(`   - 研究来源: ${teamWorkspace.research?.sources.length || 0} 个`);
    console.log(`   - 核心要点: ${teamWorkspace.research?.keyPoints.length || 0} 个`);
    console.log(`   - 文章字数: ${teamWorkspace.draft?.wordCount || 0} 字`);
}

// ============================================================================
// 运行
// ============================================================================

main().catch(console.error);
