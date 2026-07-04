# Account Manager 迭代规划

> 最后更新: 2026-07-05  
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)  
> 功能说明见 [features.md](./features.md) · 技术设计见 [design.md](./design.md)

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐⚬ | store / repository / use-cases 分层完成；controller 改用 useShallow 批量订阅 |
| 功能完备度 | ⭐⭐⭐⭐⚬ | Session 捕获/恢复/持久化/TTL/互斥/AuthProfile 完整；IndexedDB 导出待补 |
| 用户体验 | ⭐⭐⭐⚬⚬ | 撤销确认、toast、StatusBadge 好；Session 状态语义与空态仍可加强 |
| 性能 | ⭐⭐⭐⭐⚬ | Semaphore + 探针策略；多账号列表虚拟化仍缺 |
| 测试覆盖 | ⭐⭐⭐⚬⚬ | error-classifier + api 测试；session/probe 引擎无 Rust 单测 |
| 可维护性 | ⭐⭐⭐⭐⚬ | controller 已瘦身；v1/v2 双字段（local_storage + origins）待迁移收尾 |

## Backlog

- [ ] Session 状态/空态 UX（TTL、探针结果、代理状态一眼可读）
- [ ] 大列表虚拟化（多站点/多账号）
- [ ] TLS 指纹对抗 (rquest impersonate)
- [ ] Windows/Linux 跨平台 WebView 兼容
- [ ] Canvas/WebGL 指纹隔离

## 云端同步 (Cloud Sync) — **低优先级 / 可选**

> 详细设计见 [design.md §15 未来规划：云端同步](./design.md)  
> **开源默认 BYO 自托管**，不内置维护者公共 endpoint；本地 Import/Export 已满足迁移。

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
