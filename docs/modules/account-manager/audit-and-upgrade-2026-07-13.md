# Account Manager 生产可靠性审计与升级规范

> 审计日期：2026-07-13  
> 结论：**REQUEST CHANGES**  
> 置信度：**High**  
> 目标平台：macOS、Windows  
> 当前状态：两个目标平台均不得标记为生产就绪。

本文是本轮审计发现和整改顺序的唯一专题真理源。长期安全边界见 [design.md](./design.md)，完成状态只在 [roadmap.md](./roadmap.md) 更新；不要在其他文档复制问题明细。

## 1. 范围与证据

审计覆盖：

- 前端页面、controller、Zustand、use-case、repository、i18n、加载/空/错误态、响应式和大列表。
- Rust 状态、加密、存储、Session 捕获/恢复/TTL、探针、互斥、导入导出、删除和剪贴板。
- 外部登录代理、Deep Link、callback 转交、WebView 数据隔离和自动填充。
- TypeScript/Rust IPC 契约、批量结果、错误边界以及 macOS/Windows 能力对等。
- 并发原子性、跨进程覆盖、资源上限和测试门禁。模块当前没有数据库，因此连接池风险不适用；等价的数据一致性风险集中在 plugin-store、Keyring 和 WebView data directory。

已执行：

```text
pnpm exec vitest run src/features/account-manager  -> 2 files / 5 tests passed
cargo test account_manager                         -> 40 tests passed
```

现有测试主要覆盖 IPC wrapper、错误分类、加密 roundtrip、URL helper 和 reorder。它们没有证明 Session 生命周期、存储迁移/并发、Deep Link/WebView、批量 partial、敏感信息清理或 Windows 行为正确。本机没有安装 Windows Rust target，本次不能宣称 Windows 行为已通过。

## 2. 结论与平台事实

| 能力 | macOS | Windows | 审计结论 |
|------|:-----:|:-------:|----------|
| 页面入口 | ⚠️ | ❌ | `feature.tsx:18-19` 只允许 macOS |
| 站点/账号 CRUD | ⚠️ | ⚠️ | 基础 IPC 存在，但删除残留和跨进程覆盖未解决 |
| 加密凭据 | ⚠️ | ⚠️ | AES-GCM/Keyring 已接入；首次建钥有竞态，未做目标平台行为验收 |
| Session 捕获/恢复/TTL | ❌ | ❌ | 双数据源；启动恢复未注入 Cookie/Storage，也未 probe；退出捕获不落盘 |
| 隔离 WebView | ⚠️ | ⚠️ | macOS 使用 data store identifier；Windows 仅 data directory，缺行为证据 |
| 网络代理 | ⚠️ | ❌ | 仅 macOS builder 应用 proxy；解析/解密失败会静默直连 |
| 外部登录代理 | ❌ | ❌ | callback 授权、精确匹配和凭据注入边界存在高危缺口 |
| 批量刷新/探针 | ❌ | ❌ | partial 被丢弃；用户选择的 ProbeStrategy 不驱动执行 |
| 导入导出 | ❌ | ❌ | encrypted full 不可可靠跨设备，且缺资源上限和版本拒绝 |
| 目标平台测试 | ⚠️ | ⚠️ | CI 能编译/跑通用测试，不等于 WebView、Keyring、Deep Link 行为验收 |

`✅` 只能用于在对应真机/runner 上通过本文验收矩阵的能力。当前最严重的问题会导致登录态丢失、错误账号状态、密码注入错误站点或授权范围被 renderer 绕过，不能以“后续补测试”降级处理。

| 优先级 | 数量 | 发布含义 |
|--------|-----:|----------|
| P0 / High | 7 | 立即冻结相关危险路径，修复前不得发布 |
| P1 / High | 8 | 必须在生产就绪前关闭 |
| P2 / Medium | 2 | 在双平台验收前完成 |

当前值得保留的基线：

- 前端页面已经 lazy load，主要用户文案通过 i18n；`pnpm run lint:fe` 的 i18n/static guard 通过。
- 多数写操作已使用 `useGuardedAsync`，controller 通过 selector 订阅 Zustand，并正确清理自身 timer。
- TS/Rust IPC 已集中声明，Rust 命令使用结构化 `AccountManagerResult`，没有把错误统一退化为字符串。
- `storage::with_state_mut` 的 clone -> save -> replace 顺序能避免单进程内“磁盘失败但内存先提交”，probe 也已有并发 semaphore。这些设计需要升级为单一 coordinator 和跨进程协议，而不是推倒重写。
- 密文使用 AES-256-GCM 且每次生成 nonce，已有加密 roundtrip 测试；问题在密钥初始化、迁移和明文生命周期，不在算法选择。

## 3. 发现与重构要求

### A-01 Session 存在双真理源，恢复链路实际无效

**Risk [后端]**：`state.rs:15-24` 同时保存 `accounts[].session` 和 `sessions` map；`session.rs:143-153` 捕获时只更新 map，而启动恢复和 TTL 分别在 `session.rs:186`、`session.rs:313` 先检查 `account.session`。导出又在 `commands.rs:151-159` 读取 `account.session`。即使进入恢复分支，`session.rs:193-197` 也只解密到局部变量，没有向 WebView 注入 Cookie/Storage，更没有 probe。

**Severity**：P0 / High。正常捕获的登录态无法可靠恢复、过期或导出，UI 的 Ready 不是可验证事实。

**Refactor**：删除 `StationAccount.session`，以 `sessions: HashMap<AccountId, SessionRecord>` 为唯一真理源；所有状态变化通过 coordinator 完成。恢复必须执行 `decrypt -> inject -> probe -> commit status`，任何一步失败都返回明确状态。

```rust
#[derive(Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub encrypted_payload: EncryptedBlob,
    pub captured_at_utc: i64,
    pub expires_at_utc: Option<i64>,
    pub revision: u64,
}

pub async fn restore_one(
    ctx: &AccountManagerContext,
    account_id: &str,
) -> AccountManagerResult<AccountSessionStatus> {
    let record = ctx.read_session(account_id)?.ok_or(AccountManagerError::SessionMissing)?;
    let session = ctx.decrypt_session(&record)?;
    ctx.webviews.inject_session(account_id, &session).await?;
    let outcome = ctx.probes.run(account_id).await?;
    ctx.commit_status(account_id, outcome.status).await?;
    Ok(outcome.status)
}
```

迁移只允许单向、可重复执行：schema v4 同时存在两个字段时优先验证 `sessions` map；只有 map 缺失且 `account.session` 可解密时才迁入；迁移完成后原子保存 schema v5。不得把解密失败当作空 Session。

**Philosophy**：单一真理源消除捕获、TTL、导出和恢复各读一套状态的分叉；Ready 由实际 probe 产生，而不是由 Cookie 存在或旧字段推断。

### A-02 退出、TTL 和登录完成会吞错并报告成功

**Risk [后端]**：`session.rs:94-139` 忽略 Cookie 提取、加密和保存错误后仍无条件写 Ready；`session.rs:216-247` 退出时只改内存 map，`lib.rs:200-205` 随后也没有 flush；`cleanup_ephemeral()` 只改内存。`session.rs:345-356` 忽略持久化错误却返回 cleared。

**Severity**：P0 / High。进程退出后数据丢失，临时账号可能在下次启动复活，失败状态被伪装成成功。

**Refactor**：所有生命周期函数返回 `AccountManagerResult<Report>`，先构造 next snapshot，再持久化，成功后才发布内存状态和事件。退出不得无限阻塞，需有总 timeout，并将未保存结果记录为启动可见的 recovery issue。

```rust
pub async fn finalize_proxy_session(...) -> AccountManagerResult<SessionFinalizeReport> {
    let captured = capture_session(...).await?;
    let encrypted = encrypt_session(&captured)?;
    storage.mutate_and_flush(|next| {
        next.sessions.insert(account_id.to_owned(), encrypted);
        next.account_mut(account_id)?.status = AccountSessionStatus::Ready;
        Ok(())
    }).await?;
    events.emit_session_completed(account_id)?;
    Ok(SessionFinalizeReport { account_id: account_id.into(), status: Ready })
}
```

**Philosophy**：持久化成功是状态提交的前置条件。错误不能通过 `let _ =` 消失，更不能让 UI 收到“已完成”。

### A-03 首次创建主密钥存在进程内和跨进程竞态

**Risk [后端]**：`state.rs:81-87` 先调用 Keyring 再尝试 `OnceLock::set`；`crypto.rs:22-49` 的 read-then-create 也没有互斥。两个并发首次调用可能各生成一把 key，Keychain 最终值与某个进程内缓存不同；Dev/Prod 同 bundle ID 时还会跨进程竞争，重启后现有密文不可解。

**Severity**：P0 / High。可能造成全部密码和 Session 永久不可解。

**Refactor**：进程内使用 `OnceCell::get_or_try_init`；创建 Keyring 项前持有跨进程文件锁，写后重新读取并逐字节校验。Keychain 与 store 的命名空间必须包含环境或改用不同 bundle identifier。

```rust
pub fn master_key(&self) -> AccountManagerResult<[u8; 32]> {
    self.master_key
        .get_or_try_init(|| crypto::get_or_create_master_key_locked(&self.key_lock_path))
        .copied()
}

fn get_or_create_master_key_locked(path: &Path) -> AccountManagerResult<[u8; 32]> {
    let lock = open_lock_file(path)?;
    lock.lock_exclusive()?;
    let key = read_keyring()?.unwrap_or_else(generate_key);
    write_keyring_if_absent(&key)?;
    let canonical = read_keyring()?.ok_or(AccountManagerError::KeyringUnavailable)?;
    lock.unlock()?;
    Ok(canonical)
}
```

**Philosophy**：加密强度不能补救密钥生命周期竞态。密钥初始化必须是跨线程、跨进程的一次性事务。

### A-04 IPC 没有真正建立外部登录授权边界

**Risk [后端/前端]**：`commands.rs:1672-1678` 校验 return URL 失败后只记日志并继续；`proxy_login` 在 `commands.rs:1626-1635` 可被 renderer 直接调用，未重新验证 target/return；`record_proxy_usage()` 在登录完成前自动创建 App 和 binding。renderer 可绕过前端确认，提交不同 URL 或扩大授权。

**Severity**：P0 / High。IPC 是信任边界，不能把“UI 已确认”当作授权证明。

**Refactor**：`handle_browser_open` 只在完整校验后签发一次性 `AuthProxyAuthorizationTicket`；后续 IPC 只接收 `ticketId + accountId`，后端原子消费 ticket、校验有效期/候选账号/未使用状态。登录完成后才写 binding 和 use count。

```ts
type BeginAuthProxyResult = {
  ticketId: string
  expiresAt: number
  display: { targetOrigin: string; callbackOrigin: string }
  candidates: AuthProxyMatch[]
}

type StartAuthProxyInput = {
  ticketId: string
  accountId: string
}
```

```rust
let ticket = tickets.consume(&ticket_id)?;
ticket.require_not_expired(now)?;
ticket.require_candidate(&account_id)?;
open_login_window(&ticket.target, &ticket.callback, &account_id).await?;
```

**Philosophy**：renderer 只做展示与选择，授权范围由后端 canonical ticket 固化；重放、参数替换和绕过确认都必须失败。

### A-05 loopback 和 callback 匹配可被错误主机/路径触发

**Risk [后端]**：`protocol.rs:131-137` 用 `starts_with("127.")` 判断 loopback，`127.evil.com` 会被接受。`webview.rs:142-159` 命中任意 loopback URL 就完成当前登录，没有要求与请求中的 scheme、IP、port、path 一致。

**Severity**：P0 / High。恶意或意外导航可提前结束授权、捕获错误 Session 并把账号标记 Ready。

**Refactor**：用 URL parser 的结构化 host 和 `IpAddr::is_loopback()`；授权 ticket 保存规范化 `CallbackSpec`，导航只与该 spec 精确匹配。`localhost` 默认不允许子域；动态 loopback port 也必须从初始 redirect URI 固化。

```rust
pub fn is_loopback(url: &Url) -> bool {
    match url.host() {
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        Some(url::Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        None => false,
    }
}

fn matches_callback(actual: &Url, expected: &CallbackSpec) -> bool {
    actual.scheme() == expected.scheme
        && actual.host_str() == expected.host.as_deref()
        && actual.port_or_known_default() == expected.port
        && actual.path() == expected.path
}
```

**Philosophy**：URL 安全校验必须比较解析后的身份，不做字符串前缀猜测；callback 是一次授权中的精确终点，不是“任意本机 URL”。

### A-06 自动填充可能把密码注入错误站点

**Risk [后端/前端]**：`commands.rs:1568-1612` 固定等待 2 秒后向 WebView 当前页面填充账号密码，没有确认页面仍属于 Station 的授权 origin。Auth Proxy 又允许用户从候选外手动选择账号，恶意 Deep Link 可诱导用户把保存密码注入攻击者页面。

**Severity**：P0 / High。属于凭据泄露边界缺失。

**Refactor**：默认改为用户点击“填充”；后端从 WebView 读取当前 URL，按 Station 的显式 `credentialOrigins` 精确校验 scheme/host/port，页面跳转时撤销 fill capability。密码只在校验后的单次调用中解密，完成后立即释放。

```rust
pub async fn fill_credentials(ticket_id: &str, account_id: &str) -> AccountManagerResult<()> {
    let ticket = tickets.require_active(ticket_id, account_id)?;
    let current = webviews.current_url(account_id).await?;
    ticket.require_credential_origin(&current)?;
    let password = Zeroizing::new(secrets.decrypt_password(account_id)?);
    webviews.fill_without_submit(account_id, &password).await
}
```

**Philosophy**：保存密码的授权对象是具体 origin，不是“当前窗口”。时间延迟不是安全检查，显式用户动作也不能替代后端 origin 校验。

### A-07 Deep Link 注册和监听生命周期错误

**Risk [前端/后端配置]**：`tauri.conf.json:81-88` 除 `bench-auth` 外还注册标准 `http`/`https` scheme，可能干扰系统默认浏览器并扩大入口。`useAuthProxy.ts:54-83` 只在 Account Manager 页面挂载 listener，用户位于其他页面时事件可能丢失；多个 URL 也没有持久队列或去重。

**Severity**：P0 / High（标准 scheme 注册）；P1 / High（事件丢失）。

**Refactor**：配置只注册 `bench-auth`。在 App 根层建立唯一 `DeepLinkInbox`，先做大小/数量限制、去重和 schema 校验，再把受控请求排队；Account Manager 只消费队列。队列不得持久化完整 OAuth URL。

```json
"deep-link": {
  "desktop": { "schemes": ["bench-auth"] }
}
```

```ts
type DeepLinkInboxState = {
  pending: Array<{ id: string; ticketId: string; receivedAt: number }>
  enqueue: (item: DeepLinkTicket) => void
  consume: (id: string) => void
}
```

**Philosophy**：操作系统入口由应用根生命周期拥有；功能页面不是可靠事件总线。标准 URL scheme 永远不应被功能模块顺手注册。

### A-08 批量刷新把 partial 伪装成完整成功

**Risk [后端/前端]**：`commands.rs:890-916` 丢弃单账号 `Err`，只返回成功账号。`useAccountManagerController.ts:373-385` 用返回数组整体替换 store，失败账号会从 UI 消失；Station refresh 也无法区分“未返回”和“成功但 fetchFailed”。

**Severity**：P1 / High。部分网络错误会表现为账号丢失或虚假成功。

**Refactor**：IPC 返回完整 `RefreshReport`；每个请求 ID 必须落入 succeeded/failed/cancelled 之一。前端按 ID merge succeeded，保留 failed 的旧数据并显示汇总，不用子集替换全量列表。

```ts
type RefreshReport = {
  total: number
  succeeded: StationAccount[]
  failed: Array<{ accountId: string; error: CommandErrorDto }>
  cancelled: string[]
}

setAccounts(prev => {
  const next = new Map(prev.map(item => [item.id, item]))
  report.succeeded.forEach(item => next.set(item.id, item))
  return [...next.values()]
})
```

**Philosophy**：批量操作的 contract 必须守恒；失败不是空值，旧的可信数据也不能因一次 partial response 被删除。

### A-09 ProbeStrategy、失败计数和文档能力没有连接到执行

**Risk [后端/前端]**：`probe.rs:1` 宣称 HTTP HEAD + adaptive，实际 `run_probe()` 只创建 WebView；`refresh_one_impl()` 在 `commands.rs:833-875` 不读取 `auth_profile.probe_strategy`；`probe_failure_count` 只在设置策略时归零，没有累加。UI 中 HttpFirst/HttpOnly/Hybrid 的选择不会改变行为。

**Severity**：P1 / High。用户设置无效，刷新成本、anti-bot 行为和 Windows 兼容性均不可预测。

**Refactor**：建立 `ProbeEngine`，输入 `ProbePlan`，输出含 evidence 和可本地化 reason code 的结果。HTTP 请求设置总 timeout、redirect limit、响应体上限；WebView 使用全局 semaphore 和取消 token。只有 Uncertain 才升级层级。

```rust
pub enum ProbePlan { HttpOnly, HttpThenWebView, WebViewOnly, Hybrid }

pub struct ProbeReport {
    pub status: AccountSessionStatus,
    pub level: ProbeLevel,
    pub reason_code: ProbeReasonCode,
    pub elapsed_ms: u64,
}
```

策略行为必须有表驱动测试，且成功时清零 failure count、可重试失败时原子递增、达到阈值后只按设计切换计划。

**Philosophy**：配置必须驱动真实执行，否则它只是误导性 UI。分层探针用证据升级，而不是默认创建昂贵 WebView。

### A-10 删除和互斥没有清理完整账号边界

**Risk [后端]**：`commands.rs:360-392`、`commands.rs:520-536` 只清 accounts/secrets，没有完整清 sessions、external bindings/references 和活动窗口。`exclusivity.rs:29-46` 只清 `account.session`，不清 sessions map、Cookie/data store。`webview.rs:36-41` 同步删除目录并吞错，UI 仍报告删除成功。

**Severity**：P1 / High。敏感数据残留；Exclusive 模式不能真正隔离账号。

**Refactor**：实现唯一 `AccountDataEraser`，按 `close windows -> revoke bindings -> remove secrets/session -> delete WebView store -> atomic snapshot commit` 执行并返回逐项报告。不可恢复的文件清理失败必须使结果为 partial/failed，不得静默成功。

```rust
pub struct EraseAccountReport {
    pub account_id: String,
    pub metadata_removed: bool,
    pub webview_data_removed: bool,
    pub warnings: Vec<CommandErrorDto>,
}
```

Exclusive 切换必须复用同一清理原语；若产品要“仅注销但保留账号”，为它定义单独的 `revoke_session()`，不要复用删除。

**Philosophy**：删除是跨资源事务，不能等同于从 Vec 移除一行。互斥语义必须作用于真实浏览上下文，而不只是展示状态。

### A-11 网络代理会 fail-open，密码更新语义也不可靠

**Risk [后端/前端]**：`commands.rs:306-320` 把 Keyring/解密错误折叠成无密码或直连；`webview.rs:120-127` 解析 proxy URL 失败也静默忽略。Windows builder 不应用 proxy。`account-manager.use-cases.ts:52-66` 在 host/port 改变且密码留空时发送 null，后端 `commands.rs:322-345` 将 null 解释为清除，与 UI“留空保持”冲突。

**Severity**：P1 / High。用户以为通过代理访问，实际可能泄露真实网络出口；已有代理密码会被意外清除。

**Refactor**：配置了代理就必须 fail-closed；能力不足返回 `unsupported`，解密/解析失败返回 `proxyUnavailable`。用显式 union 代替 nullable 密码。

```ts
type PasswordAction =
  | { action: "keep" }
  | { action: "set"; value: string }
  | { action: "clear" }

type PlatformCapability =
  | { status: "supported" }
  | { status: "unsupported"; reasonCode: string }
  | { status: "failed"; error: CommandErrorDto }
```

**Philosophy**：安全设置不能静默降级；`null` 同时表达 keep/clear 是典型兼容性陷阱，必须让意图进入类型系统。

### A-12 导入导出缺少可移植加密、版本和资源边界

**Risk [后端]**：`commands.rs:590-620` 在 IPC 线程直接做阻塞文件 I/O，未限制文件大小、站点数、账号数或字符串长度；`commands.rs:655-660` 用当前机器 master key 解密导入 blob，跨设备失败后静默跳过 Session；导出 Session 又受 A-01 双数据源影响。代码未拒绝未知 export version，写文件也不是原子替换。

**Severity**：P1 / High。大文件可造成卡顿/内存压力；encrypted full 名不副实，迁移后凭据或 Session 悄悄缺失。

**Refactor**：sanitized 继续作为默认。full export 使用用户 passphrase 经 Argon2id 派生 export key，每文件独立 salt/nonce；导入先验证 header/version/大小/计数，再解密和构造完整 next snapshot，最后一次原子提交。文件 I/O 进入 `spawn_blocking`。

```rust
pub struct ExportEnvelopeV2 {
    pub format: String,          // "bench-account-export"
    pub version: u16,           // exact supported version
    pub kdf: Argon2Params,
    pub salt_b64: String,
    pub payload: EncryptedBlob,
}

const MAX_IMPORT_BYTES: u64 = 16 * 1024 * 1024;
const MAX_STATIONS: usize = 2_000;
const MAX_ACCOUNTS: usize = 20_000;
```

结果必须报告 imported/skipped/failed 及原因；不允许 `.ok().flatten()`。

**Philosophy**：本机静态 master key 适合本机静态数据，不是导出协议。导入属于不可信数据边界，必须先限额、再解析、后提交。

### A-13 plugin-store 没有跨进程并发控制

**Risk [后端]**：`storage.rs:197-215` 只用进程内 `RwLock` 串行化 clone/save/replace；[dev-prod-coexistence.md](../../dev-prod-coexistence.md) 已确认 Dev/Prod 共享 store 和 Keychain 且无进程锁。两个实例会后写覆盖前写。

**Severity**：P1 / High。账号、密码、Session 和授权 binding 都可能丢失更新。

**Refactor**：首选 dev/prod 使用不同 identifier 和数据目录。生产进程建立单实例锁；若必须允许多实例，存储需跨进程排他锁、`revision` compare-and-swap、重新读取合并和原子 rename，冲突返回 `STORE_CONFLICT`，不能自动 last-write-wins。

```rust
pub struct VersionedSnapshot {
    pub schema_version: u32,
    pub revision: u64,
    pub data: AccountManagerSnapshot,
}
```

**Philosophy**：进程内锁只保护一个地址空间。高价值账号数据必须明确单写者或冲突协议，不能靠“通常不会同时打开”保证。

### A-14 明文密码和敏感 URL 的生命周期过长

**Risk [前端/后端]**：编辑弹窗在 `dialogs.tsx:518-547` 一打开就 reveal 密码并长期保留在 React state；`DetailColumn.tsx:102-125` 隐藏后不清除已解密值；`commands.rs:755-772` 写入剪贴板后不清理；`useQuickLoginHistory.ts:6-27` 把完整 URL 存 localStorage，OAuth code/token/state/query 可能被持久化。

**Severity**：P1 / High。

**Refactor**：编辑默认显示“已设置”，只有用户主动 reveal/change 才取明文；隐藏、切换账号、关闭弹窗或 30 秒 TTL 时清空 state。剪贴板写入后延迟读取，只有内容仍等于本次值时清空，避免覆盖用户的新内容。Quick Login 只存规范化 `https origin`，默认丢弃 path/query/fragment。

```ts
function sanitizeHistoryUrl(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== "https:") throw new Error("HTTPS_REQUIRED")
  return url.origin
}
```

Rust 中解密结果使用 `zeroize::Zeroizing<String>`；日志和事件 DTO 只传 accountId/reason code，不传 URL query、cookie、token 或 password。

**Philosophy**：加密 at rest 不代表明文生命周期安全。敏感值应按需出现、最短驻留、离开交互边界立即清除。

### A-15 平台能力声明与真实实现不一致

**Risk [前端/后端]**：`feature.tsx:18-19` 明确只启用 macOS；Rust 大量代码可以在 Windows 编译，但 proxy 仅在 macOS builder 生效，WebView data store、Keyring、Deep Link 和 Cookie API 没有 Windows 行为测试。现有平台文档却曾把 macOS 标为 ✅。

**Severity**：P1 / High。编译通过被误认为功能对等，Windows 用户看不到入口，macOS 核心 Session 也仍不可用。

**Refactor**：新增后端 `get_account_manager_capabilities`，按能力返回 supported/partial/unsupported/failed 和 reason code；前端通过 `RuntimeFeatureGate` 展示，不在 feature 元数据里永久排除 Windows。能力状态用于禁用具体按钮，不用于把失败伪装成空结果。

```ts
type AccountManagerCapabilities = {
  credentialStore: Capability
  isolatedWebview: Capability
  sessionCapture: Capability
  sessionRestore: Capability
  networkProxy: Capability
  deepLink: Capability
}
```

**Philosophy**：跨平台对等是逐能力的行为承诺，不是 `cfg` 能编译。平台差异应集中在 provider/capability 层，不能散落为 UI 猜测。

### A-16 首载、响应式和大列表体验不符合项目 UX 规范

**Risk [前端]**：`page.tsx:26-31` 首载只显示文字；`DetailColumn.tsx:140` 在 `< xl` 完全隐藏且没有 Drawer/Sheet；站点、账号和 External Apps 直接 map，无虚拟化；`external-apps-panel.tsx:79-86` 加载只有文字，失败只有 toast、面板内无 retry。Auth Proxy 的成功反馈仅表示窗口已打开，不代表登录完成。

**Severity**：P2 / Medium。

**Refactor**：

- 首载使用与三栏最终布局同尺寸的 skeleton；刷新保留旧数据，显示 indeterminate 或 `completed/total` 进度。
- `< xl` 选中账号后用 Sheet/Drawer 展示 Detail，支持返回和焦点恢复；窄屏改为 Station -> Account -> Detail 的可预测钻取。
- 站点或账号超过 50 项启用虚拟列表，固定行高/稳定 key；搜索和筛选派生值 memoize。
- 错误态放在所属区域，含 retry；空态区分“无账号”“筛选无结果”“平台不支持”。
- 后端发送 `auth-proxy://progress|completed|failed` 事件，UI 只在 completed 后显示登录成功。

**Philosophy**：加载反馈应维持空间稳定，移动/窄屏不能通过隐藏核心详情来“适配”。异步动作必须反馈真实生命周期，而不是 IPC 已返回。

### A-17 controller、dialogs 和 commands 过度集中，错误处理重复

**Risk [前端/后端]**：Rust `commands.rs` 约 1900 行，同时承担 CRUD、导入导出、探针和代理编排；controller 约 730 行，`dialogs.tsx` 约 820 行。`AuthProxyDialog` 直接调用 repository/platform API，绕过 controller/use-case；`isInvalidInput` 和多个 classifier 重复解析错误。这会让 Session、代理和 UI 状态在修复时再次分叉。

**Severity**：P2 / Medium。

**Refactor**：按领域拆分但不新增空壳层：

```text
src-tauri/src/account_manager/
  commands/{accounts,sessions,imports,auth_proxy}.rs
  services/{session_coordinator,auth_proxy_service,account_eraser}.rs
  repositories/{credential_store,snapshot_store,webview_session}.rs

src/features/account-manager/
  hooks/{useAccountData,useAccountRefresh,useAuthProxyInbox}.ts
  components/dialogs/{StationDialog,AccountDialog,QuickLoginDialog}.tsx
  services/account-manager.use-cases.ts
```

组件只收 props/callback；repository 只做 IPC；use-case 负责编排；统一使用 `parseCommandError/getErrorCode/translateError`。i18n key 继续保持中英文集合对等，并增加语言切换行为测试。

**Philosophy**：抽象的目标是形成唯一所有者，不是把大文件机械切碎。统一错误与 i18n 边界能避免同一失败在不同入口显示不同含义。

## 4. 目标架构与不可退化契约

```text
App-root DeepLinkInbox
        |
        v
Account Manager controller -> use-cases -> typed repository -> narrow IPC
                                                   |
                                                   v
                                  AccountManagerCoordinator (single writer)
                                  | SessionCoordinator
                                  | AuthProxyService + one-time tickets
                                  | ProbeEngine
                                  | AccountDataEraser
                                  v
                         SnapshotStore / CredentialStore / WebViewProvider
                                  |
                         macOS provider | Windows provider
```

实现时强制保持：

1. `SessionRecord` 是 Session 唯一真理源，账号 DTO 只暴露状态和时间，不带密文/明文。
2. 任何 snapshot mutation 都经 coordinator 的单写者锁、revision 和 atomic persist。
3. target、callback、proxy、credential origin 由后端解析和授权；renderer 不提交最终可信 URL。
4. 批量结果守恒，错误/partial/unsupported/cancelled 都是显式状态。
5. password update 使用 keep/set/clear；敏感值不进入 Zustand、localStorage、日志或事件。
6. 平台 provider 产出 capability；UI 不硬编码“编译平台等于支持”。

## 5. 实施顺序

每一阶段独立合并；前一阶段 contract 和测试未通过，不开始后一阶段。禁止边修边保留旧双写作为“兼容方案”。

### Phase 0：冻结危险入口

- 从 Deep Link 配置移除 `http/https`。
- 暂停 external auth proxy 自动填充和 encrypted full export，UI 显示明确 unavailable reason。
- 平台矩阵保持 macOS/Windows ⚠️。

### Phase 1：数据完整性

- 完成 Session v5 migration、单一 `SessionRecord`、原子 flush、退出/TTL 错误返回。
- 修复 master key 进程内/跨进程初始化。
- 增加 snapshot revision、单实例或冲突协议。

### Phase 2：登录代理安全边界

- 引入一次性 authorization ticket。
- 精确 callback 与 credential origin 校验。
- binding 只在 completed 后写入；App 根层接管 Deep Link 队列。

### Phase 3：探针、刷新和代理语义

- 实现 `ProbeEngine` 和真实 ProbeStrategy。
- 批量刷新返回 `RefreshReport`，前端按 ID merge。
- 代理 fail-closed，密码改为 keep/set/clear，并明确 Windows capability。

### Phase 4：敏感数据全生命周期

- 统一删除/注销原语并报告 partial。
- 密码按需 reveal、内存 TTL、条件清剪贴板。
- 实现 passphrase export v2、导入限额、版本迁移和原子写。

### Phase 5：前端分层与 UX

- 拆 controller/dialogs/auth proxy 编排，统一错误解析。
- 补 skeleton、区域错误/retry、窄屏 Detail Sheet、真实进度和虚拟列表。
- 补中英文切换、长文本和键盘/焦点行为测试。

### Phase 6：目标平台验收

- macOS 与 Windows runner 执行下面的行为矩阵。
- 只在真实能力逐项通过后把对应 capability 和发布矩阵改为 ✅。

## 6. macOS / Windows 行为测试矩阵

| 场景 | macOS | Windows | 必须断言 |
|------|:-----:|:-------:|----------|
| Keyring 首建/并发/重启 | 必测 | 必测 | 唯一 master key，旧密文仍可解 |
| v4 -> v5 migration | 必测 | 必测 | 无双写、失败可回滚、revision 单调 |
| Cookie + HttpOnly 捕获/恢复 | 必测 | 必测 | 注入后 probe Ready，账号间不可见 |
| local/session storage 恢复 | 必测 | 必测 | 只恢复 allowlist origin/key |
| TTL/周期清理/退出 flush | 必测 | 必测 | 错误可见，ephemeral 不复活 |
| coexisting/exclusive/rotating | 必测 | 必测 | Cookie/data store 与状态语义一致 |
| HTTP/WebView/Hybrid probe | 必测 | 必测 | 策略真的改变执行，timeout 可取消 |
| 批量 partial/cancel/retry | 必测 | 必测 | 账号不消失，结果数量守恒 |
| custom scheme callback | 必测 | 必测 | 精确匹配、一次性 ticket、不可重放 |
| IPv4/IPv6 loopback callback | 必测 | 必测 | 仅预期 IP/port/path，伪域名拒绝 |
| 自动填充 origin 攻击 | 必测 | 必测 | 跨 origin、重定向后和过期 ticket 均拒绝 |
| 网络代理 auth/失败 | 必测 | 必测 | 支持则生效；不支持/解密失败绝不直连 |
| 删除与目录占用 | 必测 | 必测 | 窗口关闭，残留/失败被报告 |
| export/import roundtrip | 必测 | 必测 | 跨设备 passphrase 可移植，错误密码拒绝 |
| Deep Link 冷/热启动 | 必测 | 必测 | 非当前页面不丢失，多链接有序且去重 |
| 500+ 账号 UI | 必测 | 必测 | 首载 skeleton，滚动稳定，无长任务阻塞 |

测试 fixture 必须包含 CJK/emoji 用户名、超长站点名、IPv6、代理凭据、损坏密文、旧 schema、只读目录、Keyring 拒绝、WebView 数据目录占用和网络超时。

## 7. Definition of Done

- [ ] A-01 至 A-15 的 P0/P1 全部有回归测试并关闭；不得用 catch/log/空数组代替错误。
- [ ] Session 捕获、恢复、TTL、退出、导出只读写同一 canonical record。
- [ ] Auth Proxy 全流程使用一次性后端 ticket，callback 和填充 origin 精确匹配。
- [ ] 删除、互斥、导入和批量刷新在 partial/失败下保持数据完整，结果对用户可见。
- [ ] macOS/Windows capability 与实际行为一致，不支持能力明确禁用并说明原因。
- [ ] 首载 skeleton、刷新进度、区域错误/retry、空态、窄屏详情和 500+ 虚拟列表通过验收。
- [ ] 中英文 key 对等，关键页面切换语言后即时更新且无溢出。
- [ ] macOS/Windows 行为矩阵进入 CI；构建成功不能代替行为测试。
- [ ] 文档只描述已经实现并验证的能力；未完成项继续留在 roadmap。

## 8. 验证命令

```bash
pnpm run lint:fe
pnpm run test:critical
pnpm exec vitest run src/features/account-manager
cd src-tauri && cargo test account_manager
cd src-tauri && cargo clippy -- -D warnings
pnpm run check:docs
pnpm exec prettier --check "docs/**/*.{md,html}"
git diff --check
```

目标平台验收必须在 `macos-latest` 和 `windows-latest` 分别执行行为测试；本地缺少目标 target 时，结论只能写“未验证”。
