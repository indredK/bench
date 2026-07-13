# Bench 文档导航

## AI 入口

1. 从 [`AGENTS.md`](../AGENTS.md) 开始。
2. 按其清单读取 `.cursorrules`、架构、编码、UX、工作流和决策文档。
3. 根据关键词进入 `/review`、`/fix`、`/doc` 或 `/feature`。
4. 不确定、规则冲突或需要危险操作时停止并询问用户。

裁决优先级：`.cursorrules > AGENTS.md > docs/*.md`。`AGENTS.md` 是入口，`.cursorrules` 是最高优先级规则，两者职责不同。

## 常用入口

| 目的 | 文档 |
|------|------|
| 理解系统和禁止模式 | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 查实现规范 | [coding-standards.md](./coding-standards.md) |
| 查 UI/UX 规范 | [UX-STANDARDS.md](./UX-STANDARDS.md) |
| 执行标准工作流 | [AI-WORKFLOWS.md](./AI-WORKFLOWS.md) |
| 确认当前优先级 | [ROADMAP.md](./ROADMAP.md) |
| 恢复决策上下文 | [DECISIONS.md](./DECISIONS.md) |
| 修改具体模块 | [modules/README.md](./modules/README.md) |
| 避免重复审计 | [audit-report.md](./audit-report.md) |

完整索引见 [README.md](./README.md)。
