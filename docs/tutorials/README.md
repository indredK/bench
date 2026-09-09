# 新人上手（Tutorials）

> 面向刚接手 Bench 的开发者/AI 代理，按序走完即可建立全局认知。

## 第一步：理解入口与裁决优先级

- 读 [`AGENTS.md`](../../AGENTS.md) —— 所有 AI 工具的逻辑入口与「三步铁律」。
- 裁决优先级：`.cursorrules > AGENTS.md > docs/*.md`。规则冲突或不确定时**停止问人**，不许猜。

## 第二步：建立架构与规范认知

- [`reference/architecture.md`](../reference/architecture.md) —— 系统上下文与 🔴 禁止模式（写码前必读）。
- [`how-to/coding-standards.md`](../how-to/coding-standards.md) —— 编码强制/建议级规范。
- [`how-to/ux-standards.md`](../how-to/ux-standards.md) —— 布局/加载态/文本溢出/紧凑化。

## 第三步：走通开发工作流

- [`how-to/development-workflow.md`](../how-to/development-workflow.md) —— 本地开发、验证、提交流程。
- [`how-to/ai-workflows.md`](../how-to/ai-workflows.md) —— `/review` `/fix` `/doc` `/feature` 路由与产出要求。

## 第四步：定位你要改的模块

- [`modules/README.md`](../modules/README.md) —— 模块索引与专题文档入口。
- 产品规格（功能细节）：[`reference/product-specs/`](../reference/product-specs/)
- 规划与未实现项：[`roadmap/planned/`](../roadmap/planned/) 与 [`roadmap/ROADMAP.md`](../roadmap/ROADMAP.md)

## 第五步：理解方向性决策（避免重复踩坑）

- [`explanation/decisions.md`](../explanation/decisions.md) —— 已采纳/推翻的决策日志（D-001…）。
- [`explanation/functional-positioning.md`](../explanation/functional-positioning.md) —— 产品定位与闭环结论。
