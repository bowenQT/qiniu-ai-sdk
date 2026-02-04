/**
 * Level 1: 基础天气查询 Agent
 * 
 * 学习目标：
 * - generateText 基本用法
 * - 工具定义（JSON Schema）
 * - 工具执行流程
 * 
 * 运行方式：
 * npx tsx examples/01-basic-weather-agent.ts
 */

import { QiniuAI, generateText, type Tool } from '@bowenqt/qiniu-ai-sdk';

// ============================================================================
// 配置
// ============================================================================

const client = new QiniuAI({
    apiKey: process.env.QINIU_API_KEY || '',
});

const MODEL = 'gemini-2.5-flash';

// ============================================================================
// 工具定义
// ============================================================================

/**
 * 模拟天气 API
 * 实际项目中可替换为真实 API 调用
 */
async function fetchWeather(city: string): Promise<{
    temperature: number;
    condition: string;
    humidity: number;
}> {
    // 模拟 API 延迟
    await new Promise(resolve => setTimeout(resolve, 500));

    // 模拟数据（实际项目中调用真实 API）
    const mockData: Record<string, { temperature: number; condition: string; humidity: number }> = {
        '北京': { temperature: 25, condition: '晴', humidity: 40 },
        '上海': { temperature: 28, condition: '多云', humidity: 65 },
        '深圳': { temperature: 32, condition: '阵雨', humidity: 80 },
        'Beijing': { temperature: 25, condition: 'Sunny', humidity: 40 },
        'Shanghai': { temperature: 28, condition: 'Cloudy', humidity: 65 },
    };

    return mockData[city] || { temperature: 20, condition: '未知', humidity: 50 };
}

// 使用 JSON Schema 定义工具参数
const tools: Record<string, Tool> = {
    getWeather: {
        description: '获取指定城市的天气信息 / Get weather information for a city',
        parameters: {
            type: 'object',
            properties: {
                city: {
                    type: 'string',
                    description: '城市名称，如 "北京"、"Shanghai"'
                },
            },
            required: ['city'],
        },
        execute: async (args: unknown) => {
            const { city } = args as { city: string };
            console.log(`  📡 调用天气 API: ${city}`);
            const weather = await fetchWeather(city);
            return {
                city,
                ...weather,
                // 返回结构化数据，Agent 会用自然语言解释
            };
        },
    },
};

// ============================================================================
// 主函数
// ============================================================================

async function main() {
    console.log('🌤️  Level 1: 基础天气查询 Agent\n');
    console.log('='.repeat(50));

    // 用户输入
    const userQuery = '北京和上海今天天气怎么样？哪个更适合户外活动？';
    console.log(`👤 用户: ${userQuery}\n`);

    // 调用 Agent
    const result = await generateText({
        client,
        model: MODEL,
        prompt: userQuery,
        tools,
        maxSteps: 5,  // 允许最多 5 步（重要！默认为 1 不会触发工具调用）
        temperature: 0.7,
        onStepFinish: (step) => {
            // 打印每一步执行情况
            if (step.type === 'text') {
                console.log(`  💭 思考中...`);
            } else if (step.type === 'tool_call') {
                console.log(`  🔧 调用工具: ${step.toolCalls?.[0]?.function.name}`);
            } else if (step.type === 'tool_result') {
                console.log(`  ✅ 工具返回结果`);
            }
        },
    });

    console.log('\n' + '='.repeat(50));
    console.log(`🤖 Agent: ${result.text}`);
    console.log('\n📊 执行统计:');
    console.log(`   - 总步数: ${result.steps.length}`);
    console.log(`   - Token 使用: ${result.usage?.total_tokens || 'N/A'}`);
    console.log(`   - 完成原因: ${result.finishReason}`);
}

// ============================================================================
// 运行
// ============================================================================

main().catch(console.error);
