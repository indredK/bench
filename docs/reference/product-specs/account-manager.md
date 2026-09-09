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

- 账号信息区（固定不滚动）：用户名（可复制）、密码（点眼睛 reveal，**30 秒自动隐藏**，有密码时显示 ••••，可复制；加载中禁用）、备注、上次刷新时间、上次登录时间、Session 到期时间（按 `lastLoginAt + sessionTtlHours` 计算，24 小时内标 near expiry；ttl=0 表示永不过期则隐藏）。

- 底部操作行：代理开关（Switch `proxyEnabled`）、管理外部应用（Settings）、刷新当前账号。

## 6. 对话框与弹层

- **新增/编辑站点**：备注 + 网站 + 「Session Manager 高级设置」（勾选覆盖 probe 策略时可选 `probeStrategy`；`sessionTtlHours` 有效期小时数，0=永久，默认 720；`networkProxy` 每站点网络代理 http/socks5，含主机/端口/用户名/密码——密码 `undefined`=保留、空串=清除，`clear` 动作清空）。

- **新增/编辑账号**：用户名、密码（编辑时留空=不改）、备注、启用代理（编辑时）。编辑若密码更新失败会降级保留旧 `hasPassword` 并提示 passwordFailed；代理写入失败提示 proxyFailed。

- **快速登录**：URL（自动补 `https://` 前缀；有历史 datalist 补全）+ 用户名 + 可选「关闭时销毁 Session（destroyOnClose）」+ 附加到当前站点；提交后创建 ephemeral 账号并打开登录窗口。

- **删除确认**：站点/账号删除均为 `DeleteConfirmDialog` 二次确认；删除站点后自动选中剩余第一个站点及其账号。

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

- 后端 `get_account_manager_capabilities` 为唯一真理源，逐项返回 `supported / partial / unsupported / failed + reasonCode`：`platform`、`credentialStore`、`isolatedWebview`、`cookieSession`、`webStorage`、`indexedDb`、`networkProxy`、`deepLink`。

- 前端允许 `supported/partial`，对 `unsupported/failed` 禁用对应操作并显示原因（reasonCode → i18n）。

- 登录依赖 `isolatedWebview`；外部登录依赖 `isolatedWebview` + `deepLink`；网络代理依赖 `networkProxy`。

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

- **控制器拆分**：`useStationActions`（站点 CRUD/重排序/重检测/probe 策略）、`useAccountActions`（账号 CRUD/快速登录/密码/代理）、`useRefreshOrchestrator`（刷新编排/防重入）、`useDataPorting`（导入导出）、`useAuthProxy`（代理）、`useQuickLoginHistory`。

- **后端模块** `src-tauri/src/account_manager/`：`types.rs`（领域类型）、`state.rs`/`storage.rs`（串行状态与落盘）、`crypto.rs`（Keyring 主密钥 + AES-256-GCM 每写独立 nonce）、`session.rs`（Session 捕获/恢复/TTL/退出持久化）、`detection.rs`/`probe.rs`（认证检测与分层探针）、`exclusivity.rs`（coexisting/exclusive/rotating 互斥）、`webview.rs`/`proxy/`（隔离 WebView + 登录代理 + token 提取/自动填充）、`deep_link.rs`、`browser_storage.rs`、`network_proxy.rs`。

- **IPC 命令**：capabilities / listStations / create/update/deleteStation / listAllAccounts / create/update/deleteAccount / createEphemeralAccount / revealPassword / setPassword / copyPasswordToClipboard / openLoginWindow / refreshAccount / refreshStation / refreshAll / reorderStations / reorderAccounts / detectStationAuthProfile / setProbeStrategy / resetProbeStrategy / setSessionTtl / setStationNetworkProxy / setAccountProxyEnabled / exportRelayData / importRelayData / proxyLogin / proxyLoginNewAccount / handleBrowserOpen / getAuthProxyInboxStatus / drainAuthProxyRequest / listExternalApps / removeExternalApp / listExternalAppBindings。

- **持久化**：加密 store 落盘（`AccountManagerSnapshot`，schema v5 起 `sessions` 为唯一 Session 真理源）；写入由 `AccountManagerState` 串行 + 显式 flush；Keyring 首建与 store mutation 使用跨进程文件锁，锁内 reload 磁盘 canonical snapshot 后再 save/replace（防 last-write-wins）。

- **Session 生命周期**：启动→读加密 store→恢复 persistent sessions→probe→UI 就绪；登录成功→捕获 Session→加密→flush；退出→捕获 Ready sessions→清理 ephemeral→flush。

- **分层探针**：L1 HTTP（低成本）→ L2 WebView（HTTP 不确定/JS challenge/anti-bot）→ L3 Hybrid（SSO/复杂重定向）。结果区分 Ready/LoginRequired/Expired/Uncertain/AntiBotBlocked/SsoChallenge/NetworkError；只有 Uncertain 才升级探针。

- **并发/网络预算**：全局 semaphore；同账号 single-flight（leader-follower）；单请求 4s、HTTP 总预算 10s、最多 3 次；只重试 408/429/500/502/503/504 与 connect/timeout，200ms 基数 2s 上限 full-jitter 指数退避；`Retry-After` ≤2s 时服从服务端。

- **Web Storage/IndexedDB 边界**：单 origin 捕获仅限 Station website 精确 origin（scheme+host+port 比对）；Web Storage ≤512 key/2 MiB；IndexedDB ≤32 database/128 store/10000 record/8 MiB；桥接总量 12 MiB、捕获/恢复各 10s；Blob/CryptoKey/循环引用返回受限/失败；schema 不兼容 fail-closed。

- **i18n**：zh/en 双语；所有失败/空态/过期/降级均有文案。

- **性能**：账号列表 ≥100 虚拟化；首载骨架屏。

## 12. 数据模型（关键类型）

- `RelayStation`：id / remark / website / createdAt / loginDetection / exclusivityMode? / authProfile? / probeFailureCount? / sessionTtlHours?（0=永久，默认 720）/ networkProxy?。

- `StationAccount`：id / stationId / username / notes / phone / tgAccount / linkedAccount / inviteLink / loginMethods / status / lastLoginAt / lastRefreshedAt / createdAt / hasPassword / accountType?(persistent|ephemeral) / website? / session? / exclusivityGroup? / proxyEnabled?。

- `AuthProfile`：cookieBased / tokenStorage(cookie|localStorage|sessionStorage|indexedDB|multiple|none) / csrfProtection / csrfExtraction / authType(sessionCookie|bearerOAuth|saml|openIdConnect|webSocket|unknown) / fingerprinting(none|basic|strict) / antiBot / antiBotProvider / ssoProvider / probeStrategy(httpFirst|httpOnly|webviewOnly|hybrid) / detectedAt / confidence。

- `NetworkProxyConfig`：proxyType(http|socks5) / host / port / username? / encryptedPassword?(opaque，前端不解密)。

- `SessionSettings`（前端模型）：probeOverride / probeStrategy / sessionTtlHours / networkProxy / networkProxyPassword(undefined=保留, ""=清除)。

- `AccountManagerCapabilities`：platform + 7 项 capability（status + reasonCode）。

- 错误码：NOT\_FOUND / INVALID\_INPUT / STORE\_FAIL / KEYRING\_UNAVAILABLE / CRYPTO\_FAIL / CLIPBOARD\_FAIL。

- 删除结果 `DeletionReport`：逐资源（webviewData/metadata）标记 succeeded/failed，status complete/partial。

- `ExternalApp`：id/name/urlScheme/returnHosts/firstUsedAt/lastUsedAt/useCount；`ExternalAppBinding`：appId↔accountId 绑定。

## 13. 边界与限制

- **平台**：macOS + Windows；Windows 的 `networkProxy` 恒为 `unsupported`（上游 WebView2/Tauri 未提供等价能力前），后端同样拒绝非空代理配置（fail-closed，不直连、不打开共享浏览器），已有配置可清除。

- **安全红线**：明文密码/token/Cookie 只在 Rust 内存与目标账号 WebView 中短时存在，不得进入前端 store/事件/日志；HttpOnly cookie 只能经 WebView 原生 cookie API 获取；partitioned Cookie 不进入 HTTP probe。

- **capability 纪律**：不得依据 `navigator.platform` 或编译成功自行提升能力；只有平台相关真机用例通过后才可把 `partial` 提升为 `supported`。

- **危险操作**：删除站点/账号、吊销代理/外部 App、覆盖导入均二次确认；删除返回逐资源 report，目录占用等 partial 结果保留可重试信息，不得先删 metadata 再丢资源 owner。

- **输入校验**：代理密码更新只接受 keep/set/clear 窄 DTO，renderer 不回传完整读取 DTO。

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
