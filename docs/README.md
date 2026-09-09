# Bench 文档

AI 从 [`AGENTS.md`](../AGENTS.md) 开始，按其必读清单读取规范后按关键词路由进工作流；人类新人从本文件的象限导航按需进入。

> 裁决优先级：`.cursorrules > AGENTS.md > docs/*.md`。`AGENTS.md` 是逻辑入口，`.cursorrules` 是最高优先级规则。不确定、规则冲突或需要危险操作时停止并询问用户。

## 文档结构（Diátaxis 视角）

本项目文档按 **Diátaxis** 四型 + 模块/状态两层组织，每类信息只在一处（单一真理源，见 `explanation/decisions.md` D-006）。

| 象限            | 目录                             | 内容                                               | 典型文件                                                                                                              |
| --------------- | -------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Reference**   | [`reference/`](./reference/)     | 稳定规格、契约、架构边界、数据 schema              | `architecture.md` · `persistence-schema.md` · `extension-spec.md` · `product-specs/`                                  |
| **How-to**      | [`how-to/`](./how-to/)           | 开发/验证/提交流程与规范（任务导向）               | `development-workflow.md` · `ai-workflows.md` · `coding-standards.md` · `ux-standards.md` · `dev-prod-coexistence.md` |
| **Explanation** | [`explanation/`](./explanation/) | 方向性决策、产品定位、插件工作流、审计（理解导向） | `decisions.md`(DECISIONS) · `functional-positioning.md` · `extension-workflow.md` · `audit-report.md`                 |
| **Roadmap**     | [`roadmap/`](./roadmap/)         | 发布阶段规划 + 各模块规划功能（状态导向）          | `ROADMAP.md` · `planned/` · `GAP-TO-2.0.md`                                                                           |
| **模块**        | [`modules/`](./modules/)         | 模块精简索引 + 独有深度设计                        | `<id>/README.md` · `design.md` · `roadmap.md`(指针)                                                                   |
| **上手**        | [`tutorials/`](./tutorials/)     | 新人入门路径                                       | `README.md`                                                                                                           |
| **资产**        | [`diagrams/`](./diagrams/)       | 架构/流程图集（html 由 specs/*.json 渲染）         | `index.html`                                                                                                          |

## 模块文档三件套（核心约定）

每个 feature 对应三处文档，各司其职、不重复：

1. **`docs/reference/product-specs/<模块>.md`** — 产品功能规格**唯一真相源**（定位 / 界面 / 交互 / 异常 / 技术要点 / 数据模型 / 边界）。
2. **`docs/roadmap/planned/<模块>.md`** — 规划功能**唯一真相源**（待实现 / 待验证 / 远期 / 变更记录）。`modules/<模块>/roadmap.md` 已精简为指向本目录的指针。
3. **`docs/modules/<模块>/`** — 精简索引（README）+ 独有深度设计（design.md、migration-plan.md 等）。

**改动同步流程**：功能改动 → 先在 `roadmap/planned/<模块>.md` 变更记录追加一行 → 实施后同步 `reference/product-specs/<模块>.md` → 从 planned 移除已完成项。产品规格不依赖会话记忆，可移植给其他项目/AI 复刻。

## 维护规则

- 编码规范：`how-to/coding-standards.md`（12 节，含强制/建议级别）
- UX 规范：`how-to/ux-standards.md`
- 开发流程：`how-to/development-workflow.md`
- 方向性决策：`explanation/decisions.md`（规划/架构为何这么定——做取舍前先读，取舍后回写）
- 新增 feature：建 `src/features/<id>/` 同时建 `docs/modules/<id>/`（README + roadmap），并按需在 `reference/product-specs/` 与 `roadmap/planned/` 建规格与规划
- 文档 ↔ 代码对齐由 `pnpm run check:docs` 门禁保障（仅校验 `modules/` ↔ `features/` 对齐与 `docs/` 内相对链接）
