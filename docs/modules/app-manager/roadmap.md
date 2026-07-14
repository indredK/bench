# App Manager Roadmap

当前约束见 [design.md](./design.md)，执行顺序见 [全局路线图 R02](../../ROADMAP.md#r02-app-manager-与-quick-launch)。已完成历史由 Git 保留。

## 发布前必须完成

- [ ] Windows inventory fixture：EXE/MSI、UWP/MSIX、AUMID、Registry 32/64 位、CJK 路径。
- [ ] macOS inventory fixture：alias/symlink、外置卷、权限失败 warning。
- [ ] Windows 启动、图标、winget/MSI 操作和进程树 timeout smoke。
- [ ] macOS 临时签名 updater、ZIP/DMG 取消、journal 恢复和身份拒绝 smoke。
- [ ] Windows/macOS CI runner 执行行为测试。

## 远期

- [ ] 统一可查询、可恢复的 JobManager 协议。
- [ ] 更新版本 diff 展示。
- [ ] 按安装/更新来源细化过滤。

未完成平台 smoke 前，不得将 macOS/Windows 能力标记为发布对等。
