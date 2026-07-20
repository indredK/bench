# Command Center 技术设计

见 [DECISIONS D-015](../../DECISIONS.md)。

## 边界

- **持久化唯一在后端**：卡片经 `persistence.rs::atomic_write` 写入 `dirs::config_dir()/bench/command-center/cards.json`，带 `schema_version` 与 2MB 上限；renderer 不直接落盘。
- **执行唯一在后端**：`shell` 走 `subprocess.rs::run_output_with_timeout`（300s 超时、进程树清理、捕获 stdout/stderr）；`shellAdmin` 走 macOS `osascript ... with administrator privileges`；`open` 走 `open`；`copy` 走 `tauri_plugin_clipboard_manager`。
- **契约**：命令定义同时存在于 `src/lib/tauri/contracts.ts` 与 `src-tauri/src/commands.rs`，组件不得直接 `invoke`。

## 前端交互（v2 重设计）

布局为紧凑卡片网格，信息分层为：图标 + 标题（带运行状态点）/ 类型徽章 / 命令预览 / 行内操作（运行·编辑·删除）。核心交互：

- **Hover 看实时输出**：仅当该卡已有运行结果（运行中或已完成，`hasResult` 为真）时，卡片上浮现实时输出小窗；无结果时 hover 无任何效果。浮层右上角有关闭按钮，关闭后本次 hover 不再自动弹出（重新运行会再显示）。行内操作栏（`relative z-30`）始终绘制在浮层之上，运行按钮不会被遮挡。
- **点击卡片 → 运行/详情抽屉**：点击卡片（非按钮）从右侧滑出 `RunDetailDrawer`，**上下排列**——上方为实时运行输出、下方为卡片命令详情 + 操作按钮；运行中持续打印。复制类（`copy`）卡片不进抽屉，直接运行并以 sonner 右下角 toast 提示「已复制」。
- **Esc / 点击遮罩 = 仅关闭抽屉**：只收起抽屉（`expandedId = null`），**不打断**正在进行的命令；后台进程继续跑，结果会在卡片状态与（再次 hover / 展开时）输出中体现。改为单抽屉（而非聚焦放大层）是为修复此前「多个弹窗不收拢 / Esc 异常」的问题。
- **运行按钮**：非运行时为「运行 / 复制」；运行时同一位置变为红色「终止」按钮（抽屉内同样有）。
- **导入 / 导出**：页头「导入」「导出」按钮，经 `savePlatformDialog` / `openPlatformDialog` 选择 JSON 路径；导出当前全部卡片，导入按 id 合并（同 id 覆盖、其余追加），结果以 sonner toast 反馈。`escHint` 文案已弃用。
- **拖拽排序**：网格接入 `@dnd-kit`，仅卡片左上角拖拽手柄（grip）可发起排序，排序后顺序经 `save_command_cards` 持久化；点击卡片其它区域仍只打开详情抽屉，不触发排序。

### 取消 vs 终止（语义区分）

- **取消提权弹窗（系统级）**：`shellAdmin` 经 macOS `osascript` 提权，用户在系统密码框点「取消」→ 后端返回 `CMD_CANCELLED`，前端标记为失败但不视为异常崩溃。这是系统行为，不是应用内的「终止」。
- **终止（应用内）**：运行中点击「终止」→ 前端调用 `cancel_command_card` 置全局 `RunAbortFlag`，后端 `subprocess.rs` 轮询到标志后 `terminate_process_tree`（杀掉进程组）并以 `CMD_ABORTED` 返回，前端标记为失败（`已终止`）。命令中心同一时刻只跑一张卡，故用单一全局标志即可。

## 安全约束

- 提权（`shellAdmin`）与删除卡片必须经 `DestructiveConfirmDialog` 二次确认，且提权确认弹窗以原文展示完整命令。
- 用户取消系统提权对话框时后端返回 `CMD_CANCELLED`，前端标记为失败但不视为异常崩溃。
- 跨平台：提权与 `open` 仅 macOS 支持，其余平台返回 `UNSUPPORTED`。

## 未决

- 卡片导入/导出、分组/标签、参数占位符（`{{var}}` 运行前填参）见 roadmap。
