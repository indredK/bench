# Bench 文档

AI 从 [`AGENTS.md`](../AGENTS.md) 开始，按其必读清单读取规范后按关键词路由进工作流；人类新人从本文件的索引表按需进入。

裁决优先级：`.cursorrules > AGENTS.md > docs/*.md`。`AGENTS.md` 是逻辑入口，`.cursorrules` 是最高优先级规则。不确定、规则冲突或需要危险操作时停止并询问用户。

## 索引

| 文档                                                                                     | 用途                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                                                     | 架构边界与禁止模式                         |
| [coding-standards.md](./coding-standards.md)                                             | 编码、测试和文档规范                       |
| [UX-STANDARDS.md](./UX-STANDARDS.md)                                                     | 布局、加载态和交互规范                     |
| [AI-WORKFLOWS.md](./AI-WORKFLOWS.md)                                                     | `/review`、`/fix`、`/doc`、`/feature` 流程 |
| [ROADMAP.md](./ROADMAP.md)                                                               | 2.0 唯一执行路线、证据和停止条件           |
| [functional-positioning-and-closed-loop.md](./functional-positioning-and-closed-loop.md) | 功能定位与功能闭环分析                     |
| [DECISIONS.md](./DECISIONS.md)                                                           | 长期方向性决策                             |
| [audit-report.md](./audit-report.md)                                                     | 审计豁免与当前复核记录                     |
| [code-reliability-audit.md](./code-reliability-audit.md)                                 | 代码可靠性专项审计（全链验证已修复）       |
| [development-workflow.md](./development-workflow.md)                                     | 开发、验证、提交与发版                     |
| [dev-prod-coexistence.md](./dev-prod-coexistence.md)                                     | Dev / Prod 共存约束                        |
| [modules/](./modules/README.md)                                                          | 模块设计与未完成 backlog                   |

模块目录至少保留 `README.md` 和 `roadmap.md`；只有存在独有、长期有效的架构或安全约束时才增加 `design.md`。一次性、有时效性的报告不入库，历史由 Git 保留。
