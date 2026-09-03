# Quick Launch Roadmap

当前约束见 [design.md](./design.md)，执行顺序见 [全局路线图 R02](../../ROADMAP.md#r02-app-manager-与-quick-launch)。已完成历史由 Git 保留。

## 按需扫描与快照恢复（D-019）

- [ ] 真机验证：应用启动进入 quick-launch 不触发全量扫描；首次使用（无缓存）展示空状态 + 扫描按钮，点击后才扫描。
- [ ] 真机验证：扫描完成一次后重启应用，进入 quick-launch 显示上次快照（含「恢复上次的应用列表」骨架过渡），手动重新扫描后图标与数据刷新，且新快照回写磁盘缓存。

## 发布前必须完成

- [ ] Windows EXE/AUMID 与 macOS `.app` 真机启动 smoke。
- [ ] 500+ 应用虚拟列表性能和 DOM 数量验收。

## 远期

- [ ] 分类命中解释与 platform/source/exact ID 优先级治理。
- [ ] 确认外部消费者后清理未使用的 `LaunchAppEntry`。
- [ ] 使用频率、最近使用和固定项设计；先定义隐私与留存策略。

未完成目标平台 smoke 前，不得宣称跨平台发布就绪。
