/**
 * Level 3: 代码审查 Agent（Skills + Memory + Guardrails）
 * 
 * 学习目标：
 * - Skills 注入专业知识
 * - MemoryManager 短期+长期记忆
 * - Guardrails 输入/输出安全过滤
 * - 上下文压缩 (maxContextTokens)
 * 
 * 运行方式：
 * npx tsx examples/03-code-review-agent.ts
 */

import {
    QiniuAI,
    generateTextWithGraph,
    MemoryManager,
    type Skill,
    type Guardrail,
    type GuardrailContext,
    type GuardrailResult,
    type Tool,
} from '@bowenqt/qiniu-ai-sdk';

// ============================================================================
// 配置
// ============================================================================

const client = new QiniuAI({
    apiKey: process.env.QINIU_API_KEY || '',
});

const MODEL = 'deepseek-v3';

// ============================================================================
// Skills 定义（模拟 SkillLoader 加载的内容）
// ============================================================================

/**
 * 代码审查规范 Skill
 * 实际项目中使用 SkillLoader 从 .md 文件加载
 */
const codeReviewSkill: Skill = {
    name: 'code-review-standards',
    content: `# 代码审查规范

## 审查重点

### 1. 代码质量
- 命名清晰、语义化
- 函数单一职责，不超过 50 行
- 避免魔法数字，使用常量

### 2. 安全性
- 输入验证和消毒
- 避免 SQL 注入、XSS
- 敏感信息不硬编码

### 3. 性能
- 避免 N+1 查询
- 合理使用缓存
- 异步操作不阻塞主线程

### 4. 可维护性
- 适当注释复杂逻辑
- 错误处理完善
- 遵循项目代码风格

## 审查输出格式

1. **问题等级**: Critical / Major / Minor / Suggestion
2. **问题位置**: 文件名:行号
3. **问题描述**: 具体问题
4. **修复建议**: 如何改进
`,
    references: [],
    tokenCount: 300,
};

const securitySkill: Skill = {
    name: 'security-checklist',
    content: `# 安全检查清单

- [ ] 输入验证
- [ ] 身份认证
- [ ] 授权检查
- [ ] 日志审计
- [ ] 敏感数据加密
`,
    references: [],
    tokenCount: 100,
};

// ============================================================================
// Memory 配置
// ============================================================================

const memory = new MemoryManager({
    shortTerm: {
        maxMessages: 20,
    },
    summarizer: {
        enabled: true,
        threshold: 15,
        type: 'llm',
        client,
        model: MODEL,
        systemPrompt: '简洁总结对话中的关键审查意见和代码问题。',
    },
    tokenBudget: {
        summary: 300,
        context: 1000,
        active: 3000,
    },
});

// ============================================================================
// Guardrails 配置（实现 Guardrail 接口）
// ============================================================================

/**
 * 输入过滤：屏蔽可能的恶意代码注入
 */
const inputGuardrail: Guardrail = {
    name: 'input-filter',
    phase: 'pre-request',
    async process(context: GuardrailContext): Promise<GuardrailResult> {
        const blockedPatterns = [
            /eval\s*\(/gi,          // 阻止 eval
            /document\.cookie/gi,   // 阻止 cookie 访问
            /__proto__/gi,          // 阻止原型污染
        ];

        for (const pattern of blockedPatterns) {
            if (pattern.test(context.content)) {
                console.log(`  🛡️  输入被过滤: 检测到可疑模式`);
                return {
                    action: 'block',
                    reason: `检测到可疑代码模式: ${pattern.source}`,
                    guardrailName: 'input-filter',
                };
            }
        }

        // 检查最大长度
        if (context.content.length > 50000) {
            return {
                action: 'block',
                reason: '输入内容超过最大长度限制',
                guardrailName: 'input-filter',
            };
        }

        return { action: 'pass', guardrailName: 'input-filter' };
    },
};

/**
 * 输出过滤：防止泄露敏感信息
 */
const outputGuardrail: Guardrail = {
    name: 'output-redactor',
    phase: 'post-response',
    async process(context: GuardrailContext): Promise<GuardrailResult> {
        const redactPatterns = [
            { pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: '[API_KEY_REDACTED]' },
            { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, replacement: 'password: "[REDACTED]"' },
        ];

        let modifiedContent = context.content;
        let wasRedacted = false;

        for (const { pattern, replacement } of redactPatterns) {
            if (pattern.test(modifiedContent)) {
                modifiedContent = modifiedContent.replace(pattern, replacement);
                wasRedacted = true;
            }
        }

        if (wasRedacted) {
            console.log(`  🔒 输出已脱敏`);
            return {
                action: 'redact',
                modifiedContent,
                reason: '敏感信息已脱敏',
                guardrailName: 'output-redactor',
            };
        }

        return { action: 'pass', guardrailName: 'output-redactor' };
    },
};

// ============================================================================
// 工具定义
// ============================================================================

const tools: Record<string, Tool> = {
    // 获取代码文件（模拟）
    getCodeFile: {
        description: '获取指定文件的代码内容',
        parameters: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: '文件路径' },
            },
            required: ['filePath'],
        },
        execute: async (args: unknown) => {
            const { filePath } = args as { filePath: string };
            console.log(`  📄 读取文件: ${filePath}`);

            // 模拟代码文件
            const codeExamples: Record<string, string> = {
                'user-service.ts': `
// user-service.ts
export class UserService {
    private db: Database;
    
    async getUser(id: string) {
        // 问题1: SQL 注入风险
        const query = "SELECT * FROM users WHERE id = '" + id + "'";
        return this.db.query(query);
    }
    
    async updatePassword(userId: string, newPassword: string) {
        // 问题2: 密码明文存储
        await this.db.update('users', { id: userId, password: newPassword });
        
        // 问题3: 硬编码敏感信息
        const apiKey = "sk-1234567890abcdef";
        await this.notifyService(apiKey);
    }
}
`,
                'api-handler.ts': `
// api-handler.ts
export async function handleRequest(req: Request) {
    const data = JSON.parse(req.body);
    
    // 问题: 未验证输入
    return processData(data);
}
`,
            };

            return {
                filePath,
                content: codeExamples[filePath] || '// 文件未找到',
                language: 'typescript',
            };
        },
    },

    // 保存审查报告
    saveReviewReport: {
        description: '保存代码审查报告',
        parameters: {
            type: 'object',
            properties: {
                filePath: { type: 'string', description: '被审查的文件' },
                issues: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            severity: { type: 'string', enum: ['critical', 'major', 'minor', 'suggestion'] },
                            line: { type: 'number' },
                            description: { type: 'string' },
                            suggestion: { type: 'string' },
                        },
                        required: ['severity', 'description', 'suggestion'],
                    },
                    description: '发现的问题列表',
                },
            },
            required: ['filePath', 'issues'],
        },
        execute: async (args: unknown) => {
            const { filePath, issues } = args as {
                filePath: string;
                issues: Array<{ severity: string; line?: number; description: string; suggestion: string }>
            };
            console.log(`  📝 保存审查报告: ${filePath}`);

            const stats = {
                critical: issues.filter(i => i.severity === 'critical').length,
                major: issues.filter(i => i.severity === 'major').length,
                minor: issues.filter(i => i.severity === 'minor').length,
                suggestion: issues.filter(i => i.severity === 'suggestion').length,
            };

            return {
                success: true,
                filePath,
                issueCount: issues.length,
                stats,
                message: `审查报告已保存，发现 ${stats.critical} 个严重问题`,
            };
        },
    },
};

// ============================================================================
// 主函数
// ============================================================================

async function main() {
    console.log('🔍 Level 3: 代码审查 Agent');
    console.log('='.repeat(50));
    console.log('\n📚 加载 Skills:');
    console.log(`  - ${codeReviewSkill.name} (${codeReviewSkill.tokenCount} tokens)`);
    console.log(`  - ${securitySkill.name} (${securitySkill.tokenCount} tokens)`);
    console.log('\n🛡️  Guardrails: 输入过滤 + 输出脱敏\n');
    console.log('-'.repeat(50));

    // 用户请求审查
    const userRequest = '请审查 user-service.ts 文件，特别关注安全问题';
    console.log(`👤 用户: ${userRequest}\n`);

    const result = await generateTextWithGraph({
        client,
        model: MODEL,
        prompt: userRequest,
        tools,
        skills: [codeReviewSkill, securitySkill],
        memory,
        guardrails: [inputGuardrail, outputGuardrail],
        maxSteps: 10,
        maxContextTokens: 8000,  // 超过时会压缩 skills 和历史消息
        onStepFinish: (step) => {
            if (step.type === 'tool_call') {
                console.log(`  🔧 → ${step.toolCalls?.[0]?.function.name}`);
            }
        },
        onNodeEnter: (node) => {
            if (node === 'predict') {
                console.log(`  💭 生成中...`);
            }
        },
    });

    console.log('\n' + '-'.repeat(50));
    console.log(`🤖 Agent 审查报告:\n\n${result.text}`);

    // 显示执行信息
    console.log('\n📊 执行统计:');
    console.log(`   - 步数: ${result.steps.length}`);
    console.log(`   - 注入 Skills: ${result.graphInfo?.skillsInjected?.join(', ')}`);

    if (result.graphInfo?.compaction?.occurred) {
        console.log(`   - ⚠️  发生压缩: 丢弃 ${result.graphInfo.compaction.droppedSkills.length} 个 Skills`);
    }
}

// ============================================================================
// 运行
// ============================================================================

main().catch(console.error);
