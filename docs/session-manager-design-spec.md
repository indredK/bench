# 会话管理器 (Session Manager) 产品设计文档

> 版本: v1.1 | 日期: 2026-06-30 | 状态: 草案 (已补充认证兼容性分析)

## 1. 一句话定义

**一个 Web 会话管理器——管理和恢复你在任何网站上的登录态，永久的和一次性的。**

---

## 2. 问题陈述

### 2.1 当前系统问题

bench 现有的"中转站账号管理"(api-billing) 功能存在三个结构性缺陷：

| 优先级 | 问题 | 现象 | 根因 |
|--------|------|------|------|
| P0 | 登录态丢失 | 登录后退出 bench，再打开需重新登录 | WKWebView cookie 在进程终止时可能不 flush 到磁盘(WebKit Bug #213636)；无退出钩子捕获 session |
| P1 | 表单臃肿 | 新建账号需填 10+ 字段 | 所有可选元数据平铺在主表单，未做信息分层 |
| P2 | 探针过重 | 刷新登录态需 13 秒 | 用隐藏 WebView 完整渲染页面做字符串匹配 |

### 2.2 未被满足的需求

1. **临时网站**：需要登录一个只用一次或几天的网站，不想创建永久记录
2. **一次性账号**：注册后只用一次就丢弃的临时身份
3. **多账号互斥**：同一网站不能同时登录多个账号，切换时需自动登出前一个
4. **中转站**：通过中间服务访问目标网站，账号关系统一管理

---

## 3. 核心概念

### 3.1 实体模型

```
Account (账号) ────── 独立实体，自带 website URL
  │
  ├── Persistent (持久账户) ─── 属于某个 Station，完整生命周期管理
  │     ├── 密码加密存储
  │     ├── Session 持久化(启动恢复)
  │     ├── 自动探针刷新
  │     └── 参与 Station 级别互斥管理
  │
  └── Ephemeral (临时账户) ─── 不属于任何 Station，轻量无痕
        ├── 无需创建 Station 即可使用
        ├── Session 不持久化(退出即销毁)
        ├── 不参与启动恢复
        └── 仅需 2 个字段(URL + 用户名)

Station (站点组) ─── 可选的分组标签，聚合同站多账号
  ├── 名称(remark)
  ├── 网站 URL(website)
  ├── 登录检测配置(loginDetection)
  ├── 互斥模式(exclusivity): exclusive | coexisting | rotating
  └── 包含 N 个 Persistent Account
```

### 3.2 互斥模式

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| `coexisting` (默认) | 多账号同时保持登录态，各自独立 session | 支持多账号并存的平台 |
| `exclusive` | 登录账号 A 时自动登出同站其他账号 | 不允许同时多开同一站点的网站 |
| `rotating` | 按顺序切换活跃账号，上一个 session 保留但标记 inactive | 需轮流使用的多账号场景 |

---

## 4. 功能规格

### 4.1 快速录入 — Ephemeral Account

**入口**: 主界面顶部或侧边栏"快速登录"按钮

**表单字段(2 个)**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 网站 URL | input[url] | 是 | 自动补全 `https://`，粘贴即用 |
| 用户名/邮箱 | input[text] | 是 | 用于标识，非必填时自动从登录后页面提取 |

**流程**:
1. 用户粘贴 URL + 用户名 → 回车
2. 自动创建临时账户 → 打开 WebView 登录窗口
3. 登录完成后自动注入 `__sessionCapture()` 脚本
4. WebView 窗口关闭时:
   - 默认：保留 session 到当前 bench 会话结束
   - 可选：勾选"关闭后销毁"即注销后删除账户
5. 不写入 `relay-store.json`，不参与启动恢复

**设计原则**: 从 7 步砍到 2 步。不需要 Station，不需要密码，不需要任何额外字段。

### 4.2 持久账户录入 — Persistent Account

**入口**: Station 详情页 → "添加账号"

**表单字段(4 个)**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 用户名/邮箱 | input[text] | 是 | 登录标识 |
| 密码 | input[password] | 否 | AES-256 加密存储，空则每次手动输入 |
| 备注 | textarea | 否 | 自由文本，承载所有非结构化元数据(手机号、TG、邀请链接等) |
| 标签 | tag-input | 否 | 用于分类过滤 |

**被移除的字段及理由**:

| 原字段 | 处理方式 | 理由 |
|--------|----------|------|
| phone | 移入备注 | 非结构化数据，不应作为独立字段 |
| tgAccount | 移入备注 | 同上 |
| linkedAccount | 移入备注 | 同上 |
| inviteLink | 移入备注 | 同上 |
| loginMethods | 移入备注，改为自动检测 | 登录方式由网站决定，不应让用户手工标记 |

### 4.3 Session 持久化

#### 4.3.1 数据模型扩展

```rust
// 新增类型
pub struct AccountSession {
    pub cookies: Vec<CookieEntry>,
    pub captured_at: String,
    pub expires_hint: Option<String>,
}

pub struct CookieEntry {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub http_only: bool,
    pub secure: bool,
    pub expires: Option<String>,
}

// StationAccount 新增字段
pub struct StationAccount {
    // ... 现有字段
    pub account_type: AccountType,          // "persistent" | "ephemeral"
    pub website: Option<String>,            // 自带 URL（ephemeral 账号用）
    pub session: Option<EncryptedBlob>,     // 加密的 AccountSession
    pub exclusivity_group: Option<String>,  // 互斥组标识
}
```

#### 4.3.2 登录捕获流程

```
用户完成登录 → WebView 导航到非登录页面
→ 触发 on_navigation 回调
→ evaluate_javascript: document.title / document.cookie > 判断是否登录成功
→ WebviewWindow::cookies(url) 获取全部 cookie(含 HTTP-only)
→ 构造 CookieEntry 列表
→ serde_json 序列化
→ master_key AES-256-GCM 加密
→ 写入 relay-store.json sessions 键
→ 更新 account.status = Ready
```

#### 4.3.3 启动恢复流程

```
app setup → 从 relay-store.json 加载所有 Persistent Account
→ 遍历：解密 session → 验证 cookies 未全部过期
→ 对每个 Ready 状态账户：
    1. 创建隐藏 WebView
    2. WKHTTPCookieStore.setCookie 逐个注入
    3. 发送 HTTP HEAD 请求到网站(轻量探针)
    4. 200 OK 且未重定向到登录页 → 保持 Ready
    5. 302/401 → 标记 LoginRequired
→ 更新 UI 状态
```

#### 4.3.4 退出持久化流程

```rust
// lib.rs RunEvent::ExitRequested 中新增
if let RunEvent::ExitRequested { .. } = event {
    let state = app_handle.state::<ApiBillingState>();
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
    // Ephemeral 账户在此阶段自动清理
    cleanup_ephemeral_accounts(&state);
    // 强制 flush store 到磁盘
    flush_store_to_disk(app_handle);
}
```

### 4.4 探针方案

#### 4.4.1 分层探针 + AuthProfile 驱动

探针不再是一个简单的函数调用，而是一个 **分层证据收集引擎**，由 Station 级别的 AuthProfile 驱动策略选择。AuthProfile 在首次登录成功后自动检测生成（详见第 10 章）。

| 级别 | 工具 | 耗时 | 触发条件 |
|------|------|------|----------|
| L1: HTTP Probe | reqwest HTTP 客户端 | <2s | AuthProfile.probe_strategy = http_first / http_only |
| L2: WebView Probe | 隐藏 WebView + 多源证据 | <13s | HTTP probe 失败、AuthProfile = webview_only、或 adaptive degrade |
| L3: Hybrid Probe | WebView + 重定向链跟踪 | <20s | AuthProfile = hybrid (SSO/OAuth 场景) |

#### 4.4.2 HTTP Probe 实现

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

    let resp = client.head(website).headers(headers).send().await?;

    match resp.status() {
        s if s.is_success() => ProbeResult::Ready,
        s if s.is_redirection() => {
            let location = resp.headers().get("location");
            if is_login_page(location) {
                ProbeResult::LoginRequired
            } else {
                ProbeResult::Uncertain  // 触发 L2 probe
            }
        }
        _ => ProbeResult::Uncertain,
    }
}
```

#### 4.4.3 现有探针的保留与降级

当前 `probe.rs` 的隐藏 WebView 方案保留，但：
- 从"唯一方案"降级为"L2 fallback"
- 仅在 HTTP probe 返回 `Uncertain` 时触发
- Station 级别可配置"始终使用 WebView probe"(针对 session 不依赖 cookie 的网站)

### 4.5 多账号互斥

#### 4.5.1 配置

Station 创建/编辑时选择互斥模式：
- `coexisting`: 默认，无特殊行为
- `exclusive`: 同一 Station 下只能有一个 Ready 状态账号
- `rotating`: 维护活跃账号指针，切换时保留原 session

#### 4.5.2 Exclusive 模式实现

```
用户点击"登录"账号 B → 检测同 Station 下是否有 Ready 状态的账号 A
→ 如果 A 存在：
    1. 创建隐藏 WebView，注入 A 的 session cookies
    2. navigate 到目标网站(带退出登录路径)
    3. 等待页面渲染完成
    4. evaluate_javascript: 点击退出登录按钮或导航到 /logout
    5. 确认 A 已登出
    6. 清除 A 的 session 缓存
    7. 更新 A.status = LoginRequired
→ 开始 B 的登录流程
```

#### 4.5.3 Rotating 模式实现

```
Station 维护 active_account_id 指针
→ 用户切换账号：
    1. 当前账号 session 保留，标记 status = Inactive
    2. 目标账号注入 session → 轻量 probe
    3. 如果 valid → 设为 Active
    4. 如果 expired → 标记 LoginRequired，提示重新登录
```

---

## 5. 数据迁移

### 5.1 向前兼容

现有 `relay-store.json` schema v2 中的数据迁移到新模型：

```
现有 StationAccount          → 新 StationAccount
  + account_type: "persistent" (默认值)
  + website: None (从 Station.website 继承)
  + session: None (下次登录后填充)
  + exclusivity_group: None

phone/tgAccount/linkedAccount/inviteLink/loginMethods
  → 保留在响应中(向前兼容)
  → 前端不再渲染对应输入框
  → 通过 updateAccount API 仍可编辑(向后兼容)
```

### 5.2 回滚方案

新字段全部带 `#[serde(default)]`，旧版本读取新数据时自动忽略未知字段。降级只需回滚二进制，数据无损。

---

## 6. 安全设计

| 层面 | 措施 |
|------|------|
| 密码 | AES-256-GCM 加密，master_key 存储在系统 keychain |
| Session cookies | 与密码使用相同的 master_key 加密 |
| 传输 | cookie 仅在 Rust 层内存中存在，不暴露给前端 JS |
| 导出 | EncryptedFull 模式使用当前 keychain 重新加密；Sanitized 模式剥离所有密钥 |
| Ephemeral | 密码不存储，session 仅存在于进程内存 |
| 退出 | RunEvent::ExitRequested 中强制 flush store 到磁盘 |

---

## 7. UI 设计要点

### 7.1 信息架构

```
侧边栏
  ├── 📥 快速登录           <-- 新入口，始终可见
  ├── ─────────────
  ├── 📁 中转站 A           <-- 现有 Station 列表
  │     ├── 账号 1
  │     ├── 账号 2
  │     └── [+ 添加账号]
  ├── 📁 中转站 B
  │     └── 账号 3
  └── [+ 新建中转站]
```

### 7.2 快速登录入口

- 始终可见的顶部栏按钮或侧边栏首项
- 点击弹出极简面板：URL 输入框 + 用户名输入框 + "打开登录"按钮
- 支持粘贴即用：检测剪贴板中的 URL 格式自动填充
- 历史记录：最近 5 个临时网站的 URL 快速复用

### 7.3 Station 详情页

- 账户列表显示 session 状态指示灯(绿/黄/红)
- 支持拖拽排序
- 互斥模式在 Station 设置中配置
- "全部刷新"按钮：对所有账户执行 L1 HTTP probe

### 7.4 右侧详情面板 — AuthProfile 展示（面向技术用户）

Station 详情页右侧固定一个可折叠的 AuthProfile 信息面板，实时展示当前站点的认证检测结果。面向懂得一些技术的用户，帮助理解系统如何管理该站点的 session。

#### 面板结构

```
┌─────────────────────────────────────┐
│ 🔍 认证检测结果                      │
│ 检测时间: 2026-06-30 10:45           │
│ 置信度: ████████░░ 82%               │
├─────────────────────────────────────┤
│                                     │
│ 📋 Cookie 认证     ✅ 已检测         │
│    3 个 session cookie              │
│    SID, JSESSIONID, auth_token      │
│                                     │
│ 💾 Token 存储      localStorage     │
│    access_token, refresh_token      │
│                                     │
│ 🛡 CSRF 保护       已启用            │
│    来源: meta[csrf-token]           │
│    Header: X-CSRF-Token             │
│                                     │
│ 🔐 认证类型         Bearer OAuth2    │
│                                     │
│ 👆 设备指纹         基本级别          │
│    IP + UA 校验                      │
│                                     │
│ 🚫 反机器人         未检测            │
│                                     │
│ 🎯 当前探针策略     HTTP First       │
│    (L1 HTTP → L2 WebView fallback)  │
│    HTTP probe 成功率: 97% (28/29)   │
│                                     │
├─────────────────────────────────────┤
│ [🔄 重新检测]  [⚙ 手动切换策略 ▼]    │
└─────────────────────────────────────┘
```

#### 面板设计原则

1. **信息分层**：顶部显示关键摘要（检测时间 + 置信度），中部按维度展示检测结果，底部提供操作入口
2. **面向技术用户**：不隐藏技术术语（如 `localStorage`、`CSRF`、`Bearer OAuth2`），用图标和颜色辅助理解
3. **可操作性**：提供"重新检测"按钮（强制重新执行 AuthProfile 检测脚本）和"手动切换策略"下拉（覆盖自动检测的探针策略）
4. **状态可视化**：每个检测维度用图标 + 颜色表示状态
   - 🟢 绿色 = 检测到且正常
   - 🟡 黄色 = 部分检测到/不确定
   - 🔴 红色 = 检测到异常/冲突
   - ⚪ 灰色 = 未检测到
5. **探针策略可视化**：显示当前生效的探针策略及 HTTP probe 成功率，帮助用户理解为什么某些刷新操作慢（降级到 WebView 时）

#### 手动切换策略选项

用户可通过下拉菜单临时覆盖自动检测的探针策略：

| 选项 | 标签 | 说明 |
|------|------|------|
| `auto` | 自动检测（推荐） | 由 AuthProfile 引擎自动选择 |
| `http_only` | 仅 HTTP | 始终使用 HTTP HEAD probe，不降级 |
| `http_first` | HTTP 优先 | HTTP probe 失败后自动降级为 WebView |
| `webview_only` | 仅 WebView | 始终使用 WebView probe（较慢但兼容性最好） |

手动切换后，面板顶部显示提示："⚠ 探针策略已手动覆盖，点击[重置为自动]恢复"

---

## 8. 实施路线图

### Phase 1 — P0: Session 持久化 (2-3 天)

- [ ] `AccountSession` / `CookieEntry` 数据模型
- [ ] 登录捕获：`on_navigation` 回调 + cookie 提取 + 加密存储
- [ ] 退出持久化：`RunEvent::ExitRequested` hook
- [ ] 启动恢复：cookie 注入 + L1 HTTP probe
- [ ] 手动刷新：前端 "刷新" 按钮触发 L1 probe

### Phase 2 — P1: 表单简化 + 快速录入 (1-2 天)

- [ ] `account_type` 字段 + `website` 字段
- [ ] `station_id` 变为可选
- [ ] 快速录入 UI：2 字段面板 + 粘贴检测
- [ ] 持久账户表单砍到 4 字段
- [ ] 旧字段移除(保留数据，隐藏 UI)

### Phase 3 — P1: 探针升级 (2 天)

- [ ] `reqwest` HTTP 客户端集成
- [ ] L1 HTTP probe 实现
- [ ] L2 WebView probe 降级为 fallback
- [ ] Station 级别探针策略配置
- [ ] 移除 Semaphore(2) 限制

### Phase 4 — P2: 多账号互斥 (2 天)

- [ ] Station 互斥模式配置(exclusive/coexisting/rotating)
- [ ] Exclusive: 登录前自动登出逻辑
- [ ] Rotating: 活跃账号指针 + 切换逻辑
- [ ] 互斥组(ephemeral account 用)

### Phase 5 — 打磨 (1 天)

- [ ] 错误分类器更新: 新增 HTTP probe 错误类型
- [ ] Ephemeral 账户生命周期: 关闭窗口策略(保留/销毁)
- [ ] 历史记录: 最近 5 个临时 URL
- [ ] i18n: 所有新文案

**总计: 8-10 天**

---

## 9. 认证兼容性分析

### 9.1 为什么简单的 cookie 检查不够

当前 bench 的检测逻辑仅检查页面 DOM 中是否包含"退出登录"文本。这在以下场景下完全失效：

1. **非 cookie 认证**：JWT 存 localStorage、OAuth2 bearer token、WebSocket 认证
2. **Cookie 搬运失败**：Session 与设备指纹(TLS/UA/IP)绑定，搬到 HTTP client 后服务端拒绝
3. **反机器人拦截**：Cloudflare JS Challenge、Turnstile 直接拦截非浏览器请求
4. **Token 旋转**：Refresh token 使用后立即失效，提取的 token 与 WebView 中不同步
5. **企业 SSO**：SAML/OIDC 多跳重定向，Continuous Access Evaluation 实时吊销

### 9.2 认证威胁矩阵

按对 Session Manager 的威胁等级将所有 Web 认证机制分为三级：

| 威胁等级 | 机制 | 覆盖比例 | 对 Session Manager 的影响 | 应对策略 |
|----------|------|----------|--------------------------|----------|
| L1 可处理 | HttpOnly Session Cookie | ~40% | `WebviewWindow::cookies()` 可捕获。HTTP probe 可直接验证 | Cookie header 直传 |
| L1 可处理 | SameSite=Lax/Strict Cookie | ~15% | 同源 HTTP probe 正常发送。跨站时需注意 origin header | 使用与 WebView 一致的 origin |
| L2 需增强 | JWT in localStorage / IndexedDB | ~15% | cookie API 拿不到。必须 `evaluateJavaScript` 提取 | 注入 JS 提取所有存储 token |
| L2 需增强 | CSRF Double-Submit Cookie | ~10% | 请求还需携带 X-CSRF-Token header | 从 meta tag 提取并附加 |
| L2 需增强 | OAuth2 Refresh Token Rotation | ~8% | refresh_token 使用后立即失效，不可重用 | 仅存 access_token；过期后走 WebView 完整 OAuth |
| L3 严重挑战 | Session Fingerprinting (IP/UA/TLS) | ~5% | cookie 搬运到 HTTP client 时指纹变化，服务端拒绝 | 始终在 WebView 中操作 |
| L3 严重挑战 | Device-Bound Session (DBSC) | ~3% | session 绑定到 TPM 私钥，cookie 不可迁移 | 同设备同 data store 恢复 |
| L3 严重挑战 | Enterprise SSO (SAML/OIDC/CAE) | ~2% | 多跳重定向链，PRT，实时吊销 | 完整 WebView 重定向链 probe |
| L3 严重挑战 | Cloudflare / Anti-Bot | ~2% | 非浏览器 HTTP 请求被 JS Challenge 拦截 | 自动降级为 WebView probe |
| ⚠ 边界 | Partitioned Cookies (CHIPS) | ~1% | cross-site 时不发送，仅 same-origin 可用 | CookieEntry 标记 partitioned 属性 |
| ⚠ 边界 | iCloud Private Relay | macOS 用户 | WebView IP ≠ 系统真实 IP，HTTP probe IP 不一致 | 检测并降级 WebView probe |
| ⚠ 边界 | WebAuthn / Passkeys | ~1% | 依赖平台认证器，无法自动化 | 标记为不可自动登录，通知用户 |

### 9.3 各机制详细分析

#### L1: HttpOnly Session Cookie

最常见的模式。`Set-Cookie: session_id=xxx; HttpOnly; Secure; SameSite=Lax`。

- **Session 提取**：`WebviewWindow::cookies(url)` 可获取包括 HttpOnly 在内的所有 cookie
- **HTTP probe**：可工作。用 reqwest 发 HEAD 请求，Cookie header 带上 session_id
- **限制**：必须使用与 WebView 一致的 User-Agent。SameSite=Strict 的 cookie 在同站请求中正常发送
- **恢复**：启动时通过 `WKHTTPCookieStore.setCookie` 逐个注入后可用

#### L2: JWT in localStorage / IndexedDB

SPA 常用模式。登录后返回 `{ access_token, refresh_token }`，前端存 localStorage，请求手动带 `Authorization: Bearer <token>`。cookie 可能为空。

- **Session 提取**：必须注入 JS 读取 `localStorage`、`sessionStorage`、IndexedDB
- **HTTP probe**：需手动构造 `Authorization: Bearer <token>` header
- **风险**：服务端可能同时检查 Cookie 和 Authorization header，两者验证逻辑分离
- **恢复**：启动时通过 `evaluateJavaScript` 将 token 写回 localStorage

#### L2: CSRF Double-Submit Cookie

服务端要求请求同时携带 Session cookie 和 CSRF token（通常在 `X-CSRF-Token` header 中），两者必须匹配。

- **Session 提取**：除了 cookies，还需从页面提取 CSRF token。常见位置：
  - `<meta name="csrf-token" content="...">`
  - `<script>window.csrfToken = "..."</script>`
  - 第一个 cookie（double-submit 模式）
- **HTTP probe**：需从 meta tag 提取 CSRF token 并附加到请求头
- **WebView probe**：浏览器自动处理，无额外工作

#### L2: OAuth2 Refresh Token Rotation

Auth0 / Okta / Azure AD 标准做法。每次使用 refresh_token 后它立即失效，同时下发新 token。

- **Session 提取**：不提取 refresh_token。仅存储 access_token 用于短时 HTTP probe
- **HTTP probe**：如果 access_token 过期（返回 401），不能使用 refresh_token。必须回退 WebView 完整流程
- **恢复**：需要重新认证（refresh_token 已失效）

#### L3: Session Fingerprinting

服务端将 session 绑定到客户端特征：
- **IP 地址**：reqwest 发出的请求 IP 可能与 WebView 不同（代理/VPN 场景）
- **User-Agent**：reqwest 默认 UA 与 WKWebView 的 UA 不同
- **TLS 指纹（JA3/JA4）**：reqwest 的 TLS 握手特征与 WKWebView 完全不同
- **HTTP/2 帧特征**：浏览器和 HTTP 客户端的 HTTP/2 行为不同
- **Canvas/WebGL 指纹**：仅在 WebView 渲染时可用

任何一个不匹配都可能导致服务端判定为"session 劫持"，强制重新认证。

- **应对**：HTTP probe 时使用与 WKWebView 完全相同的 User-Agent；检测到 IP/TLS 不一致导致的异常时自动回退 WebView probe；Station 级别记录 HTTP probe 成功率，连续失败 N 次自动切换为 `webview_only`

#### L3: Device-Bound Session Credentials (DBSC)

> ⚠️ **2026 年 4 月更新**: Chrome 146 在 Windows 上正式 GA 了 DBSC。
> 启用后 session cookie 与设备 TPM 硬件密钥绑定，被窃取的 cookie 几分钟后失效。

session 私钥存储在设备 TPM/Secure Enclave 中，服务端只保存公钥。每次请求需要设备用私钥签名 proof。

- **限制**：提取的 cookie 在其他 context 中无效（签名需要原始设备上的 TPM 私钥）
- **应对**：DBSC 场景下 session 完全不可迁移。必须在同一 WebView 的持久化 data store 中进行所有操作。首次登录时检测 `Sec-Session-Challenge` header 自动识别

#### L3: Enterprise SSO (SAML / Azure AD / Okta)

企业 SSO 的 session 验证不是简单的"cookie 在不在"：
1. **多跳重定向**：用户 → SP → IdP → 认证 → 回调 → SP。至少 3 次 302
2. **Primary Refresh Token (PRT)**：Azure AD 设备加入场景，token 与设备 TPM 绑定
3. **Continuous Access Evaluation (CAE)**：服务端可以近乎实时地吊销 token
4. **Conditional Access Policies**：设备合规性、位置策略、风险分数

- **应对**：SSO 场景一律使用 WebView probe。probe 时导航到受保护页面，跟踪完整的重定向链，通过着陆页 DOM 状态判断

#### L3: Cloudflare / Anti-Bot

Cloudflare JS Challenge、Turnstile、reCAPTCHA 等。非浏览器 HTTP 请求被 403 并返回 JS challenge 页面。

- **应对**：HTTP probe 返回 403/503 且 body 包含 `cf-challenge` 或 `_cf_chl_opt` 时，自动降级为 WebView probe

---

## 10. AuthProfile 自动检测引擎

### 10.1 设计目标

在用户首次登录成功后，自动分析目标网站的认证机制，生成 `AuthProfile`，决定后续所有探针策略。避免用户手工配置。

### 10.2 数据模型

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthProfile {
    /// 是否有 session cookie（HttpOnly 或非 HttpOnly）
    pub cookie_based: bool,
    /// token 存储位置
    pub token_storage: TokenStorage,
    /// 是否需要 CSRF token
    pub csrf_protection: bool,
    /// CSRF token 提取方式
    pub csrf_extraction: Option<CsrfExtraction>,
    /// 认证类型
    pub auth_type: AuthType,
    /// 指纹严格程度
    pub fingerprinting: FingerprintingLevel,
    /// 是否有反机器人机制
    pub anti_bot: bool,
    /// SSO 提供商
    pub sso_provider: Option<SsoProvider>,
    /// 探针策略
    pub probe_strategy: ProbeStrategy,
    /// 检测时间
    pub detected_at: String,
    /// 检测置信度 0.0-1.0
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TokenStorage {
    Cookie,
    LocalStorage,
    IndexedDB,
    SessionStorage,
    Multiple,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthType {
    SessionCookie,
    BearerOAuth,
    Saml,
    OpenIdConnect,
    WebSocket,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FingerprintingLevel {
    None,
    Basic,     // 仅 IP 和 UA
    Strict,    // IP + UA + TLS 指纹
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SsoProvider {
    AzureAd,
    Okta,
    Auth0,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProbeStrategy {
    HttpOnly,
    WebviewOnly,
    HttpFirst,   // 默认：先 HTTP，失败再 WebView
    Hybrid,      // 复杂 SSO：多阶段 probe
}
```

### 10.3 检测脚本

登录成功后在 WebView 中执行以下 JS 来收集认证环境信息：

```javascript
// 注入到登录完成后的页面
(function() {
    'use strict';

    // ── 1. Cookie 检测 ──
    const cookies = document.cookie.split('; ').filter(Boolean);
    const sessionCookieNames = cookies
        .map(c => c.split('=')[0])
        .filter(name =>
            /session|auth|sid|token|connect\.sid|JSESSIONID|PHPSESSID/i.test(name)
        );

    // ── 2. localStorage token 检测 ──
    const lsKeys = Object.keys(localStorage);
    const tokenKeys = lsKeys.filter(k =>
        /token|auth|session|jwt|access|id_token|refresh/i.test(k)
    );
    const localStorageTokens = {};
    tokenKeys.forEach(k => {
        const raw = localStorage.getItem(k);
        try {
            const parsed = JSON.parse(raw);
            localStorageTokens[k] = {
                type: typeof parsed,
                hasAccessToken: !!parsed.access_token,
                hasRefreshToken: !!parsed.refresh_token,
                hasIdToken: !!parsed.id_token,
                preview: raw.substring(0, 30) + '...'
            };
        } catch {
            localStorageTokens[k] = {
                type: 'string',
                preview: raw.substring(0, 30) + '...'
            };
        }
    });

    // ── 3. sessionStorage 检测 ──
    const ssKeys = Object.keys(sessionStorage);
    const sessionTokenKeys = ssKeys.filter(k =>
        /token|auth|session/i.test(k)
    );

    // ── 4. CSRF token 检测 ──
    const csrfMeta = document.querySelector(
        'meta[name="csrf-token"], meta[name="_csrf"], ' +
        'meta[name="csrf"], meta[name="csrf-param"]'
    );
    const csrfInput = document.querySelector(
        'input[name="_csrf"], input[name="csrf_token"], ' +
        'input[name="csrfmiddlewaretoken"]'
    );

    // ── 5. 登录状态 UI 检测 ──
    const logoutSelectors = [
        'a[href*="logout"]', 'a[href*="signout"]', 'a[href*="sign-out"]',
        'a[href*="log-out"]', 'button[data-testid="logout"]',
        '[aria-label*="logout"]', '[aria-label*="sign out"]',
    ];
    const logoutElements = logoutSelectors
        .map(sel => {
            const el = document.querySelector(sel);
            return el ? { selector: sel, text: el.textContent?.trim().substring(0, 50) } : null;
        })
        .filter(Boolean);

    // ── 6. SSO 重定向检测 ──
    const url = window.location.href;
    const isSSOLogin =
        /login\.(microsoft|microsoftonline|okta|auth0)\.com/i.test(url) ||
        /\/saml\/|\/oauth2\/|\/openid\//i.test(url);
    const ssoProvider = isSSOLogin ? (
        /microsoft/i.test(url) ? 'azure_ad' :
        /okta/i.test(url) ? 'okta' :
        /auth0/i.test(url) ? 'auth0' : 'unknown'
    ) : null;

    // ── 7. 反机器人检测 ──
    const cloudflareChallenge = !!document.querySelector(
        '#challenge-form, #cf-challenge, [id*="cf-"]'
    );
    const hasTurnstile = !!document.querySelector('.cf-turnstile');
    const hasRecaptcha = !!document.querySelector('.g-recaptcha');

    // ── 8. WebSocket 连接检测 ──
    // (需要在 CDP/playwright 层面检测，页面 JS 只能检测已建立的连接)
    // 通过拦截 WebSocket 构造函数来实现
    let wsDetected = false;
    const OrigWebSocket = window.WebSocket;
    window.WebSocket = function(...args) {
        wsDetected = true;
        return new OrigWebSocket(...args);
    };
    window.WebSocket.prototype = OrigWebSocket.prototype;

    return {
        sessionCookieNames,
        totalCookies: cookies.length,
        tokenKeys,
        localStorageTokens,
        sessionTokenKeys,
        csrf: {
            metaName: csrfMeta?.getAttribute('name') || null,
            metaContent: csrfMeta?.getAttribute('content')?.substring(0, 20) || null,
            inputName: csrfInput?.getAttribute('name') || null,
            inputValue: csrfInput?.getAttribute('value')?.substring(0, 20) || null,
        },
        logoutElements,
        ssoProvider,
        cloudflare: {
            challenge: cloudflareChallenge,
            turnstile: hasTurnstile,
            recaptcha: hasRecaptcha,
        },
        websocketDetected: wsDetected,
        url: window.location.href,
        title: document.title,
        hasServiceWorker: !!navigator.serviceWorker?.controller,
    };
})()
```

### 10.4 分类逻辑

```rust
pub fn classify_auth_profile(detection: &DetectionResult) -> AuthProfile {
    let mut profile = AuthProfile::default();

    // 1. 判断 cookie-based
    profile.cookie_based = !detection.session_cookie_names.is_empty()
        || detection.total_cookies > 0;

    // 2. 判断 token storage
    if !detection.token_keys.is_empty() {
        profile.token_storage = TokenStorage::LocalStorage;
    } else if !detection.session_token_keys.is_empty() {
        profile.token_storage = TokenStorage::SessionStorage;
    } else if profile.cookie_based {
        profile.token_storage = TokenStorage::Cookie;
    }

    // 3. 判断 CSRF
    profile.csrf_protection = detection.csrf.meta_name.is_some()
        || detection.csrf.input_name.is_some();

    // 4. 判断认证类型
    if detection.sso_provider.is_some() {
        profile.auth_type = match detection.sso_provider.as_deref() {
            Some("azure_ad") => AuthType::Saml,
            Some("okta") | Some("auth0") => AuthType::OpenIdConnect,
            _ => AuthType::Unknown,
        };
    } else if detection.websocket_detected {
        profile.auth_type = AuthType::WebSocket;
    } else if detection.has_localstorage_tokens() {
        profile.auth_type = AuthType::BearerOAuth;
    } else {
        profile.auth_type = AuthType::SessionCookie;
    }

    // 5. 判断 fingerprinting
    if detection.uses_strict_cors() && detection.uses_device_checking() {
        profile.fingerprinting = FingerprintingLevel::Strict;
    } else if detection.cloudflare.challenge || detection.cloudflare.turnstile {
        profile.fingerprinting = FingerprintingLevel::Basic;
    }

    // 6. 判断 anti-bot
    profile.anti_bot = detection.cloudflare.challenge
        || detection.cloudflare.turnstile
        || detection.cloudflare.recaptcha;

    // 7. 选择探针策略
    profile.probe_strategy = if profile.anti_bot
        || profile.fingerprinting == FingerprintingLevel::Strict
        || profile.auth_type == AuthType::Saml
    {
        ProbeStrategy::WebviewOnly
    } else if profile.auth_type == AuthType::OpenIdConnect {
        ProbeStrategy::Hybrid
    } else if profile.token_storage == TokenStorage::LocalStorage {
        ProbeStrategy::HttpFirst
    } else {
        ProbeStrategy::HttpFirst
    };

    profile.detected_at = now_label();
    profile.confidence = calculate_confidence(detection);

    profile
}
```

### 10.5 探针引擎路由

```
probe(account) → AuthProfile → Strategy Selector
  │
  ├── strategy = http_only
  │     └── HTTP HEAD + cookie → 200? → Ready : LoginRequired
  │
  ├── strategy = http_first (默认)
  │     ├── HTTP HEAD + cookie → 200? → Ready
  │     ├── 403 + anti-bot pattern? → 自动降级为 WebView probe
  │     │     └── 连续 3 次降级 → 永久切换 station 的 probe_strategy 为 WebviewOnly
  │     ├── 302 + login_page? → LoginRequired
  │     └── 不确定? → WebView probe (原地，继续)
  │
  ├── strategy = webview_only
  │     ├── 创建隐藏 WebView
  │     ├── 注入 session data (cookies + localStorage + sessionStorage)
  │     ├── navigate 到受保护页面（不跟随 302）
  │     ├── 等待 DOM ready
  │     └── 多源证据收集:
  │           ├── 最终 URL: 是否被重定向到 /login
  │           ├── document.cookie: session cookie 是否存在
  │           ├── document.title: 是否包含"登录"/"Login"
  │           ├── DOM 元素: 是否存在 logout 相关元素
  │           ├── localStorage: token 是否存在
  │           └── Network observer: XHR/fetch 请求是否返回 401
  │
  └── strategy = hybrid (复杂 SSO/OAuth)
        ├── Phase 1: 导航到 IdP 受保护 endpoint
        ├── Phase 2: 跟踪重定向链 (最多 10 跳)
        ├── Phase 3: 着陆页 DOM 检查
        └── Phase 4: 如果需要，触发静默 token refresh (iframe)
```

### 10.6 自适应降级

```rust
/// HTTP probe 连续失败后的自动降级逻辑
pub async fn adaptive_degrade(
    state: &ApiBillingState,
    station_id: &str,
    failure_count: u32,
) {
    const DEGRADE_THRESHOLD: u32 = 3;

    if failure_count >= DEGRADE_THRESHOLD {
        // 永久降级：该 Station 后续所有 probe 使用 WebView
        update_station_probe_strategy(station_id, ProbeStrategy::WebviewOnly).await;

        // 通知前端：此站点已自动切换为 WebView 模式
        emit_event("probe:strategy-changed", json!({
            "stationId": station_id,
            "newStrategy": "webview_only",
            "reason": format!("HTTP probe failed {} consecutive times", failure_count),
        }));
    }
}
```

### 10.7 Session 提取增强

基于 AuthProfile 的结果，登录捕获时收集不同来源的证据：

```rust
pub async fn capture_full_session(
    window: &WebviewWindow,
    profile: &AuthProfile,
) -> AccountSession {
    let mut session = AccountSession::default();

    // 始终提取 cookies
    session.cookies = window.cookies(url).await?;

    // 根据 TokenStorage 提取额外数据
    match profile.token_storage {
        TokenStorage::LocalStorage => {
            let ls = window.eval("JSON.stringify(localStorage)").await?;
            session.local_storage = Some(encrypt(&ls)?);
        }
        TokenStorage::SessionStorage => {
            let ss = window.eval("JSON.stringify(sessionStorage)").await?;
            session.session_storage = Some(encrypt(&ss)?);
        }
        TokenStorage::IndexedDB => {
            // IndexedDB 提取需要注入专门的 JS 库
            // 遍历所有 database → object store → 提取 key-value
            session.indexeddb_snapshot = Some(capture_indexeddb(window).await?);
        }
        TokenStorage::Multiple => {
            // 全部提取
            capture_all_storage(window, &mut session).await?;
        }
        _ => {}
    }

    // 如果检测到 CSRF，提取 token
    if profile.csrf_protection {
        session.csrf_token = extract_csrf_token(window, profile).await?;
    }

    session
}
```

---

## 12. 实施路线图 (已更新)

### Phase 1 — P0: Session 持久化 (2-3 天)

- [ ] `AccountSession` / `CookieEntry` 数据模型
- [ ] 登录捕获：`on_navigation` 回调 + cookie 提取 + 加密存储
- [ ] 退出持久化：`RunEvent::ExitRequested` hook
- [ ] 启动恢复：cookie 注入 + L1 HTTP probe
- [ ] 手动刷新：前端 "刷新" 按钮触发 L1 probe

### Phase 2 — P1: 表单简化 + 快速录入 (1-2 天)

- [ ] `account_type` 字段 + `website` 字段
- [ ] `station_id` 变为可选
- [ ] 快速录入 UI：2 字段面板 + 粘贴检测
- [ ] 持久账户表单砍到 4 字段
- [ ] 旧字段移除(保留数据，隐藏 UI)

### Phase 3 — P1: 探针升级 + AuthProfile 引擎 (3 天)

- [ ] `reqwest` HTTP 客户端集成
- [ ] L1 HTTP probe 实现（含 cookie / bearer / CSRF 三种模式）
- [ ] AuthProfile 自动检测：登录后 JS 注入 + 分类逻辑
- [ ] L2 WebView probe 降级为 fallback + 多源证据收集
- [ ] 自适应降级：连续 HTTP probe 失败 → 自动切换 WebViewOnly
- [ ] Station 级别探针策略存储

### Phase 4 — P2: 多账号互斥 (2 天)

- [ ] Station 互斥模式配置(exclusive/coexisting/rotating)
- [ ] Exclusive: 登录前自动登出逻辑
- [ ] Rotating: 活跃账号指针 + 切换逻辑
- [ ] 互斥组(ephemeral account 用)

### Phase 5 — 打磨 (1 天)

- [ ] 错误分类器更新: 新增 HTTP probe 错误类型 + anti-bot 检测
- [ ] Ephemeral 账户生命周期: 关闭窗口策略(保留/销毁)
- [ ] 历史记录: 最近 5 个临时 URL
- [ ] i18n: 所有新文案

**总计: 9-11 天**

---

## 13. 指标定义

| 指标 | 当前 | 目标 | 衡量方式 |
|------|------|------|----------|
| 新建账户操作步骤 | 7 步 | 2 步(Ephemeral) / 4 步(Persistent) | 点击计数 |
| 登录态刷新耗时 | 13s | <2s(L1) / <13s(L2) | 计时 |
| 退出重启后 session 存活率 | ~0% | >95% | 测试用例 |
| 表单字段数(Persistent) | 10 | 4 | 字段计数 |
| 表单字段数(Ephemeral) | N/A | 2 | 字段计数 |
| 认证机制覆盖率 | ~30% (仅 cookie) | ~85% (L1+L2 全部覆盖) | AuthProfile 分类统计 |
| HTTP probe 成功率 | N/A | >70% (L1 网站) | 降级事件计数 |

---

## 14. 附录

### A. 技术依赖

- **Tauri v2**: `WebviewWindow::cookies()`(获取所有 cookie)、`WebviewWindow::on_navigation()`(检测登录完成)
- **reqwest**: HTTP 客户端，用于 L1 probe
- **ring / aes-gcm**: 加密 session cookies(现有 `crypto.rs` 已使用)
- **tauri-plugin-store**: 持久化 relay-store.json(现有)

### B. 相关 WebKit Bug

- [WebKit #213636](https://bugs.webkit.org/show_bug.cgi?id=213636): `WKHTTPCookieStore.setCookie` 应在 completion handler 前 flush 到磁盘
- [Tauri #11330](https://github.com/tauri-apps/tauri/issues/11330): 讨论 `WebviewWindow::cookies()` 提取 HTTP-only cookies
- [Tauri #2490](https://github.com/tauri-apps/tauri/issues/2490): Cookie 跨平台持久化不一致

### C. 参考设计

- Safari 的"从上次停下的地方继续"——启动时恢复所有标签页的 session
- 1Password 的"快速搜索 + 一键填充"——极简录入理念
- Chrome 的"访客模式"——Ephemeral 账户的参考
