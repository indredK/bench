# Account Manager Roadmap

架构与安全边界见 [design.md](./design.md)，跨模块优先级见 [ROADMAP.md](../../ROADMAP.md)。

## Backlog

- [ ] 补齐 Session 状态与空态 UX：明确 TTL、探针结果、代理状态和失败原因。
- [ ] 多站点/多账号列表虚拟化。
- [ ] 为 Session、Probe 和迁移引擎补 Rust 行为测试。
- [ ] Windows/Linux WebView Session 兼容与平台降级。
- [ ] 评估 TLS 指纹模拟和 Canvas/WebGL 指纹隔离；不得以降低安全边界为代价。

## 远期

- [ ] 云端同步需先提交独立 RFC：仅支持 BYO endpoint、客户端加密、版本迁移、冲突处理和删除语义；不得内置维护者公共服务。
