# Account Manager（账号管理）产品说明

> 本文件是 account-manager 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。

## 1. 定位

- 主序列桌面功能，入口：路由 `/account-manager`，侧边栏注册（`sidebar.accountManager`），图标 Users。

- `desktopOnly: true`，`platforms: ["macos", "windows"]`（Web 不提供）。

- 用途：集中管理「站点（RelayStation）+ 隔离账号（StationAccount）」——保存凭据、捕获/恢复登录 Session、探测登录状态、外部 App 登录代理、导入导出。

- 核心保证：凭据加密（系统 Keyring 主密钥 + AES-256-GCM）、账号数据目录隔离、Session 恢复后必须 probe 才标记 Ready、危险操作二次确认。

## 2. 主界面布局（三栏）

```
┌──────────────┬───────────────┬──────────────────┐
│ 站点栏(320px) │ 账号栏(弹性)   │ 详情栏(340px)     │
│ 站点列表/工具  │ 账号列表/工具  │ 站点+账号详情/操作 │
└──────────────┴───────────────┴──────────────────┘
顶部：capability 降级/阻断警告条（degraded/blocked 计数，有则显示）
窄屏(<1280px)：详情栏隐藏，选中账号时以 Sheet 弹出；回到宽屏自动收起
```

- 首载：三段式 skeleton（站点/账号/详情）；加载失败显示 `FeatureLoadError`（标题 + 说明 + 重试）。

- 三栏各自有区域错误条 `InlineErrorBar`（message + retry + dismiss），写入失败可登记可重试的区域错误。

## 3. 站点栏（左栏）

- 标题「站点 (N)」+ 工具栏：全部刷新（`refreshAll`）、新增站点。

- 站点卡片：备注（可悬停复制）、网站 URL、右上角账号数徽章；选中高亮；Enter/Space 可选中。

- 卡片操作（hover 显示）：编辑（Pencil）、删除（Trash，进二次确认）。

- 拖拽排序（`SortableList`，左侧拖拽手柄，2 个以上且非排序中可用）；排序防重入（`reorderingStations`）。

- 底部工具：快速登录（LogIn）、外部登录/粘贴登录（Link2，「proxyPaste」）、导入数据（Import）、导出数据（Download）。快速登录/外部登录在对应 capability 不可用时禁用并显示原因 tooltip。

- 空状态：无站点时显示图标 +「无站点」提示，新增站点按钮常驻可点。

- **交互细节**

  - 卡片整卡可点击选中（Enter/Space 同效，`role="button"` + `tabIndex=0`），选中高亮，hover 高亮；右侧账号数徽章常驻。

  - 备注悬停浮现复制按钮，点击复制后短暂显示 ✓（约 1.2s）并 toast；编辑/删除按钮 hover 浮现，点击需 stopPropagation 避免误触选中。

  - 拖拽：左侧拖拽手柄，仅 ≥2 个站点且未排序中可用（否则 disabled）；拖拽中卡片浮起（shadow-xl）；释放后乐观更新，失败回滚并 toast。

  - 底部工具：快速登录/外部登录在对应 capability 不可用时按钮禁用，悬停 tooltip 显示原因；导入/导出进行中图标 animate-pulse 且按钮禁用（防重入）。

## 4. 账号栏（中栏）

- 标题「账号 (N)」+ 工具栏：刷新当前站点（`refreshStation`）、新增账号（需先选中站点）。

- 账号卡片：用户名（可复制）、备注（单行截断）、状态徽章、代理启用标记（Link2 小图标）；操作区：登录按钮、刷新（RefreshCw）、编辑、删除。

- 登录按钮：打开该账号的登录 WebView 窗口（`openLoginWindow`）；若 Tauri 窗口不可用回退 `openExternal(website)`；能力不可用时禁用并提示原因。

- 状态语义（`AccountSessionStatus`）：`ready` 就绪 / `loginRequired` 需登录 / `expired` 过期 / `fetchFailed` 获取失败 / `inactive` 未激活。

- 列表工具（底部）：搜索框（用户名/备注，可清空）、排序按钮（循环 手动→用户名 A-Z→Z-A）、按状态分组开关。

- **分组**：仅当列表 <100 项时可用；按状态分组，组头吸顶（可点击折叠/展开）。

- **虚拟化**：≥100 项自动启用虚拟列表（`VirtualAccountList`），分组/筛选/排序时关闭虚拟化。

- 刷新反馈：单账号/整站/全部刷新中图标旋转；刷新成功的行显示一次 shimmer 扫光；失败保留旧数据（partial 不删失败账号）。

- 空状态：未选站点（「请先选择站点」）/ 无账号（含添加提示）/ 搜索无结果，分图标分文案展示。

- **交互细节**

  - 搜索框：带放大镜图标，输入即过滤（用户名/备注），有内容时右侧显示清除按钮（点击清空）；未选站点或无账号时禁用。

  - 排序按钮：点击循环 手动→用户名 A-Z→Z-A，非手动态按钮高亮；分组开关按状态分组，仅列表 <100 项可用（否则禁用）。

  - 组头吸顶，点击或 Enter/Space 折叠/展开（箭头旋转）；虚拟化 ≥100 项自动启用，分组/筛选/排序时自动关闭（列表在虚拟列表内滚动）。

  - 刷新反馈：单账号/整站/全部刷新中图标旋转；刷新成功的行显示一次 shimmer 扫光（约 1.5s）；失败保留旧数据（partial 不删失败账号）。

  - 登录按钮在窗口打开中（`opening`）或能力不可用时禁用并 tooltip 提示；卡片复制用户名按钮 hover 浮现、复制成功短暂 ✓。

## 5. 详情栏（右栏）

- 标题「详情」+ 操作：打开网站（`openExternal(website)`）。

- 站点信息区（可滚动）：website（可复制）、备注、创建时间；其下为 **AuthProfile 面板**（已检测时）或「未检测」占位（含「立即检测」按钮）。

- AuthProfile 面板：检测时间、置信度（百分比 + 进度条）；维度：📋 cookie、💾 token 存储、🛡 CSRF（含提取源/字段/header tooltip）、🔐 认证类型、👆 指纹级别、🚫 anti-bot、🔗 SSO（如有）；每项状态圆点（绿/黄/红/灰）；当前 probe 策略徽章 + 策略下拉（auto / httpFirst / httpOnly / webviewOnly）；手动覆盖策略时显示琥珀色提示。

- 「重新检测」：`detectStationAuthProfile(stationId, accountId?)`，防重入（`redetectingProfile`）。

- 账号信息区（固定不滚动）：用户名（可复制）、密码（点眼睛 reveal，**30 秒自动隐藏**，有密码时显示 ••••，可复制；加载中禁用）、备注、上次刷新时间、上次登录时间、初次登录时间（`firstLoginAt`，首次探测到 Ready 时回填，历史账号为空隐藏）、Session 到期时间（按 `lastLoginAt + sessionTtlHours` 计算，24 小时内标 near expiry；ttl=0 表示永不过期则隐藏）。

- **会话保活块**（仅 persistent 账号显示，紧凑单行）：开关 + 模式（每 N 小时 / 每天定时）+ 参数（小时数 1..=8760 / 时刻 HH:MM）+ 下次执行时间（`Intl.DateTimeFormat` 本地化）；变更即时保存（saving 期间禁用）+「日志」按钮打开账号日志对话框（见 §16）。ephemeral 账号不显示。

- 底部操作行：代理开关（Switch `proxyEnabled`）、浏览器互通（Globe，见 §17）、管理外部应用（Settings）、刷新当前账号。

## 6. 对话框与弹层

- **新增/编辑站点**：备注 + 网站 + 「Session Manager 高级设置」（勾选覆盖 probe 策略时可选 `probeStrategy`；`sessionTtlHours` 有效期小时数，0=永久，默认 720；`networkProxy` 每站点网络代理 http/socks5，含主机/端口/用户名/密码——密码 `undefined`=保留、空串=清除，`clear` 动作清空）。

- **新增/编辑账号**：用户名、密码（编辑时留空=不改）、备注、启用代理（编辑时）。编辑若密码更新失败会降级保留旧 `hasPassword` 并提示 passwordFailed；代理写入失败提示 proxyFailed。

- **快速登录**：URL（自动补 `https://` 前缀；有历史 datalist 补全）+ **站点自动匹配**（输入防抖 300ms 调 `match_stations_by_url`：精确 host → exact、互为父子域 → registrableDomain；有匹配时预选最高置信度站点，含「新建站点」选项）+ **账号选择**（选中已有站点且该站有账号时：选已有账号或「新账号」；选已有账号 → 提交 `openLoginWindow(accountId, url)` 在该账号隔离环境打开粘贴的 URL，只读展示账号名 + 状态徽章；新账号 → 用户名输入 + 可选「关闭时销毁 Session（destroyOnClose）」+ 附加到所选站点）+ 未匹配时回退原新建流程（附加到当前选中站点）。提交载荷为联合类型 `{kind:"existing"}|{kind:"new"}`。

- **删除确认**：站点/账号删除均为 `DeleteConfirmDialog` 二次确认；删除站点后自动选中剩余第一个站点及其账号。

- **浏览器互通（Browser Interop，见 §17）**：下拉选本机受支持的 Chromium 系浏览器；三条主路径「以该账号身份打开 / 打开站点并手动登录 / 回采登录态」，外加「关闭浏览器」与「清空浏览器数据」（destructive，`DeleteConfirmDialog` 二次确认）。回采遇冲突时弹内联告警区，需二次确认才覆盖。

- **外部应用管理面板**：列出已授权外部 App 及其账号绑定，可吊销授权（`removeExternalApp`）。

- **AuthProxyDialog（外部登录代理）**：展示来源 host、匹配站点候选（exact / sso / manual 置信度）、选择既有账号或「新建账号」；确认后调用 `proxyLogin`/`proxyLoginNewAccount`，后端拉起隔离 WebView 完成登录，命中 return URL 后把原始 callback 交还外部 App。

- **交互细节**

  - 对话框打开时焦点落入首个输入字段，关闭/提交后回落到触发元素（有 dialog-focus 测试覆盖）。

  - 新增/编辑站点：提交前本地校验非空；「Session Manager 高级设置」为折叠区，勾选覆盖 probe 策略时才显示策略下拉。

  - 编辑账号：密码留空=不改；密码写入失败会降级保留旧 `hasPassword` 并 toast（`passwordFailed`），代理写入失败同理（`proxyFailed`）。

  - 快速登录：URL 自动补 `https://` 前缀，输入框带历史 datalist 补全；勾选「关闭时销毁 Session」时，登录窗口关闭会自动删除该 ephemeral 账号。

  - 删除确认：站点/账号删除均 `DeleteConfirmDialog` 二次确认；删除站点后自动选中剩余第一个站点及其账号。

## 7. 外部登录代理（Auth Proxy）

- 入口：自定义协议 `bench-auth://authorize` 与 RFC 8252 loopback 回调；外部 App 或浏览器「用 Bench 打开」。

- 触发后 `handleBrowserOpen(url)` 归一化为 `BrowserOpenResult`（ticket/expiry/target/returnUrl/host/isAuthorize/matches），前端弹选择框；成功后 `proxyLogin(ticketId, accountId)` 启动登录。

- 前端监听 `authProxyPending` 事件（无敏感 URL），再调 `drainAuthProxyRequest` 取队列首条；队列超限（>32）报告 dropped，非法请求计数 rejected 并提示。

- 只允许 `proxy_enabled` 账号参与匹配；站点匹配优先级：精确 host → eTLD+1 → 已知 SSO provider。

## 8. 数据导入 / 导出

- 导出：原生保存对话框（默认 `relay-data-export.json`）→ `exportRelayData`，默认 **sanitized** 模式（不含明文凭据）。

- 导入：原生打开对话框（JSON）→ `importRelayData`，返回结果供选择保持/切换选中；覆盖导入为危险操作需二次确认（前端路径）。

- 后端拒绝恢复 `encryptedFull` 导出（见远期规划）。

- **交互细节**

  - 导出：保存对话框默认 `relay-data-export.json`（JSON 过滤）；导出中按钮禁用（图标 animate-pulse），成功 toast 带站点/账号计数。

  - 导入：打开对话框选择 JSON；导入中禁用；覆盖导入为危险操作需二次确认（前端路径）；成功后按导入结果保持/切换选中并清空区域错误。

## 9. capability（平台能力）体系

- 后端 `get_account_manager_capabilities` 为唯一真理源，逐项返回 `supported / partial / unsupported / failed + reasonCode`：`platform`、`credentialStore`、`isolatedWebview`、`cookieSession`、`webStorage`、`indexedDb`、`networkProxy`、`deepLink`、`browserSessionOpen`、`browserSessionCapture`。

- 前端允许 `supported/partial`，对 `unsupported/failed` 禁用对应操作并显示原因（reasonCode → i18n）。

- 登录依赖 `isolatedWebview`；外部登录依赖 `isolatedWebview` + `deepLink`；网络代理依赖 `networkProxy`；浏览器互通（出向 `browserSessionOpen` / 入向 `browserSessionCapture`）依赖 `credentialStore`（会话加解密）+ 本机存在受支持的 Chromium 系浏览器，任一不满足即 `failed` 并被详情栏入口引用为禁用原因。

- 顶部警告条：`X 项受限 / Y 项不可用` 汇总。

## 10. 异常处理

- 错误统一经 `parseCommandError` / `translateError` 归一化：`INVALID_INPUT` 走输入级 toast，其余系统错误写入对应区域错误条（站点/账号/详情，`InlineErrorBar`：message + retry + dismiss），支持区域级重试。

| 错误码                                          | 触发场景                                                                                   | 前端行为/提示                                                                            | 恢复/降级                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `INVALID_INPUT`                                 | 空字段 / 非法网站 / 重复用户名 / 排序 ids 不匹配 / 代理密码超限 / 非法导入文件             | 输入级 toast（如「用户名已存在」「排序不匹配」「导入失败」）                             | 修正输入后重试                                                                    |
| `NOT_FOUND`                                     | 站点/账号不存在（并发删除等）                                                              | 区域错误条                                                                               | 重试 = 重新拉取列表                                                               |
| `STORE_FAIL`                                    | 加密 store 落盘/读取失败                                                                   | 区域错误条                                                                               | 重试写入                                                                          |
| `KEYRING_UNAVAILABLE` / `CRYPTO_FAIL`           | Keyring 主密钥不可用 / 加解密失败                                                          | capability 面板对应项 `failed`，相关操作禁用并显示原因                                   | 提示重新初始化 Keyring                                                            |
| `CLIPBOARD_FAIL`                                | 复制到剪贴板失败                                                                           | toast「复制失败」                                                                        | 手动复制                                                                          |
| `PARTIAL_REFRESH`（前端合成）                   | 整站/全部刷新部分账号失败                                                                  | 成功行 shimmer + toast 成功数；失败数 >0 写「部分刷新失败 (failed/total)」账号区域错误条 | 区域级重试（整站刷新）                                                            |
| 删除 partial（`DeletionReport.status=partial`） | webviewData 目录删除失败                                                                   | toast.warning「清理不完整 (N 项失败)」，保留 metadata 与资源 owner                       | 可重试删除；**不得先删 metadata 再丢资源 owner**                                  |
| 探针结果                                        | Ready / LoginRequired / Expired / Uncertain / AntiBotBlocked / SsoChallenge / NetworkError | 仅 Uncertain 升级探针；失败不静默                                                        | 同账号 single-flight；单请求 4s、HTTP 总预算 10s、最多 3 次，408/429/5xx 指数退避 |
| 网络代理不支持（Windows）                       | 后端 `fail-closed` 拒绝非空代理配置（`INVALID_INPUT`）                                     | 前端禁用代理输入并提示                                                                   | 已有配置可清除                                                                    |
| schema 不兼容                                   | 加密 store 版本超前                                                                        | fail-closed，不加载                                                                      | 需升级                                                                            |

- **并发/幂等**：排序防重入（`reorderingStations` / `reorderingAccounts`，进行中禁拖）；刷新按账号/站点 `useGuardedAsyncSet` single-flight；导入/导出 `importingData` / `exportingData` 防重入；Auth Proxy 队列 drain 有 `drainInFlightRef` 防重入，队列超限（>32）报告 dropped、非法请求计数 rejected 并提示。

- **失败不静默**：所有区域错误条可重试或 dismiss；快速登录/外部登录失败 toast；代理握手失败 toast。

- **数据安全**：明文密码/token/Cookie 只在 Rust 内存与目标账号 WebView 短时存在，不得进入前端 store/事件/日志；HttpOnly cookie 只能经 WebView 原生 cookie API 获取。

## 11. 技术实现要点

- **架构分层**：page → `useAccountManagerController`（组合子 hook）→ `account-manager.use-cases` → `account-manager.repository` → 类型化 IPC（`src/lib/tauri/commands/account-manager.ts`、`contracts.ts`）。

- **控制器拆分**：`useStationActions`（站点 CRUD/重排序/重检测/probe 策略）、`useAccountActions`（账号 CRUD/快速登录[新/已有账号两种提交]/密码/代理）、`useRefreshOrchestrator`（刷新编排/防重入）、`useDataPorting`（导入导出）、`useAuthProxy`（代理）、`useQuickLoginHistory`、`useSessionKeeper`（保活计划保存/账号日志加载/URL 站点匹配）。

- **后端模块** `src-tauri/src/account_manager/`：`types.rs`（领域类型）、`state.rs`/`storage.rs`（串行状态与落盘）、`crypto.rs`（Keyring 主密钥 + AES-256-GCM 每写独立 nonce）、`session.rs`（Session 捕获/恢复/TTL/退出持久化,`capture_session_from_window` 公共捕获）、`detection.rs`/`probe.rs`（认证检测与分层探针）、`exclusivity.rs`（coexisting/exclusive/rotating 互斥）、`webview.rs`/`proxy/`（隔离 WebView + 登录代理 + token 提取/自动填充）、`session_keeper.rs`（会话保活调度器,见 §15）、`session_arbitration.rs`（会话新鲜度仲裁,见 §17）、`browser_session/`（互通 I1/I2：`browser.rs` 浏览器探测、`cdp.rs` CDP 客户端、`profile.rs` 实例与 profile 生命周期、`mod.rs` 编排,见 §17）、`deep_link.rs`、`browser_storage.rs`、`network_proxy.rs`。

- **IPC 命令**：capabilities / listStations / create/update/deleteStation / listAllAccounts / create/update/deleteAccount / createEphemeralAccount / revealPassword / setPassword / copyPasswordToClipboard / openLoginWindow（可选 `url` 显式目标） / refreshAccount / refreshStation / refreshAll / reorderStations / reorderAccounts / detectStationAuthProfile / setProbeStrategy / resetProbeStrategy / setSessionTtl / setStationNetworkProxy / setAccountProxyEnabled / setAccountRefreshSchedule / listAccountLogs / matchStationsByUrl / exportRelayData / importRelayData / proxyLogin / proxyLoginNewAccount / handleBrowserOpen / getAuthProxyInboxStatus / drainAuthProxyRequest / listExternalApps / removeExternalApp / listExternalAppBindings / browserSessionBrowsers / browserSessionOpen / browserSessionStatus / browserSessionClose / browserSessionCapture / browserSessionProbe / browserSessionClearProfile。

- **持久化**：加密 store 落盘（`AccountManagerSnapshot`，schema v5 起 `sessions` 为唯一 Session 真理源）；写入由 `AccountManagerState` 串行 + 显式 flush；Keyring 首建与 store mutation 使用跨进程文件锁，锁内 reload 磁盘 canonical snapshot 后再 save/replace（防 last-write-wins）。

- **Session 生命周期**：启动→读加密 store→恢复 persistent sessions→probe→UI 就绪；登录成功→捕获 Session→加密→flush；退出→捕获 Ready sessions→清理 ephemeral→flush。

- **分层探针**：L1 HTTP（低成本）→ L2 WebView（HTTP 不确定/JS challenge/anti-bot）→ L3 Hybrid（SSO/复杂重定向）。结果区分 Ready/LoginRequired/Expired/Uncertain/AntiBotBlocked/SsoChallenge/NetworkError；只有 Uncertain 才升级探针。

- **并发/网络预算**：全局 semaphore；同账号 single-flight（leader-follower）；单请求 4s、HTTP 总预算 10s、最多 3 次；只重试 408/429/500/502/503/504 与 connect/timeout，200ms 基数 2s 上限 full-jitter 指数退避；`Retry-After` ≤2s 时服从服务端。

- **Web Storage/IndexedDB 边界**：单 origin 捕获仅限 Station website 精确 origin（scheme+host+port 比对）；Web Storage ≤512 key/2 MiB；IndexedDB ≤32 database/128 store/10000 record/8 MiB；桥接总量 12 MiB、捕获/恢复各 10s；Blob/CryptoKey/循环引用返回受限/失败；schema 不兼容 fail-closed。

- **i18n**：zh/en 双语；所有失败/空态/过期/降级均有文案。

- **性能**：账号列表 ≥100 虚拟化；首载骨架屏。

## 12. 数据模型（关键类型）

- `RelayStation`：id / remark / website / createdAt / loginDetection / exclusivityMode? / authProfile? / probeFailureCount? / sessionTtlHours?（0=永久，默认 720）/ networkProxy?。

- `StationAccount`：id / stationId / username / notes / phone / tgAccount / linkedAccount / inviteLink / loginMethods / status / lastLoginAt / lastRefreshedAt / createdAt / hasPassword / accountType?(persistent|ephemeral) / website? / session? / exclusivityGroup? / proxyEnabled? / externalAppIds? / refreshSchedule?(`{enabled, mode: {type:"interval", hours}|{type:"daily", minuteOfDay}}`,None=未配置) / nextRefreshAtTs?(UTC Unix 秒) / firstLoginAt?(首次探测到 Ready 的时间)。

- `AuthProfile`：cookieBased / tokenStorage(cookie|localStorage|sessionStorage|indexedDB|multiple|none) / csrfProtection / csrfExtraction / authType(sessionCookie|bearerOAuth|saml|openIdConnect|webSocket|unknown) / fingerprinting(none|basic|strict) / antiBot / antiBotProvider / ssoProvider / probeStrategy(httpFirst|httpOnly|webviewOnly|hybrid) / detectedAt / confidence。

- `NetworkProxyConfig`：proxyType(http|socks5) / host / port / username? / encryptedPassword?(opaque，前端不解密)。

- `SessionSettings`（前端模型）：probeOverride / probeStrategy / sessionTtlHours / networkProxy / networkProxyPassword(undefined=保留, ""=清除)。

- `AccountManagerCapabilities`：platform + 9 项 capability（status + reasonCode）。

- `SessionOrigin`（互通 I0）：`unknown | webviewLogin | webviewKeeper | authProxy | browserCdp | browserExtension | import`；`StationAccount.sessionOrigin?` 记录当前会话由哪个端点采集、`originDetail?` 记录补充标识（浏览器 id 等，不含凭据）。`AccountSession` 同名字段持久化在加密 store 内。

- `BrowserOptionDto`：id / name（**不含本机路径**）。`BrowserOpenOutcome`：browserId / reusedInstance / injectedCookies / skippedPartitioned / rejectedCookies / sessionInjected / hasStoredSession / storageOrigins。`BrowserStatusOutcome`：running / browserId? / port?。`BrowserCaptureOutcome`：outcome(`saved|conflict|empty`) / cookieCount / skippedPartitioned / storageOrigins / indexedDbStatus / capturedAtTs / existingCapturedAtTs? / existingOrigin? / verified?。`BrowserProbeOutcome`：running / cookieCount / fingerprintHits? / fingerprintTotal?。

- 错误码：NOT\_FOUND / INVALID\_INPUT / STORE\_FAIL / KEYRING\_UNAVAILABLE / CRYPTO\_FAIL / CLIPBOARD\_FAIL。

- 删除结果 `DeletionReport`：逐资源（webviewData/metadata）标记 succeeded/failed，status complete/partial。

- `ExternalApp`：id/name/urlScheme/returnHosts/firstUsedAt/lastUsedAt/useCount；`ExternalAppBinding`：appId↔accountId 绑定。

## 13. 边界与限制

- **平台**：macOS + Windows；Windows 的 `networkProxy` 恒为 `unsupported`（上游 WebView2/Tauri 未提供等价能力前），后端同样拒绝非空代理配置（fail-closed，不直连、不打开共享浏览器），已有配置可清除。

- **安全红线**：明文密码/token/Cookie 只在 Rust 内存与目标账号 WebView 中短时存在，不得进入前端 store/事件/日志；HttpOnly cookie 只能经 WebView 原生 cookie API 获取；partitioned Cookie 不进入 HTTP probe。

- **capability 纪律**：不得依据 `navigator.platform` 或编译成功自行提升能力；只有平台相关真机用例通过后才可把 `partial` 提升为 `supported`。

- **危险操作**：删除站点/账号、吊销代理/外部 App、覆盖导入均二次确认；删除返回逐资源 report，目录占用等 partial 结果保留可重试信息，不得先删 metadata 再丢资源 owner。

- **输入校验**：代理密码更新只接受 keep/set/clear 窄 DTO，renderer 不回传完整读取 DTO。

- **浏览器互通**：仅支持 Chromium 系（Chrome / Edge / Brave / Chromium），不支持 Arc / Safari / Firefox；CDP WebSocket 地址必须经 loopback 校验（非回环一律拒绝）；互通命令只接受 `accountId` 与布尔/枚举，**站点地址由后端从 RelayStation 读取，renderer 不传 URL**；返回 DTO 只含计数与枚举，绝不含 cookie 值 / storage 值 / 明文会话。

- **互斥纪律**：一个账号同一时刻只允许一个托管浏览器实例（按账号隔离 profile 目录）；互通不改变 exclusivity 语义——同一账号的 WebView 与浏览器实例可并存，但写 S1（加密 store）仍由后端串行化。

- **探针**：禁自动 redirect；只接受无嵌入凭据的 http/https URL；本机开发站点允许 loopback HTTP。

- 未实现：可移植加密导出（passphrase+KDF+AEAD）——后端继续拒绝 `encryptedFull`（见规划文档）。

## 14. 交互 / 状态 / 键盘 / 并发补充（第二轮）

### 逐控件交互（未覆盖项）

- 详情行可复制值（website/username/password）：整值可点击复制 + hover 下划线提示，成功 toast「复制成功」；密码复制独立走 `copyPassword`，失败 toast `copyPasswordFailed`。

- 密码 reveal：无密码时眼睛可切换 hidden 态但不显示任何值（显示 "—"）；有密码时 `revealPassword` 失败 toast `revealPasswordFailed`；reveal 加载中眼睛禁用；已 reveal 后再点眼睛直接隐藏（不重新拉取）。

- 站点表单 Session TTL：`type="number" min=0`，非法/负数输入即时钳制到 0。

- 账号搜索为**大小写不敏感**匹配 username/notes（trim 后），实时过滤；搜索无结果空态图标为放大镜。

- AuthProfile 面板 `stationProbeFailureCount > 0` 时显示「探针成功率：无数据」小字提示（其余时间不显示成功率行）。

### AuthProxy 对话框（三步向导）逐控件

- ①粘贴 URL → ②选择站点/账号 → ③确认，顶部步骤指示器（当前步高亮，已完成步浅色）。

- 步骤 1：URL 前缀须为 `bench-auth://` / `http://` / `https://`，非法则内联 `role="alert"` 错误且不前进；**Enter 可触发解析**；解析中「下一步」转圈禁用（防重入）；解析/确认中**对话框不可关闭**（Esc/外点/关闭按钮被守卫）。

- 步骤 2：站点下拉除后端匹配（exact/sso/manual 置信度）外，**还列出全部已知站点**（manual 置信度）供手动任选；仅一个匹配或仅一个站点时自动预选；站点列表加载失败内联错误 + 重载按钮（转圈）。

- 步骤 3：展示 target host、return URL（截断 60 字符）、站点、账号 + 状态徽章；「打开返回 URL」按钮调 `openExternal`（失败仅 console.warn，静默）。

- 站点/账号预加载在对话框打开时进行，`cancelled` 标记防卸载后 setState。

### 状态与边界补充

- 快速登录历史：localStorage `account-manager.quick-login.history.v1`，**最多 5 条、按最近使用去重**，localStorage 不可用时静默忽略。

- Session 到期时间行：`lastLoginAt` 缺失、`sessionTtlHours=0`（永久）、或\*\*已过期（到期 ≤ 当前时刻）\*\*时均隐藏；仅未来 24h 内显示 near expiry（现有 §5 未提「已过期隐藏」）。

- 详情栏窄屏 Sheet：选中账号且窗口 <1280px 自动弹出详情 Sheet（`sr-only` 标题 + 描述供读屏），回到宽屏自动收起（matchMedia change 监听，cleanup 正确）。

- 首载骨架 `aria-busy` + `aria-label=加载中`；账号虚拟列表估计行高 112px、overscan 6（`@tanstack/react-virtual`）。

## 15. 会话保活（Session Keeper）

- **定位**：软件运行期间按每账号计划**静默刷新**已保存的登录状态——在隐藏 WebView 中重新加载站点页面（等价于网页刷新），探测登录态，Ready 则重新捕获 session 并加密落盘，实现保活；不弹任何 UI。

- **计划模型**：`RefreshSchedule{enabled, mode}`；mode 为 `Interval{hours}`（1..=8760，每隔 N 小时）或 `Daily{minuteOfDay}`（0..=1439，每天固定本地时刻）。仅 persistent 账号可设置（ephemeral 拒绝 INVALID_INPUT）；`enabled=false` 保留配置暂停调度并清空 next；`schedule=null` 清除。

- **调度器**（`session_keeper.rs`，lib.rs setup 时 spawn）：30s tick + `MissedTickBehavior::Skip`；**首个 tick 立即触发 = 启动补跑一次错过的计划**（执行后从 now 起算 next，不堆积补偿）。扫描条件：persistent + enabled + `nextRefreshAtTs <= now`，到期账号串行执行。

- **静默刷新流程**：probe flight（同账号与手动刷新 single-flight 互斥；手动刷新进行中时 keeper 作为 follower 等待并记 skip 日志）→ `probe_semaphore`（全局并发 2）→ 隐藏 WebView（`relay-keeper-{accountId}` label，独立 data dir + `data_store_identifier`，复用 probe 的 `init_script`/`eval_text`/restore 脚本模式）→ 注入 session → 导航 station.website → 5s 等加载 → 8s/500ms 轮询文本判定登录态 → **Ready**：`capture_session_from_window` 重新捕获（IndexedDB 站点 fail-closed）→ 加密写入 sessions + 更新 status/lastRefreshedAt + `firstLoginAt` 回填；**LoginRequired**：状态标记（warn 日志）；**捕获失败**：旧加密 session 原样保留，仅标 FetchFailed——静默刷新永不降级现有凭证。

- **next 计算**（`compute_next_run`，泛化 TimeZone 可单测）：Interval = `now + hours*3600`（饱和）；Daily = 本地时区下一个 minuteOfDay（今天已过则次日；DST gap 兜底 now+1h，Ambiguous 取 earliest）。存 UTC ts，展示本地时区。

- **跳过边界**（记 warn 日志 + 照常推进 next）：登录窗口打开中（`loginWindowOpen`）；Windows 上站点配置网络代理（`proxyUnsupported`，fail-closed 与 probe 一致）；非持久账号/站点缺失（防御性）。

- **收尾合并落盘**：执行结果应用 + 状态跃迁日志 + autoRefresh 日志 + next 推进合并为一次 `with_state_mut`（避免写盘放大）；失败不静默——全部落入账号日志。

- **UI 入口**：详情栏「会话保活」块（§5）；设置命令 `setAccountRefreshSchedule(accountId, schedule|null)` 防重入（useGuardedAsyncSet）。

## 16. 账号日志

- **定位**：每账号独立日志，记录登录、手动/自动刷新、计划变更、状态跃迁与错误；用户通过详情栏「日志」按钮或保活块入口查看执行情况与下次计划执行时间。

- **数据模型**：`AccountLogEntry{id, at(本地时间标签), atTs(UTC 秒), kind, level, detail}`；kind = login / manualRefresh / autoRefresh / scheduleChanged / statusChanged / error；level = info / success / warn / error；detail 仅含结构化枚举/数值（status、errorCode、durationMs、skipReason、enabled+mode 摘要、from/to、verified）。

- **存储**：加密 store `AccountManagerSnapshot.account_logs`（HashMap<accountId, VecDeque>）；**每账号环形上限 100 条**（超出裁掉最旧）；账号删除/站点删除/ephemeral 退出时同步清理；schema v5 向后兼容（旧 store 无 key → 空 map）。

- **写入点**：`open_login_window` 成功（login/info）；代理登录完成（login/success·warn·error，含 verified）；手动刷新 `refresh_one_leader` 落盘闭包（manualRefresh，含 status/durationMs/strategy，与状态更新同次写盘）；Session Keeper 收尾（autoRefresh success/warn/error，与 next 推进同次写盘）；计划变更（scheduleChanged）；Ready↔非 Ready 状态跃迁（statusChanged，from/to）。

- **敏感信息红线**：detail 禁止记录 URL 原文（query 可能含 token）、cookie、用户名、密码；只有枚举字符串与数值。

- **UI**（`account-log-dialog`）：头部 = 账号名 + 当前计划摘要（interval/daily/已暂停）+ 下次执行时间（`Intl.DateTimeFormat` 本地化）+ 刷新按钮（loading 旋转）；时间线倒序（最新在前）= kind 图标（Login→UserRound、ManualRefresh→RefreshCw、AutoRefresh→Timer、ScheduleChanged→CalendarClock、StatusChanged→Activity、Error→AlertTriangle）+ level 色点（slate/emerald/amber/red）+ 本地时间 + kind 标签 + detail 次要行（状态/错误码/跳过原因/耗时，i18n 渲染）；≤100 条直接渲染不虚拟化；空态/骨架×5/错误条（InlineErrorBar 重试）齐全。读取命令 `listAccountLogs(accountId)` 纯内存读不落盘。

## 17. 浏览器互通（Browser Interop）

- **定位**：把浏览器变成 Session 的**第二个端点**——出向（I1）把 Bench 里保存的账号会话注入真实的 Chromium 浏览器，让「用该账号打开站点」在浏览器里直接是登录态；入向（I2）把用户在浏览器里登录好的会话回采进 Bench。规划全文见 `../../explanation/browser-session-interop-plan.md`。

- **三态模型**：S1 加密 store（canonical 会话，唯一真理源）/ S2 隔离 WebView data dir（登录窗口、keeper）/ S3 托管浏览器 profile。互通只搬 S1↔S3，S2 不参与；任何写入 S1 的动作都必须经过 §17 的仲裁。

- **浏览器范围**：仅 Chromium 系（Google Chrome / Microsoft Edge / Brave / Chromium），按平台内置候选路径探测（macOS `/Applications`、Windows `Program Files` 系）。**不含 Arc / Safari / Firefox**（前二者无 CDP，Safari 需私有协议且合规风险高）。探测结果以 `BrowserOptionDto{id,name}` 下发，**本机路径不出后端**。

- **实例与 profile 隔离**：每账号一个独立 `userDataDir`（`sessions_root/<sanitized accountId>/profile`，accountId 经白名单化防路径穿越），以 `--remote-debugging-port=0` 启动由 Chromium 自行选端口，端口从 profile 内 `DevToolsActivePort` 读取；同一账号同时只允许一个实例，进程表按账号跟踪，`browser_session_close` / 应用退出时回收。

- **CDP 通道**：`tokio-tungstenite` 直连浏览器 WebSocket（`ws://127.0.0.1:<port>/devtools/browser/...`）。连接前必须通过 loopback 校验——**非回环地址一律拒绝**，避免把会话推给远端调试端口。命令带 `id` 关联应答，读取线程负责派发与断线唤醒（断线唤醒所有等待者，避免命令悬挂到超时）。

- **I1 出向（`browser_session_open`）**：
  - `injectSession=true`：`Network.setCookie` 逐条注入（`sameSite` 归一化为 CDP 大小写；partitioned cookie 跳过并计数；被浏览器拒绝（属性不合法）计入 `rejectedCookies`）→ 以 `Page.addScriptToEvaluateOnNewDocument` 注册 **`browser_storage` 的同一份 storage 恢复脚本**（在页面脚本之前运行，等价 WebView 的 `initialization_script`；导航完成后立即注销该注册，避免复用实例上累积）→ 按「同引擎」规则决定是否覆盖 UA（见下）→ 导航到站点 origin。
  - **UA 覆盖规则（同引擎才覆盖）**：Bench 登录窗口在 macOS 上是 WKWebView（Safari 系 UA），托管浏览器是 Chromium 系。跨引擎覆盖等于把 Chrome 伪装成 Safari，站点若对 UA 绑定/分流会把请求判为新客户端而**丢掉会话**。因此仅在「会话来源为 `browserCdp` 且 UA 是 Chromium 系（含 `chrome/`/`chromium/`/`edg/`）」时覆盖，其余一律保留浏览器原生 UA。
  - **存储恢复是必备环节**：只注 cookie 无法覆盖 token 存 localStorage / IndexedDB 的 SPA 站点，注入会形同虚设。
  - **已知时序边界**：Web Storage 部分同步完成；IndexedDB 恢复为异步，页面可能先于其就绪 —— 依赖 IndexedDB 首屏即刻读写的站点可能有竞态，需真机验收确认影响面。
  - **`hasStoredSession = false` 时不得视为成功**：该账号连 Bench 内置登录档案里也没有登录态，注入为空转；`injectedCookies === 0` 且 `hasStoredSession === true` 时需把 `skippedPartitioned` / `rejectedCookies` 暴露给用户，避免静默失败。前端据此分三档提示（无会话 → warning 引导先登录；有会话但 0 条注入 → error 报跳过/拒绝数；正常 → success 报注入与存储份数），并在弹窗内展示「上次打开结果」。
  - **出向前自动补采（`webview_sync`，2026-09-10 修根因）**：Bench 内置登录窗口里手动完成的登录历史上**从不落 canonical store**——登录态只留在账号专属 WebView 档案（`relay-accounts/<accountId>`）里，probe/keeper 读档案判 Ready，出向注入却报「无会话」，形成「状态 Ready 但无会话」的长期错位（2026-09-10 实测 18 账号 16 个如此）。现在 `inject_session=true` 时，**S1 为空或会话已陈旧（采集时间距今 ≥ 30 分钟，`SESSION_STALE_SECS`）都会触发补采**——陈旧阈值必要：实测 trae 的 0627 在 S1 里躺着一份 CDP 回采的残缺会话（仅 4 条风控/缓存 cookie、无登录凭证），而账号 status 依据 S2 始终是 Ready；出向同步的语义是「把账号当前登录态搬出去」，因此先对齐再注入。补采流程：加载该账号的 WebView 档案（登录窗口开着则直接复用，否则建隐藏窗口 `relay-sync-{accountId}`）→ 与 keeper 同一套证据链判定登录态（指纹全缺失确定性短路；无结论判 FetchFailed，**不**退化为「cookie 非空」以免固化匿名会话）→ Ready 才捕获 → **过仲裁**（不存在静默覆盖）→ 加密写入 S1（`sessionOrigin=webviewLogin`）并同步账号状态。DTO 以 `sessionRecovered=true` 标明本次会话来自补采，前端报「已同步」而非「无会话」；补采失败原因经 `recoveryReason`（`notLoggedIn` / `noSessionData` / `syncFailed` / `conflict`）直达提示文案。
  - **bench-host 版本纪律（2026-09-10）**：dev 工作流中 `tauri dev` 只构建主 crate，`target/debug/bench-host` 只在手动 `cargo build` 时更新——出现过扩展报 `UNKNOWN_COMMAND: browser_bridge_descriptor`（NM wrapper 指向 D-029 之前构建的旧二进制）。现 `beforeDevCommand` 前置 `build:bench-host:dev`（`cargo build -p bench-host`，cargo 增量无变化时近零开销）；打包链路维持 `build:bench-host`（含 up-to-date 检查）不变。
  - `injectSession=false`：只打开站点，供用户在真实浏览器内完成扫码 / 2FA / SSO，之后再走 I2 回采。

- **I2 入向（`browser_session_capture`）**：确保页面停在站点 origin（否则先导航并等待首屏结算）→ 复用 WebView 侧同一套捕获脚本与上限（Web Storage ≤512 key/2 MiB、IndexedDB ≤32 db/128 store/10000 record/8 MiB、桥接总量 12 MiB、超时 10s）→ 组装 `AccountSession` → **仲裁** → 写入 S1 并标 `sessionOrigin=browserCdp`、`originDetail=<browserId>` → 按站点探针复验（`verified`）。

- **新鲜度仲裁（`session_arbitration.rs`，I0 地基）**：把「谁能写 S1」收敛为一个可单测的纯函数。`force=false` 时，若 Bench 已有会话**不早于**本次回采时间戳 → 返回 `Conflict{existingCapturedAtTs, existingOrigin}` 且**不写入**，由前端二次确认；用户确认后以 `force=true` 重试才覆盖。Bench 无会话、或已有会话更旧、或无法判断新鲜度 → `Accept`（错过更新比拒绝更新更糟）。时间基准优先 `capturedAtTs`（UTC 秒），缺失时回退解析 `capturedAt` 字符串。**不存在静默覆盖更新鲜会话的路径。**

- **只读预检（`browser_session_probe`）**：不写入任何数据，只报告浏览器中是否已有站点登录态（`cookieCount` + 站点指纹命中数）。供「先探后采」与状态展示。UI 入口为弹窗内的「检测登录态」按钮，结果就地展示（实例未运行 / 无登录态 / 已发现 N 条 Cookie），不依赖 toast。

- **清空 profile（`browser_session_clear_profile`）**：先关闭实例再删 profile 目录。**自 2026-09-10 起 UI 不再暴露该入口**：账号档案本就是隔离目录、删账号时会整体清理，单按钮收益低于认知成本；站点级「只清当前站点」是另一件事（将来走 CDP `Storage.clearDataForOrigin`）。命令本身保留为后端能力。

- **页面选择策略（`pick_page_target`，2026-09-10 修）**：CDP 附加页面时按「**已在目标 origin 的页面** → `about:` 空白页 → 任意已存在页面」的优先级复用，**只有一页都没有时才新建**。两条必须守住的语义：
  1. **只读操作不得新建标签页、不得导航**。历史缺陷：`attach_page` 只认 `about:` 页面，而实时预览每 2s 轮询一次 → 首次导航后每轮都新建一个标签页并被导航到站点，实测堆积 46 个（`Sessions/Tabs_*` 取证）。
  2. **只读预览不得把用户页面导航走**（`collect_from_instance(allow_navigate = false)`）。为读 storage 而导航会打断用户正在进行的扫码/风控流程；页面不在目标 origin 时 storage 采集本就返回空，跳过导航只是少读一项，不会读到别的站点。

- **前端编排（`useBrowserInterop`）**：打开弹窗即拉浏览器列表 + 实例状态；`busy` 由 **ref 同步守卫**（同 tick 重复点击也拦得住）+ state 驱动 UI 禁用双轨实现；冲突结果留在 hook 内交给弹窗决策，不直接 toast 成功。回采成功（`saved`）后触发列表刷新（读后写），`empty` 只提示不刷新。

- **出向目标二选一（2026-09-10）**：弹窗以「同步到」下拉显式区分两个端点——
  1. **Bench 隔离实例**（默认）：本节所述 CDP 通道，点一次即可用；
  2. **日常浏览器（需扩展）**：`browser_session_sync_daily`——浏览器安全模型不允许 Bench 直接写日常 profile 的 Cookie（远程调试被 Chrome 封禁、Cookie SQLite 受 app-bound encryption 保护、命令行加载扩展自 Chrome 137 起移除），Bench 也无法主动给扩展下指令（扩展是连接发起方）。因此该命令只做两件事：确保 S1 会话就绪（必要时档案补采）+ 在所选浏览器的**日常实例**（不带 `user-data-dir`）里打开站点；真正写入由 Bench Companion 扩展在用户点击后完成。UI 上必须向用户交代这一步需要扩展，避免被理解为「一键写入失败」。

- **命令与门控**：`browser_session_browsers / open / sync_daily / status / close / capture / probe / clear_profile` 八个命令只接受 `accountId` 与布尔/枚举，**不接受 URL、路径或凭据**。capability `browserSessionOpen` / `browserSessionCapture` 任一不可用时，详情栏入口禁用并以 tooltip 说明原因（reasonCode → i18n）。

- **扩展通道（I3 读 / I5 写，2026-09-10 落地）**：浏览器端点分两类，**语义必须在 UI 上区分**：
  | 端点             | 由谁启动                                   | 通道                             | 隔离性 | 登录态来源           |
  | ---------------- | ------------------------------------------ | -------------------------------- | ------ | -------------------- |
  | **A 隔离实例**   | Bench（每账号/每站点专属 `user-data-dir`） | CDP                              | 强     | Bench 里该账号的会话 |
  | **B 日常浏览器** | 用户自己                                   | 扩展 + Native Messaging + 本地桥 | 弱     | 用户日常的登录态     |
  - **产品语义**：采样的价值在于**读取日常浏览器里已经登录好的登录态**。若仍需在隔离窗口里重新登录一次，则与「新增账号 + 在新实例里登录」没有区别，采样入口失去意义。
  - **为什么必须用扩展**：Chrome 136+ 对**默认** profile 禁用 `--remote-debugging-port`（CDP 不通）；直读 Cookies SQLite 被 macOS Keychain Safe Storage 与 app-bound encryption 挡住；外部进程无法唤醒扩展（NM 拉起的是 host 进程）。三条共同把「扩展 + 本地桥」定为唯一形态。
  - **数据面**：app 起 `127.0.0.1:0` 本地桥，每次启动重新生成一次性 token（`0600` 描述文件），并校验 `Origin` = 固定扩展 ID。**控制面**（下发端口与 token）经 Native Messaging，由 NM manifest 的 `allowed_origins` 保证只有该扩展能取到。明文会话只经「浏览器进程 → loopback → Rust 内存 → 加密 store」，**不经过 bench-host 进程**。
  - **交互模型**：扩展**主动发起**（popup 内的用户手势），Bench 侧只提供引导与状态。读：在目标站点上点扩展图标 →「保存此站点登录态到 Bench」；写：「用 Bench 账号登录此站点」（**默认不勾选、写入前把该站点现有 Cookie 备份进 `chrome.storage.local`、可一键回滚**）。
  - **落库纪律与 CDP 通道完全一致**：复用同一 `finalize_capture`（新鲜度仲裁 → 互斥 → 加密 → probe 验证），`sessionOrigin = browserExtension`。**不存在第二条静默覆盖路径。**
  - **能力边界（D-031/D-033，bench-companion 0.5.0 起）**：写方向为 **Cookie + Web Storage + IndexedDB**——桥 `/v1/session/export` 增发存储恢复载荷（`browser_storage::storage_restore_payload`，形状与恢复脚本 origin 分支一致，0.5 起含 `indexedDb` 快照），扩展经 `chrome.scripting` 注入站点页（Web Storage 走 isolated world 共享存储；IndexedDB 走 MAIN world 页面上下文执行）覆盖写入后重载；**写前全量备份、可一键回滚**（与 cookie 同一备份键；IndexedDB 备份不完整则拒绝覆盖——fail-closed）；单库恢复失败（版本 / schema / 阻塞）只记入 failed 不阻断整体；host 权限在 popup 用户手势中按站点申请。export 的 `outcome` 为 `ok` 的条件是「cookie 或存储载荷任一存在」（D-033），凭证只存 IndexedDB 的站点不再被误判 `empty`。实测动机：trae 的登录凭证先在 localStorage（`Cloud-IDE-Token`）、7242 端口实例只存 IndexedDB——cookie-only 与 Web-Storage-only 先后都被实测推翻。`storageOrigins > 0` 时提示用户确认扩展 ≥ 0.5.0 并授权站点访问。**不打开任何可见窗口**（注入用后台标签页），因此没有实时预览。
  - **安装与分发**：Chrome 137 已从 branded 构建移除 `--load-extension`，官方替代只对 Bench 新起的实例生效 —— **无法自动装入用户的日常浏览器**。流程为「一键导出扩展目录 + 打开扩展管理页 + 引导『加载已解压的扩展程序』」；消除「停用开发者模式扩展程序」提示的唯一路径是商店上架（未做）。
  - **命令与路由**：`browser_ext_status`（含 `bridgeReady` / `bridgePort`）/ `browser_ext_export`（同时确保本地桥启动）；桥路由 `GET /v1/ping`、`POST /v1/site/resolve`、`POST /v1/session/import`、`POST /v1/session/export`。capability `browserSessionExtension` **不受**「本机是否装有 Chromium 系浏览器」约束（扩展跑在用户自己的浏览器里）。
