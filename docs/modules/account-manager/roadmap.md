# Account Manager Roadmap

架构与安全边界见 [design.md](./design.md)，风险、代码契约和验收矩阵见 [audit-and-upgrade-2026-07-13.md](./audit-and-upgrade-2026-07-13.md)。以下顺序是发布门禁，不得跳过前置阶段。

## 发布阻断

- [ ] Phase 1：完成按 origin 的 local/session storage 与 IndexedDB 捕获/恢复；Session Cookie schema 保留 canonical expiry/partition key，再评估用 RFC 6265 CookieStore 取代手写 HTTP header。
- [ ] Phase 3：新增后端 capability DTO；Windows WebView proxy 当前保持 unsupported/fail-closed，入口只在 Session/Keyring/WebView 基础链路验收后开放。
- [ ] Phase 5：补区域错误/retry，并按真实 owner 拆分超大的 `commands.rs`、controller 和 dialogs；不得改 IPC 名称或创建空转发层。

## 延期验证

- [ ] 在 macOS/Windows 真机验证 Keyring 重启、WebView Session 恢复、Deep Link 冷/热启动、第二实例退出和 Windows proxy unsupported 反馈。
- [ ] 将同账号 single-flight、429/5xx 预算、Cookie scope、Deep Link 多 URL/去重和平台行为矩阵接入 CI。

## 远期

- [ ] 如恢复完整导出，实现 passphrase + KDF + AEAD 的可移植格式；当前 renderer 只能请求 sanitized export，后端继续拒绝 `encryptedFull`。
- [ ] 评估 TLS 指纹模拟和 Canvas/WebGL 指纹隔离；不得以降低安全边界为代价。
- [ ] 云端同步需先提交独立 RFC：仅支持 BYO endpoint、客户端加密、版本迁移、冲突处理和删除语义；不得内置维护者公共服务。
