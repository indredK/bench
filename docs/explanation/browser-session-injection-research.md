# 浏览器会话注入（一键在浏览器中打开账号会话）调研与方案

> 状态：**已调研、未实现、待确认**。本文是「一键打开浏览器并注入当前账号登录信息」需求的唯一调研与方案文档；确认后按项目规则把 F5 节任务同步 `docs/roadmap/planned/account-manager.md`，实施完成后回写 `design.md` 与 `product-specs/account-manager.md`。
> 关联：`docs/modules/account-manager/design.md`（§5 加密与存储 / §7 前端边界）与交互图 [`docs/diagrams/account-manager-triangle.html`](../diagrams/account-manager-triangle.html)（三角流程语义）、`docs/roadmap/planned/account-manager.md`（F1–F4）、`src-tauri/src/browser_ext/`（bench-companion 扩展与 Native Messaging）。

---

## 1. 需求与结论先行

**需求**：账号管理中新增能力——一键打开系统浏览器，把当前账号的登录信息注入进去，浏览器直接以该账号身份浏览站点。

**明确判断（先给结论）**：

| #   | 判断                                                                                                   | 依据                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **推荐路线：CDP + Bench 托管 profile（方案 B）先行**，作为 M1/M2 落地                                  | 零扩展依赖、双平台同构、数据流完全在 Rust 内存内（与 design.md §5 红线一致）、登录态天然隔离                                                              |
| 2   | **扩展注入日常浏览器（方案 A）作为 M3 进阶**，不做默认路径                                             | 会污染用户日常登录态（同站 cookie 互踩，违背多账号隔离的产品定位），且依赖扩展权限升级与分发                                                              |
| 3   | **直接写浏览器 Cookies 数据库（方案 C）与明文 cookies.txt 导出（方案 D）排除**                         | C：浏览器运行锁 + Chrome app-bound encryption 趋严 + 违反「不改浏览器内部数据」既有边界；D：明文凭据导出直接违反 design.md §5「含凭据的导出必须保持加密」 |
| 4   | **Safari / Firefox v1 明确不支持**，文档化原因并给远期路径                                             | Safari 无 CDP、无 user-data-dir 参数；Firefox 的 CDP 兼容层已弃用（转向 WebDriver BiDi）                                                                  |
| 5   | 本功能与既有 `inject_session()`（注入 Bench 内部 WebView）是**同一数据源的另一条出口**，不是新数据体系 | canonical session 唯一真理源不变，新增的只是「注入目标」                                                                                                  |

**一句话方案**：`browser_session_open(accountId)` → Rust 从加密 store 解密 canonical session → 以账号专属 `user-data-dir` 启动独立 Chromium 实例（`--remote-debugging-port=0`）→ 经 CDP WebSocket 逐条 `Network.setCookie` 注入 → 导航到站点 → 返回结果。会话全程不经过前端、不落明文盘、不进日志。

---

## 2. 现状盘点（已有资产，直接可复用）

### 2.1 会话数据与注入先例

| 资产                                                              | 位置                                      | 与本需求的关系                                                                                                                                                        |
| ----------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| canonical session（`AccountManagerSnapshot.sessions`，schema v5） | `account_manager/state.rs` / `storage.rs` | 唯一注入数据源：cookies（name/value/domain/host_only/path/http_only/secure/same_site/partitioned/expires_at_ts）+ local/session storage + IndexedDB 快照 + user_agent |
| `restore_session()` 解密                                          | `account_manager/session.rs:255`          | 注入前在 Rust 内存还原明文，AES-256-GCM，密钥来自 Keychain                                                                                                            |
| `inject_session()` 注入 WebView                                   | `account_manager/session.rs:273`          | **注入逻辑先例**：逐条 set cookie（含 domain/secure/httpOnly/sameSite/expires 还原）。本功能是把同一份 session 换个出口（CDP 替代 WebView API）                       |
| Web Storage 恢复脚本（origin 校验 + IndexedDB schema 验证）       | `account_manager/browser_storage.rs`      | CDP `Runtime.evaluate` 可直接执行同一段恢复脚本（M2 复用点）                                                                                                          |
| `enforce_exclusivity_before_login` 互斥                           | `account_manager/exclusivity.rs`          | 打开浏览器会话前须与登录窗口互斥对齐                                                                                                                                  |
| 浏览器探测 `detect_browsers()`                                    | `src-tauri/src/browser_ext/mod.rs:118`    | 已返回 chrome/edge/brave/arc/firefox 的安装状态，选择器直接复用                                                                                                       |
| Auth Proxy / `bench-auth://` 体系                                 | `account_manager/proxy/` + `deep_link.rs` | 方向相反（浏览器→Bench）；本功能是 Bench→浏览器，互补不冲突                                                                                                           |

### 2.2 安全红线（本功能必须遵守的既有边界）

来自 `design.md` §3/§5/§7 与 `architecture.md` §2，逐条对照：

1. **明文 session 只在 Rust 内存和目标浏览上下文中短时存在**——注入数据流必须是 `加密 store → Rust 内存 → CDP loopback → 浏览器进程`，不得进入 renderer、前端 store、事件或日志。
2. **每个账号独立 data directory，禁止跨账号复用浏览上下文**——Bench 托管 profile 按账号一一对应（`browser-sessions/<accountId>/`），天然满足并强化该红线。
3. **IPC 双边契约**——新增命令必须 `contracts.ts` + `commands.rs` 双写；错误走 `AppResult<T>`，禁止 `.unwrap()`。
4. **capabilities 是平台能力真理源**——新增 `browserSessionOpen` 能力项，走 `supported/partial/unsupported/failed + reasonCode` 矩阵；前端禁止自行探测提升能力。
5. **危险/写操作反馈**——打开/关闭会话须统一 spinner（UX 规范），失败可见，中英文全覆盖。
6. **Rust 平台专有 API 必须 `#[cfg]` 包裹**——浏览器可执行文件定位、进程管理在 macOS/Windows 有差异，提交前必跑 `pnpm run check:be-cfg`。

---

## 3. 候选方案与对比

### 3.1 方案总表

|                        | **B. CDP + Bench 托管 profile**（推荐 M1）                                                                  | **A. bench-companion 扩展注入**（推荐 M3）                                                      | C. 直写浏览器 Cookies DB                                       | D. cookies.txt 明文导出               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------- |
| 原理                   | 以账号专属 `user-data-dir` 启动独立 Chromium 实例，经 CDP WebSocket `Network.setCookie` 注入后导航          | Bench 起 `127.0.0.1` 一次性桥，扩展收到任务后 `chrome.cookies.set` 注入**用户日常浏览器**       | 解密浏览器 Keychain Safe Storage，直写其 Cookies SQLite        | 导出 Netscape/JSON 文件，用户手动导入 |
| 注入目标               | Bench 托管的隔离 profile                                                                                    | 用户日常浏览器 profile                                                                          | 用户日常浏览器 profile                                         | 任意（手动）                          |
| cookie 属性完整度      | ✅ 全部（domain/path/secure/httpOnly/sameSite/expires）                                                     | ✅ 全部（`cookies.set` 支持 httpOnly 等）                                                       | ⚠️ 部分受版本限制                                              | ⚠️ 依赖导入工具                       |
| localStorage/IndexedDB | ✅ CDP `Runtime.evaluate`（可复用现有恢复脚本，M2）                                                         | ⚠️ 需 content script（`scripting` 权限 + document_start 时机，复杂度中等）                      | ❌                                                             | ❌                                    |
| 凭据暴露面             | 最小：仅 Rust 内存 → loopback WS → 浏览器进程                                                               | 中：loopback HTTP 明文 + 扩展进程                                                               | 大：触碰浏览器加密体系                                         | 明文落盘                              |
| 与日常登录态的关系     | 完全隔离，互不影响                                                                                          | **同站 cookie 互踩**（顶掉用户日常登录）                                                        | 同左                                                           | 用户自行判断                          |
| 分发/权限成本          | 零                                                                                                          | 扩展加 `cookies/tabs/scripting` 权限（Chrome 会禁用待用户确认）；分发走现有导出引导或 Web Store | 零但极脆弱                                                     | 零                                    |
| 双平台                 | ✅ macOS/Windows 同一参数体系                                                                               | ✅ Chromium 系一致（Firefox 另算）                                                              | ❌ 每浏览器格式不同                                            | ✅                                    |
| 浏览器版本敏感性       | 低（Chrome 136+ 仅禁默认 profile 的远程调试端口，自定义 `user-data-dir` 不受限——Playwright 长期依赖此路径） | 低                                                                                              | **高**（Chrome 130+ app-bound encryption 持续收紧）            | 低                                    |
| 与既有工程边界         | ✅ 一致                                                                                                     | 需新增「本地桥」安全设计                                                                        | ❌ 违反「不改浏览器内部数据」（`browser_ext/mod.rs` 模块注释） | ❌ 违反 design.md §5 导出加密红线     |
| 结论                   | **✅ M1/M2**                                                                                                | **◐ M3（进阶选项，需冲突警告 + 覆盖前备份）**                                                   | ❌ 排除                                                        | ❌ 排除                               |

### 3.2 为什么 B 先行、A 进阶（而非反过来）

1. **产品语义**：Bench 的核心定位是多账号**隔离**管理（独立 WebView data dir、账号互不可见是既有红线）。把账号 X 的 cookie 注入用户日常浏览器，会顶掉用户同站点的日常登录态——对「管理多账号」的产品是反向操作。B 方案的隔离 profile 恰好把「每账号独立 data directory」红线延伸到了系统浏览器。
2. **安全边界**：B 的凭据链路全程在 Rust 内存与 loopback CDP 之内；A 必须把会话经本地 HTTP 下发给扩展（明文过 loopback、扩展进程持有凭据、前端需参与编排），边界破坏面显著更大。design.md §5「解密只发生在 Rust 内存」在 A 下需要新增例外条款。
3. **工程与分发**：B 不动扩展（无需权限升级、无需用户重新确认扩展、无需 Web Store）；A 的扩展权限变更在 Chrome 上会触发「扩展已禁用」流程，用户教育成本高。
4. **可演进性**：B 的 CDP 注入器（cookie/storage/UA 对齐）是纯 Rust 模块，M3 的扩展注入器可复用同一份「注入载荷序列化格式」，两条路线不冲突。

### 3.3 用户体验语义说明（需产品确认的一点）

方案 B 打开的是「用户自己的 Chrome/Edge/Brave 应用 + Bench 专属档案」：地址栏、下载、登录的站点都在，但书签/日常扩展/历史不共享。这**不是**用户日常浏览器的既有窗口。对「以账号 X 的身份浏览站点」的用途，隔离档案反而是优势（干净、无污染、多账号并行）；若用户明确希望「合流进日常浏览器」，由 M3 的方案 A 满足（带冲突警告）。**此语义差异需在 UI 弹窗中明确告知，避免「为什么我的书签不见了」类反馈。**

---

## 4. 方案 B 详细设计（M1/M2）

### 4.1 数据流与架构

```text
┌─ 前端（不触碰凭据）────────────────────────────┐
│ DetailColumn 底部操作行「在浏览器打开」按钮      │
│   → useBrowserSession hook（防重入）            │
│   → browser-session.use-cases.ts → repository   │
│   → 类型化 IPC：browser_session_open/status/close│
└───────────────┬─────────────────────────────────┘
                │ 仅 accountId + 浏览器选择，无凭据
┌─ Rust ────────▼─────────────────────────────────┐
│ commands/browser_session.rs                      │
│   1. 互斥检查（登录窗口打开中 → 拒绝）            │
│   2. restore_session() 内存解密 canonical session │
│   3. 浏览器可执行文件定位（cfg 双平台）            │
│   4. profile 目录：$APPCONFIG/browser-sessions/   │
│      <accountId>/（按账号隔离，TTL 联动清理）      │
│   5. spawn: <chrome> --user-data-dir=<profile>    │
│      --no-first-run --remote-debugging-port=0     │
│      --window-size=1280,900 about:blank           │
│   6. 读 <profile>/DevToolsActivePort → port       │
│   7. CDP WS(127.0.0.1:port)：Network.setCookie×N  │
│      （逐条还原 domain/path/secure/httpOnly/      │
│       sameSite/expires；partitioned 跳过+计数）    │
│   8. Runtime.evaluate（M2）：localStorage 恢复脚本 │
│      （复用 browser_storage.rs 恢复脚本，origin 校验│
│       语义不变）                                   │
│   9. Page.navigate(站点 URL) → 返回摘要            │
│   10. 断开 CDP 连接（端口随实例生命周期存在）       │
└──────────────────────────────────────────────────┘
```

关键点：

- **partitioned cookie 沿用 fail-closed 语义**：与 HTTP probe 同规则——取得完整 partition key 语义前不降级注入，跳过并在返回摘要中计数（`skippedPartitioned`）。
- **每次打开全量重注入**（幂等覆盖，不做新鲜度判断）：成本为一次 WS 往返（数百 ms），换取逻辑简单与「keeper 刚刷新过 → 立即可用最新会话」的行为。M2 评估「profile cookie 未过期则跳过注入」的优化。
- **实例复用**：打开前先读 profile 内 `DevToolsActivePort` 并 TCP 探活，可达则复用实例（只重新注入 + 导航，`reusedInstance=true`）；不可达则 fresh 启动。若 fresh 启动因 SingletonLock 竞争立即退出（该 profile 被无调试端口的实例占用），返回结构化错误引导「关闭该账号的浏览器窗口后重试」。
- **UA 对齐（M2）**：`Emulation.setUserAgentOverride` 设为 session.user_agent，避免 UA 突变触发站点风控；M1 不做（cookie 会话对 UA 通常不敏感，但记录为已知风险）。

### 4.2 IPC 契约（双边，`contracts.ts` + `commands.rs` 同步）

| 命令                     | 入参                                                            | 出参                                                                    | 说明                                                |
| ------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| `browser_session_open`   | `accountId`、`browserId?`（缺省用记住的偏好/首个已装 Chromium） | `{ reusedInstance, injectedCookies, skippedPartitioned, navigatedUrl }` | 打开 + 注入 + 导航；错误走 reasonCode               |
| `browser_session_status` | `accountId`                                                     | `{ running, browserId?, port? }`                                        | 实例探活（DevToolsActivePort + TCP）                |
| `browser_session_close`  | `accountId`、`force?`                                           | `{ closed }`                                                            | CDP `Browser.close` 优雅关闭；失败时 force 终止进程 |

DTO 只含计数与枚举，**无任何 cookie 值/URL 以外的会话内容**。`navigatedUrl` 为站点 website URL（非敏感，账号详情本就展示）。

### 4.3 目录与生命周期

- profile 根目录：`$APPCONFIG/browser-sessions/<accountId>/`（沿用既有 app data 布局；注册进 clean-space/DevCleaner 的可见清单，避免「磁盘占用黑洞」——与用户既有的存储治理方向一致）。
- 删除账号时：profile 目录进**逐资源 report**（`browserSessionProfile` 项），partial 失败可重试——对齐 design.md §7 删除语义。
- TTL 联动：`cleanup_expired_sessions` 清理账号会话时同步删除对应 profile 目录（cookie 虽会自然过期，但 profile 内可能残留 storage 快照，按「会话过期 = 浏览态也应清除」处理）；删除失败不阻断会话清理，记日志。

### 4.4 capabilities 矩阵

新增能力项 `browserSessionOpen`，真机验证前 macOS/Windows 均标 `partial`（reason `TARGET_PLATFORM_VALIDATION_PENDING`，与既有项同策略）：

| 场景                                                   | 状态 + reasonCode                                         |
| ------------------------------------------------------ | --------------------------------------------------------- |
| 无已安装 Chromium 系浏览器                             | `failed` / `NO_CHROMIUM_BROWSER`（前端禁用按钮 + 提示）   |
| 企业策略禁用远程调试（`RemoteDebuggingAllowed=false`） | `failed` / `REMOTE_DEBUGGING_BLOCKED`                     |
| 浏览器启动失败 / SingletonLock 冲突                    | `failed` / `BROWSER_INSTANCE_CONFLICT`                    |
| CDP 注入部分失败                                       | 成功返回但带 `skippedPartitioned` 等计数，前端 toast 呈现 |
| Safari / Firefox                                       | 前端选择器中直接不列出（探测结果按内核过滤），文档说明    |

### 4.5 前端落点

- **入口**：`DetailColumn` 底部操作行（设置按钮左侧，与 F2 指纹按钮同区），Globe/Chrome 图标 + tooltip「在浏览器中打开」；账号状态非 Ready 时仍可用（注入的是当前 canonical session，探针未 Ready 时注入后由用户自行判断）。
- **弹窗（首次）**：浏览器选择（`detect_browsers()` 结果，仅 Chromium 系）+ 「将在 Bench 隔离档案中打开，不影响日常浏览器登录态」说明 + 「记住选择」勾选 + 统一 spinner。
- **防重入**：`useGuardedAsync`（对齐 quick login / 指纹采样既有模式）。
- **i18n**：zh/en 全量（含 reasonCode 本地化映射）。

---

## 5. 安全边界与红线对照表（方案 B）

| 风险                                                                                 | 评估                                    | 缓解                                                                                                                                                                                |
| ------------------------------------------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CDP 调试端口窗口期暴露（实例存活期间，本机进程可连 `127.0.0.1:port` 完全控制该实例） | 中——等同用户权限，但半径=单账号 profile | 端口仅 127.0.0.1（Chrome 默认）+ 随机（`port=0`）+ 随实例生命周期存在；注入完成后 Bench 即断开；文档记录该取舍。**不可**在注入后关闭端口（Chrome 不支持运行中关闭），接受为已知限制 |
| 会话明文经过 loopback                                                                | 低——本机 root/同用户进程本可读更多      | 无凭据经 HTTP 明文下发扩展（对比方案 A 的额外暴露）；CDP WS 为本机进程间通信                                                                                                        |
| profile 目录明文 cookie 落盘                                                         | 中——与任何真实浏览器的本地存储同级风险  | 目录位于用户 app data（同账号 WebView data dir 同级保护）；账号删除/TTL 清理时同步删除；M2 评估 FileVault/BitLocker 提示文档                                                        |
| 与登录窗口互斥缺失导致双写会话                                                       | 中                                      | `browser_session_open` 前置 `enforce_exclusivity_before_login` 同源互斥检查；反向：登录窗口打开时若该账号浏览器会话在跑，同样拒绝或先关闭（实现时定，倾向拒绝 + 文案引导）          |
| 恶意站点经打开的窗口窃取其他账号数据                                                 | 低                                      | profile 按账号隔离，窗口内不存在其他账号数据；与「禁止跨账号复用浏览上下文」一致                                                                                                    |
| Windows 平台差异（进程管理/路径/杀软拦截）                                           | 中                                      | 全部平台分支 `#[cfg]` 包裹；`check:be-cfg` 门禁；真机矩阵验证后才把 capability 置 `supported`                                                                                       |

---

## 6. 分期计划

### M1（P0，最小可用）：打开 + cookie 注入 + 导航

| #     | 任务                                                                                                                | 层   | 主要文件                                                             | 规模 |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------- | ---- |
| M1-T1 | CDP 客户端模块（WS 连接、`Network.setCookie`、`Page.navigate`、`Browser.close`、DevToolsActivePort 解析、探活重试） | Rust | 新 `account_manager/browser_session/cdp.rs`                          | L    |
| M1-T2 | `browser_session_open/status/close` 命令 + 互斥检查 + profile 目录管理 + cfg 双平台浏览器定位                       | Rust | 新 `commands/browser_session.rs`、`exclusivity.rs` 复用              | M    |
| M1-T3 | IPC 契约双写 + capabilities 新增 `browserSessionOpen`                                                               | 双端 | `contracts.ts` / `commands.rs` / `capabilities.rs` / `types.rs`      | M    |
| M1-T4 | 前端 hook（防重入）+ DetailColumn 按钮 + 首次选择弹窗 + toast/loading + i18n zh/en                                  | 前端 | `hooks/useBrowserSession.ts` / `DetailColumn.tsx` / 新弹窗 / locales | M    |
| M1-T5 | 测试：CDP 消息序列单测（mock WS）、互斥、目录生命周期、DTO 无凭据断言；`cargo test account_manager` + vitest        | 双端 | `__tests__` / Rust `#[cfg(test)]`                                    | M    |

### M2（体验补全）：storage 注入 + UA 对齐 + 会话同步

- 复用 `browser_storage.rs` 恢复脚本经 `Runtime.evaluate` 注入 localStorage（IndexedDB 视恢复脚本兼容性评估，不承诺）。
- `Emulation.setUserAgentOverride` = session.user_agent。
- profile 免注入优化（cookie 未过期跳过）与「keeper 刷新后自动同步到运行中实例」评估。

### M3（P1，方案 A 进阶）：bench-companion 注入日常浏览器

- 扩展升级：manifest 增 `cookies` / `tabs` / `scripting` + `optional_host_permissions`（`http://127.0.0.1:*/*` + 目标站点）；Bench GUI 起 127.0.0.1 一次性桥（随机端口 + 5 分钟一次性 token + `Origin` 白名单 = 固定扩展 ID + 会话即用即毁，不下发 localStorage 值到 v1 桥）。
- **冲突警告 + 覆盖前备份**：注入前检测日常浏览器同站既有 cookie，提示将被覆盖并提供导出备份。
- 与「浏览器扩展导出」（`browser_ext/` 既有能力）共用安装引导 UI；与插件市场/扩展中心方向协同。

### 远期

- Safari：Safari Web Extension 具备 `browser.cookies` API，但分发需 XPC app + 签名/上架，成本高——单独 RFC 评估。
- Firefox：WebDriver BiDi 路线评估（其 CDP 兼容层已弃用）。
- 多浏览器会话并行管理视图（哪些账号当前在浏览器中打开、一键全部关闭）。

---

## 7. 验收标准（M1）

- [ ] 点击「在浏览器中打开」→ 独立 Chrome/Edge/Brave 窗口打开站点，登录态为该账号（以站内身份元素验证）；日常浏览器同站登录态不受影响。
- [ ] `HttpOnly`/`Secure`/`SameSite`/过期时间还原正确；partitioned cookie 跳过并有计数提示。
- [ ] 同账号二次打开复用实例（`reusedInstance=true`）；不同账号 profile 互不可见；删除账号时 profile 进逐资源 report。
- [ ] 登录窗口打开中触发 → 结构化拒绝 + 文案；无 Chromium 浏览器 → 按钮禁用 + reasonCode 提示。
- [ ] 全链路 DTO/日志无 cookie 值、无明文 session；`pnpm run check:be-cfg` / `clippy -D warnings` / 双端测试全绿。
- [ ] macOS 真机 + Windows Sandbox 验证后 capability 才从 `partial` 升 `supported`（沿用 R04 矩阵流程）。

## 8. 待确认决策点（实现前拍板）

- **D-A**：M3（日常浏览器注入）是否进入 roadmap，还是仅保留 B 路线？（影响扩展权限升级与本地桥设计投入）
- **D-B**：TTL 清理是否同步删除 profile 目录（本文倾向删除）；或提供「保留浏览态、仅清 Bench 会话」选项？
- **D-C**：`browser_session_open` 与登录窗口的互斥方向：浏览器会话在跑时是否允许再开登录窗口？（倾向拒绝 + 引导先关闭）
- **D-D**：浏览器选择是否需要「每次询问」模式（默认记住偏好）？
