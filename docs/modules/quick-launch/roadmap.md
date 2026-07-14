# Quick Launch Roadmap

当前约束见 [design.md](./design.md)，执行顺序见 [全局路线图 R02](../../ROADMAP.md#r02-app-manager-与-quick-launch)。已完成历史由 Git 保留。

## 发布前必须完成

- [ ] Windows EXE/AUMID 与 macOS `.app` 真机启动 smoke。
- [ ] 500+ 应用虚拟列表性能和 DOM 数量验收。

## 远期

- [ ] 分类命中解释与 platform/source/exact ID 优先级治理。
- [ ] 确认外部消费者后清理未使用的 `LaunchAppEntry`。
- [ ] 使用频率、最近使用和固定项设计；先定义隐私与留存策略。

未完成目标平台 smoke 前，不得宣称跨平台发布就绪。
