# App Manager Roadmap

当前约束见 [design.md](./design.md)，执行顺序见 [全局路线图 R02](../../ROADMAP.md#r02-app-manager-与-quick-launch)。已完成历史由 Git 保留。

## 发布前必须完成

- [ ] Windows inventory fixture：EXE/MSI、UWP/MSIX、AUMID、Registry 32/64 位、CJK 路径。
- [ ] macOS inventory fixture：alias/symlink、外置卷、权限失败 warning。
- [ ] Windows 启动、图标、winget/MSI 操作和进程树 timeout smoke。
- [ ] macOS 临时签名 updater、ZIP/DMG 取消、journal 恢复和身份拒绝 smoke。
- [ ] Windows/macOS CI runner 执行行为测试。

## 清单快照持久化（D-019）

- [ ] 真机验证：扫描后 `config_dir/bench/app-manager/inventory.json` 生成且体积受控（超限剥离图标）；进入 app-manager 展示缓存快照，重新扫描回写 revision 单调递增。
- [ ] 行为测试：`get_cached_app_inventory` 对损坏缓存文件返回 null 且不影响后续扫描。

## 远期

- [ ] 统一可查询、可恢复的 JobManager 协议。
- [ ] 更新版本 diff 展示。
- [ ] 按安装/更新来源细化过滤。

未完成平台 smoke 前，不得将 macOS/Windows 能力标记为发布对等。
