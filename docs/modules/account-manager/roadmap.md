# Account Manager Roadmap

架构与安全边界见 [design.md](./design.md)，风险、代码契约和验收矩阵见 [audit-and-upgrade-2026-07-13.md](./audit-and-upgrade-2026-07-13.md)。以下顺序是发布门禁，不得跳过前置阶段。

## 发布阻断

- [ ] Phase 5：补区域错误/retry，并按真实 owner 拆分超大的 `commands.rs`、controller 和 dialogs；不得改 IPC 名称或创建空转发层。

## 延期验证

- [ ] 按[双平台手工验收](./audit-and-upgrade-2026-07-13.md#6-macos--windows-行为测试矩阵)在 macOS/Windows 真机验证 Keyring 重启、Cookie/Web Storage/IndexedDB 恢复、账号隔离、Deep Link 冷/热启动、第二实例退出和 Windows proxy fail-closed；保存脱敏日志与截图证据。
- [ ] 真机矩阵通过后，逐能力把 `capabilities.rs` 的 `partial` 提升为 `supported` 并补平台测试；未通过项继续保持 `partial/unsupported/failed`，不得只改文档或 UI。
- [ ] 将同账号 single-flight、429/5xx 预算、Cookie scope、Deep Link 多 URL/去重和平台行为矩阵接入 CI。

Session 代码现已实现 canonical Cookie expiry、精确 origin Web Storage、受限 IndexedDB schema/record 捕获恢复和恢复后 probe。Partitioned Cookie 因 Tauri Cookie API 不提供 partition key，HTTP probe 继续拒绝发送，不能降级为普通 Cookie；是否引入完整 RFC 6265 CookieStore 保留到目标平台行为验证之后。

## 远期

- [ ] 如恢复完整导出，实现 passphrase + KDF + AEAD 的可移植格式；当前 renderer 只能请求 sanitized export，后端继续拒绝 `encryptedFull`。
- [ ] 评估 TLS 指纹模拟和 Canvas/WebGL 指纹隔离；不得以降低安全边界为代价。
- [ ] 云端同步需先提交独立 RFC：仅支持 BYO endpoint、客户端加密、版本迁移、冲突处理和删除语义；不得内置维护者公共服务。
