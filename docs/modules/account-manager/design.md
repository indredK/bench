# Account Manager 技术设计

> 本文记录安全边界、生命周期和修改入口；字段与命令以 Rust 类型和 IPC 契约为准。核心后端可靠性已完成首轮整改，剩余平台/UX 阻断项见 [生产可靠性审计](./audit-and-upgrade-2026-07-13.md)。

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

schema v5 起，`AccountManagerSnapshot.sessions` 是唯一 Session 真理源；旧 `account.session` 只读迁移且不再序列化。捕获、恢复注入、TTL、导入导出和互斥必须使用 canonical map，Ready 必须由 probe 验证。

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

并发与网络预算：

- 全局 semaphore 限制同时运行的 probe 数量；账号级 single-flight 把同账号并发刷新合并为一次执行，follower 共享 leader 的成功或结构化错误。
- leader 被取消或 future 被 drop 时必须唤醒 follower 并清理 registry；禁止 waiter 无限等待，也禁止两个 probe 争用同一 WebView label。
- HTTP probe 只接受无嵌入凭据的 `http/https` URL，禁止自动 redirect；本机开发站点可继续使用 loopback HTTP。
- 单请求 timeout 4 秒，HTTP 总预算 10 秒，最多 3 次。只重试 408/429/500/502/503/504 和 connect/timeout，使用 200 ms 基数、2 秒上限的 full-jitter 指数退避。
- `Retry-After` 不超过 2 秒时服从服务端；超过交互预算时停止 HTTP 重试并返回不确定结果，由策略决定是否升级 WebView，不得提前重试违反服务端节流。
- HTTP probe 使用捕获 Session 的 User-Agent；Cookie 必须满足 host/domain、RFC 6265 path boundary 和 secure 约束。缺少 partition key 时 partitioned Cookie 不得降级发送。

探针结果必须区分 Ready、LoginRequired、Expired、Uncertain、AntiBotBlocked、SsoChallenge 和 NetworkError。Uncertain 才允许升级探针，避免所有账号默认创建 WebView。

上述边界参考的开源实现、固定 commit、License 和未采用原因见 [审计文档 §10](./audit-and-upgrade-2026-07-13.md#10-github-参考实现与采纳矩阵)。修改重试或 Session 语义时必须同步更新该矩阵和行为测试。

## 5. 加密与存储

- 主密钥来自系统 Keychain；首次使用生成随机 256-bit key。
- 密码和 Session 使用 AES-256-GCM，每次写入生成独立 nonce。
- 解密只发生在 Rust 内存中；日志、事件和前端 DTO 不得包含密码、token、cookie 或明文 Session。
- store 写入由 `AccountManagerState` 串行化并显式 flush；Dev/Prod 共用 bundle ID 时遵守 [共存策略](../../dev-prod-coexistence.md)。
- Keyring 首建和 store mutation 使用跨进程文件锁；mutation 在锁内 reload 磁盘 canonical snapshot 后再 save/replace，禁止 last-write-wins 覆盖。
- 导出默认使用 sanitized 模式；包含凭据的导出必须保持加密并明确告知用户。

## 6. 外部登录代理

支持自定义协议 `bench-auth://authorize` 和 RFC 8252 loopback 回调。

安全约束：

- Deep Link 只由 Rust App 根 listener 接收；最多排队 32 条，每条最多 32 KiB，按 FIFO 消费并用短时 SHA-256 指纹去重。原始 `bench-auth://` URL 不发送到 renderer。
- Windows 使用第一个注册的 `tauri-plugin-single-instance`（启用 `deep-link` feature）把第二实例参数交回主实例，并聚焦主窗口；前端只监听无敏感 URL 的 pending 事件，再调用无参数 drain IPC。
- `target` 必须是合法登录 URL；hostname 使用 URL parser，不做字符串裁剪。
- `handle_browser_open` 签发 5 分钟一次性 ticket；启动登录 IPC 只接受 `ticketId + accountId`，不接受 renderer 重传 target/return。
- `return` 只允许受控自定义 scheme 或 `localhost/127.0.0.1/::1` loopback；拒绝任意 http(s)、file 和 javascript。
- callback 必须精确匹配 scheme、host、有效端口和 path；请求带 state 时 callback 必须回传相同 state。
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
