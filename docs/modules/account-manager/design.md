# Account Manager 技术设计

> 视角：技术 / 实现。产品功能见 [features.md](./features.md)；迭代规划见 [roadmap.md](./roadmap.md)。

## 目录

1. [模块架构](#1-模块架构)
2. [数据模型](#2-数据模型)
3. [Session 持久化引擎](#3-session-持久化引擎)
4. [AuthProfile 检测引擎](#4-authprofile-检测引擎)
5. [分层探针引擎](#5-分层探针引擎)
6. [多账号互斥引擎](#6-多账号互斥引擎)
7. [加密体系](#7-加密体系)
8. [外部登录代理实现](#8-外部登录代理实现)
9. [Per-Station 网络代理](#9-per-station-网络代理)
10. [IndexedDB 导出](#10-indexeddb-导出)
11. [存储 schema](#11-存储-schema)
12. [生命周期集成](#12-生命周期集成)
13. [API 契约](#13-api-契约)
14. [数据迁移与回滚](#14-数据迁移与回滚)
15. [未来规划：云端同步](#15-未来规划云端同步)

---

## 1. 模块架构

### 1.1 文件结构

```
src-tauri/src/account_manager/
├── mod.rs / lib.rs        模块入口
├── types.rs               数据模型（AccountSession / AuthProfile / ProbeStrategy ...）
├── state.rs               AccountManagerState（AppHandle 全局状态）
├── storage.rs             store.json 读写 + flush_to_disk
├── crypto.rs              AES-256-GCM 加解密 + master key 取用
├── session.rs             Session 持久化引擎（捕获 / 恢复 / TTL）
├── detection.rs           AuthProfile 自动检测（JS 注入 + 解析）
├── probe.rs               分层探针引擎（L1 HTTP / L2 WebView / L3 Hybrid）
├── commands.rs            Tauri 命令实现 + now_label 等工具
├── webview.rs             WebView 创建与生命周期
├── proxy/                 外部登录代理
│   ├── mod.rs
│   ├── matching.rs        Station 匹配（host / eTLD+1 / SSO）
│   ├── auto_fill.rs       密码自动填充（不自动提交）
│   ├── token_extractor.rs 已废弃，仅兼容保留
│   └── ...
└── cloud_sync.rs          云同步（backlog，未实现）

src/features/account-manager/                前端
├── feature.tsx                              路由元数据
├── page.tsx                                 主页面
├── store.ts                                 Zustand store
├── use-cases.ts                             业务用例层
├── components/                              UI 组件（StationCard / AccountRow / AuthProfilePanel ...）
└── services/
    ├── account-manager.repository.ts
    └── account-manager.use-cases.ts

src/lib/tauri/commands/account-manager.ts     Tauri 命令契约
src/lib/tauri/contracts.ts                    全局类型定义
```

### 1.2 分层约定

- **UI 组件** → `use-cases.ts` → `repository.ts` → `lib/tauri/commands/account-manager.ts` → Rust `commands.rs`
- 阻塞 I/O 通过 `tokio::task::spawn_blocking` 隔离
- 错误在 IPC 边界归一为 `Result<T, String>`
- 异步重入保护：`useGuardedAsync` 包装 delete / toggleProxy / redetect / quickLogin 等

---

## 2. 数据模型

### 2.1 核心类型（types.rs）

```rust
// === 账户类型 ===
pub enum AccountType {
    Persistent,   // 默认
    Ephemeral,
}

pub enum AccountSessionStatus {
    Ready,
    LoginRequired,
    Expired,
    FetchFailed,
    Inactive,  // rotating 模式下非活跃账号
}

// === Cookie 条目 ===
pub struct CookieEntry {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub http_only: bool,
    pub secure: bool,
    pub same_site: Option<String>,
    pub partitioned: bool,  // CHIPS: Cookies Having Independent Partitioned State
    pub expires: Option<String>,
}

// === 完整 Session 快照 ===
pub struct AccountSession {
    pub cookies: Vec<CookieEntry>,
    pub local_storage: Option<EncryptedBlob>,
    pub session_storage: Option<EncryptedBlob>,
    pub indexeddb_snapshot: Option<EncryptedBlob>,
    pub csrf_token: Option<CsrfTokenEntry>,
    pub captured_at: String,
    pub expires_hint: Option<String>,
    pub user_agent: String,
}

pub struct CsrfTokenEntry {
    pub extraction_method: String,  // "meta" | "cookie" | "input" | "js_var"
    pub token_name: String,
    pub token_value: String,
}

// === AuthProfile（站点级别，首次登录后自动检测生成）===
pub struct AuthProfile {
    pub cookie_based: bool,
    pub token_storage: TokenStorage,
    pub csrf_protection: bool,
    pub csrf_extraction: Option<CsrfExtraction>,
    pub auth_type: AuthType,
    pub fingerprinting: FingerprintingLevel,
    pub anti_bot: bool,
    pub anti_bot_provider: Option<AntiBotProvider>,
    pub sso_provider: Option<SsoProvider>,
    pub probe_strategy: ProbeStrategy,
    pub detected_at: String,
    pub confidence: f32,
}

pub enum TokenStorage { Cookie, LocalStorage, SessionStorage, IndexedDB, Multiple, None }
pub enum AuthType { SessionCookie, BearerOAuth, Saml, OpenIdConnect, WebSocket, Unknown }
pub enum FingerprintingLevel { None, Basic, Strict }
pub enum AntiBotProvider { Cloudflare, CloudflareTurnstile, Recaptcha, HCaptcha }
pub enum SsoProvider { AzureAd, Okta, Auth0, Custom(String) }
pub enum ProbeStrategy { HttpFirst, HttpOnly, WebviewOnly, Hybrid }

// === 互斥模式 ===
pub enum ExclusivityMode { Coexisting, Exclusive, Rotating }

// === 探针结果 ===
pub enum ProbeResult {
    Ready,
    LoginRequired,
    Expired,
    Uncertain,        // 触发下一层 probe
    AntiBotBlocked,
    SsoChallenge,
    NetworkError(String),
}
```

### 2.2 StationAccount / RelayStation 扩展字段

```rust
pub struct StationAccount {
    // ... 现有字段 ...
    pub account_type: AccountType,           // 默认 Persistent
    pub website: Option<String>,             // ephemeral 账号自带 URL
    pub session: Option<EncryptedBlob>,      // 加密的 AccountSession
    pub exclusivity_group: Option<String>,   // 互斥组标识
    pub proxy_enabled: bool,                 // 外部登录代理开关
    pub external_app_ids: Vec<String>,       // 已授权的外部 App
}

pub struct RelayStation {
    // ... 现有字段 ...
    pub exclusivity_mode: ExclusivityMode,   // 默认 Coexisting
    pub auth_profile: Option<AuthProfile>,   // 首次登录后自动填充
    pub probe_failure_count: u32,            // HTTP probe 连续失败次数
    pub session_ttl: Option<Duration>,       // Session 生存时间
    pub proxy_url: Option<String>,           // per-station 网络代理
}
```

### 2.3 检测中间类型（detection.rs）

JS 注入脚本返回的原始数据：

```rust
pub struct DetectionResult {
    pub session_cookie_names: Vec<String>,
    pub total_cookies: usize,
    pub token_keys: Vec<String>,
    pub local_storage_tokens: HashMap<String, LocalStorageTokenInfo>,
    pub session_token_keys: Vec<String>,
    pub csrf: CsrfDetection,
    pub logout_elements: Vec<LogoutElement>,
    pub sso_provider: Option<String>,
    pub cloudflare: CloudflareDetection,
    pub websocket_detected: bool,
    pub url: String,
    pub title: String,
    pub has_service_worker: bool,
}
```

### 2.4 serde 兼容性

所有新增字段必须带 `#[serde(default)]`，旧版本读取新数据时自动忽略未知字段，新版本读取旧数据时使用默认值。降级只需回滚二进制，数据无损。

---

## 3. Session 持久化引擎

实现在 `session.rs`，负责登录捕获、启动恢复、退出持久化、TTL 清理四个生命周期阶段。

### 3.1 登录捕获

```rust
pub async fn capture_session_after_login<R: Runtime>(
    window: &WebviewWindow<R>,
    account: &StationAccount,
    auth_profile: &Option<AuthProfile>,
) -> AccountManagerResult<AccountSession>
```

**流程**：

1. **提取 cookies**：始终执行。通过 `WebviewWindow::cookies_for_url(parsed_url)` 获取包括 HttpOnly 在内的所有 cookie。Cookie 结构体字段全部私有，必须用访问器方法（`name()` / `value()` / `domain()` / `expires_datetime()` 等）；`same_site` 返回 `Option<SameSite>` 枚举需 format 为字符串。
2. **读取 User-Agent**：通过 `evaluate_javascript(navigator.userAgent)` 读取，失败时回退到默认值。
3. **按 AuthProfile 决定额外提取**：
   - `TokenStorage::LocalStorage` → 注入 JS 读取 localStorage，加密为 `EncryptedBlob`
   - `TokenStorage::SessionStorage` → 同上
   - `TokenStorage::Multiple` → 同时读取 localStorage 与 sessionStorage
   - `csrf_protection == true` → 从 meta / input / cookie 提取 CSRF token
4. **估算过期时间**：`estimate_session_expiry(&cookies)` 从 cookie expires 推算 `expires_hint`
5. **超时控制**：cookie 提取包 `tokio::time::timeout(3_000ms)`，超时返回错误

**关键陷阱（v1.3 修正）**：
- `cookies()` 不接受参数；按 URL 过滤必须用 `cookies_for_url(parsed_url)`
- `Cookie` 结构体字段全部私有，必须用访问器方法
- `expiration_date` 不存在 → `expires_datetime()`
- `same_site` 返回 `Option<SameSite>` 枚举非 String

### 3.2 启动恢复

```rust
pub async fn restore_sessions_on_startup(app: &AppHandle)
```

**流程**：
1. 从 store 加载所有 Persistent Account（跳过 Ephemeral）
2. 解密 session，验证 cookies 未全部过期
3. 对每个 Ready 状态账户：
   - 创建隐藏 WebView
   - `WKHTTPCookieStore.setCookie` 逐个注入
   - 发送 L1 HTTP HEAD probe 验证有效性
   - 200 OK 且未重定向到登录页 → 保持 Ready
   - 302 / 401 → 标记 LoginRequired
4. 更新 UI 状态

### 3.3 退出持久化

`lib.rs` 的 `RunEvent::ExitRequested` 中调用：

```rust
if let RunEvent::ExitRequested { .. } = event {
    let state = app_handle.state::<AccountManagerState>();
    let snapshot = state.read_snapshot();
    for account in &snapshot.accounts {
        if account.account_type == AccountType::Persistent
            && account.status == AccountSessionStatus::Ready
        {
            if let Some(cookies) = capture_session_cookies_for_account(app_handle, account) {
                persist_session_to_store(&state, &account.id, &cookies);
            }
        }
    }
    cleanup_ephemeral_accounts(&state);  // Ephemeral 自动清理
    flush_store_to_disk(app_handle);     // 强制 flush
}
```

### 3.4 TTL 清理

后台任务定期扫描：
- `captured_at + session_ttl < now` → 标记 Expired
- 触发探针重新验证
- 失败通知用户

---

## 4. AuthProfile 检测引擎

实现在 `detection.rs`，在首次登录成功后自动运行，生成 Station 级别的 AuthProfile。

### 4.1 检测流程

1. 注入 `__detectAuthProfile()` JS 脚本，收集原始 `DetectionResult`
2. 根据 cookie 名称 / 数量判断 `cookie_based`
3. 根据 localStorage / sessionStorage / IndexedDB token 数量判断 `token_storage`
4. 根据 meta / input / cookie 判断 CSRF
5. 根据 SSO 提供商特征（host / redirect_uri）判断 `sso_provider`
6. 根据 Cloudflare challenge / Turnstile / reCAPTCHA / hCaptcha 判断 `anti_bot`
7. 综合推断 `auth_type` 与 `probe_strategy`
8. 计算 `confidence`（基于检测维度的覆盖度）

### 4.2 JS 检测脚本要点

- 读取 `document.cookie` 统计 session cookie
- 遍历 localStorage / sessionStorage / IndexedDB 查找 token 关键字
- 检查 `<meta name="csrf-token">`、`<input name="_csrf">`
- 检测 `window.Cloudflare`、Turnstile iframe、reCAPTCHA grecaptcha、hCaptcha
- 解析 URL host 与已知 SSO 提供商匹配

### 4.3 探针策略选择规则

| AuthProfile | 推荐策略 | 理由 |
|-------------|---------|------|
| `cookie_based + no fingerprinting` | HttpFirst | cookie 直传即可 |
| `cookie_based + basic fingerprinting` | HttpFirst | UA 一致即可 |
| `cookie_based + strict fingerprinting` | WebviewOnly | HTTP probe 会被指纹拦截 |
| `token_storage = LocalStorage` | Hybrid | 需注入 JS 取 token |
| `auth_type = SAML/OIDC` | Hybrid | 多跳重定向链 |
| `anti_bot = Cloudflare` | WebviewOnly | 非浏览器请求被拦截 |

---

## 5. 分层探针引擎

实现在 `probe.rs`，按效率从高到低分三层，由 AuthProfile.probe_strategy 驱动。

### 5.1 L1: HTTP Probe

```rust
pub async fn http_probe(website: &str, cookies: &[CookieEntry]) -> ProbeResult {
    let client = reqwest::Client::builder()
        .redirect(redirect::Policy::none())  // 不跟随重定向
        .build()?;

    let mut headers = HeaderMap::new();
    let cookie_str = cookies.iter()
        .map(|c| format!("{}={}", c.name, c.value))
        .collect::<Vec<_>>()
        .join("; ");
    headers.insert("Cookie", cookie_str.parse()?);
    headers.insert("User-Agent", user_agent.parse()?);  // 保持与 WebView 一致

    let resp = client.head(website).headers(headers).send().await?;

    match resp.status() {
        s if s.is_success() => ProbeResult::Ready,
        s if s.is_redirection() => {
            let location = resp.headers().get("location");
            if is_login_page(location) { ProbeResult::LoginRequired }
            else { ProbeResult::Uncertain }  // 触发 L2
        }
        _ => ProbeResult::Uncertain,
    }
}
```

**耗时 < 2s**。失败计数累加到 `RelayStation.probe_failure_count`，连续超过阈值自动降级为 L2。

### 5.2 L2: WebView Probe

复用现有 `probe.rs` 的隐藏 WebView 方案：
- 创建隐藏 WebView，注入 cookie
- 导航到网站首页
- `evaluate_javascript` 读取 DOM：
  - 是否含"退出登录"文本
  - 是否被重定向到登录页
  - 是否出现 Cloudflare challenge
- 多源证据综合判断（不依赖单一字符串匹配）

**耗时 < 13s**。降级触发条件：
- HTTP probe 返回 `Uncertain`
- AuthProfile = `webview_only`
- 自适应降级（HTTP probe 连续失败超阈值）

### 5.3 L3: Hybrid Probe

WebView + 重定向链跟踪：
- 创建隐藏 WebView，禁用缓存
- 注入 cookie + localStorage
- 导航到网站，监听所有重定向
- 跟踪完整 OAuth / SSO 链（最多 5 跳）
- 最终页面判定同 L2

**耗时 < 20s**。仅 SSO / OAuth 场景使用。

### 5.4 认证兼容性威胁矩阵

| 威胁等级 | 机制 | 覆盖比例 | 应对策略 |
|---------|------|---------|---------|
| L1 可处理 | HttpOnly Session Cookie | ~40% | `cookies_for_url` 捕获，HTTP probe 直传 |
| L1 可处理 | SameSite=Lax/Strict Cookie | ~15% | 同源 HTTP probe，保持 origin 一致 |
| L2 需增强 | JWT in localStorage / IndexedDB | ~15% | JS 注入提取 token，HTTP probe 带 `Authorization: Bearer` |
| L2 需增强 | CSRF Double-Submit Cookie | ~10% | meta tag 提取并附加 `X-CSRF-Token` |
| L2 需增强 | OAuth2 Refresh Token Rotation | ~8% | 仅存 access_token，过期回退 WebView |
| L3 严重挑战 | Session Fingerprinting | ~5% | 始终在 WebView 中操作 |
| L3 严重挑战 | Device-Bound Session (DBSC) | ~3% | 同设备同 data store 恢复 |
| L3 严重挑战 | Enterprise SSO (SAML/OIDC/CAE) | ~2% | 完整 WebView 重定向链 probe |
| L3 严重挑战 | Cloudflare / Anti-Bot | ~2% | 自动降级 WebView probe |
| ⚠ 边界 | Partitioned Cookies (CHIPS) | ~1% | CookieEntry 标记 partitioned |
| ⚠ 边界 | iCloud Private Relay | macOS | 检测并降级 WebView probe |
| ⚠ 边界 | WebAuthn / Passkeys | ~1% | 标记不可自动登录 |

---

## 6. 多账号互斥引擎

实现在 `state.rs` 的 `ExclusivityMode` 处理逻辑。

### 6.1 三种模式

```rust
pub enum ExclusivityMode {
    Coexisting,  // 默认：所有账号同时活跃
    Exclusive,    // 同一时刻仅一个账号活跃
    Rotating,     // 轮流活跃
}
```

### 6.2 切换语义

| 模式 | 切换账号时 |
|------|----------|
| Coexisting | 不影响其他账号 |
| Exclusive | 自动登出同组其他账号，标记 Inactive |
| Rotating | 当前账号标记 Inactive，新账号激活 |

### 6.3 exclusivity_group

账号的 `exclusivity_group` 字段标识所属互斥组。同组账号在 Exclusive / Rotating 模式下互相约束，不同组互不影响。

---

## 7. 加密体系

实现在 `crypto.rs`。

### 7.1 主密钥

- `master_key` 由 `get_master_key()` 从系统 keychain 读取
- 首次启动时若无 key，自动生成 32 字节随机数存入 keychain

### 7.2 加密算法

| 用途 | 算法 | 参数 |
|------|------|------|
| 本地存储加密 | AES-256-GCM | 256-bit key from keyring |
| IV | 随机 12 bytes | 每次加密新生成 |
| EncryptedBlob 结构 | `{ iv, ciphertext, tag }` | Base64 编码 |

### 7.3 加密边界

- 密码、session、localStorage、sessionStorage、IndexedDB 快照均用 `master_key` 加密
- cookie 不单独加密（包含在 AccountSession 整体加密中）
- 前端 JS 永不接触明文：解密仅在 Rust 层内存中发生
- 导出 EncryptedFull 用当前 keyring 重新加密；Sanitized 剥离所有密钥

---

## 8. 外部登录代理实现

实现在 `proxy/` 子模块。

### 8.1 协议定义

#### 8.1.1 唤起协议 `bench-auth://`

```
bench-auth://authorize
  ?target=<url-encoded https authorize/login url>
  &return=<url-encoded app callback url>
  &state=<opaque-state>
  &site=<optional-station-id>
```

参数规则：
- `target`：必填，外部软件要登录的目标 URL
- `return`：必填，自定义 scheme，**不能**是 `http` / `https` / `bench-auth` / `file` / `javascript`
- `state`：可选，原样不参与转交
- `site`：可选，仅作 UI 预选 hint，不能新增匹配候选

#### 8.1.2 注册方式（macOS）

`tauri.conf.json`：
```json
"bundle": { "macOS": { "infoPlist": { "CFBundleURLTypes": [
  { "CFBundleURLName": "com.bench.app.auth", "CFBundleURLSchemes": ["bench-auth"] }
] } } },
"plugins": { "deep-link": { "desktop": { "schemes": ["bench-auth"] } } }
```

启动时另做一次 best-effort 运行时注册（`deep_link().register("bench-auth")`），便于 Linux / Windows 调试。

#### 8.1.3 Loopback 模式（RFC 8252）

很多 IDE / CLI（如 Trae / GitHub CLI / VS Code）登录时不发自定义协议，而是直接让系统浏览器打开一个 `https` authorize 链接，回调走本地 loopback HTTP 服务器：

```
https://www.trae.cn/authorization?...&auth_callback_url=http://127.0.0.1:56290/authorize&code_challenge=...
```

bench 被当作浏览器收到该 URL 时：
1. `handle_browser_open(url)` 统一入口同时接受 `bench-auth://` 与原始 `http(s)://`
2. 用 `extract_loopback_callback` 从 query 识别回调（`auth_callback_url` / `redirect_uri` / `redirect_url` / `callback_url` / `callback`）
3. `is_oauth_authorize_like` 判定是否像登录链接
4. 在所选账号的隔离 WebView 打开 authorize URL
5. WebView 导航到 `http://127.0.0.1:<port>/...` 时**放行**让请求打到外部 App 本地服务器
6. 针对目标站点 URL 捕获 cookie、标记账号 Ready、关闭窗口

`validate_return_url` 对 `http` / `https` 仅放行 loopback（`127.0.0.1` / `localhost` / `::1`），非 loopback 一律拒绝。loopback 回调不记录为 `ExternalApp`（无稳定身份），账号归组由目标站点 Station 承担。

### 8.2 核心流程

```
外部 App                         Bench                                用户
  │                               │                                    │
  │ 1. open bench-auth://authorize│                                    │
  │    ?target=<oauth authorize>  │                                    │
  │    &return=<myapp://callback> │                                    │
  │──────────────────────────────▶│                                    │
  │                               │ 2. parse_auth_proxy_url 解析        │
  │                               │ 3. handle_auth_proxy:               │
  │                               │    - validate_return_url 校验       │
  │                               │    - 按 target host 匹配 Station     │
  │                               │    - 过滤 proxyEnabled 账号           │
  │                               │ 4. 弹出账号选择器 ─────────────────▶ │
  │                               │◀───────────────── 用户选定账号        │
  │                               │ 5. proxy_login:                     │
  │                               │    - 打开该账号独立分区 WebView       │
  │                               │      导航到 target                   │
  │                               │    - 复用已持久化 session（多数免登）  │
  │                               │    - 有保存密码则自动填充（不自动提交） │
  │                               │    - 记录 ExternalApp + Binding 用量  │
  │                               │ 6. provider 重定向到 myapp://callback │
  │                               │    on_navigation 命中 return:        │
  │ 7. myapp://callback?code=... │    - shell.open(原始 callback URL)   │
  │◀──────────────────────────────│    - 关闭 WebView                    │
  │ 8. 外部 App 收到自己的 code     │                                    │
```

**关键点**：bench 不理解外部 App 的私有协议，也不向它吐 token。它只在 WebView 导航命中 `return` 前缀时取消该次 WebView 导航，并用系统 `openExternal` 把这条原始 callback 原封不动交还给外部 App。

### 8.3 Station 匹配（`proxy/matching.rs`）

输入 `target` 用 URL parser 提取 hostname，禁止字符串裁剪。匹配优先级：
1. 精确 hostname 匹配
2. eTLD+1 子域匹配（`api.github.com` 命中 `github.com`）
3. 已知 SSO 提供商模糊匹配（Microsoft / Okta / Auth0 / Google / Salesforce）

只有 `proxyEnabled === true` 的账号才进入匹配结果。`site` hint 只能从候选中预选。

### 8.4 隔离与持久化（"保持登录态"的核心）

- 每个账号使用独立 WebView data directory（`relay-accounts/<accountId>`）
- macOS/iOS 下额外用 `data_store_identifier`（由 accountId 派生）做 WebKit 级隔离
- 因此每个账号的 cookie / storage 在进程退出后仍保留：下次代理登录时通常**已是登录态**
- bench 另有加密 session 存储（capture/restore + L1 probe），用于状态判定与跨设备导出

### 8.5 自动填充策略（`proxy/auto_fill.rs`）

- 用原生 value setter 绕过框架虚拟 DOM 守卫，触发 `input` / `change` / `blur` 事件
- **只填字段，默认不自动提交**（避免错误账号被自动登录、或触发风控）
- 多数情况下因 session 已持久化，根本不需要填充

### 8.6 数据模型

```typescript
interface StationAccount {
  proxyEnabled?: boolean;        // 默认 false
  externalAppIds?: string[];     // 已授权的外部 App
}

interface ExternalApp {
  id: string; name: string; urlScheme: string; returnHosts: string[];
  firstUsedAt: string; lastUsedAt: string; useCount: number;
}

interface ExternalAppBinding {
  id: string; appId: string; accountId: string;
  firstUsedAt: string; lastUsedAt: string; useCount: number;
}
```

### 8.7 关闭代理的吊销语义

- 不再出现在匹配结果中
- 吊销该账号的所有 `ExternalAppBinding`，清空 `externalAppIds` 引用
- 写审计日志
- 关闭前 UI 需确认

### 8.8 "使用新账号" + 自动建站分组

`proxy_login_new_account(host, target, return)`：
1. `ensure_station_for_host` 按 host 查找 Station，没有则自动新建（`remark = host`，`website = https://host`）
2. 创建一个开启代理的新账号
3. 立即启动代理登录
4. 登录完成后由 loopback 流程自动保存 session，下次同一 host 再来即出现在选择器中

---

## 9. Per-Station 网络代理

### 9.1 数据模型

`RelayStation.proxy_url: Option<String>` 存储代理 URL。

### 9.2 代理 URL 构建

| Scheme | 格式 | 用途 |
|--------|------|------|
| `http://` | `http://[user:pass@]host:port` | HTTP 代理 |
| `https://` | `https://[user:pass@]host:port` | HTTPS 代理（TLS 隧道） |
| `socks5://` | `socks5://[user:pass@]host:port` | SOCKS5 代理 |

### 9.3 应用范围

- WebView 网络请求：通过 Tauri 的 proxy 配置注入
- HTTP 探针：`reqwest::Client::builder().proxy(proxy_url)`
- Session 捕获：WebView 自带代理

---

## 10. IndexedDB 导出

### 10.1 导出模式

```rust
pub enum RelayExportMode {
    EncryptedFull,  // 完整导出（密码 + Session）
    Sanitized,       // 仅元数据，剥离密钥与 Session
}
```

### 10.2 导出文件结构

```rust
pub struct RelayDataExportFile {
    pub version: u32,
    pub exported_at: String,
    pub mode: RelayExportMode,
    pub stations: Vec<RelayStationExport>,
}

pub struct RelayStationExport {
    pub remark: String,
    pub website: String,
    pub login_detection: Option<LoginDetection>,
    pub session_ttl: Option<Duration>,
    pub accounts: Vec<RelayAccountExport>,
}

pub struct RelayAccountExport {
    pub username: String,
    pub notes: Option<String>,
    pub encrypted_password: Option<EncryptedBlob>,
    pub status: AccountSessionStatus,
    pub last_login: Option<String>,
    pub last_refreshed: Option<String>,
    pub session: Option<EncryptedBlob>,  // Sanitized 模式下为 None
    pub auth_profile: Option<AuthProfile>,
}
```

### 10.3 Tauri 命令

| 命令 | 说明 |
|------|------|
| `export_relay_data(mode)` | 构建 export file，返回文件路径或 Base64 |
| `import_relay_data(path_or_json)` | 解析 + 合并入本地 store |
| `import_relay_data_from_json(json_str)` | 供云同步拉取后调用（同 import 逻辑） |

---

## 11. 存储 schema

### 11.1 `account-manager-store.json` 结构

```json
{
  "version": 3,
  "stations": [
    {
      "id": "station_xxx",
      "remark": "示例站点",
      "website": "https://example.com",
      "exclusivity_mode": "coexisting",
      "auth_profile": { /* ... */ },
      "probe_failure_count": 0,
      "session_ttl": "7d",
      "proxy_url": null,
      "accounts": [
        {
          "id": "account_yyy",
          "username": "alice",
          "account_type": "persistent",
          "encrypted_password": { "iv": "...", "ciphertext": "...", "tag": "..." },
          "session": { "iv": "...", "ciphertext": "...", "tag": "..." },
          "status": "ready",
          "exclusivity_group": null,
          "proxy_enabled": false,
          "external_app_ids": [],
          "last_login": "2026-07-01T10:00:00Z",
          "last_refreshed": "2026-07-03T15:00:00Z"
        }
      ]
    }
  ],
  "external_apps": [
    {
      "id": "app_zzz",
      "name": "Trae",
      "url_scheme": "trae",
      "return_hosts": ["127.0.0.1"],
      "first_used_at": "...",
      "last_used_at": "...",
      "use_count": 5
    }
  ],
  "external_app_bindings": [
    { "id": "...", "app_id": "app_zzz", "account_id": "account_yyy", "first_used_at": "...", "last_used_at": "...", "use_count": 5 }
  ]
}
```

### 11.2 写入策略

- 所有写入经 `AccountManagerState` 串行化
- `flush_to_disk` 显式调用，避免 cfprefsd 类缓存问题（macOS defaults 不适用此模块）
- `RunEvent::ExitRequested` 强制 flush

---

## 12. 生命周期集成

### 12.1 启动顺序

```
app setup
  ↓
load AccountManagerState from store.json
  ↓
restore_sessions_on_startup()  ← 仅 Persistent Account
  ↓
注册 Tauri 命令
  ↓
注册 deep_link handler（bench-auth:// + http/https）
  ↓
前端 UI 就绪
```

### 12.2 退出顺序

```
RunEvent::ExitRequested
  ↓
capture + persist 所有 Ready 状态 Persistent Account session
  ↓
cleanup Ephemeral accounts
  ↓
flush_to_disk 强制写盘
  ↓
退出进程
```

### 12.3 窗口聚焦刷新

`onFocusChanged` 监听窗口聚焦，触发探针刷新所有 Ready 状态账号（仅 L1 HTTP probe，避免阻塞）。

---

## 13. API 契约

### 13.1 Tauri 命令清单

| 命令 | 说明 |
|------|------|
| `list_stations` / `get_station(id)` / `create_station` / `update_station` / `delete_station` | Station CRUD |
| `list_accounts(station_id)` / `get_account(id)` / `create_account` / `update_account` / `delete_account` | Account CRUD |
| `quick_login(website, username)` | Ephemeral 快速登录 |
| `open_login_window(account_id)` | 打开登录 WebView |
| `capture_session(account_id)` | 手动触发 session 捕获 |
| `restore_session(account_id)` | 手动触发 session 恢复 |
| `probe_account(account_id)` | 触发探针（自动选层） |
| `redetect_auth_profile(station_id)` | 重新检测 AuthProfile |
| `set_probe_strategy(station_id, strategy)` | 手动覆盖探针策略 |
| `set_account_proxy_enabled(account_id, enabled)` | 开关外部代理 |
| `parse_auth_proxy_url(raw_url)` | 解析 `bench-auth://` URL |
| `handle_auth_proxy(target, return, state?, site?)` | 校验 + 返回匹配候选 |
| `proxy_login(account_id, target, return)` | 启动代理登录 |
| `proxy_login_new_account(host, target, return)` | 用新账号登录并自动建站 |
| `remove_external_app(app_id)` | 删除外部 App 绑定 |
| `set_station_proxy_url(station_id, url)` | 设置 Station 网络代理 |
| `export_relay_data(mode)` | 导出账号库 |
| `import_relay_data(path)` | 从文件导入 |
| `set_session_ttl(station_id, ttl)` | 设置 TTL |

### 13.2 命令注册

入口 `commands.rs` 通过 `app_invoke_handler!` 宏注册到 Tauri。所有命令返回 `Result<T, String>`，错误在 IPC 边界归一。

### 13.3 前端调用链

UI 组件 → `use-cases.ts`（业务逻辑包装）→ `repository.ts`（数据访问）→ `lib/tauri/commands/account-manager.ts`（invoke 调用）→ Rust `commands.rs`

---

## 14. 数据迁移与回滚

### 14.1 向前兼容

旧 `account-manager-store.json` schema 自动迁移：
- `account_type` 默认 `Persistent`
- `website` 从 Station 继承
- `session` 在下次登录后填充
- `exclusivity_group` 默认 None
- 旧字段（phone / tgAccount / linkedAccount / inviteLink / loginMethods）保留在响应中向前兼容，UI 不再渲染

### 14.2 回滚方案

新字段全部带 `#[serde(default)]`：
- 旧版本读取新数据：自动忽略未知字段
- 新版本读取旧数据：使用默认值
- 降级只需回滚二进制，数据无损

---

## 15. 未来规划：云端同步

> 状态：**低优先级 / 可选 backlog**（详见 [roadmap.md](./roadmap.md)）。本地 Import/Export 已满足迁移需求，云同步为可选增强。

### 15.1 一句话定义

**端到端加密的账号数据云同步——多设备间安全迁移站点/账号元数据与加密密码，服务端零知识；Session 登录态同步为后续阶段。**

### 15.2 托管定案

- **参考实现**：Cloudflare Workers + R2（$0 免费档）
- **API 域名**：`https://bench-sync.<subdomain>.workers.dev/v1`（不买域名、不备案）
- **Endpoint 归属**：**用户 BYO 自托管**，每人 deploy 自己的 Worker 后填入应用设置；**不在开源仓库中写死维护者 URL**

### 15.3 零知识架构

- 加密 / 解密**仅在客户端**（Rust）完成
- 主密码与派生密钥**不上传**
- 服务端只存密文 + KDF 参数 + 元数据

| 服务端能知道 | 服务端不能知道 |
|--------------|----------------|
| Sync ID、密文大小、上传/拉取时间、IP | 主密码、明文 JSON、密码明文 |
| 客户端提交的 key proof 是否匹配 | Pull 时密码是否正确（Pull 只返回密文） |

### 15.4 双因素模型

```
同步码 (Sync ID) —— 定位云端 blob 的能力标识（Capability URL 级别）
  ├── 生成: 客户端 generate_sync_id() — 16 字节 CSPRNG → Crockford Base32 → XXXX-XXXX-XXXX-XXXX（128 bit）
  ├── 作用: 定位密文记录，不参与 KDF
  └── 安全: 不应公开张贴；泄露 = 他人可 Pull 密文尝试离线破解

主密码 (Master Password) —— 解密密钥来源
  ├── 用户自定义；最低 12 字符
  ├── 作用: Argon2id → 256-bit derived key
  └── 安全: 绝不上传；遗忘 = 数据不可恢复
```

### 15.5 加密方案

| 组件 | 算法 | 参数 |
|------|------|------|
| 对称加密 | AES-256-GCM | 256-bit key |
| 密钥派生 | Argon2id | m=64MB, t=3, p=4 |
| 盐值 | 随机 16 bytes | 每份 blob 独立 |
| IV | 随机 12 bytes | 每次新生成 |
| Key Proof | HMAC-SHA256(derived_key, sync_id + "\|upload") | Upload / Delete 必带 |

### 15.6 Worker API（参考实现）

| 路径 | 方法 | 说明 |
|------|------|------|
| `/v1/blobs` | POST | 创建；`syncId` 冲突 → 409 |
| `/v1/blobs/:syncId` | PUT | 覆盖；`keyProof` 必须匹配 → 403 |
| `/v1/blobs/:syncId` | GET | 返回密文 JSON；不存在 → 404 + jitter |
| `/v1/blobs/:syncId` | DELETE | body `{ keyProof }`；匹配则删 R2 object |

### 15.7 MVP 同步范围

| 数据 | Phase 1 | 说明 |
|------|:------:|------|
| 站点元数据 | ✅ | remark / website / login_detection / session_ttl |
| 账号元数据 | ✅ | username / notes |
| 加密密码 | ✅ | EncryptedFull |
| 状态字段 | ✅ | status / lastLogin / lastRefreshed |
| AuthProfile | ❌ | Phase 2 |
| Session | ❌ | Phase 2+（体积大、站点相关） |
| proxyEnabled / externalApps | ❌ | Phase 2 |
| 本机 keyring master key | ❌ | 永不离开设备 |

### 15.8 在线防护

| 维度 | 阈值 | 实现 |
|------|------|------|
| 单 IP | 30 req/min | Workers KV 计数 |
| 单 Sync ID GET | 20 req/hour | Workers KV 计数 |
| 全局 | MVP 不设硬顶 | 依赖 CF 平台 |

Pull 404（Sync ID 不存在或 R2 miss）返回固定 `{"error":"not_found"}` + 200–400ms 随机 jitter，防止枚举。

### 15.9 为何不在 OSS 默认内置公共 endpoint

| 顾虑 | 说明 |
|------|------|
| 成本与滥用 | 所有未改配置用户指向同一 Worker，请求与 R2 存储由维护者买单 |
| 元数据隐私 | Sync ID、blob 大小、时间戳、源 IP、Workers 访问日志运营商可见 |
| 信任集中 | 默认 URL 写进代码 = implicit 信任维护者基础设施 |
| Fork 误用 | Fork 若保留上游常量，密文会存进原作者 R2 |
| 攻击面 | 公共 endpoint 可被针对性探测 |

### 15.10 落地路径

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 0 | 架构决策（Workers + R2 + BYO） | ✅ 已定案 |
| Phase 1 | MVP：Worker 模板 + crypto + 客户端 + 设置 UI | ⏸ backlog |
| Phase 2 | AuthProfile + Session 纳入 export/import；设备绑定；版本历史 | ⏸ 远期 |
| Phase 3 | 增量同步、多端冲突处理、只读分享 | ⏸ 远期 |

### 15.11 推荐模型

| 模式 | OSS 默认 | 说明 |
|------|:--------:|------|
| BYO 自托管 | ✅ | 仓库提供 `workers/bench-sync/` + 部署文档；endpoint 存用户本地设置 |
| 维护者公共服 | ❌ | 若未来提供，须单独 opt-in，不替代 BYO |
| 本地 Import/Export | ✅ | 无第三方、无网络依赖；已满足迁移 |

**优先级结论**：在 BYO 设置 UI + endpoint 校验未就绪前，不将 Phase 1 作为近期必做项。

---

## 参考

- 加密：[NIST SP 800-38D (GCM)](https://csrc.nist.gov/publications/detail/sp/800-38d/final) · [Argon2 PHC](https://github.com/P-H-C/phc-winner-argon2)
- Loopback：[RFC 8252 OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252)
- 安全参考：[1Password Security Design](https://1password.com/security/) · [Bitwarden Security](https://bitwarden.com/help/security/)
