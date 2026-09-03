# App Manager（应用管理）规划功能

> 本文件记录 app-manager 模块**未实现 / 待验证**的功能规划，与 `../product-specs/app-manager.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> 当前约束见 `../modules/app-manager/design.md`；执行顺序见全局路线图 [R02](../ROADMAP.md#r02-app-manager-与-quick-launch)。

## 发布前必须完成（待验证 / 真机 smoke）

- [ ] Windows inventory fixture：EXE/MSI、UWP/MSIX、AUMID、Registry 32/64 位、CJK 路径。
- [ ] macOS inventory fixture：alias/symlink、外置卷、权限失败 warning。
- [ ] Windows 启动、图标、winget/MSI 操作与进程树 timeout smoke。
- [ ] macOS 临时签名 updater、ZIP/DMG 取消、journal 恢复与身份拒绝 smoke。
- [ ] Windows/macOS CI runner 执行平台行为测试。
- [ ] 清单快照持久化真机验证（D-019）：扫描后 `config_dir/bench/app-manager/inventory.json` 生成且体积受控（超限剥离图标）；进入 app-manager 展示缓存快照，重新扫描回写 revision 单调递增。

## 远期

- [ ] **统一可查询、可恢复的 JobManager 协议**：替代当前分散的批处理/安装编排。
- [ ] **更新版本 diff 展示**：在更新详情中展示版本间变更。
- [ ] **按安装/更新来源细化过滤**：已安装列表与更新列表增加按来源维度过滤。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：生成产品说明与规划功能文档（依据 `src/features/app-manager/`、`src-tauri/src/app_manager/`、`src/shared/app-inventory/`、`docs/modules/app-manager/` 与 ROADMAP R02）。
