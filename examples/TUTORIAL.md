# Agent 编排教程 | Agent Orchestration Tutorial

> 从零构建智能 Agent：从单工具调用到多智能体协作

本教程通过 **4 个渐进式示例**，展示如何使用 Qiniu AI SDK 构建具有逻辑编排能力的 Agent。

---

## 运行前准备

```bash
# 安装依赖
npm install @bowenqt/qiniu-ai-sdk zod

# 设置环境变量
export QINIU_API_KEY="sk-xxxxxxxx"
```

---

## 示例目录

| Level | 文件 | 主题 | 核心能力 |
|-------|------|------|----------|
| 🟢 L1 | [01-basic-weather-agent.ts](./01-basic-weather-agent.ts) | 天气查询 Agent | `generateText` + 单工具 |
| 🟡 L2 | [02-research-assistant.ts](./02-research-assistant.ts) | 研究助手 Agent | 多工具 + Checkpointer 断点续跑 |
| 🟠 L3 | [03-code-review-agent.ts](./03-code-review-agent.ts) | 代码审查 Agent | Skills 注入 + Memory + Guardrails |
| 🔴 L4 | [04-content-crew.ts](./04-content-crew.ts) | 内容创作团队 | Crew 多智能体编排 |

---

## 🟢 Level 1: 基础 - 单工具 Agent

**场景**：用户问天气，Agent 调用天气工具返回结果。

**学习目标**：
- `generateText` 基本用法
- 工具定义（JSON Schema / Zod）
- 工具执行流程

```
User: "北京今天天气怎么样？"
   ↓
Agent: 识别意图 → 调用 getWeather(city: "北京")
   ↓
Tool: 返回 { temperature: 25, condition: "晴" }
   ↓
Agent: "北京今天天气晴朗，气温 25°C"
```

---

## 🟡 Level 2: 中级 - 多工具协作 + 状态持久化

**场景**：研究助手帮用户搜索资料、保存笔记、生成摘要。支持中断后恢复。

**学习目标**：
- 多工具协同（搜索 → 分析 → 保存）
- `Checkpointer` 状态持久化
- `runResumableWithThread` / `resumeThread` 断点续跑

```
User: "帮我研究一下 AI Agent 的发展趋势"
   ↓
Agent: search("AI Agent trends") 
   ↓ 保存检查点
[用户离开，稍后返回]
   ↓ 恢复检查点
Agent: 继续执行 → analyze() → saveNote()
   ↓
Agent: "已完成研究并保存笔记，发现 3 个主要趋势..."
```

---

## 🟠 Level 3: 高级 - Skills + Memory + Guardrails

**场景**：代码审查 Agent，具有专业知识、历史记忆和安全过滤。

**学习目标**：
- `Skills` 注入专业知识（代码规范）
- `MemoryManager` 短期+长期记忆
- `Guardrails` 输入/输出安全过滤
- 上下文压缩 (`maxContextTokens`)

```
[加载 Skills: code-review-guidelines.md]
   ↓
User: "审查这段代码"
   ↓
Agent: 检索历史审查记录 (Memory)
   ↓
Agent: 应用 Skills 知识 → 生成审查意见
   ↓
Guardrails: 过滤敏感信息
   ↓
Agent: "发现 3 个问题：1. 未处理空指针..."
```

---

## 🔴 Level 4: 专家 - 多智能体团队编排

**场景**：内容创作团队，包含 Researcher、Writer、Editor 三个专业 Agent 协作。

**学习目标**：
- `createSequentialCrew` / `createParallelCrew` / `createHierarchicalCrew` 多智能体编排
- 顺序/并行/层级编排模式
- 智能体间消息传递
- 任务分解与聚合

```
User: "写一篇关于量子计算的科普文章"
   ↓
┌─────────────────────────────────────────┐
│            Orchestrator                  │
├─────────────────────────────────────────┤
│  Researcher    →    Writer    →   Editor │
│  (搜索资料)        (撰写初稿)     (润色发布) │
└─────────────────────────────────────────┘
   ↓
Agent: "文章已完成：《量子计算入门：从比特到量子比特》"
```

---

## 进阶主题

完成以上示例后，可继续探索：

- **MCP 集成**：连接外部工具服务器 ([COOKBOOK #20](../COOKBOOK.md#20-nodemcphost-integration))
- **工具审批 (HITL)**：敏感操作人工确认 ([COOKBOOK #18](../COOKBOOK.md#18-tool-approval-hitl))
- **Prometheus 监控**：生产环境指标导出 ([COOKBOOK #23b](../COOKBOOK.md#23b-structured-telemetry---prometheus-export-v0320))
- **Vercel AI SDK 适配**：前端流式显示 ([COOKBOOK #8](../COOKBOOK.md#8-vercel-ai-sdk-integration))

---

## 常见问题

### Q: 运行报错 "API Key invalid"
确保设置了正确的环境变量：`export QINIU_API_KEY="sk-xxx"`

### Q: 工具没有被调用
检查 `maxSteps` 是否设置得足够大（默认为 1，意味着不会进入工具循环）

### Q: 如何调试 Agent 执行过程？
使用 `onStepFinish` 回调打印每一步：
```typescript
onStepFinish: (step) => console.log(`[${step.type}]`, step.content?.slice(0, 100))
```

---

*Built with ❤️ using @bowenqt/qiniu-ai-sdk v0.49.1*
