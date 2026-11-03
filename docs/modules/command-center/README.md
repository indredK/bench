# Command Center（命令中心）

> **完备功能规格** → [product-specs/command-center.md](../../reference/product-specs/command-center.md)
> **规划功能** → [planned/command-center.md](../../roadmap/planned/command-center.md)

代码：`src/features/command-center/` · `src-tauri/src/command_center/`

定位：把常用命令、脚本和快捷操作保存为卡片，一键运行。四种动作类型：`shell`（普通执行）、`shellAdmin`（提权执行）、`copy`（复制到剪贴板）、`open`（打开路径/URL）。

页面分「我的命令 / 命令市场」两个标签：市场目录来自独立仓库 `command-market`（默认 `raw.githubusercontent.com` 上的 `registry.json`，可用 `BENCH_COMMAND_MARKET_URL` / `_DIR` 覆盖）。每条市场命令有自己的版本，可在 Bench 内安装、更新（版本单调，拒绝降级）、卸载（删除带市场来源标记的本地卡片）；本地命令库不可读时市场仍可浏览，但已安装状态未知。

| 文档                       | 说明                                 |
| -------------------------- | ------------------------------------ |
| [design.md](./design.md)   | 持久化、执行边界、安全约束与前端交互 |
| [roadmap.md](./roadmap.md) | 实施路线（未完成项已归入 planned）   |

全局顺序：[2.0 最终路线图](../../roadmap/ROADMAP.md)
