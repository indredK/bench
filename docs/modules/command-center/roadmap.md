# Command Center Roadmap

只保留未完成项。全局顺序见 [ROADMAP.md](../../ROADMAP.md)。

## Backlog

- [ ] 卡片分组 / 标签与搜索过滤
- [ ] 参数占位符：命令内 `{{var}}` 运行前弹窗填参
- [ ] `open`/`shellAdmin` 的 Windows 支持

## 已完成（近期）

- [x] 卡片拖拽排序：网格接入 `@dnd-kit`（`rectSortingStrategy`），仅拖拽手柄触发排序，顺序经 `save_command_cards` 持久化；纯函数 `reorderByIds` 含单测。
- [x] 卡片导入 / 导出（JSON）：`export_command_cards` / `import_command_cards` IPC，前端经 `savePlatformDialog` / `openPlatformDialog` 选择路径，导入按 id 合并、toast 反馈。
- [x] 运行中的「终止」按钮：前端 `cancel_command_card` + 后端 `RunAbortFlag` 进程树 kill（`CMD_ABORTED`）。
- [x] Esc / 点遮罩仅关弹窗不打断命令（区分于系统级提权取消 `CMD_CANCELLED`）。
- [x] 紧凑网格 + Hover 看实时输出 + 抽屉（上下排列：运行输出 / 命令详情），移除原详情弹窗与 RunDrawer。

## 验收条件

- 新增/编辑/删除卡片后重启应用数据仍在（后端持久化）。
- 提权命令执行前展示完整命令并二次确认；取消提权不崩溃。
- 运行中点击「终止」可真正中断后端进程（`CMD_ABORTED`），且可立即重新运行。
- `pnpm run lint:fe`、`pnpm run test:critical`、`cargo clippy -- -D warnings` 全绿。
