# Bench 文档总导航（一页纸）

> **你是 AI？** → 去 [`AGENTS.md`](../AGENTS.md)（唯一逻辑入口）。
> **你是人类新人？** → 按下面的图看文档。
> **冲突时谁说了算？** → 裁决优先级：`.cursorrules > AGENTS.md > docs/*.md`。

---

## 全景流程图

```
┌─────────────────────────────────────────────────────────┐
│  工具物理入口（天然不唯一，每个工具先读自己的文件）          │
│  .cursorrules / .trae/rules/ / .github/copilot-…        │
│  .claude/CLAUDE.md / .codebuddy/rules/（均已提交）        │
└───────────────────────┬─────────────────────────────────┘
                        │  每个入口只做一件事：导流
                        ▼
              ┌─────────────────────┐
              │   AGENTS.md         │  ← 唯一逻辑入口
              │   （"门"）           │
              └─────────┬───────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
   ① 必读清单      ② 路由 workflow   ③ 判断不了？
   (5 个文件)      /review           → 停下问人
   .cursorrules    /fix               （§0 STOP 铁律）
   ARCHITECTURE   /doc
   coding-standards /feature
   AI-WORKFLOWS
   DECISIONS
          │
          ▼
   ③ 执行 + 验证链
      pnpm run lint:fe
      pnpm run test:critical
      cargo clippy（有 Rust 改动时）
          │
          ▼
   ④ 文档回写
      roadmap.md / bugs.md
      audit-report.md / DECISIONS.md
```

---

## 快速链接

| 你想… | 去哪 |
|-------|------|
| 理解系统架构 | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| 查编码规范 | [coding-standards.md](./coding-standards.md) |
| 看 AI 工作流 | [AI-WORKFLOWS.md](./AI-WORKFLOWS.md) |
| 知道做什么（路线图） | [ROADMAP.md](./ROADMAP.md) |
| 知道为什么这么做（决策） | [DECISIONS.md](./DECISIONS.md) |
| 查模块细节 | [modules/](./modules/README.md) |
| 看审计报告 & 不计违规 | [audit-report.md](./audit-report.md) |
| 日常开发流程 | [development-workflow.md](./development-workflow.md) |

---

## 入口 vs 优先级

这是两件事，不矛盾：

- **入口顺序**：所有工具 → `AGENTS.md`（从哪开始读）。
- **裁决优先级**：`.cursorrules > AGENTS.md > docs/*.md`（内容冲突时谁说了算）。
- 一句话：`AGENTS.md` 是"门"，`.cursorrules` 是"最高法律"。

> 本文件是 README 性质的导航，**不是入口**——入口仍是 `AGENTS.md`。
