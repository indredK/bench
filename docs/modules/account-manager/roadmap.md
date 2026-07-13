# Account Manager Roadmap

架构与安全边界见 [design.md](./design.md)，风险、代码契约和验收矩阵见 [audit-and-upgrade-2026-07-13.md](./audit-and-upgrade-2026-07-13.md)。以下顺序是发布门禁，不得跳过前置阶段。

## 发布阻断

- [ ] Phase 0：移除 `http/https` Deep Link 注册，冻结不安全的自动填充和 encrypted full export。
- [ ] Phase 1：Session 单一真理源、v5 migration、原子 flush、密钥并发和跨进程冲突保护。
- [ ] Phase 2：后端一次性 Auth Proxy ticket、精确 callback/origin 校验和 App 根层 Deep Link 队列。
- [ ] Phase 3：真实 ProbeStrategy、守恒的 RefreshReport、代理 fail-closed 和 PasswordAction。
- [ ] Phase 4：完整删除/互斥清理、明文 TTL、剪贴板清理和可移植加密导入导出。
- [ ] Phase 5：分层重构、skeleton、区域错误/retry、窄屏详情和 500+ 账号虚拟列表。
- [ ] Phase 6：macOS/Windows 行为矩阵进入 CI 并在真机 smoke 通过。

## 远期

- [ ] 评估 TLS 指纹模拟和 Canvas/WebGL 指纹隔离；不得以降低安全边界为代价。
- [ ] 云端同步需先提交独立 RFC：仅支持 BYO endpoint、客户端加密、版本迁移、冲突处理和删除语义；不得内置维护者公共服务。
