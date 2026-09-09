# Port Manager（端口管理）规划功能

> 本文件记录 port-manager 模块**未实现 / 待验证**的功能规划，与 `../product-specs/port-manager.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。

## 待实现 / 待优化（Backlog）

- [ ] 清理未使用返回值和死代码（来源：`docs/modules/port-manager/roadmap.md`）。
- [ ] 优化大 PID 集合的进程树构建与刷新开销（当前已做 `build_children_index` O(N) 建索引 + 按需子树，全量快照 `sysinfo` 本身仍有成本，见 roadmap）。

## 待验证（真机）

- [ ] macOS/Windows 双端：lsof / netstat 解析、kill / taskkill 权限语义、PID 复用（`PID_REUSED`）场景真机验证。
- [ ] 杀进程后自动重扫的最终一致性；断网/无权限环境错误码正确落入结构化结果。
- [ ] 500+ 进程下进程树构建与虚拟滚动渲染的耗时/DOM 数量验收。

## 远期

- [ ] Remote 模式在 Windows 上 `nc` 不可用时的降级方案（未见实现）。
- [ ] 端口占用告警的历史/通知去重策略完善（当前为每 30s 轮询 + free→occupied 触发单条通知）。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：生成本产品说明与规划文档——梳理 Local/Remote 双模式、端口解析、进程树、Kill 安全链路与告警轮询；无功能缺口，仅 roadmap 既有 backlog。
