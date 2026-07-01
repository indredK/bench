# Account Manager 迭代规划

> 版本: v1.15.0 | 最后更新: 2026-07-01

## v1.9 — 近期修复 (1-2 天)

- [ ] Ephemeral QuickLogin 走 WebView 而非 openExternal
- [ ] AccountSession v1→v2 迁移逻辑（local_storage → origins）
- [ ] 增量保存: persist_session + flush_to_disk
- [ ] i18n: DetailColumn 中 7 处硬编码中文改为 t()
- [ ] 组件层不再直接调 Tauri api（DetailColumn/auth-proxy-dialog/external-apps-panel 改走 controller）
- [ ] 异步操作重入保护（delete/toggleProxy/redetect/quickLogin 加锁）
- [ ] removeExternalApp 加二次确认

## v1.10 — 中期增强 (3-5 天)

- [ ] contracts.ts 集中管理 30+ Tauri 命令
- [ ] api.ts → repository.ts 命名规范化
- [ ] 缺失组件补全: store.ts / use-cases.ts / repository.ts
- [ ] IndexedDB 导出集成 idb-backup-and-restore.js
- [ ] Session TTL 过期自动清理
- [ ] 启动时检查 Session TTL + 过期清理

## v2.0 — 远期 (Phase 3)

- [ ] per-station HTTP/SOCKS5 代理集成
- [ ] TLS 指纹对抗 (rquest impersonate)
- [ ] Windows/Linux 跨平台 WebView 兼容
- [ ] Canvas/WebGL 指纹隔离
