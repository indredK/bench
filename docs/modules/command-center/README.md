# Command Center 文档

代码：`src/features/command-center/` · `src-tauri/src/command_center/`

把常用命令、脚本和快捷操作保存为卡片，一键运行。支持四种动作类型：`shell`（普通执行）、`shellAdmin`（提权执行）、`copy`（复制到剪贴板）、`open`（打开路径/URL）。

交互模型（v2）：紧凑卡片网格，Hover 看实时输出，点击放大聚焦层（左输出 / 右详情），Esc 或点遮罩只关弹窗不打断命令，运行中可点「终止」真正取消后端进程。详见 [design.md](./design.md)。

| 文档                       | 说明                                 |
| -------------------------- | ------------------------------------ |
| [design.md](./design.md)   | 持久化、执行边界、安全约束与前端交互 |
| [roadmap.md](./roadmap.md) | 未完成项                             |

全局顺序：[2.0 最终路线图](../../ROADMAP.md)
