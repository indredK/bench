# App Manager Roadmap

> 当前状态与约束见 [跨平台可靠性说明](./audit-and-upgrade-2026-07-13.md)。

## 已落地基线

- inventory 是应用清单唯一真理源，带 revision 与 single-flight。
- IPC 使用稳定 `appId`；破坏性动作要求 exact source evidence。
- macOS/Windows provider、统一 `UpdateScanReport` 和显式 partial/unsupported 状态已接入。
- 更新器具备 HTTPS、签名/身份/兼容性校验、资源上限、取消和恢复边界。
- 首载 skeleton、刷新进度、批量结果、按需图标和更新页紧凑提示已接入。

## 发布前必须完成

- [ ] Windows inventory fixture：EXE/MSI、UWP/MSIX、AUMID、Registry 32/64 位、CJK 路径。
- [ ] macOS inventory fixture：alias/symlink、外置卷、权限失败 warning。
- [ ] Windows 启动、图标、winget/MSI 操作和进程树 timeout smoke。
- [ ] macOS 临时签名 updater、ZIP/DMG 取消、journal 恢复和身份拒绝 smoke。
- [ ] Windows/macOS CI runner 执行行为测试。

## 后续增强

- [ ] 统一可查询、可恢复的 JobManager 协议。
- [ ] 更新版本 diff 展示。
- [ ] 按安装/更新来源细化过滤。

未完成平台 smoke 前，不得将 macOS/Windows 能力标记为发布对等。
