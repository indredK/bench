# Bench 路线图

本文件只维护当前跨模块优先级；模块实现细节和 backlog 见 [modules/](./modules/README.md)，产品取舍见 [release-themes.md](./roadmap/release-themes.md)。已完成项由 Git 历史保留。

## Active Theme: Developer Daily Loop

目标：让“启动应用 -> 端口/清理/环境 -> 小工具”的日常路径具备可信的跨平台行为、反馈和性能。

## 已落地基线

- App Manager inventory 成为应用清单唯一真理源，Quick Launch 只消费带 revision 的 snapshot。
- 启动/更新/卸载使用稳定 ID 和后端 canonical state；Windows 不再通过 `cmd /C start` 执行 renderer 输入。
- Quick Launch 已接入错误/partial/stale 反馈、skeleton、虚拟网格、按需图标和关键测试。
- App Manager 更新中心已接入显式能力状态、批量反馈和原地更新安全边界。

## 当前验收

- [ ] App Manager 完成 Windows/macOS fixture、真机 smoke 和 CI 行为测试，见 [模块 roadmap](./modules/app-manager/roadmap.md)。
- [ ] Quick Launch 完成两平台启动 smoke 与 500+ 应用性能验收，见 [模块 roadmap](./modules/quick-launch/roadmap.md)。
- [ ] Account Manager 补 Session 状态 UX、Rust 行为测试和大列表虚拟化。
- [ ] Dev Toolbox 拆分持续膨胀的子模块，并补关键行为测试。

未完成目标平台 smoke 前，不得宣称 App Manager / Quick Launch 已在 macOS 与 Windows 发布对等。
