---
description: Sync critical documentation after major changes (README, COOKBOOK, agent.md)
---

# /sync-docs Workflow

在较大修改或版本发布后，同步更新核心文档。

## 触发时机

- 新版本发布后
- 添加新 feature/API 后
- 架构变更后
- 用户手动触发 `/sync-docs`

---

## 步骤

### 1. 收集变更信息

```bash
# 查看最近的 CHANGELOG 条目
head -100 CHANGELOG.md
```

```bash
# 查看 package.json 版本
grep '"version"' package.json
```

### 2. 分析 src/ 目录结构变化

```bash
# 统计各目录文件数和行数
find src -name "*.ts" | head -50
```

### 3. 更新 agent.md

更新 `.agent/agent.md` 包含：
- 版本号同步
- 快速索引链接保持有效
- 精简架构概览与环境变量/开发命令
- 环境变量更新

// turbo
```bash
# 检查 agent.md 当前版本
grep -E "^>.*v[0-9]" .agent/agent.md
```

### 3b. 更新治理文档

按需更新以下治理文档：
- `AGENTS.md`
- `.trellis/spec/sdk/architecture.md`
- `.trellis/spec/sdk/verification-matrix.md`
- `.agent/agent.md` 中指向 `.trellis/` 的链接（如果路由变化）

适用场景：
- 架构边界变化
- 导出面/验证要求变化
- `.agent/` / `.trellis/` 的职责变化

### 4. 更新 README.md (英文)

更新根目录 `README.md`:
- 版本徽章
- 新增功能列表
- 安装/使用示例更新
- API 变更说明

### 5. 更新 README.zh-CN.md (中文)

同步更新 `README.zh-CN.md`:
- 与英文版保持结构一致
- 使用简体中文翻译

### 6. 更新 COOKBOOK.md

更新 `COOKBOOK.md` 实战指南：
- 新增使用场景
- 更新代码示例
- 新 API 的最佳实践

### 7. 验证文档一致性

检查关键信息是否一致：
- 版本号
- API 签名
- 功能列表
- `.trellis/spec/**` 链接存在
- `AGENTS.md` 指向的治理文档存在
- 若架构/导出/验证要求变化，对应 `.trellis/spec/*` 已同步
- `.claude/CLAUDE.md` import 目标仍然存在

// turbo
```bash
# 对比版本号
echo "=== 版本号检查 ==="
grep '"version"' package.json
grep -E "^>.*v[0-9]" .agent/agent.md
head -5 README.md | grep -E "v[0-9]" || echo "README 无版本号"
```

```bash
# 检查治理文档目标存在
test -f AGENTS.md
test -f .trellis/spec/sdk/architecture.md
test -f .trellis/spec/sdk/verification-matrix.md
test -f .trellis/spec/guides/index.md
test -f .claude/CLAUDE.md
```

---

## 文件清单

| 文件 | 语言 | 内容 |
|------|------|------|
| `.agent/agent.md` | 中文 | Agent 上下文 (架构/API/开发命令) |
| `AGENTS.md` | English | Codex + human router for repo governance |
| `.trellis/spec/sdk/architecture.md` | English | Stable architecture reference |
| `.trellis/spec/sdk/verification-matrix.md` | English | Verification expectations by change area |
| `README.md` | English | 项目主页 (安装/快速开始/API) |
| `README.zh-CN.md` | 中文 | 中文版主页 |
| `COOKBOOK.md` | 双语 | 实战指南 (高级用法/最佳实践) |
| `CHANGELOG.md` | English | 版本历史 (自动生成，仅参考) |

---

## 注意事项

1. **版本号必须一致**: package.json → agent.md → README
2. **代码示例可执行**: 确保示例代码与当前 API 兼容
3. **双语同步**: README.md 和 README.zh-CN.md 内容对应
4. **避免重复**: `.trellis/spec/` 是长期知识库，`.agent/agent.md` 只保留快速索引
5. **`.claude/CLAUDE.md` 非常规同步目标**: 仅在路由/import 目标变化时更新
