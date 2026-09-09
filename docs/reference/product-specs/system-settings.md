# System Settings（系统设置）产品说明

> 本文件是 system-settings 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。
> 规划/未完成项见 `../planned/system-settings.md`；平台/权限/键位约束见 `../modules/system-settings/design.md`。

## 1. 定位

- **独立 feature**（`desktopOnly: true` + `platforms: ["macos"]`），入口：路由 `/system-settings`，侧边栏注册，**仅 macOS 显示**（Windows 隐藏，直达路由显示 unsupported）。
- 用途：提供**受控的系统开关、快捷入口、设置搜索和应用授权**——不直接复制 macOS 系统设置，只做「常用且可可靠读回」的设置。
- 平台边界：macOS 为主；不支持的设置显示 unsupported / 只读跳转，**不显示为「当前关闭」**。

## 2. 界面总览（搜索栏 + 4 Tab）

```
┌──────────────────────────────────────────────────────┐
│ 搜索栏（跨设置搜索，命中后点击跳转对应 Tab）            │
├──────────────────────────────────────────────────────┤
│ Tab 栏：外观 | 安全与隐私 | 系统 | 高级（搜索时隐藏）    │
├──────────────────────────────────────────────────────┤
│ 内容区（两列网格 SettingGroup 分区）                    │
└──────────────────────────────────────────────────────┘
```

- **搜索**：顶部搜索框，`search-index.ts` 静态索引（canonical id/section/key），命中展示结果卡（名称 + 描述 + 所属 Tab/Section 徽标），点击跳转到对应 Tab 并清空搜索；无结果显示空态。搜索时隐藏 Tab 栏。
- **Tab**：appearance / security / system / advanced（下划线式切换，见 §2 交互细节修正）。
- 读取策略：外观/安全/系统三 Tab 共用一次 `getSystemSettingsSnapshot`；已加载 Tab 缓存（`loadedTabs`），切回不重复读；仅读取失败展示整区错误态（可重试），加载中由每个开关内部 spinner 表达（不整屏骨架）。
- **写操作统一包装 `useSettingAction`**：per-key loading（`applyingKeys` 集合，同一 key 不可并发、不同 key 可并行）、成功/失败 toast、开关内 spinner 表达 loading（不用 toast.loading）。

**交互与反馈细节**：

- **页签渲染**：实际为**下划线式 Tab**（`border-b-2` 高亮 + ghost 样式），非胶囊；切换时若该 Tab 未加载则触发读取，已加载 Tab（`loadedTabs`）切回不重复读。
- **窗口聚焦自动刷新**：`useSettingsSectionLoader` 分区（防止睡眠 / 锁屏 / 显示与 Dock / 键盘等）监听窗口 focus 事件，**重新聚焦时自动 `reload(true)` 强制刷新**——系统设置被外部改动后回到本窗口即可同步；卸载时清理事件监听。
- **页签切换**：横向胶囊 Tab（见上「下划线式」修正）；已加载 Tab（`loadedTabs`）切回不重复读（`hydrateCachedTab`）；appearance/security 共用一次快照、system 额外并行拉浏览器与登录项（`Promise.allSettled` 部分失败不影响其余）；仅整区读取失败才显示错误态 + 重试，加载中由各开关内部 spinner 表达（不整屏骨架）。
- **开关写入**：点击开关 → 该 key 进入 `applyingKeys`（内部 Loader2 旋转，开关禁用）→ 执行受控 adapter → 后端 read-after-write 回读校验 → 成功 toast + 更新 store；回读不一致视为失败并 toast 错误，**不乐观显示成功**。不同 key 之间可并行操作。
- **unknown 态显式按钮（SettingToggle）**：`checked === null`（读取失败/未读）且未 loading 时**不显示 Switch**，改为「未知」Badge + 「关闭 / 开启」两个显式按钮（`CircleOff`/`CirclePower`，带 tooltip 与 `aria-label`），可主动将该项置为 true/false（避免 unknown 状态卡死）。
- **SettingChoiceButtons 细节**：点击当前已选值 **no-op**（不触发写入）；`loading` 期间所有选项不高亮（全部 outline）+ 末尾旋转图标（`aria-label=loading`）；`disabled`（含全局 applying）时不可点。
- **全局 applying 与 per-key 差异**：Switch 用 **per-key**（`applyingKeys.has(key)`）精细 loading；而**截图格式选择 / 截图保存位置按钮 / TCC「重置」按钮 / 登录项「移除」按钮 / 锁屏密码延时**在 `applyingKeys.size > 0`（任意 key 应用）时**全局禁用**——并发策略不统一（实现如此，未见整理）。
- **搜索**：输入即过滤静态索引；命中卡显示名称 + 描述 + Tab/Section 徽标，点击跳转对应 Tab 并清空搜索；无结果显示空态文案；搜索时隐藏 Tab 栏；输入框右侧提供清空按钮（`aria-label`）。
- **四态选择（`SettingChoiceButtons`）**：低电量模式 / 菜单栏自动隐藏为单选组，点击某值即写入并 toast；值变更期间该组 `disabled` + loading。
- **TCC 权限重置**：每行「重置」按钮 → `prompt` 输入 bundleId → 取消则不执行；执行中该行按 `privacy.reset.<service>` 作用域 loading；成功后 toast 成功文案。
- **登录项移除**：点「移除」→ `DestructiveConfirmDialog` 二次确认 → 执行 `removeLoginItem` → **重读列表**（read-after-write）→ 空态显示「暂无登录项」。
- **快捷操作（QuickActions）**：锁定屏幕 / 立即睡眠直接执行（无确认）；清倒废纸篓 / 重启 / 关机先弹 `DestructiveConfirmDialog`（含后果说明），确认期间按钮 `applying` 全局禁用。
- **默认浏览器**：下拉切换时右侧 spinner + 下拉 disabled；当前值不在候选列表则补一项显示；切换经 `setDefaultBrowser` 成功 toast；读取失败显示错误态（可重试）。

## 3. 外观（appearance）Tab

### 显示与 Dock（DisplayDockSection）

- 电池百分比显示（Switch；打开「控制中心」设置）。
- Dock 位置：左 / 下 / 右（三选按钮；打开「桌面与程序坞」）。
- 最小化缩放效果（Switch）。
- 数据独立读取（batteryPercent / dockOrientation / minimizeScale）。

### Dock 与菜单栏开关（toggles）

- 自动隐藏程序坞（Switch，开「控制中心」设置）。
- 程序坞显示最近使用的 App（Switch，开「桌面与程序坞」）。
- 隐藏桌面图标（Switch）。
- 菜单栏自动隐藏：**四态选择**（永不 / 仅全屏 / 仅桌面 / 始终，映射 `AppleMenuBarVisibleInFullscreen` + `_HIHideMenuBar`）。

### 截图（screenshot）

- 禁用截图阴影（Switch）、显示缩略图（Switch）。
- 截图格式：PNG/JPG/BMP/PDF/TIFF 五选（`SettingChoiceButtons`）。
- 截图保存位置：只读输入框 + 文件夹选择按钮（`openPlatformDialog` directory）。

## 4. 安全与隐私（security）Tab

### 锁屏（LockScreenSection）

- 需要密码（Switch；开「锁屏」设置）。
- 需要密码延时：立即 / 5 / 10 / 30 / 60 秒（仅开启时显示）。

### 网络（network）

- 防火墙（Switch，开「网络」设置）、远程登录 SSH（Switch）、屏幕共享（Switch）、隔空投送关闭（Switch）——均为 macOS 网络共享开关。

### Gatekeeper（只读）

- 显示「App Store」/「已识别的开发者」两个按钮（disabled）说明当前模式可读；点击整块跳「隐私与安全性」设置；带只读说明。

### 隐私与安全性（TCC）

- 六类权限列表（相机 / 麦克风 / 屏幕录制 / 完全磁盘访问 / 位置 / 辅助功能）：点击行跳系统隐私设置；每行「重置」按钮——弹 `prompt` 输入 bundleId → `resetTccPermission` 重置该 App 权限（成功 toast，作用域 `privacy.reset.<service>`）。

## 5. 系统（system）Tab

### 睡眠（SleepSection）

- 防止睡眠（Switch）：`toggleSleepInhibitor`（`prevent_sleep + prevent_display + auto_disable_on_exit`），显示启用时间。

### 快捷操作（QuickActionsSection）

- 橙色警告条 + 5 个动作按钮：锁定屏幕（直接执行）、**清倒废纸篓** / **重启** / **关机**（`DestructiveConfirmDialog` 二次确认；关机/重启有后果说明）、立即睡眠（直接执行）。

### 系统设置快捷入口（shortcuts）

- 热角（桌面与程序坞）、锁屏、语言与地区、键盘——各按钮打开对应系统设置面板。

### Finder

- 显示隐藏文件、显示路径栏、显示状态栏、显示“资源库”文件夹、显示文件扩展名、禁止生成 .DS_Store（6 个 Switch）。

### 电源策略（batteryStrategy）

- 低电量模式：**四态选择**（永不 / 始终 / 仅电池 / 仅电源适配器，映射 `pmset -b/-c`）；点击 label 跳「电池」设置。
- 屏幕保护（Switch，开「桌面与程序坞」）。

### 默认浏览器

- 下拉选择（Safari / Chrome / Edge / Firefox / Brave / Opera / Arc；当前值不在列表则补一项）；切换经 `setDefaultBrowser`，成功 toast；loading 显示右侧 spinner；「打开桌面设置」按钮。
- 读取失败显示错误态（可重试）。

### 键盘（KeyboardSection）

- Fn 键（将 F 行用作功能键）、自动纠正、智能引号、智能破折号、自动大写（5 个 Switch，各带「打开键盘设置」入口）。

### 登录项（login items）

- 「在系统设置中管理」按钮；列表显示登录项名称 + 逐个「移除」（`DestructiveConfirmDialog` 二次确认，移除后重读列表）；空态提示。

## 6. 高级（advanced）Tab

### 应用授权（AppAuthorizeSection，仅 macOS）

- 「选择 App…」→ 文件选择（默认 `/Applications`）→ 校验为 .app bundle → 弹 `AlertDialog` 展示 `spctl --assess` 授权命令原文 → 确认执行 `authorizeMacApp`（Gatekeeper/quarantine 授权）；成功 toast + 系统通知（notification 权限可被拒，忽略失败）；失败展示错误。
- **运行锁细节**：授权运行中「选择 App…」按钮 disabled；AlertDialog 内「取消」「确认授权」均 disabled、确认按钮文案切为「授权中…」+ spinner；**运行中弹窗不可关闭**（`closeConfirm` 在 `running` 时 return）；非 macOS 平台整个分区不渲染（`navigator.platform` 含 mac 才显示）。
- 文件选择取消 → 静默（无 toast）；选择非 .app → toast「不是有效的 App」。

### 启动服务（只读列表）

- **LaunchAgents**：`~/Library/LaunchAgents` 等用户级启动代理列表（名称 + 文件）。
- **LaunchDaemons**：`/Library/LaunchDaemons` 等系统级守护列表（只读，不改动）。
- 均含加载/错误/空态。

## 7. 快捷键

无全局快捷键（本模块未实现；编辑输入框内 Enter 等为原生行为）。

## 8. 技术实现要点

- **架构分层**：`page.tsx`（组合搜索/Tab/分区）→ `components/sections/`（每分区独立组件，`useSettingsSectionLoader` 独立加载与缓存）→ `components/SettingToggle`（统一二值开关）/`SettingChoiceButtons`（统一枚举选择）→ `hooks/useSettingAction`（统一 loading/反馈/read-after-write）→ `services/use-cases + repository` → `@/lib/tauri/commands/system-settings`。
- **写入可靠性（read-after-write）**：读取当前值 → 执行受控 adapter → 重新读取 → 比对目标值 → 更新 UI/报失败；写入后回读不一致视为失败，不乐观显示成功。
- **命令参数结构化**：禁止 renderer 提交 shell 字符串；`defaults` 仅用于已验证 domain/key（映射真理源在后端 `src-tauri/src/system_settings/`，按领域拆分 finder/dock/display/keyboard/network/privacy/screenshot/login_items/quick_actions/system_toggles 等）。
- **store**（zustand）：保存已读取设置与共享 UI 状态（activeTab / loadedTabs / loadedSections / applyingKeys），`applySnapshot` 一次灌入快照；不承担命令编排。
- **契约**：`src/lib/tauri/contracts.ts` 与后端命令双边集中维护（含语义化系统面板打开命令 `open_*_settings`）。
- **搜索**：`search-index.ts` 语言无关 canonical 条目，渲染期 i18n 取文案；枚举/浏览器值不以中文作 canonical。
- **自启动（D-019）**：`getAutostart_status` / `set_autostart` 契约存在；LaunchAgents plist 机制（`com.bench.app.plist`，`--hidden` 静默启动）。

## 9. 数据模型（关键类型）

- `SystemSettingsSnapshot`：`finder`（show_hidden_files / show_pathbar / show_statusbar / show_library_dir / show_file_extensions / no_ds_store）、`screenshot`（format / disable_shadow / show_thumbnail / save_location）、`network`（firewall / ssh / screen_sharing / airdrop_disabled）、`toggles`（autohide_dock / autohide_menu_bar / dock_show_recents / hide_desktop_icons / low_power_mode / screen_saver）。
- `SleepConfig` / `SleepState`（enabled / since / config）。
- `MenuBarAutoHideMode`（四态）、`LowPowerMode`（四态）、`GatekeeperMode`（app_store / identified_developers）。
- `LoginItem`（name / enabled）、`LaunchService`（name / path / enabled）、`TccPermission`。
- `SettingResult`（success / message）；网络诊断类型 `PingResult` / `PortCheckResult` / `IpInfo` / `WifiInfo`（命令存在）。
- store 关键状态：activeTab、loadedTabs、loadedSections、applyingKeys、各设置值（见快照 + 分区独立项）。

## 10. 边界与限制

- **仅 macOS**（feature 级 `platforms: ["macos"]`）；Windows 隐藏导航，直达显示 unsupported。
- **权限与失败语义**：TCC / 辅助功能 / 自动化权限不足返回稳定错误并提供系统设置入口；需要 System Events/AppleScript 的操作设置 timeout；设置读取失败保留 unknown/error 状态，**禁止回退为 `false`**；unsupported 不显示为关闭。
- **高危操作二次确认**：清空废纸篓、重启、关机、移除登录项；应用授权弹原文确认。
- **键位映射**：`defaults read` 见值 ≠ 可写；必须验证写入后系统 UI 与再次读取均变化；cfprefsd 缓存、ByHost、容器化 plist、布尔/枚举差异纳入排查；无法稳定控制则保留只读或跳转，不实现虚假开关。
- Gatekeeper 仅只读展示（不写）；启动服务只读列表。

## 11. 异常处理

### 11.1 错误码 → 前端提示映射

后端统一返回 `{ code, message }`（`src-tauri/src/error.rs` AppError）；前端 `useSettingAction` 捕获后 toast（`systemSettings.toasts.error` + 后端 message），读取类失败进入分区/整区错误态（`SettingsSectionState`，可重试）。

| 错误码                                        | 场景                                                                                                                                                                                                                                                              | 前端行为/提示                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `SETTING_VERIFICATION_FAILED`                 | 写入后 read-after-write 回读不一致（`helpers.rs`：4 次 / 75ms 重试后仍不匹配）                                                                                                                                                                                    | 视为写入失败 toast 错误，不乐观显示成功                                           |
| `DEFAULT_BROWSER_CHANGE_FAILED`               | LaunchServices `LSSetDefaultHandlerForURLScheme` 设置失败                                                                                                                                                                                                         | 默认浏览器下拉 toast 错误；后端**自动回滚** http/https 原 handler（`browser.rs`） |
| `DEFAULT_BROWSER_UNKNOWN`                     | macOS 未报告默认浏览器（读回为 null）                                                                                                                                                                                                                             | 下拉显示错误态（可重试）                                                          |
| `DEFAULT_BROWSER_CHANGE_REQUIRES_USER_ACTION` | 写入后读回 http/https handler 与目标不一致                                                                                                                                                                                                                        | toast 提示「去系统设置手动完成」；前端下拉值不乐观更新                            |
| `INTERNAL`                                    | `defaults`/`osascript` 等外部命令失败、HOME 缺失、plist 读写失败（message 带操作名）                                                                                                                                                                              | 操作 toast 错误；读取类进错误态可重试                                             |
| `INVALID_INPUT`                               | 非法 TCC service / bundleId 含空白与引号分号、截图路径为空/非绝对/目录不存在、JSON 格式化/base64/哈希类型/时间戳非法、未知系统面板 `open_*_settings`、浏览器 bundle id 非法（`canonicalize_bundle_id`：非反转域名、空段、段首/尾 `-`、非字母数字字符、长度 >255） | toast 错误，不重试（修正输入/选择后重试）                                         |
| `UNSUPPORTED`                                 | 非 macOS 上读取快照 / 系统级操作                                                                                                                                                                                                                                  | 功能隐藏；直达显示 unsupported                                                    |
| `IO_ERROR`                                    | LaunchAgents 目录/plist 读写失败                                                                                                                                                                                                                                  | 高级 Tab 对应分区错误态（可重试）                                                 |
| `TASK_FAILED`                                 | `spawn_blocking` JoinError                                                                                                                                                                                                                                        | 对应操作 toast 错误                                                               |

### 11.2 常见失败场景与行为

| 场景                                                                         | 行为/提示                                                                                                           | 恢复/降级                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 快照/浏览器/登录项/启动服务读取失败                                          | 各自分区 `SettingsSectionState` 错误态（独立，不影响其它分区）；system Tab 用 `Promise.allSettled` 部分失败部分可用 | 分区内「重试」按钮；不整屏崩溃                                      |
| system Tab 部分失败**不缓存**                                                | `Promise.allSettled` 三路中任一失败则不 `markTabLoaded`；该分区显示错误态                                           | 切走再切回该 Tab 会重新读取（非缓存快照）；全成功才标记已加载       |
| 默认浏览器设置失败/回读不匹配                                                | `DEFAULT_BROWSER_CHANGE_FAILED` / `DEFAULT_BROWSER_CHANGE_REQUIRES_USER_ACTION`                                     | 后端自动回滚 http/https；前端下拉不乐观更新值                       |
| 开关写入后系统未生效（cfprefsd 缓存 / ByHost / 容器化 plist / 布尔枚举差异） | `SETTING_VERIFICATION_FAILED` → toast 失败，**不乐观显示成功**                                                      | 重试；无法稳定控制则保留只读/跳转系统设置，不实现虚假开关           |
| TCC / 辅助功能 / 自动化权限不足                                              | 稳定错误 + 引导打开系统设置                                                                                         | 提供系统设置入口；需要 System Events/AppleScript 的操作设置 timeout |
| 系统通知权限被拒（AppAuthorize 成功通知）                                    | `sendNotify` 失败被捕获忽略                                                                                         | 功能不受影响（toast 已反馈成功）                                    |
| 选择的不是 .app bundle（AppAuthorize）                                       | toast「不是有效的 App」                                                                                             | 重新选择                                                            |
| 平台不支持（Windows / Linux）                                                | feature 级仅 macOS；导航隐藏、直达 unsupported                                                                      | 不显示为「当前关闭」                                                |

### 11.3 幂等 / 取消 / 并发保护

- **per-key 防并发**：`applyingKeys` 集合保证同一 key 不可并发（快速连点被短路），不同 key 可并行；`useSettingAction.run` 入口 `if (applyingKeys.has(key)) return undefined`。
- **read-after-write 校验**：读取当前值 → 执行受控 adapter → 重新读取 → 比对目标值 → 更新 UI/报失败；`helpers.rs` 最多重试 4 次（间隔 75ms）后报 `SETTING_VERIFICATION_FAILED`。
- **QuickActions 全局禁用**：任一动作执行中（`applying`）全部按钮禁用，防连点触发多次重启/关机/清空。
- **登录项移除串行**：移除后重读列表（read-after-write），再执行下一次移除。

### 11.4 数据与安全

- **命令参数结构化**：禁止 renderer 提交 shell 字符串；`defaults` 仅用于已验证 domain/key（映射真理源在后端 `src-tauri/src/system_settings/`，按领域拆分）。
- **TCC 重置校验**：service 必须命中 `ALLOWED_TCC_SERVICES` 白名单；bundleId 拒绝空白、引号、分号等注入字符（`privacy.rs`）。
- **键位映射原则**：`defaults read` 见值 ≠ 可写；必须验证写入后系统 UI 与再次读取均变化；无法稳定控制则保留只读或跳转，不实现虚假开关。
- Gatekeeper 仅只读展示（不写）；启动服务只读列表（不改动）。
