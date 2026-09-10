# 会话捕获保真度调研 — 宿主为何丢失域级 cookie 与「全量捕获」方案

> **定位**：解释层（Explanation）。回答两个问题：① 宿主捕获层为什么会丢域级 cookie（trae.cn CheckLogin 误判的根因）；② 「宿主要拿到和浏览器登录一样的全量信息」的口径定义、现状缺口与解决方案矩阵。
> **前置阅读**：[login-state-detection-research.md](login-state-detection-research.md) §4.1（误判根因链勘误）· [login-rulepack-spec.md](../reference/login-rulepack-spec.md)（规则包契约）
> **关联实现**：`src-tauri/src/account_manager/session.rs`（`cookies_for_target`，P0 已实现待提交）
> **版本**：v1 ｜ **日期**：2026-09-10 ｜ **状态**：待评审（规划-确认-执行）

---

## 1. 结论（TL;DR）

1. **为什么丢**：捕获链走的是 Tauri/wry 的 `cookies_for_url()`，而 wry 的 **macOS 后端（WKWebView）实现是 `cookie.domain() == url.domain()` 的精确字符串匹配**（`wry-0.55.1/src/wkwebview/mod.rs:1184`），不是 RFC 6265 的 domain-match。WKWebView 里域级 cookie 的 domain 属性带前导点（`".trae.cn"`），与 `url.domain()`（`"www.trae.cn"`）永不相等 → **全部域级 cookie 被过滤**。Windows 后端走 `ICoreWebView2CookieManager.GetCookies(uri)`（Chromium 引擎级匹配），**行为正确**——这是一个**跨平台行为不一致**的 macOS 特有缺陷。
2. **为什么长期没暴露**：恰好 domain 等于 `www.trae.cn`（无前导点）的 4 个 analytics cookie 被正确捕获，制造了「捕获正常」的假象；且账号的**磁盘 WebView 数据目录本身就是全量持久的**，账号在应用里「看起来一切正常」——丢的只是加密 canonical session（探针/导出/恢复用的可移植副本）。
3. **方案**：cookie 域级丢失的 P0 修复（全量 `cookies()` + RFC 6265 domain-match 自行过滤）**已实现**；剩余缺口按 P1→P3 递进：host-only 语义修复 → 多 origin 存储捕获 → keep-alive 元数据（衔接登录规则包 v2）。**不建议**默认捕获第三方域 cookie（噪音/体积/隐私），建议「站域树全量 + 显式白名单」。

---

## 2. 为什么会丢域级 cookie（机制链）

### 2.1 双层会话模型（先分清丢的是什么）

| 层          | 载体                                                                        | 完整性                                                                   | 用途                                                      |
| ----------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| L-磁盘      | 每账号独立 `WKWebsiteDataStore`（`data_store_identifier` / data dir）       | **全量**（浏览器级，含 HttpOnly/域级 cookie/多 origin 存储），跨启动持久 | 账号日常使用；这也是「账号看起来正常」的原因              |
| L-canonical | 加密 `AccountSession`（`snapshot.sessions`，导出即 bench-account-snapshot） | **子集**，本次缺陷所在                                                   | loginCheck 探针凭证源、指纹比对、快照导出、跨窗口恢复注入 |

捕获层缺陷只影响 L-canonical；L-磁盘无恙。但探针（S1 loginCheck）用的是 L-canonical → 凭证缺失 → 探针退化为匿名请求。

### 2.2 丢失点的源码级定位

调用链：

```
session.rs extract_cookies(target_url)
  → tauri 2.11.5 WebviewWindow::cookies_for_url(url)        (webview/mod.rs:2144)
    → wry 0.55.1 wkwebview cookies_for_url                   (wkwebview/mod.rs:1177)
      → filter: cookie.domain() == url.domain()              (wkwebview/mod.rs:1184)  ← 丢失点
                && (secure/scheme 规则)
```

wry 的过滤条件是**精确字符串相等**，等价于只认 host-only cookie。而 RFC 6265 §5.1.4 规定浏览器发送 cookie 前做 domain-match：`host == domain（去点） || host.ends_with(".{domain}")`。WKWebView 遵循 CFNetwork 约定：**带 `Domain=` 属性的 cookie，`NSHTTPCookie.domain` 存储为带前导点形态**（`.trae.cn`）——wry 的精确匹配把它们一网打尽地滤掉。

### 2.3 平台对照（跨平台行为不一致实证）

| 后端                   | 实现                                                                                           | 域级 cookie  | 结论     |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------ | -------- |
| macOS/iOS（WKWebView） | wry 手写过滤，`cookie.domain() == url.domain()`                                                | **全部丢失** | 缺陷所在 |
| Windows（WebView2）    | `ICoreWebView2CookieManager.GetCookies(uri)`（Chromium 引擎匹配，`webview2/mod.rs:1618-1668`） | 正常返回     | 行为正确 |

同一份 Bench 代码，macOS 用户会遭遇「已登录被判未登录」，Windows 用户不会——这正是 `check:be-cfg`/双平台 CI 之外另一种「本机验证不了另一平台」的形态：**不是编译失败，而是运行时语义分歧**。

### 2.4 为什么三个迹象长期互相掩护

1. 捕获结果非空（4 个 host 级 analytics cookie），没有「空 cookie」类告警；
2. 指纹特征采样走的同一缺陷链路（`fingerprint.rs` 两处 `cookies_for_url`），指纹里也只有 analytics 特征 → 特征「存在」→ L0b 不短路；
3. 磁盘层全量 → 用户在应用内的实际体验正常，只有探针/导出链路异常。

三层叠加，缺陷直到用真实凭证打 CheckLogin 实测才暴露。

---

## 3. 「和浏览器登录一样」的口径定义

用户要求：**宿主捕获的 canonical session 要达到浏览器级保真度**。按浏览器会话状态拆解：

| #   | 组成                                                         | 浏览器语义            | 当前宿主                          | 缺口                                                         |
| --- | ------------------------------------------------------------ | --------------------- | --------------------------------- | ------------------------------------------------------------ |
| C1  | Cookie 全集（含域级、HttpOnly、host-only 标志、partitioned） | RFC 6265 domain-match | P0 修复后：站域树内全量 ✅        | host-only 标志不可靠（§4-C1）；第三方域默认不收（口径决策）  |
| C2  | localStorage / sessionStorage（per origin）                  | 所有访问过的 origin   | **仅当前页 origin**               | 登录流经多 origin（SSO/passport/app 子域）时其余 origin 丢失 |
| C3  | IndexedDB（per origin）                                      | 同上                  | 已实现（fail-closed，可要求完整） | 同 C2 的单 origin 限制                                       |
| C4  | UA                                                           | navigator.userAgent   | 已实现 ✅                         | —                                                            |
| C5  | 缓存/Service Worker                                          | 浏览器级              | 不在捕获范围                      | 判定/恢复场景通常不需要，**建议明确排除**并写入设计文档      |

**建议采用的口径**（后文方案矩阵按此展开）：

- **Cookie**：目标站点可注册域树内**全量**（含域级 + host-only），第三方域默认排除、支持站点级白名单扩展；
- **存储**：登录窗口内**实际访问过的同 registrableDomain 的 origin** 全部捕获（C2/C3 合并处理）；
- **明确排除**：HTTP 缓存、Service Worker（恢复场景收益低、体积大）。

---

## 4. 现状盘点与方案矩阵

### C1 — Cookie：域级丢失（P0 已修）+ host-only 标志失真（P1 待修）

**P0（已实现，工作区未提交）**：`session.rs cookies_for_target()` —— 全量 `cookies()`（tauri 2.11.5 全后端可用；Windows 注意同步 handler 死锁，仅异步链路调用）+ `cookie_domain_matches_target` RFC 6265 过滤。`extract_cookies` 与 `fingerprint.rs` 两处采样统一切换。已验证：502/502 后端测试、clippy、cfg 卫生门禁。

**P1（建议下一步）：host-only 标志修复。** 现状 `host_only = c.domain().is_none()` 在 wry 下**恒为 false**（wry 恒传 `Some(domain)`，macOS 与 Windows 均如此——已核对 `cookie_from_wkwebview` / `cookie_from_win32`）。后果：

- 探针 `cookie_header_for_url` 对 host-only cookie 也做子域匹配 → host-only cookie 被发给兄弟子域（同站内，风险低但语义不纯）；
- 恢复注入 `inject_session` 一律带 `Domain=` 属性 → host-only cookie 被还原成域级 cookie，`Domain=www.trae.cn` 会注入出「子域也带」的超集状态。

**方案**：WKWebView/WebView2 双后端均遵循「域级 cookie 的 domain 带前导点」约定（CFNetwork / Chromium 一致），故 `host_only = !domain.starts_with('.')` 可跨平台推导。**风险**：该约定是经验性的，需一次注入-回读实验验证（见 §6 验证方案）；若个别内核去点存储，推导会把域级 cookie 误标为 host-only，导致探针**少发**凭证（比多发危险）。**缓解**：推导仅在 domain 无前导点**且 host 与 domain 相等**时判 host-only；domain 为可注册域本身（如 `trae.cn`）时保守按域级处理。

**P2（口径决策，默认不做）：第三方域 cookie。** 全 store 捕获可达到绝对浏览器等价，代价是快照混入广告/CDN 域 cookie（体积↑、隐私面↑、指纹与导出噪音↑）。**建议**：默认站域树；`station.captureCookieDomains: string[]` 白名单覆盖 SSO/关联域场景（schema 追加属宿主 schema 变更，需走规格流程）。

### C2/C3 — 存储：单 origin → 登录窗口实际访问的 origin 集（P2）

现状 `capture_current_origin` 只抓**当前页 URL 的 origin**（且要求与 target 同 origin）。登录若经 `passport.x.cn` → `www.x.cn` → `app.x.cn` 跳转，canonical session 只有最后停留 origin 的存储。

**候选方案**：

| 方案                 | 做法                                                                                                                 | 代价                                               | 风险                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| S-a 导航记录法       | 登录/捕获窗口 `on_page_load` 收集本次会话访问过的 origin（限同 registrableDomain），捕获时对每个 origin 注入采集脚本 | 中：需把「窗口生命周期内的 origin 集」传给捕获函数 | 低；脚本可复用现有 `capture_script`                              |
| S-b 逐 origin 导航法 | 捕获时开隐藏窗口逐个导航到候选 origin（`https://www.`, `https://app.`, `https://passport.`…）执行采集                | 高：每 origin 一次页面加载（SPA 慢），15s 预算×N   | 中；可能触发站点风控                                             |
| S-c 磁盘直读法       | 直接读 `~/Library/WebKit/.../LocalStorage` SQLite                                                                    | 低网络成本                                         | **高**：跨版本格式不稳、绕过引擎语义、Windows 无对应路径，不建议 |

**建议 S-a**：采集脚本与超时/体积护栏全部复用现有实现，只是 origin 集合从 1 扩到 N；`merge_origin` 已支持多 origin 合并与排序，持久化 schema 无需变更。

### C4 — UA：已达标，无动作。

### C5 — 保活衔接（P3，呼应登录规则包 v2）

全量捕获的价值闭环是 keep-alive：`tokenHints`（凭证位置/JWT exp/刷新端点）+ `keepAlive`（频率下限/jitter/riskLevel）已在本仓库规则包 skill（command-market `skills/login-rule-authoring/SKILL.md` §5）草案化。宿主侧需对应扩展规则包 schema v2 + 保活调度器，**在宿主支持前规则侧不下发**。

---

## 5. 建议实施顺序

| 优先级                   | 事项                                                                                                        | 改动面                                             | 依赖                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------ |
| **P0**（已完成，待提交） | `cookies_for_target` 全量 + RFC 6265 domain-match；session/fingerprint 三处切换                             | session.rs / fingerprint.rs                        | 无                             |
| **P1**                   | host-only 推导（前导点 + host 相等双条件）+ 探针/恢复消费 host_only                                         | session.rs / probe.rs 复用既有 `host_only` 分支    | 注入-回读实验（§6）            |
| **P2**                   | 多 origin 存储捕获（S-a 导航记录法）                                                                        | browser_storage.rs / session.rs / 会话窗口生命周期 | 无硬依赖                       |
| **P3**                   | 站点级第三方 cookie 白名单（`station.captureCookieDomains`）+ 规则包 v2（tokenHints/keepAlive）+ 保活调度器 | 宿主 schema + 规则包 spec v2                       | 规格流程（先改 spec 再改两端） |

每步验证口径不变：**登出 / 登录 / 残留** 三分类全对 + 双平台 CI 绿 + `check:be-cfg` 绿。

---

## 6. 验证方案（P1 前置实验）

**注入-回读实验**（一次性，可用 debug 构建 + trae.cn 测试账号）：

1. 向测试 WebView 注入四个构造 cookie：`Domain=.x.cn`、`Domain=www.x.cn`、无 Domain（host-only@www.x.cn）、`Domain=x.cn`；
2. `cookies()` 回读，记录每个 cookie 的 `domain()` 字符串形态与 `is_none()` 结果；
3. 确认「域级⇄前导点」在 macOS/Windows 双端成立后，再落 P1 代码。

**回归口径**：trae.cn 0627/7242 Refresh → Ready 且快照 cookies 包含 `sessionid`/`sid_guard`/`ttwid`；未登录账号 e72016f3 保持 LoginRequired；快照导出体积与域数量在预期内。

---

## 7. 风险与边界

| 风险                                           | 等级  | 对策                                                                                      |
| ---------------------------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| host-only 前导点约定失效（内核行为变化）       | 🟡 中 | P1 双条件推导 + 注入-回读实验 + 失败时回退「恒按域级」（P0 行为）                         |
| 多 origin 捕获拉长登录/刷新耗时                | 🟢 低 | S-a 仅对「实际访问过的 origin」采集，护栏沿用现有超时/体积上限                            |
| 第三方 cookie 引入噪音/隐私面                  | 🟢 低 | 默认排除，白名单显式开启（P3）                                                            |
| Windows 同步 handler 死锁（WebView2 已知问题） | 🟡 中 | `cookies()` 仅在异步链路调用（已在实现 doc 注明）；CI 双平台回归                          |
| 探针频率触发站点风控                           | 🟡 中 | 判定探针维持现状频率；保活走 P3 的 riskLevel 分级 + 全局预算，规则侧不下发                |
| 行为分歧只有真机可验证（macOS 捕获语义）       | 🟡 中 | §6 实验脚本化，纳入发布前 checklist；Windows 差异由 CI 双平台运行时对拍兜底（如后续引入） |
