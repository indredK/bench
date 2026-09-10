# 登录态识别方案调研 — 以 trae.cn 三账号案例验证置信度

> 状态：调研结论已验证（2026-09-10，基于本机 Bench 真实数据实测）
> 关联：`roadmap/planned/account-manager.md` F2（登录指纹）、`modules/account-manager/design.md` §3、D3 决策（移除登录佐证）
> 触发问题：站点 `www.trae.cn` 三个已存账号中，第 1 个（`acct-e72016f3`）实际已登出，Bench 判定为 `ready`（误判）；`7242` / `0627` 实际已登录，判定正确。

---

## 1. 结论（TL;DR）

1. **误判根因已实锤，是双重叠加**：
   - **特征无判别力**：trae.cn 站点指纹的 7 项特征中 6 项是字节 analytics/设备特征（`__tea_cache_tokens_*`、`gfkadpd`、`s_v_web_id`、`__tea_session_id_*`），**匿名访问即全部存在且长度与登录态完全一致**；
   - **L0b 违反设计红线**：`probe.rs` L0b 对「任一特征存在」直接返回 `Ready`，把设计文档明确要求的弱肯定（「指纹存在 → 仍需原探针验证」）当成了定论。账号 1 的 WebView 存储残留了 7 月登录期的 `Cloud-IDE-Token`，特征命中 → 误判 Ready。
2. **唯一能 3/3 全对的方案是服务端权威探针**（S1）：用账号 cookie 调站点自己的鉴权接口，从响应判定登录态。trae.cn 已实测存在现成接口：`GET https://api.trae.cn/cloudide/api/v3/trae/CheckLogin` → `Result.IsLogin: false/true`（结构化布尔，匿名即返回，凭证走 `.trae.cn` 域 cookie，跨子域自动携带）。
3. **建议的判定分层**（详见 §6）：S1 服务端探针为「肯定/否定」主判据 → 指纹仅保留「全缺失 → 确定性未登录」的否定短路 → 指纹存在只作为线索，**不再直接判 Ready** → 文本分类仅作最后兜底。

---

## 2. 实测取证（2026-09-10，本机真实数据）

### 2.1 Bench 存储的 ground truth（`account-manager-store.json`）

| 账号                                | 实际状态（用户确认） | Bench 状态 | lastLoginAt      | 备注                       |
| ----------------------------------- | -------------------- | ---------- | ---------------- | -------------------------- |
| `acct-e72016f3`（www.trae.cn 账号） | **已登出**           | `ready` ❌ | 2026-07-01       | WebView 存储残留登录期数据 |
| `acct-abe4dd8a`（7242）             | 已登录               | `ready` ✅ | 2026-09-10 08:55 |                            |
| `acct-9d07f4ce`（0627）             | 已登录               | `ready` ✅ | 2026-09-10 08:59 | 指纹采样来源账号           |

站点指纹（`stn-5cdca9f9`，2026-09-10 08:53 采自 0627）：

| 特征                                     | 通道    | 采样值长度 | 匿名访问实测      | 判别力                                                                  |
| ---------------------------------------- | ------- | ---------- | ----------------- | ----------------------------------------------------------------------- |
| cookie `__tea_cache_tokens_711126`       | cookie  | 109        | 存在，len=109     | **无**（analytics 缓存）                                                |
| cookie `gfkadpd`                         | cookie  | 12         | 存在，len=12      | **无**（首页内联脚本对每个访客写入 `"711126,40124"`，实测脚本源码确认） |
| cookie `s_v_web_id`                      | cookie  | 52         | 未出现（设备 ID） | **无**（与登录无关）                                                    |
| localStorage `__tea_cache_tokens_2018`   | storage | 149        | 同族键存在        | 无                                                                      |
| localStorage `__tea_cache_tokens_711126` | storage | 85         | 存在，len=85      | **无**                                                                  |
| sessionStorage `__tea_session_id_711126` | storage | 78         | 存在，len=78      | **无**                                                                  |
| localStorage `Cloud-IDE-Token`           | storage | 996        | **不存在**        | **有**（但登出后不清除 → 弱肯定）                                       |

authProfile：`tokenStorage=multiple, authType=bearerOAuth, probeStrategy=hybrid, confidence=0.85`。

### 2.2 匿名基线（Playwright 无痕 Chromium 实测 www.trae.cn）

- 首页 `GET /`：**200，无 Set-Cookie，无重定向** → HTTP 探针对 SPA shell 无区分度；
- 匿名加载完成后：3 个 cookie（`gfkadpd`/`ttwid`/`__tea_cache_tokens_711126`）+ 7 个 localStorage 键 + 2 个 sessionStorage 键 —— **与指纹采样特征同名同长度**；
- 发现服务端鉴权接口：`api.trae.cn/cloudide/api/v3/trae/CheckLogin` 匿名返回 `200 + {"Result":{"IsLogin":false,...}}`，请求仅携带 `.trae.cn` 域 cookie（`ttwid` 等）。

### 2.3 WebView 存储残留（`~/Library/WebKit/bench/WebsiteDataStore/`，26 个 store 全扫描）

| store       | LocalStorage 含 `Cloud-IDE-Token` | 含 `__tea_cache_tokens_711126` | 对应                                     |
| ----------- | --------------------------------- | ------------------------------ | ---------------------------------------- |
| `1237244c…` | ✅                                | ✅                             | 登录账号                                 |
| `a1b6cbb9…` | ✅                                | ✅                             | 登录账号                                 |
| `feaf99da…` | ✅                                | ✅                             | **账号 1（7 月登录残留，服务端已登出）** |
| `2c3eb2c6…` | ❌                                | ✅                             | 纯匿名访问的 store                       |

### 2.4 误判根因链（代码路径回放）

```
refresh(acct-e72016f3)
→ L0a: 指纹含 storage 键 → 保守不短路（all_features_missing_from_session 直接 false）
→ HTTP probe(Hybrid): GET https://www.trae.cn/ + 账号 cookie → 200 SPA shell
   → 401/403 无；classify_confident 文本无确定结果 → 无判据
→ WebView L0b: wait_for_any_feature_present(6×500ms)
   → 账号 1 的 store 残留 Cloud-IDE-Token（且 analytics 键匿名即有）→ present=true
   → probe.rs:484-488: present → 直接返回 Ready  ← ★ 违反 design.md §3「弱肯定不定论」
→ status=ready, statusReason=null
```

`probe.rs` 注释里的「7242 案例」（canonical session 为空但 WebView data dir 有残留）正是同一机制的另一面：**只要 WebView/会话里特征「存在」，L0b 就判 Ready，而特征根本不区分「服务端是否认可」**。

---

## 3. 业界方案调研

### 3.1 标准与协议（大厂如何做）

| 来源                                                   | 方案                                      | 要点                                                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenID Connect Session Management 1.0**（OIDF 标准） | `check_session_iframe` + postMessage 轮询 | RP 内嵌 OP 隐藏 iframe，`postMessage(client_id + session_state)` 轮询，`changed` → 触发 `prompt=none` 重认证                              |
| **OIDC prompt=none**（Core §3.1.2.1）                  | 静默认证                                  | 带 OP 会话 cookie 重放认证请求；已登出 → `error=login_required`；这是 SSO 会话检测的标准答案（Auth0/Okta/Keycloak/Connect2id 均按此实现） |
| **RFC 7662 OAuth Token Introspection**                 | 令牌内省                                  | 向授权服务器查询 `active: true/false` + 元数据；面向 RS 设计，客户端等价物是 userinfo/受保护端点的 401 语义                               |
| **GitHub（实测）**                                     | 服务端权威端点                            | `GET api.github.com/user` 匿名 → **401**；`github.com/settings/profile` → **302 → /login**。「问服务器」是唯一真相                        |

### 3.2 开源项目（GitHub）

| 项目                                            | 判定方式                                                           | 借鉴点                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `K0rz3n/session-maintainer`（安全测试会话维护） | 每站点配置 `session_check_url`，用保存的会话发 HTTP 请求校验       | **「每站点配置一个检查 URL」**是开源实践的核心模式                         |
| `vesper-astrena/sessionkeeper`                  | `check_url` + `success_indicator` / `failure_indicator` CSS 选择器 | 成功/失败**指示器**模式；登录态判定本质 = 访问受保护页后看指示器           |
| Playwright 官方 auth 指南                       | `if "login" not in page.url`                                       | 重定向到登录页 = 未登录，最普遍的朴素实践                                  |
| AdsPower / BitBrowser（多开指纹浏览器）         | **不做自动判定**：环境隔离 + cookie 导入/备份 + 人工确认           | 行业空白点——多账号工具的登录态自动检测没有成熟方案，Bench 有机会做出差异化 |

### 3.3 反面教材（本次已删除的逻辑属于此类）

- 页面文本匹配（登录/退出字样）、DOM 元素存在性（登出按钮）——SPA 同构 shell 下无区分度（trae.cn 登录/登出 HTML 完全一致）；
- Cookie/Storage 存在性启发——匿名即有（§2.1 实测）；
- 缓存/时序侧信道（favicon timing）——现代浏览器分区隔离后已不可靠，且属追踪技术。

---

## 4. 方案对比与 trae.cn 案例置信度验证

判定口径：对「账号 1 = 登出 / 7242 = 登录 / 0627 = 登录」的三分类能否全对。

| #      | 方案                                                                                            | trae.cn 账号1（登出）                                             | 7242 / 0627（登录） | 3/3 全对        | 置信度                | 成本/风险                                                       |
| ------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------- | --------------- | --------------------- | --------------------------------------------------------------- |
| **S1** | **服务端权威 API 探针**（站点配置 check URL，带账号 cookie/token 请求，解析 401/302/JSON 布尔） | ✅ `IsLogin:false`（401/布尔均可行）                              | ✅ `IsLogin:true`   | ✅ **唯一全对** | ★★★★★                 | 需按站点配置端点+判定规则；通用站点可退化为「受保护页 302/401」 |
| S2     | HTTP 首页/保护页状态码探针（bench 已有）                                                        | ❌ 首页 200 无重定向                                              | ✅（碰巧）          | ❌              | ★★★☆                  | 仅对传统服务端渲染站点有效（GitHub 302 ✅，trae SPA ❌）        |
| S3     | OIDC silent auth（prompt=none）/ check_session iframe                                           | —（trae 非 OIDC，N/A）                                            | —                   | —               | ★★★★★（限 OIDC 站点） | 实现重（iframe 域/credential 跨域）；作为 S1 的 OIDC 特化变体   |
| S4     | 指纹 L0 短路（bench 现行）                                                                      | ❌ L0b present→Ready（实测误判）；否定方向可用但被 storage 键阻断 | ✅                  | ❌              | 否定 ★★★ / 肯定 ★     | 否定短路需「纯 cookie 指纹」才可靠；肯定方向不得定论            |
| S5     | Cookie/Storage 存在性启发                                                                       | ❌ 匿名即有                                                       | ✅（碰巧）          | ❌              | ★                     | 「低级逻辑」，已从产品中移除                                    |
| S6     | 页面文本/DOM 启发（登出按钮/退出字样）                                                          | ❌ SPA shell 同构                                                 | ✅（碰巧）          | ❌              | ★                     | 已删除登录佐证的原因                                            |
| S7     | 本地 token exp 解析（JWT）                                                                      | ❌ Cloud-IDE-Token 非透明 JWT，且吊销不可知                       | ✅                  | ❌              | ★★                    | 零网络成本，仅作辅助线索                                        |
| S8     | 环境隔离 + 人工标记（AdsPower 模式）                                                            | ✅（人工）                                                        | ✅（人工）          | ✅（人工）      | —                     | 无自动判定能力，用户体验差                                      |

**核心判断**：

1. **任何「客户端残留」证据（cookie/storage/指纹）都只能提供「否定」方向的确定性**（全缺失 → 一定未登录）；「肯定」方向必须由服务端裁决。trae.cn 案例中账号 1 的误判 = 把残留当肯定。
2. **S1 是唯一同时具备否定与肯定确定性的方案**，且大厂（GitHub 401/302）、标准（OIDC prompt=none ≈ S1 的协议化封装）、开源工具（session_check_url / success_indicator）殊途同归。
3. 指纹的真实价值在两点：① 否定短路省探针预算；② 供用户在确认弹窗中**理解判定依据**（配合本次新增的特征明细二级弹窗）。

---

## 5. 指纹质量改进：匿名基线差集（建议）

trae.cn 指纹 7 特征中 6 项无效的根源：采样时只看「登录页有什么」，没看「匿名页也有什么」。改进：

- **采样时并行开一个干净（无 cookie）WebView 访问站点首页，采集匿名基线特征**；
- 指纹入库前剔除「与基线同名且值长度同量级」的特征（`value_shape_matches` 复用）；
- trae.cn 实测验证：差集后仅剩 `Cloud-IDE-Token` —— 指纹从 7 项垃圾变 1 项金子；
- 成本：每次采样多一个隐藏窗口 + 一次首页加载（与现有 detect/capture 窗口预算一致）。

## 6. 判定链改进建议（按优先级）

1. **P0 — 修复 L0b 弱肯定越权**（一行语义改动）：`wait_for_any_feature_present` 命中后**不再直接返回 Ready**，改为「无否定证据」继续走原有文本/探针链；只有「全缺失 → LoginRequired(fingerprintMissing)」保留短路。此改动单独即可修复账号 1 误判的一半（误判 Ready → 走文本分类）。
2. **P1 — 站点级登录检查探针（S1）**：`RelayStation` 增加 `loginCheck: Option<{ url, method, expect: Status(401/302) | JsonBool(path) | BodyContains }>`；`capture_login_fingerprint` 时尝试自动发现（探测 `/api/user`、`/api/me` 等常见路径，或从 authProfile 的 XHR 观测中提取）；HTTP 探针阶段优先打它。trae.cn 手动配置 `https://api.trae.cn/cloudide/api/v3/trae/CheckLogin` + `Result.IsLogin` 即达 3/3。
3. **P2 — 匿名基线差集采样**（§5）：提升指纹否定短路的实际命中率。
4. **P3 — authProfile 置信度里的登出元素加分项**（detection.rs `logoutElements` +0.1）：与已删除的「登录佐证」同族启发式，建议一并移除（会使 DetailColumn 展示的置信度数值变化，需产品确认）。

## 7. 「识别登录状态」弹窗特征明细（本次已实现）

- 确认弹窗中「Cookie 特征」「存储键特征」计数可点击 → 二级弹窗查看明细；
- **数据边界**：值（cookie value / storage value）永不出后端，明细仅含 键名/域名/path/httpOnly/值长度；
- 新增命令 `get_login_fingerprint_detail(station_id)`，从 Rust 侧加密 store 的 `snapshot.fingerprints` 读取，不新增持久化 schema。
