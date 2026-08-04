# Command Center Roadmap

只保留未完成项。全局顺序见 [ROADMAP.md](../../ROADMAP.md)。

## Backlog

- [ ] 卡片分组 / 标签与搜索过滤
- [ ] 参数占位符：命令内 `{{var}}` 运行前弹窗填参

## 验收条件

- 新增/编辑/删除卡片后重启应用数据仍在（后端持久化）。
- 提权命令执行前展示完整命令并二次确认；取消提权不崩溃。
- 运行中点击「终止」可真正中断后端进程（`CMD_ABORTED`），且可立即重新运行。
- `pnpm run lint:fe`、`pnpm run test:critical`、`cargo clippy -- -D warnings` 全绿。
