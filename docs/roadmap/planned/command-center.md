# Command Center（命令中心）规划功能

> 本文件记录 command-center 模块**未实现 / 待验证**的功能规划，与 `../product-specs/command-center.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> 来源：`../modules/command-center/roadmap.md`、`design.md`。

## 待实现（Backlog）

- [ ] **卡片分组 / 标签与搜索过滤**：为卡片增加分组/标签，提供按标签/关键字过滤。
- [ ] **参数占位符**：命令内 `{{var}}` 运行前弹窗填参（与编辑器联动，运行前解析替换）。

## 待验证（验收条件）

- [ ] 新增/编辑/删除卡片后重启应用数据仍在（后端持久化 `cards.json`）。
- [ ] 提权命令执行前展示完整命令并二次确认；取消提权不崩溃（`CMD_CANCELLED`）。
- [ ] 运行中点击「终止」可真正中断后端进程（`CMD_ABORTED`），且可立即重新运行。
- [ ] `pnpm run lint:fe`、`pnpm run test:critical`、`cargo clippy -- -D warnings` 全绿。

## 远期

- [ ] 内置卡目录扩展 / 社区命令模板（未见实现）。
- [ ] Windows 提权进程输出与终止能力评估（当前提权进程脱离进程树、无输出、终止无效）。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：首版生成——依据 `docs/modules/command-center/roadmap.md` 提取未完成项；产品说明见 `../product-specs/command-center.md`。
