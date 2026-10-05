# Account Manager（账号管理）规划功能

> 本文件记录 account-manager 模块**未实现 / 待验证**的功能规划，与 `../product-specs/account-manager.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> 长期安全边界与参考实现见 `../modules/account-manager/design.md`；执行顺序见全局路线图 [R01](../ROADMAP.md#r01-account-manager-代码收口) 与 [R04](../ROADMAP.md#r04-account-manager-双平台真机矩阵)。

## 待实现（代码阻断）

- [x] 将同账号 single-flight、429/5xx 重试预算、Cookie scope、Deep Link 多 URL/去重和平台行为测试接入 macOS/Windows CI runner；`.github/workflows/ci-build.yml` 的 Rust 矩阵在 macOS/Windows 都运行 `pnpm run test:be`，本地 `nextest` 全量覆盖对应回归（probe scope/retry、single-flight、inbox FIFO/capacity/dedup）。

## 待验证（互通 I1/I2 浏览器会话互操作 · 2026-09-10 已实现，未真机验收）

> 状态：**代码与单测已完成**（Rust 侧 `account_manager/browser_session/**` + `session_arbitration.rs`，前端 `useBrowserInterop` + `browser-interop-dialog`）。产品语义见 [交互图：账号管理三角闭环（B1/B2）](../../diagrams/account-manager-triangle.html)。
> 阻断项：能力状态在真机用例通过前只能维持 `partial`（reasonCode `TARGET_PLATFORM_VALIDATION_PENDING`），不得提升为 `supported`。

- [ ] **macOS 真机矩阵**（全新测试用户，禁用生产账号）：
  - [ ] I1 注入：`injectSession=true` 打开站点后浏览器内直接是登录态；核对 `injectedCookies` / `skippedPartitioned` / `rejectedCookies` 与实际 cookie 数一致。
  - [ ] I1 手动登录：`injectSession=false` → 浏览器内完成扫码 / 2FA / SSO → `browser_session_probe` 报告命中 → `browser_session_capture` 落库 → Bench 侧刷新后状态 Ready。
  - [ ] I2 冲突：先在 Bench 刷新出更新会话，再从浏览器回采 → 必须返回 `conflict` 且 **Bench 数据不变**；确认覆盖后 `capturedAtTs` 前进、`sessionOrigin=browserCdp`。
  - [ ] 实例生命周期：重复 `open` 复用实例（`reusedInstance=true`）；`close` 后进程退出；`clear_profile` 后 profile 目录消失且下次打开是干净起点。
  - [ ] CDP 边界：把调试端口指到非回环地址必须被拒绝；浏览器中途退出时命令返回结构化错误而非悬挂到超时。
  - [ ] **I1 存储恢复终态（D-038）**：登录凭证只在 IndexedDB 的站点（本地 7242 端口 Cloud-IDE 类）走 `injectSession=true` → `storageRestoreStatus` 必须为 `complete` 且页面直接是登录态；人为制造失败（IDB 被其他连接占用）时必须出现「存储未恢复完」告警而不是纯成功 toast。
  - [ ] **I5 注入回执（D-038）**：① 未装/未启用扩展 → 轮询超时后必须报「扩展没联系 Bench」，全程不得出现成功 toast；② 站点未授权 → 扩展回报 `failed:SITE_NOT_AUTHORIZED` 并红色终态；③ 正常路径 → `injected` 且计数（cookie / 存储键 / IDB 库数）与浏览器实际写入一致；④ 注入中途关扩展面板或 SW 被回收 → 任务在 90 秒后重新可领取，不出现永久「同步中」。
  - [ ] **采集作用域（D-039）**：在凭证落在兄弟子域（页面 `www.x.com`、会话 cookie host-only 于 `api.x.com`）的站点保存登录态，`collectCookies` 必须带回该 cookie；`x.co.uk` / `x.com.cn` 形态的 apex 页必须**只**申请精确 host（不得出现 `*.co.uk` 这类越界授权提示）。
  - [ ] 中文路径 / 带空格用户名下 `userDataDir` 正常（accountId 白名单化不应破坏正常 id）。
- [ ] **Windows 真机矩阵**（Windows Sandbox/VM）：同上述 I1/I2 全项；额外核对候选安装路径探测（`Program Files` 系）与 `taskkill` 收尾无残留进程。
- [ ] **无浏览器环境**：卸载全部 Chromium 系浏览器后，`browserSessionOpen`/`browserSessionCapture` 必须为 `failed`（reasonCode `NO_CHROMIUM_BROWSER`），详情栏入口禁用且 tooltip 说明原因。
- [ ] **Keyring 失败**：拒绝钥匙串授权后互通能力必须 `failed`（`CREDENTIAL_STORE_INITIALIZATION_FAILED`），且不暴露入口（fail-closed 优先于浏览器可用性）。
- [ ] **I3 兜底入向：直读本机 Chrome 落盘登录态**（[D-040](../../explanation/decisions.md#d-040--新增直读本机-chrome-落盘登录态作为-i3-兜底入向修正一条基于错误事实的红线)；代码与单测已完成，未真机验收）：`browser_session/chrome_store.rs` 只读打开 Chrome 的 Cookies 库，钥匙串 `Chrome Safe Storage` → PBKDF2-SHA1 + AES-128-CBC 解 `v10`、剥 `SHA256(host_key)` 前缀，按当前站点可注册域过滤后交 `finalize_capture` 入 S1。仅 macOS、仅 cookie。
  - [ ] 首次点「从本机 Chrome 导入」应弹一次钥匙串授权；点「始终允许」后第二次不再弹；点「拒绝」必须得到 `CHROME_IMPORT_KEYCHAIN_DENIED` 的可读提示而不是静默失败。
  - [ ] Chrome **正在运行时**导入应成功（不需要先退出 Chrome）；`Default` 之外的 profile（`Profile 1` 等）应被读到并取命中最多的那个。
  - [ ] 域级 cookie（Chrome 存成 `.trae.cn`）必须导入成功 —— 去前导点是这条链路唯一的静默失败点。
  - [ ] 分区（CHIPS）cookie 与已过期 cookie 应被丢弃并计入 `skippedPartitioned` / 日志，不降级为普通 cookie。
  - [ ] `conflict` 路径：先在 Bench 刷新出更新会话，再从 Chrome 导入 → 必须不覆盖，且 UI 不提供 force。
  - [ ] 令牌存在本地存储的站点（trae / 7242 Cloud-IDE）导入后**仍判未登录**是预期行为，文案须引导用户改用扩展。
  - [ ] Windows / Linux：入口不显示（`CHROME_IMPORT_PLATFORM_UNSUPPORTED`），且双平台 CI 编译通过（新依赖全部挂在 macOS target 下）。
- [x] **I3/I5 日常浏览器双向互通**（代码已实现，待真机验收）：`bench-companion` 通过 Native Messaging + loopback bridge 读取/写入默认浏览器的 Cookie、Web Storage 与 IndexedDB；首次站点访问需在扩展弹窗授予 host 权限，注入前自动备份并支持回滚。扩展版本 **0.10.0**：采集与授权作用域按可注册域泛到同站全部子域（[D-039](../../explanation/decisions.md#d-039--扩展采集作用域--可注册域泛到同站全部子域删除站点特例硬编码)，不再硬编码 `api.trae.cn`），并按任务回执上报真实注入终态（[D-038](../../explanation/decisions.md#d-038--出向同步必须回报真实终态注入任务回执--cdp-等存储恢复落库)）；host-only Cookie 注入时仍按原 host 回写。

## 已实现、待验收（2026-09-09 规划轮 F1–F4：登录指纹 · 入口收敛 · 日志增强 · 弹窗修复）

> 状态：**代码任务已完成；真机与端到端验收未完成**。F1–F4 的实现任务均已勾选；下列未勾选验收项仍是发布前置证据，不能据此把 R01 标为完成。保留本节作为验收清单，确认所有验收证据后再归档，并同步设计边界到 `design.md`、功能到 `product-specs/account-manager.md`。
> 背景（用户反馈 4 项）：① 快速登录与外部登录疑似重叠；② 登录态识别不可靠，需在详情栏底部新增「登录指纹采样」按钮；③ 账号日志信息量不足；④ 外部登录弹窗第二步选项卡两行文字溢出。

### F1. 快速登录 × 外部登录：重叠调研与入口收敛

**调研结论（重叠属实，但安全语义不同，不宜直接合并）**

两条链路骨架同构：「粘贴 URL → 站点匹配 → 账号选择（已有/新建）→ 隔离 WebView 打开」。外部登录接受任意 http(s) URL（`auth-proxy-dialog.tsx:246-249`），对非 authorize-like、无回调参数的普通 URL，其执行结果与快速登录「已有账号」路径功能等价：

| 维度      | 快速登录 `quick-login-dialog.tsx`                            | 外部登录 `auth-proxy-dialog.tsx`                                                     |
| --------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 入口      | 站点栏底部 LogIn 图标（`StationColumn.tsx:157-177`）         | 站点栏底部「外部登录」按钮（`StationColumn.tsx:178-199`）+ `bench-auth://` deep link |
| URL 范围  | http(s)                                                      | `bench-auth://` + 任意 http(s)                                                       |
| 站点匹配  | `match_stations_by_url`（exact / 同可注册域近似）            | `match_target_to_stations`（精确 host → PSL 可注册域 → SSO）并返回其余站点为 manual  |
| 账号范围  | 全部账号                                                     | 仅 `proxy_enabled` 账号（安全边界，见交互图 A1/A2 限制）                             |
| 新建账号  | persistent / ephemeral、destroyOnClose、历史 datalist        | persistent（`proxy_login_new_account`）                                              |
| 票据/回调 | 无                                                           | 5 分钟一次性 ticket、return URL 捕获 + state 校验 + 转交外部 App                     |
| 审计/填充 | 无                                                           | `audit_log` + ExternalApp binding、有密码时延迟自动填充                              |
| 互斥处理  | `enforce_exclusivity_before_login`（`commands/proxy.rs:94`） | **未调用**（`run_proxy_login` 路径，见 F1-T4）                                       |

不能简单合并的原因：外部登录承担代理安全边界（ticket / return URL allowlist / state 回传 / 仅代理账号 / 审计），快速登录承担轻量打开（全部账号、临时账号、关窗即焚）；合并进单一向导会混淆两类安全上下文。

**收敛方案（推荐 A）**：双入口保留、职责文案澄清 + 普通 URL 引导分流。`handle_browser_open` 已返回 `isAuthorize`（`commands/proxy.rs:585,647`）但前端未消费——外部登录第一步解析结果为「非 `bench-auth://` 且非 authorize-like」时，Step 2 顶部提示「该链接不是登录授权链接」，并提供「改用快速登录打开」按钮（携带 URL 预填打开 QuickLoginDialog，需给其新增 `initialUrl` prop）。
（备选 B：合并为单一「打开链接」入口按 URL 类型内部分流——向导状态机复杂、代理上下文易误用，本轮不做。）

**任务**

- [x] F1-T1 前端：`AuthProxyDialog` Step 1/2 消费 `isAuthorize`，普通 URL 显示引导 +「快速登录打开」按钮（预填 URL、关闭自身、打开 QuickLoginDialog 新增 `initialUrl`）
- [x] F1-T2 前端：两入口 tooltip/描述文案澄清（快速登录=在隔离环境快速打开链接；外部登录=代外部应用完成登录授权）；i18n zh/en
- [x] F1-T3 Rust：调研统一站点匹配。结论：**不合并，保留双实现**——`match_stations_by_url`（快速登录，`commands/station.rs`）沿用轻量域名分组；`match_target_to_stations`（外部登录，`proxy/matching.rs`）用 Mozilla PSL 识别同可注册域，支持父/子/兄弟子域并隔离 `co.uk`、`github.io` 等后缀，再匹配 SSO provider；所有其余站点作为 `manual` 候选返回。候选 DTO 和一次性 ticket 共用同一快照，ticket 按账号 ID + 签发时站点 ID 收窄，启动前复核账号仍启用代理且未移站。保留不同的授权语义（外部代理只允许代理账号），不统一为单一匹配算法。
- [x] F1-T4 Rust：`run_proxy_login` 补 `enforce_exclusivity_before_login`（与 `open_login_window` 命令互斥行为对齐）

**验收**

- [ ] 普通 URL 粘贴进外部登录 → 出现引导；一键转快速登录且 URL 已预填
- [ ] `bench-auth://` 与 authorize-like URL 行为不变（ticket/回调/审计链路回归）
- [ ] exclusive 站点外部登录互斥行为与普通登录一致（或文档化豁免）

### F2. 登录指纹：登录态特征采集与判定（核心）

**现状与根因（为什么「识别不准」）**

状态判定现有 3 条链路：

1. 手动/keeper 刷新 → 分层探针：HTTP（401/403 → 待登录；正文文本分类）→ WebView（页面文本分类）→ Hybrid（`probe.rs run_probe`）。
2. 文本分类 `detection_legacy.rs`：`presetLogout`（默认）找页面含「退出登录」→ Ready，否则 LoginRequired——对英文站、SPA、异步渲染站基本失效；`custom` 模式两条规则都不中 → **Expired（需重登）**，即「需重登」实际是**检测不确定**的兜底态（`detection_legacy.rs:28`，全代码库唯一产生 Expired 的位置）。
3. 代理登录回调命中 → `finalize_proxy_session` 直接标 Ready。

「尚未检测认证配置」区域 = `station.authProfile == null` 时的占位（`DetailColumn.tsx:228-258`）。authProfile 由 `detect_station_auth_profile` 生成（优先复用已开登录窗口，否则开隐藏窗口跑 `DETECTION_SCRIPT`），描述**站点如何认证**（cookie/localStorage/CSRF/SSO/anti-bot/probe 策略），不参与登录态判定，只影响 probe 策略与 IndexedDB 捕获要求。**与登录指纹相关但不同物**：authProfile=方法画像（method），登录指纹=登录态证据（evidence）。二者可共用一次窗口加载采样（见 F2-T2）。

**用户直觉的技术校验（「需重登的账号必然不遗留 token」）**

- 指纹**缺失** → 一定未登录（强否定证据）✅ 可作为确定性判据；
- 指纹**存在** → 疑似已登录，但 token 可能已被服务端吊销（弱肯定证据）❌ 不能单独定论；
- 因此指纹只能作为 L0 预检层 +「未登录」的确定性判据；Ready 仍须经现有探针验证或由用户显式确认——与「恢复后必须 probe 才能标记 Ready」红线一致（见交互图 C2 限制；用户显式确认属于例外：见决策点 D4）。

**指纹内容选型（调研结论：cookie 特征名单为主 + storage 键名为辅，一律不记值）**

| 信号源                                       | 通道                                                                  | 可靠性 | 备注                                       |
| -------------------------------------------- | --------------------------------------------------------------------- | ------ | ------------------------------------------ |
| Cookie 特征 `{name, domain, path, httpOnly}` | `cookies_for_url()`（`session.rs extract_cookies` 已有，含 HttpOnly） | 高     | **只记名与域，不记值**；值随会话变化且敏感 |
| localStorage/sessionStorage token 键名       | `DETECTION_SCRIPT` 已采集 `tokenKeys`（`detection.rs:13-79`）         | 中     | 键名稳定；正则模式需按需扩充               |
| session 快照存在性 + `captured_at_ts`        | 内存判定，零成本                                                      | 中     | 配合 station TTL 判断新鲜度                |
| 页面文本规则                                 | 现有 `LoginDetectionConfig`                                           | 低     | 保留兼容，继续作为 L1/L2 输入              |

安全边界（design.md §5）：指纹本体（cookie 特征名单 + storage 键名）存 Rust 侧加密 store 的**站点级字段**；前端 DTO 只回摘要（特征数量、命中数、采样时间），不回键名明文列表。

**方案设计**

1. 数据模型：`RelayStation.login_fingerprint: Option<LoginFingerprint>`（serde default，旧数据兼容 + migration 检查）：`cookie_features: Vec<{name, domain, path, http_only}>`、`storage_keys: Vec<String>`、`sampled_at`、`sampled_by_account`。
2. 采样命令 `capture_login_fingerprint(station_id, account_id)`：优先复用该账号已打开的登录窗口；无则开隐藏窗口（注入该账号 session，复用 `detect_station_auth_profile` 的窗口构建逻辑，`commands/proxy.rs:202-311`）→ 扩展版指纹脚本（DETECTION_SCRIPT 基础上返回 cookie 名单+域、storage 键名）→ 写入站点指纹；**同一窗口顺带刷新 authProfile**（一次加载两份画像，消除「尚未检测认证配置」与指纹的分离感）。
3. 确认弹窗（采样成功后）：展示「检测到 N 项 cookie 特征 / M 个 storage 键」→「是否将该账号当前状态识别为该站点的活跃（已登录）状态？」→ 确认：`account.status = Ready` + `last_login_at` 回填 + 写 statusChanged / fingerprint 日志。
4. 判定集成（probe L0 预检，两路都只做「特征全缺失」短路）：
   - L0a（HTTP 路径，`run_probe` 入口）：站点有指纹 && 恢复的 canonical session 中特征 cookie 名全部缺失 → 直接 `LoginRequired`，跳过 HTTP 请求（省预算，结果确定）；
   - L0b（WebView 路径，probe/keeper 窗口加载后）：在文本分类轮询外增加指纹 eval 脚本（`cookies_for_url` + storage 键检查）→ 特征全缺失 → `LoginRequired`（覆盖「canonical session 为空但 WebView data dir 有残留」的账号，避免 L0a 误判）；
   - 站点无指纹 → 现行为完全不变。
5. 确认后自动刷新：确认成功即调用 `refresh_station`（该站点全部账号），各账号 probe 走 L0 预检——指纹缺失者确定性判未登录，特征存在者走原 L1/L2 链（对应用户「不符合特征的自动判定为未登录」）。
6. 「需重登」语义收敛：指纹缺失导致的 LoginRequired 在 UI 标注「已确认未登录（指纹缺失）」；Custom 模式不确定兜底产生的 Expired 保留，UI 副标签注明「检测不确定，建议采样指纹」。
7. UI：详情栏底部操作行（`DetailColumn.tsx:350-406`）设置按钮左侧新增指纹采样按钮（Fingerprint 图标 + tooltip；站点无指纹时带「未采样」提示点）。

**待讨论决策点（实现前需拍板）**

- D1 「未登录」是否新增独立状态枚举（如 `loggedOut`）vs 复用 `loginRequired` + detail 标注？新增枚举动 TS/Rust 双端契约与全部状态映射。**2026-09-10 已定：方案 A（复用 + 来源标注）**——`StationAccount.status_reason` 仅指纹 L0 短路时记 `fingerprintMissing`，前端 `StatusBadge` 在 `loginRequired && statusReason=fingerprintMissing` 时挂 tooltip「指纹缺失，已确认未登录」；手动/keeper 刷新的日志 detail 同步带 `reason`。确认登录（`confirm_login_fingerprint`）与 Ready 时清空。
- D2 指纹为站点级：采样确认后立即对同站全部账号生效（自动批量刷新）——与用户描述一致，确认刷新范围与并发预算（复用现有 semaphore/single-flight）。
- D3 采样前置条件：是否要求采样账号当前探针 Ready（防止把登出态采成指纹）？建议不强制。**2026-09-10 已定：不强制，且确认弹窗不展示「登录佐证（登出入口）」**——登出元素存在性检查（DOM 文本/元素判断）已整体移除（Rust 采集脚本、`FingerprintCapture.logout_evidence`、`LoginFingerprintSummary.hasLogoutEvidence`、弹窗展示行与 i18n），用户以特征计数自行判断。
- D4 「用户显式确认即 Ready」与「恢复后必须 probe 才能标记 Ready」红线的关系：显式确认是用户断言而非自动推断，且指纹来自实时页面采样——交互图 C2 限制已写明该例外条款（用户显式确认），不违反红线。

**任务**

- [x] F2-T1 Rust：`LoginFingerprint` 类型 + storage schema。实现与方案差异：完整特征存 `AccountManagerSnapshot.fingerprints`（按 station_id），`RelayStation.login_fingerprint` 只挂 `LoginFingerprintInfo` 摘要（serde default 兼容旧数据，不动 schema 版本）
- [x] F2-T2 Rust：`capture_login_fingerprint` 命令（窗口复用/隐藏窗口 + 指纹脚本 + authProfile 顺带刷新 + 日志脱敏——日志与 DTO 只含计数无关键名）
- [x] F2-T3 Rust：probe L0a/L0b 指纹预检（`probe.rs run_probe` + keeper 静默刷新）+ 确认后 `refresh_station` 编排（前端侧触发，复用 single-flight/预算语义）
- [x] F2-T4 IPC：`contracts.ts` + typed command + DTO（`LoginFingerprintSummary`/`RelayStation.loginFingerprint` 仅摘要）+ Rust 注册 + 命令入 `commands.rs` invoke_handler
- [x] F2-T5 前端：DetailColumn 底部按钮（设置按钮左侧，Fingerprint 图标）+ 采样确认弹窗（`FingerprintConfirmDialog`，普通确认非 Destructive）+ 详情栏「指纹已采样」状态条（站点级，展示采样时间与特征计数，并说明指纹缺失账号判定为未登录）。账号级来源标注按 D1 方案 A 落地：`loginRequired && statusReason="fingerprintMissing"` 时状态徽标挂 tooltip「指纹缺失，已确认未登录」（无小字）
- [x] F2-T6 前端：i18n zh/en + 空态/失败态（region error + toast）+ 防重入（`useGuardedAsync`）
- [x] F2-T7 测试：`fingerprint.rs` 单测覆盖指纹缺失→短路、特征存在→不短路、storage 键保守不短路、空指纹不短路（L0a 判定逻辑）
- [x] F2-T8（2026-09-10）确认弹窗特征明细二级弹窗：新增 `get_login_fingerprint_detail` 命令（`commands/fingerprint.rs`，State-only 非泛型），「Cookie 特征 / 存储键特征」计数可点击 → `FingerprintDetailDialog` 展示键名/域名/path/httpOnly/值长度；**值永不出后端**（修订原「键名列表不出后端」边界：键名可看、值不可出，D3 同日决策）。i18n zh/en 同步；contracts 双端对齐测试覆盖。调研依据见 `explanation/login-state-detection-research.md`（trae.cn 账号 1 误判根因 = 特征无判别力 + L0b 弱肯定越权，P0~P3 改进建议已列出）

**验收**

- [ ] 采样 → 确认 → 账号立即显示已登录 + 日志记录；同站其它账号自动刷新，指纹缺失者直接判未登录（无 HTTP/WebView 开销）
- [ ] 指纹与 authProfile 一次采样同时生成，「尚未检测认证配置」区域随之消失
- [x] Cookie 值与 storage 值不进入 DTO、日志或指纹明细；普通 `RelayStation` DTO 只出摘要。用户主动打开二级明细时，`get_login_fingerprint_detail` 会返回 cookie/storage 特征名及域、path、长度等元数据，**不会返回凭据值**。

### F3. 账号日志增强

**现状缺口**（`state.rs push_account_log` 环形 100 条 + `account-log-dialog.tsx`）：detail 仅 4 类字段（status/errorCode/skipReason/durationMs），login 只有 `verified`/`target`；快速登录来源、session 捕获失败（`session_keeper.rs:343` 仅 eprintln）、callback 转交失败（`webview.rs:274` 仅 eprintln）、探针层级（autoRefresh 无 strategy/probeLayer，与 manualRefresh 不对齐）等信息缺失；UI 无过滤、detail 单行截断。

**方案**

- 扩展 detail（**不改 kind 枚举**，避免 TS/Rust 双端契约断裂）：`source`（manual/keeper/deepLink/quickLogin/fingerprintConfirm）、`probeLayer`（http/webview/hybrid）、`fingerprintHit`（如 `3/5`）、`captureStatus`、`forwardResult`。
- 新增写点：keeper 捕获失败、代理 callback 转交失败、快速登录打开（现有 login/`target=loginWindow` 补 `source=quickLogin`）。
- 日志 UI：kind 过滤 chips + 条目展开显示完整 detail 字段（时间线保留）。
- 红线：detail 继续只含枚举/计数/时长，不得含 URL、cookie、明文。

**任务**

- [x] F3-T1 Rust：补写点（keeper 捕获失败 `captureStatus=failed`、代理 callback 转交失败 `forwardResult=failed`）+ autoRefresh detail 对齐 manualRefresh（补 `layer:webview`/`source:keeper`）。快速登录 `source` 细分未做：`open_login_window` 命令被普通登录与快速登录共用，无法经 IPC 区分来源，需在命令层加显式参数（成本>收益，本轮不做）
- [x] F3-T2 前端：account-log-dialog kind 过滤 chips + detail 结构化多段展示 + 点击 kind 展开(去单行截断) + `formatDetail` 扩展（source/layer/captureStatus/forwardResult 枚举本地化）
- [x] F3-T3 前端：i18n zh/en + 过滤/展开交互

**验收**

- [x] 快速登录、自动刷新跳过、捕获失败、转交失败均有日志条目且来源可辨（捕获失败/转交失败为新增写点；快速登录来源见 F3-T1 说明）
- [x] 过滤与展开在中英文下不溢出

### F4. 外部登录弹窗第二步选项卡溢出（bug，小）

**根因（已定位）**：Step 2 两张单选卡片（`auth-proxy-dialog.tsx:478-513` Option A、`543-570` Option B）用 `<Button size="default">`；`button.tsx` `size:default` 固定 `h-8`（32px，`button.tsx:28`）且基础类含 `whitespace-nowrap`（`button.tsx:11`）。卡片内容为两行（标题 + `useExistingHint`/`newAccountHint` 提示，后者长文案含 host 必然换行），所需高度约 40px → 溢出。

**修复**：两卡片 className 追加 `h-auto min-h-8 whitespace-normal`（tailwind-merge 正确覆盖 cva 的 `h-8`/`whitespace-nowrap`）。同类排查：模块内 `flex-col` 双行 Button 内容仅此两处（`auth-proxy-dialog.tsx:501、562`），随本任务一并修复。

**任务**

- [x] F4-T1 修复两卡片高度/换行（`h-auto min-h-8 whitespace-normal`）；窄宽度（sm 以下）与中英文长文案验证

**验收**

- [x] zh/en 两语言、包含长 host 的 hint 均完整显示不溢出（样式层修复）

### 任务分配与执行顺序总表

| 顺序 | 任务                        | 层   | 主要文件                                                               | 规模 | 依赖         |
| ---- | --------------------------- | ---- | ---------------------------------------------------------------------- | ---- | ------------ |
| 1    | F4-T1 溢出修复              | 前端 | `components/auth-proxy-dialog.tsx`                                     | XS   | 无           |
| 2    | F1-T1/T2 引导分流+文案      | 前端 | `auth-proxy-dialog` / `quick-login-dialog` / `StationColumn` / locales | S    | 无           |
| 3    | F1-T4 互斥对齐              | Rust | `commands/proxy.rs`                                                    | S    | 调研结论     |
| 4    | F2-T1/T2 指纹类型+采样命令  | Rust | `types.rs` / `storage.rs` / `commands/`（新 fingerprint.rs）           | L    | D1–D4 决策   |
| 5    | F2-T3 L0 预检+站点刷新      | Rust | `probe.rs` / `session_keeper.rs` / `commands/refresh.rs`               | M    | 4            |
| 6    | F2-T4 IPC 契约              | 双端 | `contracts.ts` / `commands/account-manager.ts` / `commands.rs`         | M    | 4            |
| 7    | F2-T5/T6 前端按钮+弹窗+i18n | 前端 | `DetailColumn` / 新确认弹窗 / locales                                  | M    | 6            |
| 8    | F3-T1 日志写点补齐          | Rust | `session_keeper.rs` / `webview.rs` / `commands/`                       | S    | 无（可并行） |
| 9    | F3-T2/T3 日志 UI            | 前端 | `account-log-dialog.tsx`                                               | S    | 8            |
| 10   | F1-T3 匹配统一调研          | Rust | `proxy/matching.rs`                                                    | M    | 可延后       |

> 提交策略：按任务独立 commit（Conventional Commits）；涉及 Rust 平台分支的改动（F2-T2 隐藏窗口构建）提交前必跑 `pnpm run check:be-cfg`；全部完成后执行 /fix 验证链，同步 product-specs/design.md，并移除本节。

## F5：浏览器会话注入——代码已实现，决策与真机验收未完成

> 状态：CDP、托管 profile、IPC 和前端入口已实现。详情见 [`explanation/browser-session-injection-research.md`](../../explanation/browser-session-injection-research.md)。M1 的反向互斥策略仍待 D-C 决策；macOS/Windows 真机验收未完成，capability 保持 `partial`。
> 结论摘要：**CDP + Bench 托管 profile** 是隔离实例端点（账号专属 `user-data-dir`，会话全程 Rust 内存 → loopback CDP）；**日常浏览器**是独立端点，扩展 + Native Messaging 路线已按 [D-029](../../explanation/decisions.md#d-029--日常浏览器方向改用扩展--本地桥i3i5-提前为必须实现) 提前纳入 I3/I5，不是待立项的 M3；直写浏览器 Cookies DB 与明文 cookies.txt 导出排除；Safari/Firefox v1 明确不支持。

### 任务（M1 最小可用，详见调研文档 §6）

- [x] M1-T1 Rust：CDP WebSocket 客户端、cookie 注入、导航、关闭、loopback 校验及 DevTools 探活；本地 mock WebSocket 已验证完整消息序列。
- [ ] M1-T2 Rust：打开/状态/关闭命令、profile 生命周期、跨平台浏览器发现已实现；同一 scope 的打开/重置/关闭已加入串行锁，避免并发 CDP 操作和 profile 生命周期竞态。打开托管浏览器时会拒绝已打开的 Bench 登录窗口，反方向行为待 D-C 决定。
- [x] M1-T3 双端：IPC 契约与 capabilities 已接线；真机验收前 `browserSessionOpen` 保持 `partial`。
- [x] M1-T4 前端：互通 hook、详情入口、浏览器选择、加载/结果反馈与 zh/en 文案已实现。
- [ ] M1-T5 测试：mock CDP 消息序列、profile 目录隔离/幂等清理、DTO 安全字段断言及 scope 操作串行回归均已通过；D-C 互斥行为测试待决策后补齐。

### 待拍板

- [x] D-A 日常浏览器扩展路线已由 D-029 决议提前纳入 I3/I5；与本节 CDP 隔离实例并行维护为不同端点。
- [ ] D-B 会话 TTL 到期时是否同步关闭并删除对应托管 profile（会清除其中的站点存储数据）。
- [ ] D-C 托管浏览器运行时，是否阻止再打开同账号的 Bench 登录窗口；当前只有“登录窗口运行时拒绝打开托管浏览器”的单向保护。
- [ ] D-D 浏览器选择是否每次让用户选择，还是记住用户偏好。

## 待验证（真机，全新 macOS 测试用户 + Windows Sandbox/VM，禁用生产账号）

### 1. Keyring、持久化与重启

- [ ] 两平台首次创建账号、保存密码与 Session；完全退出重启后密码可按需 reveal、Session 恢复后 probe 为 Ready。
- [ ] 两个进程并发触发首次主密钥与账号写入；重启后只有一个 canonical key、全部密文可解、revision 单调无覆盖。
- [ ] 拒绝 Keychain/Credential Manager：capability 返回 `failed`，页面可重试，不创建伪成功 Session。
- [ ] 记录卸载 / 重装后系统凭据的真实生命周期；不得为“修复”手工删除系统凭据。

### 2. Cookie、Web Storage 与 IndexedDB

- [ ] 账号 A 捕获状态后备份/重命名测试 WebView data directory，保留加密 store，重启后强制从 canonical Session 恢复（HttpOnly Cookie、expiry、local/session storage、database/store/index/key/record）。
- [ ] 导航 fixture B 时 A 数据不可见；两账号反复切换/重启互不可见。
- [ ] 提升 schema version 或修改 store/index 后恢复必须 fail-closed，不覆盖现有数据库。
- [ ] 超限（512 key/2 MiB、32 database、128 store、10000 record/8 MiB）与 Blob/CryptoKey/循环引用返回 limited/failed，旧 Session 不被半截快照覆盖。
- [ ] Partitioned Cookie 继续不进入 HTTP probe；Tauri 未提供 partition key 前不得改为普通 Cookie 发送。

### 3. Probe、批量与隔离

- [ ] HTTP/WebView/Hybrid 策略真实改变执行；timeout 可取消、只重试规定瞬态错误、预算不超设计值。
- [ ] 同账号并发刷新只运行一个 leader；leader 取消/drop 后 follower 拿到结构化结果且 registry 清理。
- [ ] 批量 partial/cancel/retry 每账号恰好落入 succeeded/failed/cancelled；失败账号保留旧数据。
- [ ] coexisting/exclusive/rotating 的状态、Cookie 与 data store 语义一致，账号间不共享浏览上下文。

### 4. Deep Link 与 Auth Proxy

- [ ] App 未运行时连续两个 `bench-auth://` 请求：主窗口启动、FIFO 正确、第二实例退出、原始 URL 不进 renderer 日志。
- [ ] 已运行时重复 URL 在去重窗口内只处理一次；超过 32 条报告 dropped。
- [ ] 合法/非法回调（scheme/host/port/path、伪 loopback、过期 ticket、重放）均按预期接受/拒绝。
- [ ] 跨 origin 或跳转后的自动填充被拒绝；密码只在后端精确 origin 校验后的单次操作中解密。
- [ ] Windows `networkProxy` 显示 `unsupported`；UI 与直接 IPC 都拒绝非空代理，失败不直连、不打开共享浏览器；已有配置可清除。

### 4a. Session Keeper(会话保活)与账号日志(本轮新增,待真机验证)

- [ ] interval/daily 两种计划在软件持续运行期间按 30s tick 准点触发;daily 跨日与 DST 边界(时区切换)下下次执行时间正确。
- [ ] 软件未运行错过的计划:启动后首个 tick 只补跑一次,执行后从 now 起算 next,不堆积补偿。
- [ ] 静默刷新(隐藏 WebView 加载站点 → 探测 → Ready 重新捕获 session)后:加密 store 更新、lastRefreshedAt/firstLoginAt 回填、日志写入;捕获失败时旧 session 不被破坏。
- [ ] 与手动刷新/外部代理登录同账号并发时 single-flight 生效(keeper follower 记录 manualRefreshInFlight skip 日志)。
- [ ] 登录窗口打开中跳过并记 warn 日志;Windows 上站点配置代理跳过并记 warn 日志。
- [ ] 每账号日志 100 条环形裁剪;账号/站点删除与 ephemeral 退出时日志同步清理;日志 detail 无 URL/cookie/密码。
- [ ] 快速登录粘贴 URL → 300ms 防抖匹配站点(exact/同域父子)→ 预选最高置信度 → 选已有账号在其隔离环境打开该 URL。
- [ ] 详情栏「会话保活」块(开关 + 模式 + 参数 + 下次执行时间)与「日志」对话框(时间线 + 计划摘要 + 刷新)在中英文下展示正确。

### 5. 删除、UX 与 capability

- [ ] 删除账号关闭窗口并逐项报告 metadata/secret/Session/binding/data directory；partial 不影响其他账号。
- [ ] 首载 skeleton、区域 retry、窄屏 Detail Sheet、500+ 虚拟列表、中英文长文本、Tab/Escape/焦点恢复均通过。
- [ ] 平台相关用例全部通过并有证据后，才把 `capabilities.rs` 对应项从 `partial` 改为 `supported` 并补平台行为测试。

## 远期

- [ ] **可移植加密导出**：实现 passphrase + KDF + AEAD 的可移植格式；当前 renderer 只能请求 sanitized export，后端继续拒绝 `encryptedFull`。
- [ ] **指纹隔离评估**：评估 TLS 指纹模拟和 Canvas/WebGL 指纹隔离；不得降低 origin、账号隔离或日志脱敏边界。
- [ ] **云同步**：先提交独立 RFC，只允许 BYO endpoint、客户端加密、版本迁移、冲突与删除语义；不得内置维护者公共服务。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-10-05：macOS 隔离 Bundle ID `com.bench.app.r01live` 真机复验（当前 macOS 用户下独立 Application Support 数据，无生产账号/密码/Session；HTTP Only 指向 `.invalid` fixture，凭据保持锁定）。首次启动确认未触碰 Keychain；新账号无 Session 时手动刷新不再因 `restore_session` 提前取主密钥而卡住；站点请求失败后按钮恢复，界面显示连接问题提示。复验发现原 HTTP probe 把网络错误误报为本地存储故障，新增稳定 `PROBE_FAILED` IPC 错误码与中英文提示后重新确认。Rust `account_manager` 233 项通过、1 项忽略，Clippy、lint、critical、格式与 cfg 检查通过。此为单个 macOS 场景的真机 smoke，不代表 R04 全矩阵完成；Windows 验收按用户安排延期，Deep Link / Keychain 拒绝 / 多账号隔离等矩阵仍待验证。
- 2026-10-04：复核 R01 跨平台测试接线：Rust CI 矩阵同时包含 macOS 与 Windows，均执行 cfg hygiene、Clippy 和 `test:be`（cargo-nextest）；实际回归覆盖同账号并发结果共享、503 重试预算及请求头保持、Cookie 域/路径/Secure/Partitioned scope、Deep Link FIFO/容量/去重。对应待实现项由代码阻断转为已接入；此记录证明流水线接线和本地测试覆盖，未声称本地未推送改动已有远程 CI 结果。
- 2026-10-04：对齐 F5 文档与现有浏览器互通实现：CDP mock 消息序列、profile scope 隔离与幂等清理、`BrowserOpenOutcome` 安全字段形状测试加入 Rust 单测；`account_manager` 228 项通过、1 项忽略，Clippy 与 `check:be-cfg` 通过。M1-T2/T5 仍等待 D-C 互斥决策；真机验证仍未完成，未推送。
- 2026-10-04：并发审查发现同一 profile scope 的重复打开/关闭可能跨异步等待交错；加入按 scope 复用的异步锁，串行化 open/reset/close，并新增锁互斥/释放回归。验证通过：全 Rust 681 项（2 项忽略）、`account_manager` 228 项、Network Probe 58 项（1 项 multicast fixture 忽略）、前端 critical 305 项、Clippy `-D warnings`、`lint:fe`、Rust fmt、`check:be-cfg`、文档一致性/88 篇链接检查和 Prettier。macOS/Windows 真机验收与 D-C 决策仍待完成，未推送。
- 2026-10-04：R01 修正 Auth Proxy 候选/ticket 快照不一致：手选站点一直是产品列出的 manual 候选，旧 ticket 却只允许自动匹配账号；现由后端同一 canonical snapshot 返回自动与 manual 候选，ticket 绑定账号 ID + 签发时站点 ID，启动前验证代理开关与站点归属，隐藏孤立账号仍拒绝。站点匹配改用 Mozilla PSL crate，覆盖父/子/兄弟可注册域，并隔离多级 public/private suffix。新账号可在没有已有 Station 时创建并使用默认名称；向导预选唯一自动候选，否则仅一个候选时预选。另修复新账号模式下无法切回已有账号的交互卡点、无站点时误导用户先手动建站的文案，并向辅助技术暴露选择状态。新增普通 URL 分流、Deep Link 不回传原始 URL、快速登录预填与重新匹配回归。验证通过：Rust 679 项（677 通过、2 忽略）、Clippy、`check:be-cfg`（386 文件）、`lint:fe`、critical 305 项、格式检查及 88 篇 Markdown 链接检查。macOS 隔离用户桌面与 Deep Link 复验仍未完成，因此不推送。
- 2026-10-04：Auth Proxy ticket 与 OAuth callback state 边界复审：ticket 仅允许候选中展示的代理账号，并绑定原 Station，防止直接 IPC 越权和账号移站后沿用旧 ticket；预期 OAuth state 必须是回调中唯一且完全匹配的参数，缺失或重复均拒绝。此前“ticket 只允许匹配候选”忽略了 UI 另行补入的 manual 候选，已由上述同快照修复更正。新增签发范围、站点变更与重复 state 回归；Auth Proxy command 定向 19 项、state 定向 1 项通过，全量 Rust 675 项通过/2 项忽略。`lint:fe`、critical 298 项、Clippy、Rust fmt、cfg 与文档链接检查通过。Station.website 路径/查询归一与 Auth Proxy 第二次 wakeup 修复见前一条记录。Playwright 使用 mock Tauri/Chromium，不计作原生真机验收；隔离 macOS 用户下的 Deep Link 与窗口验收待完成。
- 2026-10-03：复核 F1–F4 状态后，将标题从“待实现”改为“已实现、待验收”，明确代码任务已勾选但真机/端到端验收仍未通过；同步产品说明中的登录指纹入口、确认/明细弹窗与 DTO 摘要字段，并修正“键名不出后端”的过期描述。指纹特征是否需静态加密仍待安全边界决策。
- 2026-09-30：R01 代码审计补齐区域错误作用对象与敏感信息边界（store 只留错误码）、后台重载旧数据保留与刷新态、无重试动作时隐藏按钮、CRUD 重载按钮明确标为「刷新」、弹窗写入失败 toast 和 retry 防重入；Auth Proxy deep-link inbox 按 owner 从 proxy 命令拆出，深链目标/回调 URL 与 OAuth state 保留在 Rust ticket，renderer 只接收脱敏元数据；手动粘贴 URL 仅留在弹窗临时输入态，关闭后清除。回调应用由 Rust 按 ticket 打开，登录 IPC 不回传 state 或占位凭据；原 IPC 名称保持不变。lint、critical、Rust account-manager tests、clippy、cfg guard、前端构建通过；macOS 真机截图待隔离测试用户后补。

- 2026-10-03：修复 Auth Proxy inbox drain 与 `authProxyPending` 通知并发时的 lost wake-up：drain 过程中记录通知，空结果后继续消费；并发通知伴随 IPC 失败时最多额外重试一次，避免无限重试。复审又发现路由卸载会丢失已 drain 的 ticket，现将协调器提升到 App 生命周期，新 ticket 自动导航到 Account Manager，路由视图卸载/重挂载保留 active ticket；浏览器环境不注册 Tauri listener。新增竞态、路由生命周期与 browser-mode 回归测试；lint:fe、生产构建、critical 259 项、前端全量 359 项、Rust 630 项（1 项 skipped）、clippy、cfg hygiene 与格式检查通过。macOS 隔离测试用户的界面与 Deep Link 验收待执行。
- 2026-10-03：继续 R01 并修复三处并发/失败恢复问题：Account Manager 跨路由共享 load 序号，阻止旧 IPC 响应覆盖新页面数据；Auth Proxy 在同一串行 mutation 中幂等创建 Station 并写入新账号；ticket 校验失败不消费票据，登录启动失败时按 owner 回滚新建元数据、关闭新 WebView，并恢复仍有效的 ticket。新增路由乱序加载、同 host 幂等、回滚归属、ticket 恢复及窗口失败回归。验证通过：lint:fe（含 i18n/doc 链接）、critical 263、前端全量 363、前端构建、Rust 635 项（1 项 ignored）、clippy、cfg hygiene、fmt 与 diff whitespace 检查。隔离 macOS 账号真机 UI/Deep Link 验收仍待执行；Windows traceroute 状态差异按用户要求记录，留待后续 Windows 回归。
- 2026-10-03：a11y 复审发现账号卡片的 `role="button"` 包含多个子按钮，导致屏幕阅读器无法分别识别卡片动作。卡片改为有名称的 article，以账号名 toggle button 提供键盘选择与焦点样式，复制/登录等操作仍是独立按钮；新增屏幕阅读器角色可见性回归。定向语言/卡片测试 4 项、critical 264 项和 lint:fe 通过。macOS 隔离账户真机验收待执行。
- 2026-10-03：Auth Proxy callback 完成路径增加每个登录窗口的一次性原子闸门，避免 callback 被站点重试时并发触发多次 loopback 请求或重复打开外部 App；新增并发领取回归。Rust 全量 667 项（1 项跳过）、Clippy、Rust fmt、cfg hygiene、lint:fe、critical 295 项、88 篇 Markdown 链接检查通过；隔离 macOS 应用内回调复验待完成。

- 2026-09-10：新增规划 **F5 浏览器会话注入**（一键在浏览器中打开账号会话，仅调研未实现）：调研 `explanation/browser-session-injection-research.md`。四方案对比（CDP+托管 profile / 扩展注入日常浏览器 / 直写 Cookies DB / cookies.txt 导出），推荐 CDP + Bench 托管 profile 先行（隔离语义与「每账号独立 data directory」原则一致——见交互图 C2 技术实现、凭据链路不出 Rust 内存、零扩展依赖），扩展注入为 M3 进阶，后两者因红线冲突排除；M1 任务分解与 D-A~D-D 决策点待确认后实施。
- 2026-09-10：落地**登录判定规则包（rulepack）**（调研：`explanation/login-detection-rulepack-research.md`，规格：`reference/login-rulepack-spec.md`）——①`login_rules.rs` 新模块：声明式 JSON 规则（loginCheck 服务端权威探针 + text/selector fallback 弱证据），fail-closed 校验（deny_unknown_fields / id=可注册域 / kind 白名单），bundled 内置集（`ruledata/`：trae.cn `CheckLogin Result.IsLogin` 实测 + github.com `api/user` 401/200 实测）+ 远程拉取（command-market 登录规则板块 `rules.json`，零配置官方源 + `BENCH_LOGIN_RULES_URL/DIR` env，缓存 `$APPDATA/login-rules/`，启动后台拉取 + 24h TTL 惰性刷新，失败静默沿用）；②判定融合：优先级 = 用户手配 Custom > 规则包 > 旧预设，证据分层不变，loginCheck 为强判据短路（`loginCheck` reason）；③**修复 L0b 弱肯定越权**（trae.cn 误判根因）：probe/keeper 两路「指纹 present → Ready」改为继续走文本分类链，仅保留「全缺失 → 未登录」否定短路；④仓库侧：kindred-plugin-market/command-market 新增 `rules.json` + `rules/` + `build-rules.mjs` + CI 重算（与命令市场独立 schema，老客户端零影响）。安全铁律：loginCheck 同可注册域 + GET/POST 白名单 + 不跟随重定向（携带账号 cookie 的请求，同域约束下投毒无法外泄）。测试 +9（校验/匹配/fallback 判定/JSON 路径）；门禁全绿（clippy/test 492/check:be-cfg 368）。**注意：trae CheckLogin 实测仅接受 POST（GET 404），`login-state-detection-research.md` 的 GET 记录已修正**。UI 规则来源标注待后续轮（未新增 IPC，contracts 无改动）。
- 2026-09-10：规则包升级为**通用规则 + 站点特殊规则双层体系 + 「更新登录逻辑」弹窗**（规格 §4.4/§6 同步回写）——①仓库侧 command-market 新增 `rules/generic.json`（id 固定 `"generic"`、match 省略 = 全局兜底、禁 loginCheck、中英文文本弱证据；`build-rules.mjs` 特例放行，commit a642fd9 已推送）；②宿主 `login_rules.rs`：`match_rule` 改 `Option<RuleMatch>`、generic 校验特例（禁 match/loginCheck、必须 fallback）、`rule_matches_host` generic 对任意 host 生效、`pick_best` 优先级 = 站点特殊 > generic > 精确 host > 同 id 版本高者（同版本平局取 remote，消除顺序依赖缺陷）> 远程 > bundled，bundled 新增 `ruledata/generic.json`；③新增 IPC `get_login_rules_overview`（当前生效 generic/站点规则详情 + 远程索引版本比较 `updatable`）与 `update_login_rules`（scope = all/generic/site 按需拉取，逐条 sha256/size/schema 校验 + 版本单调防降级守卫，meta 记录 indexUpdatedAt），commands 注册 + contracts 契约双写；④前端：DetailColumn 右上角「打开官网」左侧新增按钮 → `LoginRulesDialog`（标题「更新登录逻辑」，展示通用/站点规则卡片的判定逻辑与更新时间，三个更新按钮按远程 `updatable` 才可点、检查中/更新中 loading），`useLoginRules` hook 编排（防重入 + 更新后自动重新检查），i18n zh/en 同步；测试 +4（弹窗行为）+ Rust generic 校验/优先级 +5；门禁全绿（fmt/clippy/nextest 497/check:be-cfg 369/lint:fe/vitest 280/prettier）。注意：`fetch_and_cache` 重构为 `fetch_index`/`fetch_validated_entry`/`write_docs_to_cache` 共用路径，全量后台刷新同样获得版本单调守卫。
- 2026-09-10：按用户要求废弃 HTML 字段（登录页检测）判定，改为**指纹值形态匹配**——采样时对每个特征记录**值长度**（`CookieFeature.value_len` / `LoginFingerprint.storage_key_lens`，不存值本身，serde default 兼容旧指纹），判定时要求同名特征值长度与采样同量级（`value_shape_matches`：≥ 采样一半且 ≥ 4 字符）。效果：已登录账号特征值为长串密钥 → 匹配判已登录；未登录账号同名 cookie 是短占位/空值 → 形态不符判未登录（修复 www.trae.cn 误判）。移除 `is_login_page`/`IS_LOGIN_PAGE_SCRIPT` 与两处调用；`capture_from_window` 采集长度、storage 脚本返回 `{k,l}` 条目；probe/keeper L0b 两路生效。**注意：已采样的旧指纹无 value_len（=0）不校验长度，需重新采样一次才能获得带形态的指纹。** 新增测试覆盖短占位不符、长串匹配、阈值边界。
- 2026-09-10：修复"www.trae.cn 账号未登录但采样 0627 后被判已登录"——定位为指纹特征名存在但非登录专属（站点通用 cookie 同名），且该账号 WebView data dir 为空。修复：L0b 增加**登录页检测**（`is_login_page`：password 输入框或登录文本且无登出文本 → 确定性未登录，优先于指纹判定），probe 与 keeper 两路生效。同时优化确认体验：确认后刷新改用 `refresh.handleRefreshStation`（站点/账号刷新按钮进入 loading 态），完成后目标账号用 updated 覆盖保持 Ready。
- 2026-09-10：修复"手动刷新 fetchFailed 但登录窗口已登录"——对比本地 store 数据发现 trae（`probeStrategy=hybrid`）全部账号 fetchFailed，根因是 **probe/keeper 隐藏 WebView 加载超时仅 5s**（detect/capture 为 15s），SPA 站点加载超时直接 FetchFailed，而可见登录窗口能正常加载故"点登录看到已登录"。修复：①probe.rs / session_keeper.rs 加载预算 5s→15s 对齐；②新增 `wait_for_any_feature_present` 轮询（6×500ms）等待 SPA 延迟就绪的 cookie/localStorage 特征，避免 L0b 首次检查全缺失误判；③L0b 判定改为指纹存在→Ready / 缺失→LoginRequired，不再产出无意义的 FetchFailed（仅 WebView 真加载失败保留 FetchFailed 兜底）。
- 2026-09-10：修正指纹判定链与采样交互——①**L0b 信任指纹**：WebView 路径下指纹任一特征存在 → Ready（keeper 同步改为存在→重新捕获 session），全部缺失 → 未登录，不再受文本分类误判（修复 7242 类"实际登录但被判未登录"）；②**L0a 保守化**：指纹全缺失仅 HttpOnly 直接返回，其余跳过 HTTP 走 L0b 复核（避免 canonical session 空但 data dir 有登录态的账号被误判）；③HTTP 弱证据（文本分类 LoginRequired/Expired）在指纹存在时升级 WebView 复核，HTTP 401/403 强证据（新增 `httpAuthStatus` reason）仍直接判未登录；④点击采样按钮**立即弹窗**（弹窗内「采样中」loading，采样完成更新特征摘要），弹窗账号名取采样目标。
- 2026-09-10：修复指纹采样/确认交互——①采样成功不再 `loadInitialData()`（避免选中项被 `applyInitialSelection` 重置为第一站点/账号、弹窗文案错位），改为本地 patch 站点 `loginFingerprint` 摘要与 `authProfile`，弹窗账号名取自采样目标 `fingerprintTarget`；`capture_login_fingerprint` 返回扩展为 `{ summary, profile }`（一次采样两份画像，「尚未检测认证配置」区域即时消失）。②确认后 `refreshStation` 用 `confirm` 返回的 updated 覆盖目标账号，保证"根据用户确定"目标保持 Ready，其余账号按指纹 L0 预检判定。
- 2026-09-10：D1 拍板方案 A 落地——新增 `StationAccount.status_reason`（仅指纹 L0 短路时 `fingerprintMissing`），手动/keeper 刷新写账号字段与日志 detail（reason），`StatusBadge` 与快速登录徽标在指纹判定未登录时挂 tooltip「指纹缺失，已确认未登录」，确认登录时清空；`status.reason.fingerprintMissing` 与 `accountLog.detail.reason` 双语。
- 2026-09-09：实施 F1/F2/F3/F4（F1-T1/T2/T4、F2-T1..T7、F3-T1/T2/T3、F4-T1 已实现，F1-T3 匹配统一调研可延后，F2-T5 的「已确认未登录」徽标标注待 D1）：指纹采样按钮+确认弹窗+probe L0a/L0b 预检（完整特征存 snapshot.fingerprints，DTO 只出摘要）、外部登录 isAuthorize 引导转快速登录、run_proxy_login 补互斥、keeper/代理日志写点与 detail 扩展、弹窗选项卡溢出修复。真机验证项见 F1/F2 验收；见变更记录下一条。
- 2026-09-09：新增规划轮 F1–F4（仅规划未实现）：确认快速登录与外部登录在普通 URL 场景功能重叠并给出「双入口保留 + isAuthorize 引导分流」收敛方案（含 run_proxy_login 互斥缺失问题）；设计站点级登录指纹（cookie 特征名单 + storage 键名，不含值）采样按钮、确认弹窗与 probe L0a/L0b 预检判定链；账号日志 detail 扩展（source/probeLayer/fingerprintHit 等）与写点补齐；定位外部登录弹窗第二步选项卡 `h-8`/`whitespace-nowrap` 溢出根因。附 D1–D4 待拍板决策点与任务分配总表。
- 2026-09-09：实现 Session Keeper 会话保活(每账号 interval/daily 静默刷新计划 + 后端 30s 调度器 + 隐藏 WebView 重新捕获 session)、账号日志(每账号 100 条环形,加密 store 持久化)、快速登录 URL 站点自动匹配与已有账号选择、first_login_at 初次登录时间;新增 IPC `set_account_refresh_schedule` / `list_account_logs` / `match_stations_by_url`,`open_login_window` 扩展显式 url 参数并修复 ephemeral 无 station 的 NotFound 缺陷。已同步产品说明 §5/§6/§16 与交互图 B1（会话保活语义）;真机验证项见 §4a。
- 2026-09-03：生成产品说明与规划功能文档（依据 `src/features/account-manager/`、`src-tauri/src/account_manager/`、`docs/modules/account-manager/` 与 ROADMAP R01/R04）。
