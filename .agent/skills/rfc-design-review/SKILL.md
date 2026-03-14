---
name: rfc-design-review
description: >
  技术方案 RFC 的自审 + 请求审阅的完整闭环。融入 14 维度自审清单 + 结构化审阅请求模板。
  触发场景：(1) 用户说"自审"、"RFC"、"设计方案"、"design review"、"方案审阅"；
  (2) 完成技术方案设计后需要系统化验证；
  (3) 需要向用户/团队提交方案请求审阅。
  不适用于：业务需求分析（用 prd-deep-review）、代码级 review（用 requesting-code-review）、
  架构决策记录（用 decision-capture）。
---

# RFC Design Review

技术方案 RFC 的自审与请求审阅闭环。

## 核心理念

1. **事实优先**：每条外部依赖必须有权威来源锚点，可被驳斥则必须先修正
2. **杀死"幽灵能力"**：代码存在 ≠ 能力生效，必须验证主链路是否真正消费
3. **先自审再请审**：自审清单暴露的问题越多，审阅轮次越少

## 两阶段流程

```
Phase 1: Self-Review（方案撰写完成后）
  → 按 14 维度逐项验证
  → 输出 self-review.md（通过/发现/待定）

Phase 2: Request Review（自审完成后）
  → 用结构化模板组织方案
  → 明标"请挑战这些决策"
  → 提交审阅
```

### Phase 1: Self-Review

完成方案后，按 [references/self-review-checklist.md](references/self-review-checklist.md) 逐项回答。

**输出格式**：

```markdown
## Self-Review: [方案名称]

### 总览
| 维度 | 状态 | 备注 |
|------|------|------|
| Problem | ✅ / ⚠️ / ❌ | ... |
| Current State | ... | ... |
| External Facts | ... | ... |
...

### 发现项
- [P0] ...
- [P1] ...

### 待定项
- ...
```

**关键规则**：
- 每条 External Fact 必须有可验证的锚点（文件路径 + 行号 或 URL）
- "Main Execution Path" 维度必须 grep/trace 证明新能力真正进入主链路
- "Kill Shot" 维度强制写出 3 个最可能卡死 / 出事故的点

### Phase 2: Request Review

自审完成后，按 [references/review-request-template.md](references/review-request-template.md) 填充并提交审阅。

**关键规则**：
- "Please Challenge These Decisions" 必须列出 ≥3 个待挑战决策
- Background 中必须说明"本轮不解决什么"
- External Dependencies 必须标注版本/日期

## 与其他 Skill 的关系

| Skill | 定位 | 边界 |
|-------|------|------|
| `brainstorming` | 需求探索 + 方案发散 | 在本 skill 之前 |
| **`rfc-design-review`** | **方案自审 + 请求审阅** | 方案已成型，验证和提交 |
| `writing-plans` | 拆解实现计划 | 审阅通过后 |
| `prd-deep-review` | 业务需求分析 | 侧重用户视角和业务语言 |
| `decision-capture` | 决策沉淀（ADR） | 方案确认后记录 |
| `requesting-code-review` | 代码级 review | 实现完成后 |

## Anti-Patterns

| 反模式 | 正确做法 |
|--------|---------|
| 跳过自审直接请审 | 自审暴露的问题越多，审阅效率越高 |
| External Fact 无锚点 | 每条必须有文件:行号 或 URL |
| "类型存在"等于"能力生效" | grep 主链路证明消费路径 |
| Self-Review 全部写 ✅ | 至少有 2-3 个 ⚠️ 才是诚实的审查 |
| RFC 改完不重新自审 | 每轮修改后必须重跑受影响维度 |
