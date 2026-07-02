# Account Manager 迭代规划

> 版本: v1.15.1 | 最后更新: 2026-07-02  
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)  
> 设计文档见 [README.md](./README.md) · [云端同步设计](./cloud-sync-design.md)

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

## v1.19 — 云端同步 (Cloud Sync) — **低优先级 / 可选**

> 详细设计见 [cloud-sync-design.md](./cloud-sync-design.md)（v1.4）  
> **开源默认 BYO 自托管**，不内置维护者公共 endpoint；本地 Import/Export 已满足迁移。见设计文档 §1.1（隐私、滥用、fork 误用）。

**排期建议**：晚于 v1.16 Session UX、v1.17 IndexedDB 导出；可与 v1.18 并列或更后。

### Phase 0：架构 ✅ 已定案

- [x] 参考实现：Cloudflare Workers + R2（$0 免费档）
- [x] API 形状：`/v1/blobs` + keyProof；Sync ID 格式见 cloud-sync-design
- [x] **Endpoint：用户 deploy 后填入设置，不写进仓库常量**
- [x] 大陆：不保证；本地 Import/Export fallback
- [x] 身份：Sync ID + key proof；MVP 数据范围见 cloud-sync-design §6.3

### Phase 1: MVP（backlog）

- [ ] `workers/bench-sync/` 模板 + BYO 部署文档（可先合入，无客户端依赖）
- [ ] Worker：`/v1/blobs` CRUD + keyProof + KV 限流
- [ ] `crypto.rs`：`argon2` + cloud 加解密 + keyProof
- [ ] `import_relay_data_from_json` + `cloud_sync.rs`（reqwest，读用户 endpoint）
- [ ] 设置 UI：`cloud_sync_endpoint`；空值禁用云同步
- [ ] 前端：上传/拉取/删除 + 同意勾选 + 大陆 fallback i18n

### Phase 2: 体验与 Session

- [ ] AuthProfile + Session 纳入 export/import
- [ ] 设备绑定、Sync ID 二维码、可选邮箱（仅恢复 Sync ID）
- [ ] 版本历史 / 回滚

### Phase 3: 协同

- [ ] 增量同步
- [ ] 多端冲突处理
- [ ] 只读分享（独立 proof 模型）
