# Bench 路线图

本文件只维护当前跨模块优先级；模块实现细节和 backlog 见 [modules/](./modules/README.md)，产品取舍见 [release-themes.md](./roadmap/release-themes.md)。已完成项由 Git 历史保留。

## Active Theme: 2.0.0 Release Readiness

目标：停止扩展新品类，把现有功能、跨平台行为、发布供应链和核心用户路径补到可公开发布 2.0.0 的程度。

执行真理源：

- [2.0.0 功能完善与发布就绪规范](./roadmap/2.0.0-release-readiness.md)
- [2.0.0 用户体验完善与验收规范](./roadmap/2.0.0-ux-readiness.md)

## 已落地基线

- App Manager inventory 成为应用清单唯一真理源，Quick Launch 只消费带 revision 的 snapshot。
- 启动/更新/卸载使用稳定 ID 和后端 canonical state；Windows 不再通过 `cmd /C start` 执行 renderer 输入。
- Quick Launch 已接入错误/partial/stale 反馈、skeleton、虚拟网格、按需图标和关键测试。
- App Manager 更新中心已接入显式能力状态、批量反馈和原地更新安全边界。
- 导航和直达路由统一消费 feature platform contract；Clean Space、Hardware、System Settings 在 Windows 不再暴露虚假入口。
- Account Manager 已有三栏首载 skeleton 和密码明文 30 秒 TTL；System Settings 读取失败显示 error/unknown，不再显示为关闭。
- Updater 已有 24 小时间隔、失败退避、离线/省流策略、用户开关和 cancelling；tag workflow 对 OS 签名、目标产物、updater 签名和 checksum fail-closed。

## 当前验收

- [ ] 功能规范 F00-F09 全部完成：平台、迁移、核心模块、IPC、签名、CI、RC 和回滚均有证据。
- [ ] UX 规范 U00-U09 全部完成：异步状态、核心路径、响应式、i18n、a11y、性能和视觉回归均有证据。
- [ ] macOS arm64/x64 与 Windows x64 使用正式签名 RC 通过全新安装、1.x 升级、更新和真机 smoke。

上述三项未完成前不得创建正式 `v2.0.0` tag，也不得把模块标记为跨平台发布对等。
