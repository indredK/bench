# Account Manager Roadmap

架构与安全边界见 [design.md](./design.md)，风险、代码契约和验收矩阵见 [audit-and-upgrade-2026-07-13.md](./audit-and-upgrade-2026-07-13.md)。以下顺序是发布门禁，不得跳过前置阶段。

## 发布阻断

- [ ] Phase 0：暂时禁用或升级不可跨设备恢复的 encrypted full export。
- [ ] Phase 1：完成按 origin 的 local/session storage 与 IndexedDB 捕获/恢复；Session Cookie schema 保留 canonical expiry/partition key，再评估用 RFC 6265 CookieStore 取代手写 HTTP header。
- [ ] Phase 2：把 Deep Link listener 上移到 App 根层队列，并补 Windows single-instance 冷/热启动行为。
- [ ] Phase 3：网络代理改用显式 `PasswordAction`，补 Windows WebView capability；当前不支持时保持 fail-closed。
- [ ] Phase 4：删除返回逐资源 partial report；前端密码 reveal 增加按需获取和内存 TTL；实现 passphrase 可移植加密导入导出。
- [ ] Phase 5：分层重构、skeleton、区域错误/retry、窄屏详情和 500+ 账号虚拟列表。
- [ ] Phase 6：macOS/Windows 行为矩阵进入 CI 并在真机 smoke 通过；覆盖同账号 single-flight、429/5xx 重试预算、Cookie scope、Keyring 重启、WebView Session 恢复和 Deep Link 冷/热启动。

## 远期

- [ ] 评估 TLS 指纹模拟和 Canvas/WebGL 指纹隔离；不得以降低安全边界为代价。
- [ ] 云端同步需先提交独立 RFC：仅支持 BYO endpoint、客户端加密、版本迁移、冲突处理和删除语义；不得内置维护者公共服务。
