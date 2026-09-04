# Bench 文档

AI 从 [`AGENTS.md`](../AGENTS.md) 开始，按其必读清单读取规范后按关键词路由进工作流；人类新人从本文件的索引表按需进入。

裁决优先级：`.cursorrules > AGENTS.md > docs/*.md`。`AGENTS.md` 是逻辑入口，`.cursorrules` 是最高优先级规则。不确定、规则冲突或需要危险操作时停止并询问用户。

## 文档分层（Diátaxis 视角）

| 层              | 目录 / 文件                                                                                                                                                                                                                              | 用途                                                    | 维护规则                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| **Reference**   | [product-specs/](./product-specs/README.md)                                                                                                                                                                                              | 各模块**完备产品规格**（唯一功能真相源）                | 功能改动/优化/bug 修复必须同步；实现后从 planned 移除对应项 |
| **Reference**   | [ARCHITECTURE.md](./ARCHITECTURE.md) · [persistence-schema.md](./persistence-schema.md)                                                                                                                                                  | 架构边界、IPC 契约、数据持久化 schema                   | 架构变更时同步                                              |
| **Explanation** | [DECISIONS.md](./DECISIONS.md) · [functional-positioning-and-closed-loop.md](./functional-positioning-and-closed-loop.md)                                                                                                                | 方向性决策、产品定位与闭环                              | 新决策记入 DECISIONS                                        |
| **Roadmap**     | [ROADMAP.md](./ROADMAP.md) · [planned/](./planned/README.md)                                                                                                                                                                             | 全局发布阶段规划 · 各模块**规划功能**（唯一规划真相源） | 新增规划先进 planned；发布阶段进度推进 ROADMAP              |
| **How-to**      | [development-workflow.md](./development-workflow.md) · [AI-WORKFLOWS.md](./AI-WORKFLOWS.md) · [coding-standards.md](./coding-standards.md) · [UX-STANDARDS.md](./UX-STANDARDS.md) · [dev-prod-coexistence.md](./dev-prod-coexistence.md) | 开发/验证/提交流程、AI 工作流、编码与 UX 规范           | 流程变化时同步                                              |
| **模块**        | [modules/](./modules/README.md)                                                                                                                                                                                                          | 模块精简索引 + 深度设计（design/scenarios/migration）   | 新增 feature 须建目录                                       |
| **质量审计**    | [audit-report.md](./audit-report.md)                                                                                                                                                                                                     | 审计豁免与当前风险复核                                  | 复核后更新                                                  |

## 模块文档三件套（核心约定）

每个 feature 对应三处文档，各司其职、不重复：

1. **`docs/product-specs/<模块>.md`** — 产品功能规格**唯一真相源**（定位 / 界面 / 交互细节 / 异常处理 / 技术要点 / 数据模型 / 边界）。
2. **`docs/planned/<模块>.md`** — 规划功能**唯一真相源**（待实现 / 待验证 / 远期 / 变更记录）。`modules/<模块>/roadmap.md` 已精简为指向本文件。
3. **`docs/modules/<模块>/`** — 精简索引（README）+ 独有深度设计（design.md、migration-plan.md 等）。

**改动同步流程**：功能改动 → 先在 `planned/<模块>.md` 变更记录追加一行 → 实施后同步 `product-specs/<模块>.md` → 从 planned 移除已完成项。产品规格不依赖会话记忆，可移植给其他项目/AI 复刻。
