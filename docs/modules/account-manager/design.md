# Account Manager 技术设计

> 本文只记录安全边界、生命周期和修改入口；字段与命令以 Rust 类型和 IPC 契约为准。

## 1. 模块职责

Account Manager 管理站点、隔离账号、加密凭据、Session 捕获/恢复、认证探测和外部登录代理。

| 层 | 位置 | 职责 |
|----|------|------|
| 页面/controller | `src/features/account-manager/` | 三栏 UI、交互状态、业务入口 |
| use-case/repository | `services/` | 业务编排与 IPC 适配 |
| IPC | `src/lib/tauri/commands/account-manager.ts`、`contracts.ts` | 类型化命令边界 |
| 后端 | `src-tauri/src/account_manager/` | 加密、存储、Session、探针、WebView 和代理 |

Rust 关键文件：

- `types.rs`：Station、Account、Session、AuthProfile 等领域类型。
- `state.rs` / `storage.rs`：串行状态与落盘。
- `crypto.rs`：Keychain 主密钥与 AES-256-GCM。
- `session.rs`：Session 捕获、恢复、TTL 和退出持久化。
- `detection.rs` / `probe.rs`：认证检测与分层探针。
- `exclusivity.rs`：多账号互斥。
- `webview.rs` / `proxy/`：隔离 WebView 与外部登录代理。

## 2. 核心模型与兼容性

- `RelayStation` 表示站点；`StationAccount` 表示站点下的隔离账号。
- 账号分为 persistent 和 ephemeral；ephemeral 不参与启动恢复并在退出时清理。
- Session 包含 cookies、Web Storage、可选 IndexedDB/CSRF 信息和捕获元数据。
- AuthProfile 描述认证类型、token 存储、CSRF、SSO、anti-bot、指纹级别与 probe 策略。
- 互斥模式为 coexisting、exclusive、rotating；约束只作用于同一 exclusivity group。
- 持久化类型新增字段必须提供 serde 默认值；schema 变更必须支持旧数据读取和回滚。

不要在文档复制完整 struct。修改模型时同时检查 `types.rs`、TS DTO、storage migration 和契约测试。

## 3. Session 生命周期

```text
启动 -> 读取加密 store -> 恢复 persistent sessions -> probe 状态 -> UI 就绪
登录成功 -> 捕获 Session -> 加密 -> 更新状态 -> flush
退出 -> 捕获 Ready sessions -> 清理 ephemeral -> flush -> 退出
```

强制约束：

- HttpOnly cookie 只能通过 WebView 原生 cookie API 获取。
- local/session storage 仅按 AuthProfile 需要读取；明文不得进入前端 store 或日志。
- 恢复后必须 probe，不能仅凭 cookie 存在标记 Ready。
- TTL 清理和退出持久化必须幂等；失败需要可见错误或明确降级状态。
- 每个账号使用独立 data directory/data store，禁止跨账号复用浏览上下文。

## 4. 检测与分层探针

AuthProfile 检测从页面、cookie、Web Storage、CSRF、SSO、anti-bot 和 WebSocket 信号生成候选策略。

探针顺序：

1. L1 HTTP：低成本验证登录态。
2. L2 WebView：HTTP 不确定、JS challenge 或 anti-bot 时使用。
3. L3 Hybrid：SSO、复杂重定向或设备绑定场景。

探针结果必须区分 Ready、LoginRequired、Expired、Uncertain、AntiBotBlocked、SsoChallenge 和 NetworkError。Uncertain 才允许升级探针，避免所有账号默认创建 WebView。

## 5. 加密与存储

- 主密钥来自系统 Keychain；首次使用生成随机 256-bit key。
- 密码和 Session 使用 AES-256-GCM，每次写入生成独立 nonce。
- 解密只发生在 Rust 内存中；日志、事件和前端 DTO 不得包含密码、token、cookie 或明文 Session。
- store 写入由 `AccountManagerState` 串行化并显式 flush；Dev/Prod 共用 bundle ID 时遵守 [共存策略](../../dev-prod-coexistence.md)。
- 导出默认使用 sanitized 模式；包含凭据的导出必须保持加密并明确告知用户。

## 6. 外部登录代理

支持自定义协议 `bench-auth://authorize` 和 RFC 8252 loopback 回调。

安全约束：

- `target` 必须是合法登录 URL；hostname 使用 URL parser，不做字符串裁剪。
- `return` 只允许受控自定义 scheme 或 `localhost/127.0.0.1/::1` loopback；拒绝任意 http(s)、file 和 javascript。
- `site` 只能预选已有候选，不能扩大授权范围。
- 只有 `proxy_enabled` 账号可参与匹配；关闭代理时撤销 binding 并写审计记录。
- Bench 不解析或转发 token，只在 WebView 命中 return URL 后将原始 callback 交还外部 App。
- 自动填充只填写字段，默认不自动提交。

站点匹配优先级：精确 host -> eTLD+1 -> 已知 SSO provider。任何模糊匹配都不能绕过用户选择和账号授权。

## 7. 前端边界

- 组件只消费 controller；平台调用经 use-case/repository/类型化 IPC。
- Zustand 只保存 UI 与领域状态，不保存明文凭据。
- quick login、删除、代理开关、重新检测等异步动作必须防重入。
- 删除、吊销代理、覆盖导入等危险操作必须二次确认并展示结果。
- 所有失败、空状态、过期状态和探针降级均支持中英文。

## 8. 修改检查表

- [ ] 模型变更同步 Rust/TS/serde 默认值和 migration。
- [ ] IPC 变更同步 `contracts.ts`、command wrapper 和 Rust 注册。
- [ ] Session/代理变更检查日志脱敏、账号隔离和 URL allowlist。
- [ ] 异步 effect/listener 有清理，重复操作有 guard。
- [ ] `pnpm run test:critical` 与相关 Rust 测试通过。
- [ ] 未完成功能只记录在 [roadmap.md](./roadmap.md)，不在设计文档展开未来方案。
