# Account Manager 迭代规划

> 版本: v1.15.0 | 最后更新: 2026-07-01  
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)  
> 设计文档见 [README.md](./README.md)

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐⚬ | store / repository / use-cases 分层完成；Tauri 命令在 `lib/tauri/commands/` |
| 功能完备度 | ⭐⭐⭐⭐⚬ | Session 捕获/恢复/持久化/TTL/互斥/AuthProfile 完整；IndexedDB 导出待补 |
| 用户体验 | ⭐⭐⭐⚬⚬ | 撤销确认、toast、StatusBadge 好；Session 状态语义与空态仍可加强 |
| 性能 | ⭐⭐⭐⭐⚬ | Semaphore + 探针策略；多账号列表虚拟化仍缺 |
| 测试覆盖 | ⭐⭐⭐⚬⚬ | error-classifier + api 测试；session/probe 引擎无 Rust 单测 |
| 可维护性 | ⭐⭐⭐⭐⚬ | controller 已瘦身；v1/v2 双字段（local_storage + origins）待迁移收尾 |

## ✅ 已交付 (v1.15.x)

- [x] Quick Login 走 `openLoginWindow` WebView（`quickLogin` use-case）
- [x] `persist_session` + `flush_to_disk`（Rust session/storage）
- [x] i18n: DetailColumn 用户可见文案改为 `t()`
- [x] 组件层经 controller / use-cases，不再直调 feature `api.ts`
- [x] 异步重入保护（delete / toggleProxy / redetect / quickLogin 等 `useGuardedAsync`）
- [x] `removeExternalApp` + `DestructiveConfirmDialog` 二次确认
- [x] `store.ts` / `account-manager.repository.ts` / `account-manager.use-cases.ts`
- [x] `api.ts` → `lib/tauri/commands/account-manager.ts` + repository
- [x] Tauri 命令契约 → `@/lib/tauri/contracts`（全局）
- [x] `sortable-card` 提升至 `components/ui/`

## v1.16 — 剩余

- [ ] AccountSession v1→v2 迁移逻辑（读取旧 `local_storage` 写入 `origins`）
- [ ] Session 状态/空态 UX（TTL、探针结果、代理状态一眼可读）
- [ ] 大列表虚拟化（多站点/多账号）

## v1.17 — 中期增强

- [ ] IndexedDB 导出集成 `idb-backup-and-restore.js`
- [ ] Session TTL 过期自动清理 + 启动时检查

## v1.18 — 远期 (Phase 3)

- [ ] per-station HTTP/SOCKS5 代理集成
- [ ] TLS 指纹对抗 (rquest impersonate)
- [ ] Windows/Linux 跨平台 WebView 兼容
- [ ] Canvas/WebGL 指纹隔离
