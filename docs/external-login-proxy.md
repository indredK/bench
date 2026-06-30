# 外部登录代理 (External Login Proxy)

> 版本: v1.0 | 状态: 已实现（可用）
> 本文档由 `external-login-proxy-design-spec.md`（功能/交互稿）与
> `external-login-proxy-best-practices.md`（安全加固稿）评审合并而成，
> 是该功能的唯一权威设计与实现说明。

## 1. 一句话定义

让 bench 成为外部软件的**登录代理**：当外部软件触发浏览器登录时，跳转到 bench 而不是默认浏览器；
bench 用所选账号在**独立隔离的 WebView**中完成登录，并把外部软件**自己的回调原样转交**回去。
每个账号的登录态被持久化保存，因此下一次切换账号、再次登录时无需重复输入账号密码或验证码。

## 2. 目标与非目标

### 2.1 目标

- 让使用系统浏览器登录的外部软件，可以由 bench 接管账号选择 + 登录态隔离。
- 同一站点多账号可独立开启/关闭代理能力，并在请求到来时由用户选择账号。
- 通过持久化的 per-account session，做到“切换账号、保持登录态、免重复登录”。
- 所有授权 UI 全量接入 i18n。

### 2.2 非目标

- 不绕过 MFA、CAPTCHA、设备确认、风控或 OAuth consent。
- 不向外部 App 返回密码、cookie 或 bench 内部数据结构。
- 不抢占其它 App 的 callback scheme、不做 TLS MITM、不注入其它进程、不静默读取其它浏览器 profile。
- 不承诺把 bench 的 session 注入任意第三方 App 的内嵌 WebView。

## 3. 架构结论（评审核心）

两份原始文档在“凭证如何回传”上存在冲突：

- 设计稿（v0.2）：在回调 URL 里直接回传 `token=...`（抓取 cookie / localStorage）。
- 安全稿（v1.0-secure）：**禁止** URL 回传任何原始凭证，主路径应为“系统浏览器代理”。

合并结论：**采用安全稿的“浏览器代理 / callback 转交”模型作为唯一主路径。**

原因：

1. **更安全**：bench 永远不解析、不持有、不回传站点 token / cookie；它只把 OAuth provider
   返回给外部 App 的**原始 callback URL**（其中含 App 自己的 `code`）原样 `openExternal` 转交。
2. **更可靠**：无需为每个站点猜测 token 在 cookie / localStorage / URL 的哪个位置。
3. **天然契合本场景**：外部 App 本来就期望从浏览器收到自己的 callback，bench 只是在“浏览器”
   这个位置上替用户选账号 + 隔离登录态。

> 历史的 token 抽取实现（`proxy/token_extractor.rs`、`build_proxy_return_url`）已不在主流程使用，
> 仅作为兼容保留，不应再扩展。新逻辑一律走 callback 转交。

## 4. 核心流程

```text
外部 App                         Bench                                用户
  │                               │                                    │
  │ 1. open bench-auth://authorize│                                    │
  │    ?target=<oauth authorize>  │                                    │
  │    &return=<myapp://callback> │                                    │
  │    &state=<opaque>            │                                    │
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
  │ 7. myapp://callback?code=...  │    - shell.open(原始 callback URL)   │
  │◀──────────────────────────────│    - 关闭 WebView                    │
  │ 8. 外部 App 收到自己的 code     │                                    │
```

关键点：bench 不理解外部 App 的私有协议，也不向它吐 token。它只在 WebView 导航命中
`return` 前缀（即外部 App 自己的 callback scheme）时，取消该次 WebView 导航，并用系统
`openExternal` 把这条原始 callback 原封不动交还给外部 App。

## 5. 协议定义

### 5.1 唤起协议 `bench-auth://`

```text
bench-auth://authorize
  ?target=<url-encoded https authorize/login url>
  &return=<url-encoded app callback url>
  &state=<opaque-state>
  &site=<optional-station-id>
```

| 参数 | 必填 | 规则 |
| --- | --- | --- |
| `target` | 是 | 外部软件要登录的目标 URL（OAuth authorize endpoint / 登录页）。 |
| `return` | 是 | 外部软件自定义回调 URL。其 scheme 必须为自定义 scheme，**不能**是 `http`/`https`/`bench-auth`/`file`/`javascript`。 |
| `state` | 否 | 原样不参与转交（callback 由 provider 自带 state）。 |
| `site` | 否 | 仅作为 UI 预选 hint，不能新增匹配候选、不能绕过 host 匹配。 |

### 5.2 回调转交

bench **不构造**带 token 的回调。它转交的是 provider 重定向到的、外部 App 自己的原始
callback URL：

```text
myapp://callback?code=<provider-issued-code>&state=<provider-state>
```

日志只记录 callback 的 scheme，不记录完整 URL（其中可能含 code / state）。

### 5.3 注册方式（macOS）

`tauri.conf.json` 通过 `CFBundleURLTypes` + deep-link 插件注册 `bench-auth`：

```json
"bundle": { "macOS": { "infoPlist": { "CFBundleURLTypes": [
  { "CFBundleURLName": "com.bench.app.auth", "CFBundleURLSchemes": ["bench-auth"] }
] } } },
"plugins": { "deep-link": { "desktop": { "schemes": ["bench-auth"] } } }
```

启动时另做一次 best-effort 运行时注册（`deep_link().register("bench-auth")`），便于
Linux/Windows 调试环境。

### 5.4 native-app loopback 模式（无自定义 scheme 的工具，如 Trae / GitHub CLI / VS Code）

很多 IDE/CLI 登录时**不发自定义协议**，而是直接让系统浏览器打开一个 `https` authorize
链接，回调走 **本地 loopback HTTP 服务器**（RFC 8252）。例如 Trae：

```text
https://www.trae.cn/authorization?...&auth_callback_url=http://127.0.0.1:56290/authorize&code_challenge=...&code_challenge_method=S256
```

此时 bench 是“被当作浏览器”收到这条 `https` URL 的。处理方式：

1. `handle_browser_open(url)` 统一入口同时接受 `bench-auth://` 与原始 `http(s)://`。
2. 对原始链接：用 `extract_loopback_callback` 从 query 里识别回调
   （`auth_callback_url` / `redirect_uri` / `redirect_url` / `callback_url` / `callback`），
   `is_oauth_authorize_like` 判定是否像登录链接，再按 host 匹配 Station。
3. 在所选账号的隔离 WebView 打开 authorize URL。
4. WebView 导航到 `http://127.0.0.1:<port>/...` 时：**放行**这次导航，让请求真正打到
   外部 App 的本地服务器（外部 App 由此拿到 code 完成登录），随后针对**目标站点** URL
   捕获 cookie、标记账号 `Ready`、关闭窗口。
5. `validate_return_url` 对 `http`/`https` 仅放行 loopback（`127.0.0.1` / `localhost` /
   `::1`），非 loopback 一律拒绝。loopback 回调不记录为 `ExternalApp`（无稳定身份），
   账号归组由目标站点 Station 承担。

> 与 5.2 的差异：自定义 scheme 回调用 `openExternal` 交还并取消 WebView 导航；loopback
> 回调则**放行** WebView 导航（请求即送达本地服务器），不 `openExternal`。

### 5.5 路由：如何让外部 App 跳到 bench

外部 App 自己决定打开什么；要让它路由到 bench，bench 必须先是 `http/https` 处理器。
当前选择 **“可选浏览器”** 策略（不抢默认）：

- bench 在 `Info.plist` 声明 `http`/`https`（`com.bench.app.web`）+ `public.url` 文档类型，
  从而出现在系统“默认网页浏览器”候选与浏览器选择器（如 Velja/Browserosaurus）里。
- 需要时由用户通过系统“用其它浏览器打开”、浏览器选择器、或 App 自带的自定义浏览器设置
  临时选 bench；**bench 不接管普通网页浏览**。

### 5.6 “使用新账号” + 自动建站分组

账号选择器除已匹配账号外，始终提供“使用新账号登录”：

- `proxy_login_new_account(host, target, return)`：`ensure_station_for_host` 按 host 查找
  Station，没有则**自动新建并分组**（`remark = host`，`website = https://host`），再创建一个
  开启代理的新账号并立即启动代理登录。
- 登录完成后由 5.4 的 loopback 流程自动保存 session，下次同一 host 再来即出现在选择器中。

## 6. Station 匹配

### 6.1 规则（`proxy/matching.rs`）

输入 `target` 用 URL parser 提取 hostname，禁止字符串裁剪。匹配优先级：

1. 精确 hostname 匹配。
2. eTLD+1 子域匹配（`api.github.com` 命中 `github.com`）。
3. 已知 SSO 提供商模糊匹配（Microsoft / Okta / Auth0 / Google / Salesforce）。

只有 `proxyEnabled === true` 的账号才进入匹配结果。`site` hint 只能从候选中预选。

### 6.2 自动选择策略

| 条件 | 行为 |
| --- | --- |
| 匹配到 0 个 Station | 提示“无匹配账号”，引导去账号管理添加/关联。 |
| 匹配到 Station，但 0 个账号开启代理 | 提示“没有账号开启外部代理，请先开启”。 |
| 匹配到 Station + 1 个开启代理的账号 | 仍展示轻量确认/选择器（首次使用某 App 时）。 |
| 匹配到 Station + 多个账号 | 弹出账号选择器。 |
| 匹配到多个 Station | 账号选择器列出全部候选账号。 |

## 7. 账号代理开关

### 7.1 数据模型

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

### 7.2 开启 / 关闭语义

- **开启**：账号进入 `handle_auth_proxy` 匹配结果，可被外部 App 选择。
- **关闭（立即生效）**：
  - 不再出现在匹配结果中。
  - **吊销**该账号的所有 `ExternalAppBinding`，并清空账号上的 `externalAppIds` 引用。
  - 写审计日志。
  - 关闭前 UI 需确认。

### 7.3 交互入口

- 账号详情面板：`外部登录代理` Section + `Switch` 开关 + `管理外部应用`。
- 编辑账号对话框：`允许外部应用登录` checkbox（随 `updateAccount` 提交）。
- 账号卡片：开启代理时显示 🔗 图标。

## 8. 登录执行与会话持久化

### 8.1 隔离与持久化（“保持登录态”的核心）

- 每个账号使用独立 WebView data directory（`relay-accounts/<accountId>`）。
- macOS/iOS 下额外用 `data_store_identifier`（由 accountId 派生）做 WebKit 级隔离。
- 因此每个账号的 cookie / storage 在进程退出后仍保留：下次代理登录时通常**已是登录态**，
  无需再次输入账号密码或验证码。
- bench 另有加密 session 存储（capture/restore + L1 probe），用于状态判定与跨设备导出。

### 8.2 自动填充策略（`proxy/auto_fill.rs`）

- 用原生 value setter 绕过框架虚拟 DOM 守卫，触发 `input`/`change`/`blur` 事件。
- **只填字段，默认不自动提交**（安全稿 §11）。是否提交交给用户，避免错误账号被自动登录、
  或触发风控。
- 多数情况下因 session 已持久化，根本不需要填充。

### 8.3 生命周期

- 登录窗口 label 绑定 accountId（`relay-login-<accountId>`）。
- 命中 `return` 前缀即转交 callback 并关闭窗口。
- 用户取消 / provider 拒绝 WebView / 超时，窗口可手动关闭，不产生回传。

## 9. 后端命令

| 命令 | 说明 |
| --- | --- |
| `set_account_proxy_enabled(accountId, enabled)` | 开关账号代理；关闭时吊销绑定。 |
| `parse_auth_proxy_url(rawUrl)` | 解析 `bench-auth://authorize`。 |
| `handle_auth_proxy(targetUrl, returnUrl, state?, siteHint?)` | 校验 return URL + 返回匹配账号。 |
| `proxy_login(accountId, targetUrl, returnUrl)` | 打开隔离 WebView、自动填充、记录用量、启用 callback 转交 / loopback 完成检测。 |
| `handle_browser_open(url)` | 统一入口：接受 `bench-auth://` 或原始 `http(s)://` 登录链接，返回 target / 回调 / host / 是否 authorize / 匹配账号。 |
| `proxy_login_new_account(host, targetUrl, returnUrl, username?)` | “使用新账号”：自动建站分组 + 创建开启代理的新账号 + 启动代理登录。 |
| `match_proxy_target(target)` | 仅做匹配（调试/预览用）。 |
| `list_external_apps(stationId?, accountId?)` | 列出外部 App。 |
| `register_external_app(name, urlScheme, returnHosts)` | 注册外部 App（按 scheme 去重）。 |
| `remove_external_app(appId)` | 移除 App + 其绑定 + 账号引用。 |
| `list_external_app_bindings(accountId?)` | 列出绑定关系。 |

> `build_proxy_return_url` 保留但不在主流程使用（历史 token 路径）。

## 10. 前端结构

```text
src/features/api-billing/
├── auth-proxy-dialog.tsx     # 外部登录请求 + 账号选择器
├── external-apps-panel.tsx   # 外部应用管理 / 取消授权
├── page.tsx                  # deep-link 监听 + DetailColumn/EditAccount 集成
└── api.ts                    # IPC 绑定
```

- deep-link：`page.tsx` 监听 `bench-auth://` 事件 → `parseAuthProxyUrl` → `handleAuthProxy`
  → 打开 `AuthProxyDialog`。
- 选定账号 → `proxyLogin` → 后端打开 WebView 并在完成后自动转交 callback；前端只提示“已开始”。
- 文案全部走 `apiBilling.authProxy.*` / `apiBilling.externalApps.*`，中英文同步维护。

## 11. 安全策略

### 11.1 必须阻断

- return URL scheme 为 `http`/`https`/`bench-auth`/`file`/`javascript` 或无 scheme。
- return URL host 不在已注册 App 的 allowlist（当 allowlist 非空时）。
- 账号未开启 `proxyEnabled` 时执行 `proxy_login`。
- 目标 host 与任何 Station 不匹配。

### 11.2 日志原则

允许记录：app id、account id、target host、callback scheme、结果状态。
禁止记录：token、cookie、password、authorization header、完整 callback URL、完整 query。

### 11.3 威胁与缓解

| 威胁 | 缓解 |
| --- | --- |
| 任意 App 调起 bench-auth:// | 首次需用户在选择器中确认；记录 ExternalApp/Binding。 |
| return URL 劫持 | scheme 校验 + 可选 host allowlist。 |
| 密码泄露 | 永不回传密码；仅转交 provider 的原始 callback。 |
| 错误账号被静默登录 | 自动填充默认不提交。 |
| 关闭代理后仍被使用 | 关闭即吊销绑定并移出匹配结果。 |

## 12. 已实现 vs 后续可加固

已实现（可用）：

- `bench-auth://` 解析、return URL 安全校验、Station/账号匹配。
- 账号选择器 UI、账号代理开关（含关闭吊销）、外部应用管理面板。
- per-account 隔离 WebView + 持久化登录态 + 自动填充（不自动提交）。
- **callback 转交**：登录完成后把外部 App 原始回调 `openExternal` 转交。
- ExternalApp / Binding 用量记录。

后续可加固（非本次范围）：

- 一次性 grant code + 本地 loopback 兑换通道（面向愿意集成的协作式 App）。
- 速率限制、重放检测、SQLite 事务化存储、审计落库。
- 端到端自动化验证。

## 13. 上线门槛

- 回调中不包含任何原始凭证（仅转交 provider 自带 callback）。
- 账号关闭代理后，绑定立即失效且不再被匹配。
- 所有 UI 文案走 i18n。
- 审计日志不含敏感凭证或完整 callback URL。
- 自动填充默认不自动提交。
