# 浏览器会话互通 V2：扩展通道立项方案（I3 / I5 提前）

> 状态：**已实施**（P0 全部落地；P1 读 / P2 写已实现，见 §8 实施现状；商店上架 P3 未做）　· 提出：2026-09-10　· 关联：`browser-session-interop-plan.md`（调研）、`browser-session-injection-research.md`（方案对比）、`decisions.md` D-029
>
> 本文相对既有调研的**唯一增量**：把 I3（读日常浏览器）与 I5（写日常浏览器）从「后续里程碑」提前为**当前必须实现**，并给出可行性核实结果、架构落点与分期。

---

## 1. 决策来源

用户真机实测后拍板（2026-09-10）：

1. **站点采样的语义被纠正**：采样应当是「读取我**日常浏览器里已经登录好**的登录态」，而不是「再开一个隔离窗口让你重新登录一次」。后者与「新增账号 + 在新实例里登录」没有区别，采样入口失去存在意义。因此——**若必须靠浏览器扩展才能做到，那就必须实现扩展**。
2. **出向（注入）也要覆盖日常浏览器**：I5 正式立项。
3. 「清空浏览器数据」按钮**移除**。
4. 旧命名的孤儿 profile 目录**做一次自动迁移**。

---

## 2. 前置缺陷取证（已确认，独立于本方案）

三条实测问题的根因（详见当日工作记录）：

| #   | 现象                               | 根因                                                                                                                                                                                                                                                                                                     | 证据                                                                                                                            |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 采样时浏览器**不断新增同一个页面** | `cdp.rs:204` 的 `attach_page()` 只复用 `url` 以 `about:` 开头的页面；而 `useStationBrowserInterop.ts:32` 每 2s 轮询 `preview_station_session` → 首次导航后已无 `about:` 页 → **每次轮询都 `Target.createTarget(about:blank)`**（`cdp.rs:217`），随后又被 `ensure_page_on_origin` 导航走（`mod.rs:1175`） | `station-stn-2d33b26f/profile/Default/Sessions/Tabs_*` 内含 **46 个 `about:blank`**（单标签页会话文件约 5–15 KB，该文件 39 KB） |
| D2  | 打开后未注入登录态                 | **非缺陷。** `www.workbuddy.cn` 的 `0627` = `acct-3860a50d`，store 中 `session = false`（`sessions` 仅有 `acct-9d07f4ce` / `acct-abe4dd8a`，均属 trae.cn）→ 后端 `has_stored_session = false`、`injected = 0`                                                                                            | store `sessions` 键集；`useBrowserInterop.ts:101` 的 warning 分支                                                               |
| D3  | 弹窗被内容撑宽                     | UA 串与 cookie 名列表用 `truncate`（`station-browser-interop-dialog.tsx:302/316`），`DialogContent` 为 `grid`（`dialog.tsx:68`），grid 子项 `min-width: auto` + `nowrap` 使 min-content = 整串宽度 → 无法收缩                                                                                            | —                                                                                                                               |

**附带发现**：`browser-sessions/` 下存在 2 个旧命名孤儿目录 `acct-04d64db2`、`acct-9d07f4ce`（早于 `Scope::key()` 引入 `account-` 前缀），当前代码不再引用，其中的登录态等于孤儿。

**文档债务**：`src-tauri/src/browser_ext/mod.rs` 引用的 `docs/browser-extension-export-research.md` **不存在**，需修正或补写。

---

## 3. 可行性核实结果

### 3.1 好消息：脚手架已在，不是从零开始

| 已有资产           | 位置                                                                             | 说明                                                                                   |
| ------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| MV3 扩展模板       | `src-tauri/resources/browser-extension/bench-companion/`                         | 经 `include_str!/include_bytes!` 编译期嵌入                                            |
| 扩展导出 + NM 注册 | `src-tauri/src/browser_ext/mod.rs`                                               | 写出可加载目录、生成 wrapper、注册 NM host `com.kindred.bench`                         |
| **固定扩展 ID**    | manifest 内嵌固定 `key` → `dmcfgfpfilhgcoddmciglpjdggkpinje`                     | ID 恒定，NM host manifest 的 `allowed_origins` **永久匹配**，无需随版本调整            |
| NM 通道            | `crates/bench-host/src/native.rs`（`bench-host native`）                         | 4 字节长度前缀 + JSON；dispatcher 与 `mcp` / `cli` **三通道共用**                      |
| 能力内核           | `crates/bench-capabilities/`                                                     | 平台无关能力（clean_space / photo_triage / terminology）+ `StoreLocator` / `PathGuard` |
| 安装引导命令       | `browser_ext_export` / `browser_ext_status` / `browser_ext_open_extensions_page` | 已能一键写出目录并打开 `chrome://extensions`                                           |

**结论**：I3/I5 不需要新建通道，**扩展 ↔ bench-host 的 Native Messaging 链路已通**，缺的是「会话互通命令 + 权限 + 与 Bench app 的运行时通道」。

### 3.2 硬约束（决定产品形态，必须先接受）

| #   | 约束                                                                                                                                                                                                                                             | 后果                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Chrome 137 已从 branded 构建移除 `--load-extension`**。官方替代是 `--remote-debugging-pipe` + CDP `Extensions.loadUnpacked`，但后者会把 `navigator.webdriver` 置为 `true`（站点可检测自动化），且只对**新起的、独立 user-data-dir 的实例**生效 | **无法把扩展自动装进用户正在使用的日常浏览器**。日常浏览器只能由用户手动「加载已解压的扩展程序」一次（Bench 已能一键导出目录并打开扩展页）。代价：Chrome 每次重启弹「停用开发者模式扩展程序」，需长期保留开发者模式。彻底消除该提示的唯一路径是上架 Chrome Web Store / Edge Add-ons |
| C2  | 读写任意站点 cookie 需要 **host 权限**。声明 `<all_urls>` 会向用户展示「读取和更改您在所有网站上的数据」                                                                                                                                         | 建议改用 `optional_host_permissions` + 按站点 `chrome.permissions.request()`；但该 API **必须由扩展自身 UI 中的用户手势触发**，因此每个新站点首次授权需一次弹窗交互                                                                                                                 |
| C3  | `localStorage` / `IndexedDB` **无扩展 API 可直读直写**，只能 `scripting` 注入脚本，且需目标 origin 的页面已存在                                                                                                                                  | 相比 CDP（可在任意页面求值），扩展路径在 storage 侧复杂度更高、失败面更大；IndexedDB 尤其如此                                                                                                                                                                                       |
| C4  | **I5 写日常浏览器会顶掉用户同站的日常登录态**                                                                                                                                                                                                    | 这是既有调研（F5 判断 2）的核心反对理由。必须带「冲突检测 + 覆盖前备份 + 回滚」，且默认不开启                                                                                                                                                                                       |
| C5  | 扩展只能在其**已安装的浏览器**里工作                                                                                                                                                                                                             | 「选择哪个浏览器」的语义从「用哪个程序开窗口」变为「从哪个浏览器的会话里读」；且需由扩展自报身份（UA-CH brands），后端不可自行假设                                                                                                                                                  |

---

## 4. 架构：两个端点 × 两个方向

把「浏览器」正式确立为与 Bench 内部 WebView **并列的端点**，并区分两种浏览器端点：

| 端点                  | 打开方式                                            | 通道                        | 读（入向）                                   | 写（出向）                       | 隔离性                     |
| --------------------- | --------------------------------------------------- | --------------------------- | -------------------------------------------- | -------------------------------- | -------------------------- |
| **A. Bench 隔离实例** | Bench 以账号/站点专属 `user-data-dir` 拉起 Chromium | **CDP**（loopback WS）      | ✅ 已有（`capture` / `capture_for_station`） | ✅ 已有（`open_for_scope` 注入） | 强（每账号独立档案）       |
| **B. 用户日常浏览器** | 用户自己的窗口，Bench 不启动它                      | **扩展 + Native Messaging** | ⬜ **I3（本次立项）**                        | ⬜ **I5（本次立项）**            | 无（与日常登录态共用档案） |

通道层不变式：**明文会话只在「加密 store → Rust 内存 → 通道 → 浏览器」之间流转，不进入 renderer / 前端 store / 事件 / 日志**（design.md §5）。通道本身不落明文。

### 4.1 扩展侧新增

- **权限**：`cookies`（必需）、`scripting`（storage 读写，C3）、`tabs`（定位 origin 上下文，可选）。
  - host 权限走 `optional_host_permissions` + 运行时按站点申请（C2）。
- **命令**（经 background → NM → `bench-host native` → dispatcher）：
  - `session_probe` —— 只读探测某站点在**本浏览器**是否存在登录态（cookie 名计数 + 是否命中站点指纹），不返回值。
  - `session_capture` —— 采集某站点 cookie（按站点可注册域过滤）+ `scripting` 注入采集 storage + UA。
  - `session_inject` —— 写入 cookie（`chrome.cookies.set`，含 httpOnly）；storage 经 `scripting` 注入恢复脚本。
  - `session_clear_origin` —— 仅清当前站点（`chrome.browsingData.remove` 的 `origins` 限定）。
  - `browser_identify` —— 扩展自报浏览器身份（UA-CH brands + 扩展 ID），供后端在「多浏览器」场景下定位目标。
- 全部命令的返回 DTO **只含计数与枚举**，与既有 CDP 链路的 DTO 语义保持一致。

### 4.2 与 Bench app 的运行时通道（关键取舍）

`bench-host` 由**浏览器**以 NM 方式拉起，是独立进程，与运行中的 Bench GUI 内存状态不同步。两条候选（沿用 `browser-session-interop-plan.md §5.4`）：

|          | **A. app 侧本地桥**（推荐）                                                                                                       | B. bench-host 直读 store                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 形态     | Bench app 起 `127.0.0.1` 随机端口 + 一次性 token + `Origin` 白名单（= 固定扩展 ID，已被 NM manifest 的 `allowed_origins` 验证过） | `bench-host` 经 `bench-capabilities` 的 `StoreLocator` 直接读写加密 store            |
| 凭据落点 | Rust app 内存（沿用唯一 writer）                                                                                                  | bench-host 进程内存 → **违反「解密只发生在 Rust app 内」**，且与应用内存状态双写冲突 |
| 结论     | ✅ 采纳                                                                                                                           | ❌ 排除（需新增 design.md §5 例外条款，且引入双 writer）                             |

桥的认证链：扩展 ID 由 Chromium 在 NM 层保证 → 扩展把该 ID 作为 `Origin` 头（或 `X-Bench-Ext`）出示 → app 校验一次性 token。端口与 token 通过 NM 通道下发（自然绑定到已验证的扩展身份），不落盘到可被其它进程读取的位置。

### 4.3 路由：何时用哪个端点

| 用户意图                                       | 端点                           | 方向                        |
| ---------------------------------------------- | ------------------------------ | --------------------------- |
| 「我已经在日常浏览器登录了，把它保存进 Bench」 | B（扩展）                      | 读                          |
| 「用这个账号身份打开站点」                     | A（隔离实例，注入）            | 写                          |
| 「让我的日常浏览器也用上这个账号」             | B（扩展）                      | 写（I5，带冲突警告 + 备份） |
| 「在一个干净环境里重新登录一次」               | A（隔离实例 + 清空该站点档案） | —                           |

---

## 5. 分期落地

### P0 —— 缺陷修复（不依赖扩展，可与 P1 并行，**建议立即落**）

1. **D1 修 Tab 风暴**：`attach_page` 改为「优先复用已在目标 origin 的页面 → 其次复用任意 `about:` 页 → 都没有才创建」；只读预览（`preview_station_session`）走**不创建、不导航**的独立路径。
2. **D1 修轮询打扰**：轮询间隔上调并在实例已停止时自动停止；`preview` 不再对用户正在操作的页面做附加 + 求值。
3. **D3 修弹窗溢出**：`DialogContent` 补 `overflow-hidden`，各面板补 `min-w-0`，长串改 `break-all`；同时补 `max-h` + `overflow-y-auto`。
4. **移除「清空浏览器数据」按钮**（含 hook 分支、i18n 文案、命令是否保留待 P1 决定）。
5. **孤儿目录自动迁移**：启动时把 `browser-sessions/acct-*` 重命名为 `account-acct-*`（幂等、冲突时保留新目录）。
6. **账号列表显示所属站点**（同名 `0627` 分属 trae 与 workbuddy，当前 UI 无法区分，是 D2 类误判的直接诱因）。
7. 修正 `mod.rs` 中失效的 `docs/browser-extension-export-research.md` 引用。

### P1 —— I3：从日常浏览器读（采样语义改写）

1. 扩展加 `cookies`（+ 可选 `scripting`）权限与 `session_probe` / `session_capture` / `browser_identify` 命令。
2. Bench app 侧起本地桥 + 一次性 token 校验；新增 IPC 命令与 DTO（**四写**：`commands.rs` / `contracts.ts` / `types/` / `commands/`，并加入 `contracts.test.ts` 的 `checks` 数组）。
3. 站点采样入口：默认路径改为「经扩展从日常浏览器读」；隔离实例降级为**可选**的「在没有日常登录态时使用」回退。
4. 浏览器选择器扩为**所有已安装浏览器**（含 Safari / Firefox / Arc 等非 Chromium 系——它们在 B 端点下只需扩展，不需要 CDP；A 端点下仍仅 Chromium 系可用，需在 UI 上区分）。
5. capabilities 新增对应能力项，真机验证前一律 `partial`。

### P2 —— I5：写日常浏览器

1. 扩展加 `session_inject`（`chrome.cookies.set`，含 httpOnly）+ `session_clear_origin`。
2. **冲突前置检查**：注入前探测日常浏览器同站既有 cookie，命中则弹冲突确认，并提供**导出备份**（不落明文盘，走既有加密导出链路）。
3. 默认关闭，需用户在弹窗内显式勾选「同时写入日常浏览器」。
4. 回滚路径：备份可一键还原。

### P3 —— 分发（消除开发者模式提示）

Chrome Web Store / Edge Add-ons 上架。这是唯一能消除「每次重启提示停用开发者模式扩展」的路径，也是 `--load-extension` 被移除后的长期解。上架前 P1/P2 以「开发者模式手动加载 + 引导」形态交付。

---

## 6. 风险与显式不做的事

| 风险                                         | 缓解                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| 开发者模式扩展的安装摩擦与每次重启提示       | P0 之外的引导要做到「一键导出 + 打开扩展页 + 分步骤截图」；把上架列为 P3          |
| 扩展权限升级会触发「扩展已禁用，待用户确认」 | 权限在本轮一次性申请到位，避免多次升级                                            |
| 每站点 host 授权需要用户手势                 | 在扩展 popup 内做授权引导，Bench 弹窗给出「下一步请在扩展图标上点一次」的明确指引 |
| storage 采集（C3）在部分 SPA 站点失败        | fail-closed：采集不到即不写入该项并计数上报，不静默降级                           |
| I5 顶掉日常登录态                            | 默认关闭 + 冲突确认 + 覆盖前备份 + 可回滚（C4）                                   |
| 扩展与 app 通道被本机其它进程冒用            | 一次性 token + `Origin`/扩展 ID 白名单 + 仅 loopback 绑定                         |

**显式不做**：直读/直写浏览器 Cookies SQLite（macOS Keychain Safe Storage + Chrome 130+ app-bound encryption）；`--load-extension` 编程注入日常浏览器（Chrome 137 已移除）；把 session 明文经扩展页面（popup/tab）中转。

---

## 7. 待确认

1. **P0 批次是否立即执行**（与扩展方案解耦，7 项均为确定性缺陷或已拍板事项）。
2. **P1/P2 的交付形态**：按「开发者模式手动加载 + 引导」先行、上架列为 P3，是否认可？（若要求开箱即用，则必须先把 P3 上架做完，P1/P2 会顺延到商店审核之后。）
3. 既有 `browser-session-interop-plan.md` 的 I3/I5 章节是否需要同步改写（避免两份文档结论不一致）。

---

## 8. 实施现状（2026-09-10）

### 8.1 已落地

**P0 缺陷修复**

| 项                     | 落地位置                                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab 风暴               | `browser_session/cdp.rs::pick_page_target`（优先「已在目标 origin 的页面」→ 空白页 → 任意页面，**只有一页都没有才新建**），5 处调用方全部改为传 origin 偏好；6 条单测覆盖选择优先级与 opaque 源边界 |
| 轮询打扰               | `collect_from_instance(..., allow_navigate)`：**只读预览传 `false`**，不再为采集把用户页面导航走；`preview_station_session` 走该路径                                                                |
| 轮询空转               | `PREVIEW_POLL_MS` 2s→3s；`refreshPreview` 见到 `running === false` 立即停表；1 条单测钉住「30s 内最多再跑一轮」                                                                                     |
| 弹窗溢出               | 两个互通弹窗补 `max-h-[85vh] overflow-x/y`、面板补 `min-w-0`、长串由 `truncate` 改 `break-all`                                                                                                      |
| 移除「清空浏览器数据」 | 账号维度弹窗 + hook + i18n 一并移除；hook API 面由单测钉住                                                                                                                                          |
| 孤儿 profile 迁移      | `profile::migrate_legacy_profile_dirs`（幂等、冲突保留两侧、无 Bench 痕迹不动），启动时后台执行；5 条单测                                                                                           |
| 失效文档引用           | `browser_ext/mod.rs` 注释改指本文档                                                                                                                                                                 |
| 所属站点可见           | 两个互通弹窗的标题/描述均带站点名；无会话时的引导文案改为指向站点维度入口（原文案指向已迁走的按钮）                                                                                                 |

**P1（I3 读日常浏览器）**

- `account_manager/browser_bridge.rs`：loopback HTTP 桥（`GET /v1/ping`、`POST /v1/site/resolve`、`POST /v1/session/import`、`POST /v1/session/export`），token + `Origin` 双校验，请求体/超时上限，CORS 预检应答；启动时写 `0600` 描述文件，退出时删除。
- `browser_session/mod.rs`：`resolve_site_for_extension` / `import_from_extension` / `export_for_extension`；落库**复用** `finalize_capture`（新鲜度仲裁、互斥、加密、probe 验证四条纪律与 CDP 通道完全一致）。
- 站点 → 站点匹配逻辑抽为纯函数 `commands::station::station_matches_for_url`，IPC 命令与桥共用，避免规则漂移。
- `bench-host`：新增 `--bridge-descriptor` 与 `browser_bridge_descriptor` 命令；NM wrapper 由 Bench 生成时带上该路径（控制面）。
- 扩展：权限加 `cookies` / `activeTab`，加 `optional_host_permissions`；`background.js` 增桥客户端（401 与连接失败各重试一次，覆盖 app 重启换 token）、按候选域采集 cookie。
- 前端：`browserSessionExtension` 能力项（不受「本机是否装有 Chromium」约束）；站点互通弹窗新增「① 推荐：从你的日常浏览器读取」区块（状态机 + 一键导出 + 打开扩展页）。

**P2（I5 写日常浏览器）**

- 扩展 `popup` 提供「用 Bench 账号登录此站点」：先取账号会话 → **把该站点现有 cookie 备份进 `chrome.storage.local`** → 逐条 `chrome.cookies.set` → 展示写入/失败计数与备份入口；「回滚」一键还原。
- `storageOrigins > 0` 时明确提示「本地存储无法经扩展写入，若仍显示未登录请改用浏览器实例方式」。

### 8.2 已知边界（**不是**缺陷，是有意为之）

1. **扩展通道只搬 Cookie**。`localStorage` / `IndexedDB` 在扩展侧无直读 API，而采集载荷 schema 只能保一份（`browser_storage`）。理由与取舍见 D-029 决议 4。
2. **扩展必须手动安装一次**，且 Chrome 会自动禁用开发者模式扩展的提示无法消除（Chrome 137 移除了 `--load-extension`）。要开箱即用只能走 P3 商店上架。
3. **每站点首次需要一次 host 授权手势**（`optional_host_permissions` + `chrome.permissions.request`），比声明 `<all_urls>` 更保守，代价是多一次点击。
4. **I5 会顶掉用户同站的日常登录态**——这是该方向固有的产品代价，只能靠「默认不勾选 + 覆盖前备份 + 一键回滚」控制，无法消除。

### 8.3 未做

- **P3 商店上架**（消除开发者模式提示的唯一路径；需开发者账号与审核）。
- 扩展通道的 **storage 采集/注入**（见 8.2-1）。
- 扩展通道**不打开任何窗口**，因此没有「实时预览」；面板上的实时预览仍属隔离实例通道。
