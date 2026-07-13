# Quick Launch Roadmap

> 当前状态与约束见 [跨平台可靠性说明](./audit-and-upgrade-2026-07-13.md)。

## 已落地基线

- 复用共享 inventory，不维护独立扫描流程。
- 仅通过稳定 `appId` 启动后端 LaunchTarget，不可启动项不可点击。
- revision 变化自动重分类，刷新 single-flight 并支持取消、partial/stale 反馈。
- 首载 skeleton、刷新进度、虚拟网格、按需图标和 NFKC 搜索已接入。
- 分类规则版本化，overrides 带 schema version 持久化。

## 发布前必须完成

- [ ] Windows EXE/AUMID 与 macOS `.app` 真机启动 smoke。
- [ ] 500+ 应用虚拟列表性能和 DOM 数量验收。

## 后续增强

- [ ] 分类命中解释与 platform/source/exact ID 优先级治理。
- [ ] 确认外部消费者后清理未使用的 `LaunchAppEntry`。
- [ ] 使用频率、最近使用和固定项设计；先定义隐私与留存策略。

未完成目标平台 smoke 前，不得宣称跨平台发布就绪。
