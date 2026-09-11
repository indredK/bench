# WorkBuddy / Trae 登录态与浏览器互通调研

- 调研日期：2026-09-11
- 目标：解释普通网站可以通过扩展同步，而 `www.workbuddy.cn`、`www.trae.cn` 经常无法同步的原因，并为后续实现提供排查路径。
- 范围：公开页面和前端 JavaScript 静态分析、本机 Chrome Cookie 数据库字段观察、Bench 当前会话桥接代码阅读。没有破解服务端签名，也没有绕过验证码或风控。

## 结论先行

这两个站点没有使用一种“扩展无法处理”的单一神秘标准，问题是多个条件叠加：

1. Bench 内置 WebView 和默认 Chrome 是两个完全独立的浏览器配置文件。WebView 中看到登录，只说明 WebView 的 Cookie、Storage、设备标识有效；扩展默认只能读取 Chrome 当前配置文件。
2. Trae 的页面域和 API 域分离：页面会把 `www.trae.cn` 重定向到 `trae.cn`，请求发往 `api.trae.cn`。Cookie、localStorage 的 origin/domain 不一致时，单纯按当前页面复制会漏数据或写错位置。
3. WorkBuddy 使用腾讯统一登录/OneID 体系，登录完成后还要经过账号选择、企业域、设备 Token 和风险上下文校验。复制 Cookie 可能只能复制“浏览器凭据”的一部分。
4. 两者都使用 HttpOnly、Secure、SameSite、跨域带凭据请求，以及风控/设备指纹 SDK。扩展可以通过 `chrome.cookies` 读 HttpOnly Cookie，但前提是用户授予正确的 host 权限；页面 JavaScript 本身永远读不到 HttpOnly Cookie。
5. 服务端可以把会话绑定到 UA、设备 Token、风险指纹、IP/区域、登录流程状态或短期 token。此时 Cookie 看起来已经注入，`CheckLogin` 仍可能返回未登录。

因此，普通站点成功通常是“单页面域 + 少量 Cookie + 无设备绑定”；WorkBuddy/Trae 需要按认证域、页面 origin、Storage、设备/风控信号逐项验证。

## Trae 的已确认特征

### 页面与 API 分离

Trae 官网前端配置中存在：

- 页面站点：`https://www.trae.cn`
- API：`https://api.trae.cn`
- 文档：`https://docs.trae.cn`

公开脚本中可见的登录相关调用包括：

- `POST /cloudide/api/v3/trae/CheckLogin`
- `POST /cloudide/api/v3/trae/SSOCheckLogin`
- `POST /cloudide/api/v3/common/GetUserToken`
- `POST /cloudide/api/v3/trae/GetUserInfo`
- `POST /cloudide/api/v3/trae/Login`

脚本使用带 Cookie 的请求（`withCredentials`）。`GetUserToken` 返回的 token 会写入：

```js
localStorage.setItem("Cloud-IDE-Token", token)
```

本机 Chrome Cookie 数据库观察到以下认证相关字段位于 `.trae.cn` 父域，且 `X-Cloudide-Session` 为 HttpOnly + Secure：

- `X-Cloudide-Session`
- `sessionid`、`sessionid_ss`
- `sid_tt`、`sid_guard`
- `passport_auth_status`
- `passport_csrf_token`
- `passport_mfa_token`
- `ttwid` 等

`www.trae.cn` 还存在若干埋点 Cookie。当前页面实测从 `www.trae.cn/#/pages/login-classic/index` 落到了 `trae.cn/#/pages/login-classic/index`。这会造成两个常见误区：

- 只采集 `www.trae.cn` origin 的 Storage，漏掉 apex `trae.cn` 的 Storage；
- 只按页面 host 查询 Cookie，漏掉 API host-only Cookie（如果服务端下发了 `api.trae.cn` 专属 Cookie）。

### 安全 SDK

Trae 页面加载字节侧 rc-client-security glue、CSRF 和 BDMS 相关脚本。静态代码能看到对 `/CheckLogin`、`/GetUserToken`、`/Login` 的安全监控和请求保护配置。它们不等于“禁止扩展”，但说明登录判断依赖服务端 API 和风险上下文，首页返回 200 不能作为已登录判据。

### Trae 的判定方式

必须使用 API 结果判断：

```text
页面是否打开 ≠ 已登录
Cookie 是否存在 ≠ 已登录
必须以 api.trae.cn 的 CheckLogin/GetUserInfo 结果为准
```

## WorkBuddy 的已确认特征

WorkBuddy 登录页前端不是一个简单的站点表单，而是 CodeBuddy/腾讯统一登录壳。公开脚本中可见：

- `GET /console/accounts`
- `POST /console/login/account`
- `POST /console/login/enterprise/:enterpriseId`
- `POST /console/account/switch`
- `GET /console/validate/refresh-token`
- `GET /v2/plugin/auth/token?state=...`
- `GET /console/logout`

请求默认启用 `withCredentials: true`，并按场景附加：

- `X-Domain`：企业域或登录域
- `X-Device-Token`：设备/风险 Token
- `X-Product-Code`、`X-Invite-Code`、`X-From-Promotion`
- SSO 场景中的 state、redirect URI 和 OneID 参数

脚本还引用：

- FingerprintJS
- risk-context
- 腾讯 TDID/Turing 风控设备 Token
- SSO/OneID 多域名（如 `*.sso.codebuddy.cn`、`*.sso.copilot.tencent.com`）
- iframe `postMessage`，并检查消息来源 origin
- `localStorage` 中的 `loggedIn`、当前企业/账号 ID、平台状态
- `sessionStorage` 中的登录流程、state、共享数据

这意味着 WorkBuddy 的“登录成功”是一个流程结果：统一身份认证、账号/企业选择、设备风险校验、会话建立、回跳和本地状态写入都可能参与。仅复制某一组 Cookie 或 localStorage，未必能重建流程。

### WorkBuddy 的实际 OIDC/网关层

对未登录的 `GET https://www.workbuddy.cn/console/accounts` 观察到：

- APISIX 网关先返回 302，跳转到同域 Keycloak：
  `/auth/realms/copilot/protocol/openid-connect/auth`
- 回跳地址含随机 `state`，redirect URI 为 `https://www.workbuddy.cn/console/accounts/.apisix/redirect`。
- 网关会设置名为 `session` 的 HttpOnly、SameSite=Lax、Path=/、约 7 天有效期的不透明签名值。
- Keycloak 登录页还涉及 `KEYCLOAK_SESSION`、`AUTH_SESSION_ID`、`KC_RESTART` 等会话 Cookie；页面脚本每 2 秒检查非 HttpOnly 的 `KEYCLOAK_SESSION` 并触发 restart URL。
- Keycloak 的 OIDC discovery 文档公开支持 authorization code、refresh、device、CIBA 等流程，并支持 PKCE（plain/S256）、前后通道登出和 TLS client certificate bound token。

登录页响应包含 `Content-Security-Policy: frame-ancestors 'self'`、`X-Frame-Options: SAMEORIGIN`、`Cache-Control: no-store` 和 HSTS。这些策略主要防点击劫持和缓存泄露，不能直接解释扩展 Cookie API 失败；真正的难点是 APISIX session、Keycloak session、一次性 state/session_code 和可能的设备绑定必须同时有效。

因此 WorkBuddy 至少存在两层会话：

```text
Keycloak OIDC 会话（认证中心域/Path）
          ↓ code + state + redirect
APISIX /console session（www.workbuddy.cn、HttpOnly）
          ↓
前端账号/企业选择与 X-Domain、X-Device-Token
```

只复制 `document.cookie` 或 localStorage 会漏掉 HttpOnly 会话；只复制 `session` 又可能因 Keycloak 会话、state、设备 Token 或网关签名不匹配而返回 401。

## 为什么普通网站能双向同步

典型普通站点通常满足：

- 所有请求都发往当前页面域；
- 会话只有一个或几个普通 Cookie；
- Cookie 没有强设备绑定；
- 登录信息主要在 Cookie，Storage 只是偏好设置；
- 没有跨域 SSO、企业域、账号切换或短期 token 交换；
- 服务端只验证 Cookie 签名和过期时间。

这种站点的流程近似：

```text
读取当前页面 Cookie
→ 写入另一个浏览器
→ 刷新页面
→ 服务端识别会话
```

WorkBuddy/Trae 的流程更接近：

```text
页面 Cookie
+ API 域 Cookie
+ 页面 origin Storage
+ 短期 token
+ UA/设备/风控信号
+ CSRF/state/回跳上下文
→ 服务端重新评估会话
```

## 对 Bench 的直接启示

### 1. 先区分“来源浏览器”

扩展只能读取默认 Chrome 的 Cookie/Storage。Bench WebView 中的登录态不能被扩展直接读取；必须由 Bench 自己导出会话，再通过扩展注入 Chrome。

反方向同理：扩展保存的是 Chrome 当前 profile 的状态，不能假设它与 Bench WebView 的设备标识相同。

### 2. 以 API 验证，而不是页面 200

对 Trae，诊断应记录：

- 最终页面 URL（`www` 还是 apex）
- `api.trae.cn` 的 `CheckLogin` 响应
- Cookie 名称、domain、hostOnly、secure、httpOnly、sameSite、partitionKey
- `Cloud-IDE-Token` 所在的 Storage origin
- 注入后的 API 请求是否携带 Cookie
- 注入后的 UA 是否与导出会话一致

对 WorkBuddy，至少记录：

- 当前产品/环境（prod、staging、test）
- SSO 域和 `X-Domain`
- `X-Device-Token` 是否存在、是否过期
- `/console/account`、`/console/accounts` 的结果
- 是否发生企业账号选择或 `/console/account/switch`
- 登录回跳的 state、redirect URI 是否仍有效

### 3. 域和 origin 必须分别建模

Cookie 的 Domain 匹配规则和 localStorage 的 origin 隔离规则不同：

- `.trae.cn` Cookie 可发送给多个子域；
- host-only `api.trae.cn` Cookie 只能发送给 API host；
- `https://www.trae.cn` 与 `https://trae.cn` 是不同 localStorage origin；
- `https://api.trae.cn` 又是第三个 origin。

导出结构不能只有“目标网站 Cookie”，应保留每条 Cookie 的原始 domain/hostOnly，并保留每个 Storage 分支的 origin。

### 4. 设备绑定不能靠盲目伪造

如果注入 Cookie 后 API 仍返回 401/未登录，优先判断是否存在：

- UA 绑定；
- 设备 Token/指纹绑定；
- IP、地区、代理或网络环境绑定；
- 短期 token 已过期；
- CSRF token 与服务端 Cookie 不匹配；
- SSO state/回跳上下文已失效；
- 服务端主动撤销旧设备会话。

此时应记录失败原因并提示重新登录或走官方 SSO 流程，不要无限扩大 Cookie 域或复制第三方域凭据。

## 后续排查顺序

1. 在默认 Chrome 中打开目标站点，记录 `tabs.query` 返回的最终 URL。
2. 扩展申请当前 host、一级父域和已知 API host 的最小权限。
3. 分别调用 `chrome.cookies.getAll({url})` 与 `chrome.cookies.getAll({domain})`，输出仅包含名称/domain/属性的诊断摘要，绝不输出 Cookie value。
4. 采集当前页面的 localStorage、sessionStorage、IndexedDB，并标注 origin。
5. 将会话注入后刷新页面。
6. 通过站点自己的登录检查 API 验证，不用首页标题或 HTTP 200 判断。
7. 若失败，比较注入前后的 Network 请求：请求 host、Cookie、Origin、Referer、UA、CSRF/header、响应状态和业务错误码。
8. 只有在确认某个固定认证域后，才为该域增加 allowlist；不要把权限扩大到所有第三方域。
9. WorkBuddy 至少要同时观察 `www.workbuddy.cn` 的 `session` 与 Keycloak 域的 `KEYCLOAK_SESSION`、`AUTH_SESSION_ID`、`KC_RESTART`；若存在跨域 SSO，优先验证官方回跳链路，不要只导入网关 Cookie。
10. WorkBuddy 优先验证官方 SSO/设备登录链路；Trae 优先验证 `api.trae.cn` Cookie + `Cloud-IDE-Token` + apex/www origin。
11. 对 partitioned Cookie、WebAuthn、Passkey、硬件密钥或系统 Keychain 绑定凭据，允许明确标记为“无法通过 Cookie 同步完成”，改用官方登录回跳或用户重新授权。

## 参考来源

- [Trae 官网](https://www.trae.cn/)
- [Trae 文档](https://docs.trae.cn/)
- [WorkBuddy 官网](https://www.workbuddy.cn/)
- [WorkBuddy 登录页](https://www.workbuddy.cn/login/)
- [Chrome cookies API](https://developer.chrome.com/docs/extensions/reference/api/cookies)
- [Chrome host permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [MDN Cookie Domain/HttpOnly/SameSite](https://developer.mozilla.org/docs/Web/HTTP/Headers/Set-Cookie)
- [MDN Web Storage origin isolation](https://developer.mozilla.org/docs/Web/API/Web_Storage_API)
- [MDN CORS credentials](https://developer.mozilla.org/docs/Web/HTTP/CORS)

## 给后来者的一句话

不要把问题抽象成“Cookie 能不能复制”。先画出完整认证图：页面域、API 域、Cookie domain、Storage origin、SSO 回跳、设备 Token、风控校验和最终 CheckLogin 结果。普通站点只跨过第一层；WorkBuddy 和 Trae 的失败通常发生在后面几层。
