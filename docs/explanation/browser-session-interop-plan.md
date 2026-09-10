# 账号 ↔ 浏览器双向互通（Session Interop）实现逻辑与整体计划

> 状态：**I0 / I1 / I2 已实现（2026-09-10），待双平台真机验收；I3 及以后未实现**。
> 本文是「账号与浏览器双向互通」构想的唯一总体方案文档；**落地后的产品语义以 [product-specs/account-manager.md §17](../reference/product-specs/account-manager.md) 与 [DECISIONS D-028](./decisions.md#d-028--账号会话互通采用cdp--新鲜度仲裁浏览器作为第二端点) 为准**，本文保留原始论证与后续里程碑设计。
> 方向一（Bench → 浏览器）的详细方案见 [browser-session-injection-research.md](./browser-session-injection-research.md)（F5），本文不重复其论证，只做统一收口与方向二设计。
> 待验收清单见 `../roadmap/planned/account-manager.md`「待验证（互通 I1/I2 …）」一节；实施完成度回写 `../modules/account-manager/design.md` 与 `../reference/product-specs/account-manager.md`。
> 关联：`../modules/account-manager/design.md`（§3 Session 生命周期 / §5 加密与存储 / §6 外部登录代理 / §7 前端边界）、`../reference/architecture.md` §2（禁止模式）、`../reference/extension-spec.md` 与 `../modules/extension-center/roadmap.md`（bench-companion 扩展与 Native Messaging）、`src-tauri/src/browser_ext/`。

### 实施进度（2026-09-10）

| 里程碑 | 内容                                                | 状态                                                                             |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| I0     | `SessionOrigin` 维度 + 新鲜度仲裁纯函数             | ✅ 已实现（`session_arbitration.rs`，9 单测）                                    |
| I1     | 出向注入：CDP 客户端 + 浏览器实例 / profile 隔离    | ✅ 已实现（`browser_session/{browser,cdp,profile}.rs` + `browser_session_open`） |
| I2     | 入向回采：CDP 采集 + 仲裁 + 写 S1 + 探针复验        | ✅ 已实现（`browser_session::capture`，复用 WebView 捕获脚本与上限）             |
| I3     | 从用户日常浏览器回采（bench-companion 扩展 + 桥接） | ⬜ 未实现；`SessionOrigin::BrowserExtension` 已占位，当前无写入路径              |
| I4–I6  | 见下方里程碑章节                                    | ⬜ 未实现                                                                        |

---

## 1. 结论先行

**构想拆解**：

- **方向一（出向）**：Bench 中保存的账号会话 → 注入系统浏览器 → 浏览器直接以该账号身份访问站点。
- **方向二（入向）**：用户在浏览器中完成的登录 → 回采进 Bench → 加密保存为账号会话。

**核心判断（先给结论）**：

| #   | 判断                                                                                                                                  | 依据                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | 两个方向**不是两个功能，而是同一个数据模型的两种端点**。落地前应先做一次地基重构（I0），否则会写出两套互不兼容的注入/捕获逻辑         | canonical session 已是唯一真理源；新增的只是「端点」而非「数据体系」（F5 判断 5 的推广）             |
| 2   | **方向二的价值高于方向一**。它是 2FA / 扫码 / SSO / 设备绑定类站点当前**唯一可行**的登录通路，直接解决现有 WebView 登录的适配性天花板 | 现有 `capture_session_from_window` 只能采 Bench 自身 WebView；风控站点在 WebView 内无法完成登录      |
| 3   | 方向二推荐 **CDP 回采 Bench 托管 profile** 先行（I2），**不触碰用户日常浏览器**                                                       | 与方向一共用同一 CDP 客户端；profile 按账号隔离，天然确定「这份会话属于哪个账号」；零扩展权限变更    |
| 4   | **「读日常浏览器」比「写日常浏览器」安全得多，因此应当排在前面**（I3 提前于 I5）                                                      | 写日常浏览器必然顶掉用户同站登录态（F5 判断 2）；读日常浏览器只读不改、无互踩，仅需 `cookies` 读权限 |
| 5   | 直写浏览器 Cookies DB、明文 cookies.txt 导出继续排除                                                                                  | 违反「不改浏览器内部数据」（`browser_ext/mod.rs` 模块注释）与 design.md §5 导出加密红线              |
| 6   | 互通引入**第三个浏览态存放点**，一致性规则是本方案最大的技术风险，必须在 I0 定义清楚                                                  | 现有 S1（加密 store）/ S2（WebView data dir）已需同步，新增 S3（浏览器 profile）会放大不一致面       |

**一句话方案**：把「浏览器」提升为与「Bench 内部 WebView」并列的**第二个 Session 端点**——出向经 CDP/扩展把 canonical session 注入目标浏览上下文，入向经 CDP/扩展把目标浏览上下文的登录态回采为 canonical session；两个方向共用同一份注入载荷表示与同一套端点抽象，canonical session 的唯一真理源地位不变。

---

## 2. 现状盘点：可复用资产与真实缺口

### 2.1 已有资产（直接可复用）

| 资产                                                | 位置                                                     | 与互通的关系                                                            |
| --------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| canonical session（`snapshot.sessions`，schema v5） | `account_manager/state.rs` / `storage.rs`                | 唯一真理源；双向互通的读写中枢                                          |
| `restore_session()` / `encrypt_session()`           | `account_manager/session.rs:255` / `:244`                | 注入前内存解密、回采后加密落盘，AES-256-GCM + Keychain 主密钥           |
| `inject_session()`（注入 WebView）                  | `account_manager/session.rs:273`                         | **出向注入先例**：逐条还原 domain/path/secure/httpOnly/sameSite/expires |
| `capture_session_from_window()`（从 WebView 捕获）  | `account_manager/session.rs:141`                         | **入向捕获先例**，但签名绑定 `WebviewWindow<R>`——浏览器端点需并列实现   |
| `browser_storage.rs` 恢复脚本 / 采集脚本            | `account_manager/browser_storage.rs:165` / `:294`        | 可经 CDP `Runtime.evaluate` 复用；出向用恢复脚本、入向用采集脚本        |
| `detect_browsers()` / NM 注册 / 扩展模板            | `src-tauri/src/browser_ext/mod.rs`                       | 浏览器探测、Native Messaging（`com.kindred.bench`）、固定扩展 ID        |
| bench-companion 扩展                                | `src-tauri/resources/browser-extension/bench-companion/` | 已有 `nativeMessaging` + `storage` 权限与 background 消息网关           |
| `enforce_exclusivity_before_login()`                | `account_manager/exclusivity.rs`                         | 打开浏览会话前须与登录窗口互斥对齐                                      |
| `fingerprint.rs` / `probe.rs` / `session_keeper.rs` | `account_manager/`                                       | 回采后的登录态验证与定时同步，全部可直接复用                            |
| Auth Proxy / `bench-auth://`                        | `account_manager/proxy/` + `deep_link.rs`                | 已覆盖「浏览器 → Bench」的窄场景（OAuth 回调）；方向二是它的泛化        |

### 2.2 真实缺口

| 缺口                                | 说明                                                              | 归属里程碑 |
| ----------------------------------- | ----------------------------------------------------------------- | ---------- |
| 缺少「端点」抽象                    | 注入/捕获逻辑与 `WebviewWindow` 强耦合，浏览器端点无法复用        | I0         |
| 缺少注入载荷统一表示                | WebView 走 `WebviewCookie` builder，CDP 走 JSON——两套序列化易漂移 | I0         |
| 缺少 `session_origin` 元数据        | 无法回答「这份会话从哪来、什么时候采的」，冲突与审计不可诊断      | I0         |
| 无 CDP 客户端                       | 出向注入与入向回采都依赖它                                        | I1         |
| 无浏览器侧捕获实现                  | `capture_session_from_window` 只认 Tauri WebView                  | I2         |
| 扩展无 `cookies` / `scripting` 权限 | 无法读取日常浏览器会话                                            | I3         |
| 应用与扩展之间无运行时通道          | NM host 由浏览器启动、生命周期独立，回采数据拿不回 Bench app      | I3         |
| 无 S1/S2/S3 三态一致性规则          | 互通后会出现「WebView 已登出、浏览器仍登录」类不一致              | I0         |

---

## 3. 统一架构

### 3.1 三层视图模型与一致性规则（**本方案的地基**）

互通之后，同一账号的浏览态存在三处：

| 代号 | 存放点                                          | 角色                        | 生命周期                     |
| ---- | ----------------------------------------------- | --------------------------- | ---------------------------- |
| S1   | `AccountManagerSnapshot.sessions`（加密 store） | **唯一真理源（canonical）** | 账号存续期，TTL 管理         |
| S2   | Bench WebView 的每账号 data directory           | S1 的**物化视图**           | 随会话清理 / 账号删除        |
| S3   | Bench 托管的浏览器 profile 目录                 | S1 的**物化视图**           | 随会话清理 / 账号删除（D-B） |

**不一致风险**：S2 与 S3 是两份真实浏览态，二者会独立漂移（用户在浏览器登录了新账号，WebView 仍是旧的）。

**规则（建议在 design.md 固化）**：

1. **S1 永远优先**。S2/S3 只由 S1 单向注入生成，不得反向渗透。
2. **唯一允许的反向写入是显式回采**（S3/S2 → S1），且必须满足三个条件：用户显式动作触发、经 probe 验证、通过新鲜度比较（§3.4）。
3. **物化视图不参与登录态判定**。账号状态仍以 S1 + probe 为准，S3 里「看起来已登录」不构成 Ready 依据（与 design.md §3 红线一致）。
4. **同一账号同一时刻只允许一个活跃写入端点**。回采进行中禁止注入，反之亦然——复用 `enforce_exclusivity_before_login` 的同源互斥语义（F5 D-C 的推广）。

### 3.2 端点抽象（I0 的核心产出）

建议引入一个仅描述**能力形状**的 trait，不改动既有实现语义：

```text
SessionEndpoint（概念，非最终签名）
  ├─ WebviewEndpoint   ← 包装现有 inject_session / capture_session_from_window
  ├─ CdpEndpoint       ← S3 托管 profile（I1 出向 / I2 入向）
  └─ ExtensionEndpoint ← 日常浏览器（I3 入向 / I5 出向）
```

- **注入载荷（InjectionPayload）**：由 `AccountSession` → 载荷的转换提取为**纯函数**，产出与端点无关的中间表示（cookie 列表 + 按 origin 的 storage 快照 + UA + 跳过计数）。WebView 端点与 CDP 端点各自只负责「把载荷写进目标」，序列化逻辑只有一份。
- **捕获结果（CaptureResult）**：反向同构——端点只负责「从目标读出原始数据」，由共用逻辑组装为 `AccountSession`（含 origin 校验、IndexedDB schema 校验、体积上限）。
- **收益**：方向一/方向二各自新增约 1 个适配器，而不是各自复制一遍 `session.rs` 的全部规则（体积上限、partitioned fail-closed、origin 精确匹配）。

### 3.3 双向数据流

```text
                          ┌────────────────────────────┐
                          │ S1 canonical session        │
                          │ （加密 store，唯一真理源）   │
                          └───────┬────────────┬───────┘
                         注入（出向）│            │ 回采（入向，显式+probe+新鲜度）
                                  ▼            ▲
      ┌───────────────────────────┴────┐   ┌───┴──────────────────────────────┐
      │ S2 Bench WebView (每账号)       │   │ S3 Bench 托管浏览器 profile (每账号)│
      │ 既有：inject_session            │   │ I1 出向：CDP Network.setCookie     │
      │ 既有：capture_session_from_window│  │ I2 入向：CDP getAllCookies + eval  │
      └────────────────────────────────┘   └───┬──────────────────────────────┘
                                               │ I3 入向（只读）
                                       ┌───────▼──────────────────────────────┐
                                       │ 用户日常浏览器（bench-companion 扩展） │
                                       │ 只读 cookies + scripting             │
                                       └──────────────────────────────────────┘
```

### 3.4 新鲜度与冲突仲裁

回采写 S1 前必须仲裁，避免「用陈旧浏览态覆盖 keeper 刚刷新的新会话」：

1. 比较 `session.captured_at_ts` 与回采时间戳。
2. 若 S1 更**新**且状态为 Ready → 默认**拒绝直接覆盖**，改为提示「Bench 已有一份更新的会话」并提供「仍然用浏览器登录态覆盖」确认（DestructiveConfirmDialog）。
3. 若 S1 更旧或不存在 → 正常写入。
4. 无论何种路径，写入沿用既有 `revision` 单调 + 跨进程文件锁 + 锁内 reload canonical 后 save/replace，禁止 last-write-wins。

### 3.5 `session_origin` 元数据（schema 变更）

建议给 `AccountSession` 追加只增字段（`serde(default)`，兼容旧数据，不动 schema 版本）：

| 字段             | 说明                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `origin_kind`    | `webviewLogin` / `webviewKeeper` / `authProxy` / `browserCdp` / `browserExtension` / `import` |
| `origin_detail`  | 端点标识（浏览器 ID / 扩展版本），**不含账号、URL query、cookie 值**                          |
| `captured_at_ts` | 既有字段，复用为仲裁依据                                                                      |

用途：审计、冲突诊断、UI 上标注「此会话来自浏览器登录」。红线：该字段不得进入日志明细以外的敏感上下文，且不携带任何凭据。

---

## 4. 方向一：Bench → 浏览器（出向）

沿用 [browser-session-injection-research.md](./browser-session-injection-research.md) 的结论，不重新论证：

- **路径**：账号专属 `user-data-dir` 启动独立 Chromium 实例（`--remote-debugging-port=0`）→ 读 `DevToolsActivePort` → CDP `Network.setCookie` 逐条注入 → `Page.navigate`。
- **排除**：直写浏览器 Cookies DB、明文 cookies.txt 导出。
- **不支持**：Safari（无 CDP / 无 `user-data-dir`）、Firefox v1（CDP 兼容层已弃用）。
- **语义提醒**：打开的是「用户自己的浏览器应用 + Bench 专属档案」，书签/日常扩展不共享，UI 必须明示。

本文相对 F5 的**唯一增量建议**：把 F5-M2 的「storage 注入」与 I0 的载荷统一合并推进，避免 F5 先写一套 CDP 专用的 storage 恢复逻辑、I2 再改。

---

## 5. 方向二：浏览器 → Bench（入向，核心）

### 5.1 传输方案对比

|                  | **A. CDP 回采 Bench 托管 profile**（推荐 I2）                                    | **B. 扩展回采日常浏览器**（推荐 I3）                                  | C. 直读浏览器 Cookies DB            | D. 手动导入 cookies.txt / HAR |
| ---------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------- | ----------------------------- |
| 原理             | 连接托管 profile 的 CDP，`Network.getAllCookies` + `Runtime.evaluate` 采 storage | 扩展 `chrome.cookies.getAll` + `scripting` 注入采集脚本，经本地桥回传 | 解密浏览器 Safe Storage 直读 SQLite | 用户手动导出后导入            |
| 覆盖范围         | Bench 打开的浏览器窗口                                                           | 用户**日常**浏览器的既有登录态                                        | 同 B                                | 任意                          |
| HttpOnly         | ✅（CDP 网络栈视角）                                                             | ✅（`cookies.getAll` 返回）                                           | ⚠️ 受版本限制                       | ⚠️ 依赖工具                   |
| localStorage     | ✅ `Runtime.evaluate`                                                            | ⚠️ 需 `scripting` + `document_start` 时机                             | ❌                                  | ❌                            |
| 权限/分发成本    | 零                                                                               | 扩展加 `cookies` / `scripting`（Chrome 会禁用待用户确认）             | 零但极脆弱                          | 零                            |
| 对用户登录态影响 | 无（只读自有 profile）                                                           | **无（纯读取，不写入）**                                              | 无                                  | 无                            |
| 凭据暴露面       | 最小：浏览器进程 → loopback CDP → Rust 内存                                      | 中：桌面应用 ↔ 扩展的本地桥（需新增通道安全设计）                     | 大：触碰浏览器加密体系              | **明文落盘**                  |
| 结论             | **✅ I2**                                                                        | **✅ I3**（先于「扩展写入」落地，见 §1 判断 4）                       | ❌ 排除                             | ❌ 排除                       |

**为什么 I2 必须先行**：I2 与 I1 共用同一个 CDP 客户端（`cdp.rs`），边际成本极低；profile 按账号隔离，回采结果天然归属已知账号，不需要「识别这份会话属于谁」的难题。I3 需要先解决「应用 ↔ 扩展运行时通道」这一独立的安全课题。

### 5.2 I2 详细设计（CDP 回采）

**数据流**：

```text
用户在托管浏览器窗口完成登录（密码 / 扫码 / 2FA / SSO）
       │
       ▼
Bench: browser_session_capture(accountId, stationUrl)
  1. 复用 I1 的实例探活（DevToolsActivePort + TCP），未运行则返回结构化错误
  2. CDP 连接（短窗口：连接 → 采集 → 断开，不做长连接）
  3. Network.getAllCookies → 按站点可注册域过滤 → 映射为 CookieEntry
     （partitioned 继续 fail-closed：跳过并计数，不降级为普通 cookie）
  4. Runtime.evaluate → 复用 browser_storage.rs 的采集脚本
     （精确 origin 校验 scheme+host+port；IndexedDB 按 schema 校验，不兼容 fail-closed）
  5. Runtime.evaluate → navigator.userAgent
  6. 组装 AccountSession（体积上限沿用 design.md §3：512 key/2 MiB、32 db、128 store、10k record/8 MiB）
  7. 新鲜度仲裁（§3.4）→ 冲突时返回需确认的结构化结果，不静默覆盖
  8. 用户确认后：encrypt_session → storage::with_state_mut → revision 单调写入
  9. 触发 probe 验证；Ready 必须由 probe 确认（design.md §3 红线）
       │
       ▼
账号卡片显示「已保存浏览器登录态」+ 日志记录 origin_kind=browserCdp
```

**关键约束**：

- **凭据链路**：浏览器进程 → loopback CDP WS → Rust 内存 → 加密 store。**完全不经过 renderer / 前端 store / 事件 / 日志**，与出向同一红线。
- **短窗口原则**：采集完成后立即断开 CDP。理由：调试端口在实例存活期间可被本机任意同用户进程完全控制（F5 §5 已记录该取舍），回采若保持长连接会显著扩大暴露窗口。
- **只采站点相关**：按站点可注册域过滤 cookie，不采集该 profile 内的第三方/追踪 cookie。
- **不自动回采**：默认由用户显式点击触发；「自动同步」为可选勾选（D1），启用后走 keeper 调度，且仍受新鲜度仲裁约束。
- **互斥**：回采进行中禁止同账号注入 / 登录窗口操作（§3.1 规则 4）。

**IPC 契约（双边同步：`contracts.ts` + `commands.rs`）**：

| 命令                          | 入参                                | 出参                                                                                        |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `browser_session_capture`     | `accountId`、`stationUrl`、`force?` | `{ captured, cookieCount, skippedPartitioned, storageOrigins, indexedDbStatus, conflict? }` |
| `browser_session_probe_login` | `accountId`                         | `{ seemsLoggedIn: bool, evidenceCount: number }`（复用指纹 L0 语义，仅作 UI 提示）          |
| `browser_session_sync_status` | `accountId`                         | `{ enabled, lastSyncedAt?, nextRunAt? }`                                                    |

DTO 只含计数与枚举，**无 cookie 值 / storage 值 / 明文会话内容**。`conflict` 只回「Bench 会话更新」这一布尔语义与时间戳，不回会话内容。

### 5.3 UX 主流程（把「浏览器登录」变成一等登录路径）

```text
账号详情 →「用浏览器登录」按钮
   → 首次：选择浏览器（仅 Chromium 系）+ 明示「在 Bench 隔离档案中打开，不影响日常浏览器」
   → 可选「清空该档案后打开」（干净起点，避免残留旧登录态干扰）
   → 浏览器打开站点首页
用户在该窗口完成登录（任意方式：密码 / 扫码 / 2FA / SSO）
   → 回到 Bench，点击「保存到 Bench」
   → 回采 → probe 验证 → Ready → toast「已保存 <账号> 的登录态」
   → 可选勾选「以后自动同步」（D1）
```

**与「快速登录」「外部登录」的关系（必须澄清，避免第三个重叠入口）**：

| 入口                         | 目标                                                  | 隔离环境         | 适用                      |
| ---------------------------- | ----------------------------------------------------- | ---------------- | ------------------------- |
| 快速登录                     | 用已有账号打开任意链接                                | Bench WebView    | 轻量访问                  |
| 外部登录                     | 代外部 App 完成登录授权（`bench-auth://` / loopback） | Bench WebView    | OAuth 回调                |
| **用浏览器登录**（本文新增） | **登录后把会话保存回 Bench**                          | Bench 托管浏览器 | **2FA/扫码/SSO/风控站点** |

F5 的 F1 结论是「双入口保留 + 职责文案澄清」；本文在其上增加第三个入口，因此**文案澄清要求更高**：三者的按钮位置、tooltip 与弹窗首句必须明确「在什么环境、完成后发生什么」。建议在同一次 UI 收敛中一并处理。

### 5.4 I3 详细设计（扩展回采日常浏览器）

**需要新建的通道**：扩展由浏览器启动、NM host 生命周期独立，采到的数据拿不回正在运行的 Bench app。两种方案：

|          | 应用侧本地桥（推荐）                                                                | bench-host 中转                                             |
| -------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 形态     | Bench app 起 `127.0.0.1` 随机端口 + 一次性 token + `Origin` 白名单（= 固定扩展 ID） | 扩展 → NM → bench-host → 再经某通道转给 Bench app           |
| 凭据落点 | Rust 内存（直接进 canonical store 链路）                                            | bench-host 进程内存，违反「解密只在 Rust app 内」需新增例外 |
| 复用性   | 与 F5-M3「本地桥」是同一个设计，双向共用                                            | 无                                                          |
| 结论     | **✅ 采用**                                                                         | ❌                                                          |

**通道安全要求**（与 F5-M3 一致，必须一次做对）：

- 仅 `127.0.0.1`、随机端口、随机一次性 token、`Origin` 白名单 = 固定扩展 ID（`dmcfgfpfilhgcoddmciglpjdggkpinje`）。
- 会话即用即毁：一次回采一次 token，用完即失效；不提供长驻 API。
- 扩展侧权限最小化：仅 `cookies`（读）+ `scripting`（在用户**显式点击**的标签页注入一次采集脚本）；不申请 `tabs` 全量读取、不申请写入类权限。
- **用户显式触发**：扩展 popup 上「保存当前站点登录态到 Bench」按钮，绑定当前标签页 origin；**禁止**后台静默全量采集。
- 域最小化：只采当前标签页 origin 的可注册域 cookie，不采第三方。
- Bench 侧仍执行 §3.4 新鲜度仲裁与 probe 验证。

**与方向一的关系**：I3 只读、I5 写入日常浏览器。两者的扩展权限与本地桥**共用**，但 I3 无互踩风险，因此独立于 I5 先行落地。

---

## 6. 闭环效应：从两条功能到一个工作流

两端打通后，真正的产品价值不在「单向能力」，而在**闭环**：

```text
S1 canonical session ──① I1 注入──▶ 托管浏览器（真实浏览器指纹）
        ▲                                    │
        │                                    │ ② 用户在该窗口以真实浏览器完成登录/续期
        │                                    ▼
        └──④ I2 回采入库 ◀──③ CDP 采集（含 HttpOnly / storage / UA）
                     │
                     └──⑤ keeper 定时重复 ①→④，保持真实浏览器指纹下的会话新鲜
```

**三个衍生能力（建议写入产品规格）**：

1. **登录适配性兜底**：WebView 无法完成登录的站点（扫码、2FA、设备绑定、风控拦截），改走「浏览器登录 → 回采」。这是现存能力矩阵里真实存在的缺口，价值最高。
2. **会话保真度提升**：真实浏览器的 UA / 指纹 / cookie 形态比 WebView 内更「自然」，回采入库后的会话在后端 probe 与站点风控下通过率更高。与 [session-capture-fidelity-research.md](./session-capture-fidelity-research.md) 的结论方向一致。
3. **托管 profile 升级为「账号工作区」**：S3 从「一次性注入目标」变为该账号的常驻浏览器工作区，与 WebView data dir 并列；多会话管理视图（哪些账号正在浏览器中打开、一键全关）成为自然延伸（I6）。

---

## 7. 安全边界与红线对照

| 红线（来源）                                                        | 本方案如何满足                                                                                      | 违反风险点                            |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 明文 session 只在 Rust 内存与目标浏览上下文短时存在（design.md §5） | 出向：加密 store → Rust → CDP loopback；入向：浏览器 → CDP → Rust → 加密 store。**均不进 renderer** | I3 的本地桥若把数据下发给前端即违反   |
| 每账号独立 data directory，禁止跨账号复用浏览上下文（design.md §3） | S2/S3 均按 accountId 一一对应；回采只读该账号 profile，不跨账号                                     | 复用一个 profile 服务多账号           |
| 恢复后必须 probe，不能仅凭 cookie 存在标记 Ready（design.md §3）    | 回采后同样走 probe；S3「看起来已登录」不构成 Ready 依据                                             | 回采即直接标 Ready                    |
| partitioned Cookie fail-closed（design.md §3）                      | 出向注入与入向回采都跳过并计数，不降级为普通 cookie                                                 | 回采把 partitioned 当普通 cookie 写回 |
| 含凭据导出必须保持加密（design.md §5）                              | 排除 cookies.txt / HAR 明文导出；跨机迁移走远期加密会话包（I6）                                     | 引入任何明文导出                      |
| 不改浏览器内部数据（`browser_ext/mod.rs` 注释）                     | CDP 读的是运行时 cookie，不触碰 Cookies DB 文件                                                     | 直读 SQLite                           |
| 危险操作二次确认（coding-standards §5）                             | 「用浏览器登录态覆盖 Bench 已有会话」走 DestructiveConfirmDialog                                    | 静默覆盖                              |
| IPC 双边契约、错误走 `AppResult<T>`（design.md §7）                 | 新命令全部 `contracts.ts` + `commands.rs` 双写，禁止 `.unwrap()`                                    | 单边写                                |
| capabilities 是平台能力真理源（design.md §7）                       | 新增 `browserSessionOpen`（出向，F5 已规划）与 `browserSessionCapture`（入向）                      | 前端自行探测提升能力                  |
| Rust 平台专有 API 必须 `#[cfg]` 包裹（coding-standards §7.4.1）     | 浏览器定位、进程管理、profile 路径双平台分支；提交前必跑 `pnpm run check:be-cfg`                    | 本机 macOS 编译通过即认为双平台可用   |

**新增需在 design.md 落条款的两点**：

1. **第二端点条款**：浏览器 profile 与 WebView data dir 同为 S1 的物化视图，禁止互相渗透，唯一反向写入路径是显式回采。
2. **回采条款**：回采必须「用户显式触发 + 新鲜度仲裁 + probe 验证」三条件齐备，且采集范围为站点可注册域。

---

## 8. 分期计划

> 里程碑命名 I0–I6（Interop），与 F5 的 M1/M2/M3 映射关系见 §8.7。I0–I2 是「必须一次做对」的地基与主线。

### I0 地基：端点抽象与一致性规则（P0，前置）

**目标**：不新增用户可见功能，但让 I1–I3 各自只写适配器。

| 任务  | 内容                                                                                                 | 层   | 主要文件                                            | 规模 |
| ----- | ---------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------- | ---- |
| I0-T1 | 抽取 `AccountSession` → `InjectionPayload` 纯函数；`inject_session` 改为消费者（行为不变，测试锁定） | Rust | `account_manager/session.rs`                        | M    |
| I0-T2 | 抽取 `CaptureResult` → `AccountSession` 组装逻辑（origin 校验、schema 校验、体积上限只留一份）       | Rust | `account_manager/session.rs` / `browser_storage.rs` | M    |
| I0-T3 | `AccountSession.session_origin` 字段（`serde(default)`，兼容旧数据，不动 schema 版本）+ 迁移测试     | Rust | `account_manager/types.rs` / `storage.rs`           | S    |
| I0-T4 | S1/S2/S3 一致性规则与新鲜度仲裁函数（纯逻辑 + 单测，暂不接线）                                       | Rust | 新 `account_manager/session_arbitration.rs`         | M    |
| I0-T5 | design.md 补「第二端点条款」「回采条款」                                                             | 文档 | `../modules/account-manager/design.md`              | XS   |

**验收**：既有 `inject_session` / `capture_session_from_window` 行为零回归（`cargo nextest run account_manager` 全绿 + `pnpm run test:critical`）；`session_origin` 旧数据可读；`pnpm run check:be-cfg` 全绿。

### I1 出向：托管 profile 注入（= F5-M1，P0）

F5 的 M1-T1..T5 原样执行（CDP 客户端 / `browser_session_open·status·close` / IPC 双写 + capabilities / 前端 hook + 按钮 + 弹窗 / 测试）。本文仅调整一处：**storage 注入并入 I0 的载荷统一**，不在 I1 单独实现。

**验收**：见 F5 §7。补充一条——注入后同账号二次打开复用实例（`reusedInstance=true`）。

### I2 入向：托管 profile 回采（P0，闭环关键）

| 任务  | 内容                                                                                                            | 层   | 主要文件                                                                           | 依赖  |
| ----- | --------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------- | ----- |
| I2-T1 | CDP 回采原语：`Network.getAllCookies` → 域过滤 → `CookieEntry` 映射；`Runtime.evaluate` 采 storage + UA         | Rust | `account_manager/browser_session/capture.rs`                                       | I1-T1 |
| I2-T2 | `browser_session_capture` / `probe_login` / `sync_status` 命令 + 互斥 + 短窗口连接策略                          | Rust | 新 `commands/browser_session.rs`、`exclusivity.rs`                                 | I2-T1 |
| I2-T3 | 新鲜度仲裁接线 + 冲突返回结构化结果（不静默覆盖）                                                               | Rust | `session_arbitration.rs` / `storage.rs`                                            | I0-T4 |
| I2-T4 | IPC 契约双写 + capabilities 新增 `browserSessionCapture`（真机验证前 `partial`）                                | 双端 | `contracts.ts` / `commands.rs` / `capabilities.rs`                                 | I2-T2 |
| I2-T5 | 前端：「用浏览器登录」按钮 + 首次选择弹窗（含「清空该档案后打开」）+「保存到 Bench」+ 冲突确认弹窗 + i18n zh/en | 前端 | `DetailColumn.tsx` / 新弹窗 / `hooks/useBrowserSession.ts`                         | I2-T4 |
| I2-T6 | 三入口文案收敛（快速登录 / 外部登录 / 用浏览器登录；对齐 F5-F1 结论）                                           | 前端 | `StationColumn.tsx` / `quick-login-dialog.tsx` / `auth-proxy-dialog.tsx` / locales | I2-T5 |
| I2-T7 | 测试：CDP 采集消息序列、域过滤、partitioned 跳过、冲突仲裁、DTO 无凭据断言                                      | 双端 | `__tests__` / Rust `#[cfg(test)]`                                                  | I2-T3 |

**验收**：

- [ ] 在托管浏览器完成登录（含扫码 / 2FA 场景）→「保存到 Bench」→ 账号显示 Ready，且 WebView 内打开该站点确为已登录（证明回采内容可用、跨端点一致）。
- [ ] HttpOnly / Secure / SameSite / 过期时间还原正确；partitioned 跳过并有计数。
- [ ] Bench 已有更新会话时，回采不静默覆盖，返回冲突并需用户确认。
- [ ] 全链路 DTO / 日志无 cookie 值、无 storage 值、无明文 session。
- [ ] 采集完成后 CDP 连接立即断开（断言无长驻连接）。
- [ ] `pnpm run check:be-cfg` / `clippy -D warnings` / 双端测试全绿。

### I3 入向：日常浏览器回采（P1，扩展只读）

| 任务  | 内容                                                                              | 层          | 主要文件                                                                                   |
| ----- | --------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| I3-T1 | 应用侧本地桥：`127.0.0.1` 随机端口 + 一次性 token + `Origin` 白名单 + 即用即毁    | Rust        | 新 `account_manager/browser_bridge.rs`                                                     |
| I3-T2 | 扩展权限升级：`cookies` + `scripting`（仅为显式触发的标签页注入一次采集脚本）     | 扩展        | `resources/browser-extension/bench-companion/manifest.json` / `background.js` / `popup.js` |
| I3-T3 | 采集入口：popup「保存当前站点登录态到 Bench」+ 站点匹配 + 账号选择（已有 / 新建） | 扩展 + 前端 | `popup.*` / `tab.*` / 前端弹窗                                                             |
| I3-T4 | 权限升级引导 UI（Chrome 会禁用扩展待确认）+ 与既有「浏览器扩展导出」引导共用      | 前端        | `src/features/.../browser-ext` 相关                                                        |
| I3-T5 | 回采结果入库（复用 I2-T3 仲裁）+ probe 验证 + 审计日志                            | Rust        | `commands/browser_session.rs`                                                              |

**验收**：日常浏览器登录某站点 → 扩展点击保存 → Bench 出现带该站点会话的账号且 probe 为 Ready；日常浏览器登录态**不受任何影响**（只读断言）；扩展仅声明 `cookies` / `scripting`，无写入类权限；本地桥端口不可被非白名单 Origin 访问（含单测）。

### I4 保真与同步（P1）

- storage / IndexedDB 回采的兼容性补全（IndexedDB 版本或 store 不兼容 fail-closed，不覆盖现有库）。
- `Emulation.setUserAgentOverride` = `session.user_agent`（出向）；回采时记录真实 UA。
- **自动同步**（D1）：keeper 调度扩展为「注入 → 等待 → 回采」，保持真实浏览器指纹下会话新鲜；失败不破坏 S1 旧会话。
- profile 免注入优化（cookie 未过期跳过）与运行中实例的会话同步评估。

### I5 出向：日常浏览器注入（= F5-M3，P1）

扩展写入日常浏览器 profile：`cookies.set` 注入。**必须带冲突警告 + 覆盖前备份**（会顶掉用户同站日常登录态——这是 F5 判断 2 的核心反对理由，只有把「警告 + 备份 + 回滚」做扎实才可上线）。与 I3 共用本地桥与扩展权限。

### I6 远期

- Safari（Safari Web Extension 需 XPC + 签名上架，单独 RFC）；Firefox（WebDriver BiDi 路线评估）。
- 多浏览器会话管理视图（哪些账号正在浏览器中打开、一键全部关闭）。
- **可移植加密会话包**：passphrase + KDF + AEAD 的跨机迁移格式（替代被排除的明文导出）。

### 8.7 与既有规划 F5 的映射

| 本文           | F5 原编号 | 说明                                                     |
| -------------- | --------- | -------------------------------------------------------- |
| I0             | 新增      | F5 未覆盖的抽象收口，是 I1–I3 的共同前置                 |
| I1             | M1        | 原样执行，仅 storage 注入并入 I0                         |
| （并入 I1/I4） | M2        | 体验补全拆分到 I0（载荷统一）与 I4（UA / 免注入 / 同步） |
| I2             | 新增      | **方向二主线**，F5 完全未覆盖                            |
| I3             | 新增      | 日常浏览器「读」，从 F5-M3 中拆出并**提前**              |
| I5             | M3        | 日常浏览器「写」，保持进阶位置                           |

---

## 9. 风险与缓解

| 风险                                                      | 等级 | 缓解                                                                                                  |
| --------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| **S1/S2/S3 三态不一致**（互通引入的最大风险）             | 高   | §3.1 四条规则 + §3.4 新鲜度仲裁 + UI 明示「当前会话来自哪个端点」；keeper 视为 S1 的唯一自动刷新者    |
| 用陈旧浏览器登录态覆盖 keeper 刚刷新的会话                | 高   | I0-T4 仲裁函数 + I2-T3 冲突返回结构化结果 + 二次确认，禁止静默覆盖                                    |
| CDP 调试端口在实例存活期可被本机同用户进程完全控制        | 中   | loopback + 随机端口 + 生命周期随实例；**回采用短窗口**（连→采→断）；不在注入后长驻连接                |
| 回采采集过宽（第三方 / 追踪 cookie）                      | 中   | 按站点可注册域过滤 + 只采用户显式指定的标签页 origin（I3）                                            |
| 扩展权限升级触发 Chrome「扩展已禁用」流程，用户教育成本高 | 中   | I3 与既有扩展导出引导共用；权限最小化（只 `cookies` / `scripting`）；不申请 `tabs` 全量               |
| 本地桥被非预期 Origin 访问                                | 中   | 随机端口 + 一次性 token + `Origin` 白名单 = 固定扩展 ID + 即用即毁；单测覆盖拒绝路径                  |
| 企业策略 `RemoteDebuggingAllowed=false` 或杀软拦截进程    | 中   | capability 返回 `failed` + reasonCode，前端禁用按钮并提示原因，不得 fail-open                         |
| Windows 路径 / 进程管理 / profile 锁差异                  | 中   | 全部分支 `#[cfg]` 包裹；`check:be-cfg` 门禁；真机矩阵（R04 流程）通过后才把 capability 置 `supported` |
| 三个登录入口概念重叠导致用户困惑                          | 中   | I2-T6 三入口文案收敛；每个入口 tooltip 与弹窗首句明确「环境 + 完成后发生什么」                        |
| 托管 profile 成为磁盘黑洞                                 | 低   | 注册进 clean-space / DevCleaner 可见清单；账号删除进逐资源 report；TTL 联动（D-B）                    |

---

## 10. 待拍板决策点

| #   | 决策点                                                  | 倾向                                                                   |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| D1  | 回采触发语义：显式点击 / 关窗自动 / 定时自动            | **显式默认 + 可选「自动同步」勾选**（自动路径仍受仲裁约束）            |
| D2  | S1 已有更新会话时是否允许覆盖                           | 允许，但必须二次确认；默认保留较新的一方                               |
| D3  | 是否支持「浏览器登录 → 新建账号」（而非仅更新已有账号） | 支持；站点匹配后提供「新建账号并保存」路径                             |
| D4  | 托管 profile 是否常驻（作为账号工作区）                 | 倾向常驻 + TTL 联动清理；与 keeper 的关系在 I4 定                      |
| D5  | 「清空该档案后打开」是否作为默认行为                    | 首次默认开启（干净起点），用户可关；记住偏好                           |
| D6  | profile 目录 TTL 清理是否同步删除                       | 倾向删除（沿用 F5 D-B）；若选保留，需在 UI 说明残留浏览态              |
| D7  | 日常浏览器方向（I3 / I5）是否立项                       | 建议 I3 立项（只读、低风险、高价值），I5 视 I3 反馈再定（沿用 F5 D-A） |

---

## 11. 验收红线（全局）

- 任何路径下，cookie 值 / storage 值 / 明文 session **不得**出现在 renderer、前端 store、事件、日志。
- 跨账号浏览上下文**不得**互相可见（S2、S3 各自按 accountId 隔离）。
- 回采不得绕过 probe 直接标记 Ready。
- 未在 macOS 真机 + Windows Sandbox/VM 双平台验证前，`browserSessionOpen` / `browserSessionCapture` 保持 `partial`，不得改为 `supported`（沿用 R04 矩阵流程）。
- 涉及 Rust `#[cfg]` / 平台分支 / 新增常量 / 新增 `use` 绑定的改动，提交前必跑 `pnpm run check:be-cfg`。

**验证命令**：

```bash
pnpm run lint:fe
pnpm exec vitest run src/features/account-manager
cargo test --manifest-path src-tauri/Cargo.toml account_manager
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
pnpm run check:be-cfg
pnpm run test:critical
pnpm run check:docs
git diff --check
```

---

## 12. 落地约定

1. **本文不直接改代码**。确认后按项目规则拆分为 `../roadmap/planned/account-manager.md` 的 **F5**（出向，沿用既有小节 + I0 增量）与 **F6**（入向，本文章节 5/8）两节任务；实施完成后回写 `../modules/account-manager/design.md`（§3 生命周期、§5 加密与存储、新「第二端点条款」「回采条款」）与 `../reference/product-specs/account-manager.md`。
2. **提交策略**：按任务独立 commit（Conventional Commits）；I0 属重构，必须与 I1 分开提交，便于回归定位。
3. **顺序**：I0 → I1 → I2 为强顺序（同一 CDP 客户端与载荷表示），不得并行跳过 I0；I3 可与 I4 并行。
4. **本次涉及的既有文档**：[design.md](../modules/account-manager/design.md)、[planned/account-manager.md](../roadmap/planned/account-manager.md)、[browser-session-injection-research.md](./browser-session-injection-research.md)（F5 原文，实施后其 M2 部分需按 §8.7 拆分）、[extension-spec.md](../reference/extension-spec.md)（I3 的扩展权限变更需同步契约）、[session-capture-fidelity-research.md](./session-capture-fidelity-research.md)。

## 变更记录

- 2026-09-10：创建。统一「账号 ↔ 浏览器双向互通」构想：提出把浏览器作为与 WebView 并列的**第二 Session 端点**；定义 S1/S2/S3 三层视图与一致性规则、`SessionEndpoint` 抽象与注入载荷统一、`session_origin` 元数据与新鲜度仲裁；给出入向两方案对比（CDP 回采托管 profile 优于扩展回采，且**读日常浏览器应先于写**）；确立 I0–I6 分期（I0 地基 / I1 出向 = F5-M1 / I2 入向闭环 / I3 日常浏览器只读回采 / I4 保真与同步 / I5 出向日常浏览器 = F5-M3 / I6 远期）与 D1–D7 决策点。
