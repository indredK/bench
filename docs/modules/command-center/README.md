# Command Center（命令中心）

> **完备功能规格** → [product-specs/command-center.md](../../product-specs/command-center.md)
> **规划功能** → [planned/command-center.md](../../planned/command-center.md)

代码：`src/features/command-center/` · `src-tauri/src/command_center/`

定位：把常用命令、脚本和快捷操作保存为卡片，一键运行。四种动作类型：`shell`（普通执行）、`shellAdmin`（提权执行）、`copy`（复制到剪贴板）、`open`（打开路径/URL）。

| 文档                       | 说明                                 |
| -------------------------- | ------------------------------------ |
| [design.md](./design.md)   | 持久化、执行边界、安全约束与前端交互 |
| [roadmap.md](./roadmap.md) | 实施路线（未完成项已归入 planned）   |

全局顺序：[2.0 最终路线图](../../ROADMAP.md)
