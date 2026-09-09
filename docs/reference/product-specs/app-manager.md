# App Manager（应用管理）产品说明

> 本文件是 app-manager 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。

## 1. 定位

- 主序列桌面功能，入口：路由 `/app-manager`，侧边栏注册（`sidebar.appManager`），图标 AppWindow。
- `desktopOnly: true`；目标平台 macOS、Windows（后端另有 `linux.rs` 骨架，能力未对等）。
- 用途：应用清单（发现本机已装应用）、启动/定位/授权/升级/卸载、推荐应用安装（市场）、多来源软件更新中心。
- 核心保证：所有破坏性操作只接受后端解析的稳定 `appId`；升级/卸载必须有 exact evidence；provider 失败不得显示「全部最新」；in-place 更新含校验与回滚。

## 2. 页面结构（三页签）

```
┌─────────────────────────────────────────────┐
│ 页签：已安装 | 应用市场 | 软件更新(带更新数徽章) │
├─────────────────────────────────────────────┤
│ 内容区（随页签切换，motion 淡入/移出）           │
└─────────────────────────────────────────────┘
底部常驻：确认对话框、安装进度对话框、安装阻塞对话框
```

- 首载懒加载（`lazy`）+ Suspense；页面级错误边界 `AppManagerErrorBoundary`；桌面能力不可用时 `RuntimeFeatureGate` 提示。
- 进入「软件更新」页签自动触发更新检查（5 分钟内已检查则复用缓存）。

## 3. 已安装页签（installed）

### 视图与数据

- 应用清单（`AppInfo`），表格/网格双视图（`viewMode` 持久化 localStorage `view-mode:app-manager`）。
- 表格列：名称（图标 + 系统徽章 + 更新可用红色徽章 + bundleId）、版本、来源（badge + 置信度百分比）、安装路径（compact 缩写 `…/xxx`，点击复制）、最后修改日期、操作列（启动/定位/升级/卸载 + 运行中/成功/失败状态图标）。
- 图标按需提取（`getAppIconBase64`，失败用前端 fallback）；网格卡片同源渲染。

### 工具栏 / 筛选

- 搜索（名称/bundleId 等）、类型筛选（全部/用户/系统/可启动/可管理，带计数）、分类筛选（ai/browser/communication/ide/launcher/utility/development/system/other，规则见 `app-categories.ts`）、系列筛选。
- 筛选面板 footer：平台包管理器可用性（Homebrew Cask / winget / Flatpak / Snap / Apt 勾选列表；全不可用时提示「noPmAvailable」）+ 上次扫描时间 + 上次更新时间 + 摘要（总数/可管理数）。
- 排序：名称/版本/来源/路径/最后修改（自然排序，默认名称升序），持久化 `app-manager-preferences`（activeFilter + sorting）。

### 操作（单应用）

- **启动** `launchApp(appId)`：后端解析 LaunchTarget（appBundle/executable/aumid/desktopEntry），Windows 不经 `cmd /C start`。
- **定位** `revealAppInFinder(appId)`（Finder / 资源管理器）。
- **授权（macOS）** `authorizeMacApp(appId)`：临时签名身份/卸载权限；仅在 `canAuthorizeMacApp` 时显示，二次确认，结果 toast。
- **升级** `upgradeApp(appId)` / **卸载** `uninstallApp(appId)`：二次确认；卸载系统应用/未知来源被阻止（ShieldAlert 图标 + tooltip）。
- 右键菜单（context menu）：启动/定位/授权/升级/卸载（卸载标 destructive），按 `allowedActions` 禁用。
- 操作防重入（`operations[appId].status === "running"` 时禁用），成功后 5s 状态自动复位；升级后自动重扫，卸载后延迟 800ms 重扫。

### 批量模式

- 批量切换后多选（复选框），工具栏出现：批量卸载（计数）、清除选择；运行中显示进度 `当前/总数` + 取消。
- 批量升级 `batchUpgradeApps(ids)` / 批量卸载 `batchUninstallApps(ids)`：二次确认（显示数量与名称列表），后端返回逐项 succeeded/failed/cancelled；前端监听 `app-manager://batch-progress` 事件刷新进度；结果面板汇总成功/失败/取消，可清除。

### 扫描

- 首次进入（首帧后）自动 `scanInstalledApps`；阶段进度（scanningDirectories / resolvingSources / processingMetadata）与已扫描数。
- single-flight（扫描中再触发不重入）；可取消（`cancelInventoryScan`）；失败显示错误条 + 重试；partial 扫描提示失败 provider 列表。
- 结果同时写入共享 `app-inventory` 快照（带 `revision`），app-manager 消费该快照；进入页面展示缓存快照（`config_dir/bench/app-manager/inventory.json`），重新扫描回写单调递增 revision。
- 已安装「更新可用」标记：`checkManagedAppUpdates(managedIds)` 返回可更新集合，合并进 `upgradeAvailable`；进入页面自动轻量刷新。

### 交互细节

- **首载/扫描**：首帧后自动扫描；加载骨架屏 + 阶段进度（scanningDirectories→resolvingSources→processingMetadata）与已扫描数；扫描中「重新扫描」变「取消」。
- **空态/失败态**：未扫描 →「开始扫描」提示；已扫描无结果 → 空提示；搜索无结果 → noResults；扫描失败 → 错误条 + 重试（保留缓存快照）。
- **表格/网格**：视图切换持久化（localStorage）；网格按行估算高度虚拟化、图标按需加载（失败用 fallback）。
- **行操作**：hover 行内操作按钮；**右键菜单**（启动/定位/授权/升级/卸载，卸载标 destructive）按 `allowedActions` 禁用；安装路径点击复制。
- **防重入**：单应用操作 `operations[appId].status === "running"` 时按钮禁用（图标转圈 + 状态文案），成功后 5s 自动复位；升级成功自动重扫，卸载后延迟 800ms 重扫。
- **批量模式**：切换后行首出现复选框；工具栏批量卸载（计数）/清除选择；运行中显示 `当前/总数` + 取消；结果面板汇总成功/失败/取消，可清除。
- **筛选/排序**：搜索（名称/bundleId）、类型/分类/系列筛选（带计数）、自然排序，全部持久化 `app-manager-preferences`。

## 4. 应用市场页签（marketplace）

- 推荐应用安装清单（`InstallListAppInfo`，`_virtual` 标记），数据源 `recommended-apps.ts` 内置 ~35 款（Chrome/Firefox/微信/QQ/钉钉/飞书/VSCode/Cursor/Docker/Claude/Ollama/Notion/Obsidian 等），含名称/分类/系列/描述/安装源/图标 key。
- 已安装匹配：按 bundleId 前缀（可多模式逗号分隔）、sourceId（brew/winget 等）、名称（仅用于「已安装」徽章，不用于破坏性操作）匹配；匹配到显示已安装版本/路径/可否卸载。
- 视图与工具栏同「已安装」（表格/网格、搜索、类型筛选：全部/待安装/已安装、分类、系列、批量切换）。
- **安装**：未安装项点安装 → 二次确认 → `installApp(appId, installSource)` 按源安装（brew/winget/apt/flatpak/snap/url），成功后延迟 2s 重扫并刷新清单；单项状态（运行中/成功/失败）。
- **批量安装 / 批量卸载已安装项**：二次确认；前端串行执行（取消标记中断），显示进度与逐项结果汇总。
- 详情面板（InstallDetail）：描述、安装源信息、安装按钮、打开官网、复制文本。
- **交互细节**
  - 已安装项显示已安装版本/路径/可否卸载，「安装」按钮禁用；未安装项点「安装」→ 二次确认 → 单项进度（运行中/成功/失败），成功后延迟 2s 重扫并刷新清单。
  - 批量切换后多选；批量安装/批量卸载已安装项为前端串行执行，取消标记（`batchInstallCancelRef`）中断后续项，逐项结果汇总；运行中显示进度 + 取消。
  - 详情面板点击行打开，`Esc` 关闭；打开官网走 `openExternal`，复制文本走剪贴板（失败静默）。

## 5. 软件更新页签（softwareUpdate）

### 更新检查

- `checkAllAppUpdates(forceRefresh?)`：后端各 provider 返回 `ok/partial/unsupported/failed/timedOut`；全部成功 → 更新列表；部分失败 → 列表 + warning（toast 常驻可关闭，`UPDATE_PARTIAL_WARNING_TOAST_ID`，不挤压列表高度）；整体失败 → 错误条（可关闭）+ 重试。
- 空状态区分：从未检查（提示 + 立即检查按钮）/ 搜索无结果 / 错误 / 全部最新（绿勾 + 上次检查时间）。

### 分组与操作

- 按来源分组（顺序 homebrew→winget→windowsStore→macAppStore→sparkle→electron→squirrel→gitHub），组可折叠、多选。
- 组级操作：homebrew/winget = 全部更新；windowsStore/macAppStore = 打开商店更新页；sparkle/electron/squirrel = 全部安装（串行队列）；gitHub = 打开全部 Releases。
- 单行操作按来源：homebrew/winget = 执行升级；macAppStore = 打开 App Store 对应页（需 adamId，缺则报错）；gitHub = 打开 releases URL；sparkle/electron/squirrel = **in-place 代下载安装**；其余 = 打开下载页。
- 详情面板（UpdateDetail）：版本信息、大小（格式化）、发布说明（URL 或内联）、执行操作；`Esc` 逐层关闭。
- 工具栏：搜索、来源过滤下拉、重新检查（`checkAllUpdates(true)`）、分组展开状态。

### in-place 安装流程（sparkle/electron/squirrel，v1.2）

- 点击「安装」→ 安装进度对话框（**进行中不可关闭**，只可「取消」）：
  - 阶段：queued → downloading（百分比 + 总大小进度条）→ verifying → extracting → replacing → finalizing → done；失败 → failed（错误码 + 消息）或 rolledBack（回滚原因）。
  - 事件：`app-update-install:progress`（InstallPhase 判别联合）、`app-update-install:finished`（success/message/errorCode）。
- 取消：`cancelAppUpdate(appId)`；关闭对话框仅限终态。
- **阻塞场景** `UpdateBlockingDialogs`：目标 App 正在运行（`SU_APP_RUNNING`）→ 提示「退出 App 后重试」对话框（退出并重试 / 取消）。
- 安装成功后自动重新检查更新 + 重扫；串行队列继续下一个待装更新。

## 6. 异常处理

- 单应用/批量操作的错误统一封装为 `OperationResult`（success/message/exitCode/errorCode/permissionIssue），前端按 errorCode 提示；in-place 更新与 provider 各有独立错误码。

| 场景/错误码                                                            | 触发                                          | 行为/提示                                             | 恢复/降级                 |
| ---------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------- | ------------------------- |
| `PERMISSION_DENIED`                                                    | 卸载/升级无权限（sudo/root/拒绝）             | 操作状态 failed + 提示需要管理员/root                 | 授权后再试                |
| `NOT_FOUND`                                                            | 卸载/升级目标不存在（输出含 not found）       | failed + 消息                                         | 重新扫描                  |
| `LOCKED`                                                               | 目标正被修改                                  | 「正在被修改，请稍候」                                | 稍后重试                  |
| `OPERATION_CANCELLED`                                                  | 用户中途取消单项操作                          | failed/cancelled                                      | —                         |
| `GENERIC_ERROR` / `SKIPPED`                                            | 未知失败 / 前置条件不满足跳过                 | failed + 消息（如缺 installSource）                   | 修正后重试                |
| `SU_APP_RUNNING`                                                       | in-place 安装目标 App 正在运行                | 阻塞对话框「退出 App 后重试」（退出并重试/取消）      | 退出后重试                |
| `SU_INSTALL_FAIL` 等                                                   | in-place 安装失败                             | 进度对话框 failed 终态（错误码+消息）                 | 可回滚（journal 恢复）    |
| `SU_STALE_INVENTORY_REVISION` / `SU_UPDATE_NOT_FOUND_OR_STALE`         | in-place 提交的 inventoryRevision/update 过期 | failed 终态                                           | 重新扫描/检查后重试       |
| `SU_NO_DOWNLOAD_URL` / `SU_INVALID_DOWNLOAD_URL` / `SU_HTTPS_REQUIRED` | 下载 URL 缺失/非法/非 HTTPS                   | failed 终态                                           | 等待下一个清单            |
| `SU_SOURCE_NOT_INSTALLABLE` / `SU_PLATFORM_UNSUPPORTED`                | 来源不支持 in-place / 非 macOS                | failed 终态                                           | 降级为打开下载页          |
| `UPDATE_PLATFORM_UNSUPPORTED` / `UPDATE_PROVIDER_NOT_APPLICABLE`       | provider 不适用于平台                         | provider 显式 `unsupported`，**不得显示「全部最新」** | 不静默降级为空            |
| 扫描失败                                                               | 扫描命令抛错                                  | 错误条 + 重试，保留缓存快照                           | 重扫回写单调递增 revision |
| 扫描 partial                                                           | 部分 provider 失败                            | 错误条列出失败 provider 列表                          | 可重扫                    |
| 批量取消                                                               | 用户取消批量                                  | 后端返回逐项 succeeded/failed/cancelled；前端标记中断 | 结果面板汇总，可清除      |

- **防重入/并发**：扫描 single-flight（扫描中再触发不重入）、可取消；单应用操作 running 时禁用；批量任务与取消接口幂等设计（`cancelBatchOperation`）；in-place 安装串行队列同一时刻只装一个。
- **安全边界**：renderer 只提交 `updateId + inventoryRevision`，URL/hash/签名/目标路径由后端缓存解析；启动/定位/授权/升级/卸载只接收稳定 `appId`；升级/卸载必须有 exact evidence（heuristic 仅展示，不开启破坏性动作）；卸载系统应用/未知来源被阻止。
- **不静默失败**：provider 失败不得显示「全部最新」；`macAppStore` 缺 adamId 显式报错；复制文本失败静默（剪贴板不可用场景）。

## 7. 技术实现要点

- **架构分层**：page → `useAppManagerController` + `useAppManagerViewState` + `useAppManagerUpdates` + `useInstallEvents` → `app-manager.use-cases` → `app-manager.repository` → 类型化 IPC；纯模型在 `model/`（store-state / operations / selectors / authorize-app / install-list / preferences / update-source-info）。
- **共享清单**：`src/shared/app-inventory/` 为 inventory 唯一真理源（带 revision 的 snapshot），Quick Launch 与 App Manager 共用；app-manager 不维护第二套扫描。
- **IPC 命令**（`src-tauri/src/app_manager/commands.rs`）：scanInstalledApps / getCachedAppInventory / cancelAppInventoryScan / getAppIconBase64 / launchApp / revealAppInFinder / authorizeMacApp / checkManagedAppUpdates / upgradeApp / uninstallApp / batchUpgradeApps / batchUninstallApps / installApp / cancelBatchOperation / checkAllAppUpdates / openInMacAppStore / openMacAppStoreUpdates / installAppUpdate / cancelAppUpdate。
- **后端模块**：`macos.rs`（Spotlight+标准目录+用户目录+外置卷 fallback、`.app` 解析、Homebrew 升级/卸载）、`windows.rs`（Registry+Start Apps/AUMID+winget 记录、EXE/AUMID 启动、winget/MSI ProductCode）、`linux.rs`、`sources/`（homebrew / mac_app_store / sparkle / electron）、`installer/`（downloader → extractor → verifier → codesign → replace → running 检查 → orchestrator，含 journal/回滚）、`gatekeeper.rs`（授权）、`operations.rs`（批处理）、`state.rs`（single-flight 与缓存）。
- **安全约束**：renderer 只提交 `updateId + inventoryRevision`（in-place），URL/hash/签名/目标路径由后端缓存解析；启动/定位/授权/升级/卸载只接收稳定 `appId`；升级/卸载必须有 receipt/package ID/ProductCode 等 exact evidence（heuristic 仅展示）；强制 HTTPS + 签名或 SHA-512 + bundle/team/架构/最低系统校验 + 下载/解压资源上限；阻塞 I/O 走 `spawn_blocking`；外部进程有 timeout、进程树回收、持久取消状态。
- **持久化**：前端 localStorage（`app-manager-preferences`：activeFilter+sorting；`view-mode:app-manager`）；后端 inventory 快照（`config_dir/bench/app-manager/inventory.json`）。
- **事件**：`app-manager://batch-progress`、`app-update-install:progress`、`app-update-install:finished`。
- **i18n**：zh/en 双语；空/错误/partial/unsupported/取消/刷新状态均有反馈。
- **性能**：目录视图虚拟化（网格按行估算高度）、图标按需加载、扫描进度可取消、刷新保留旧数据。

## 8. 数据模型（关键类型）

- `AppInfo`：appId / name / version / bundleId / installPath / source / sourceType / sourceId / sourceConfidence / sourceEvidence(exactReceipt|exactPackageId|exactProductCode|heuristic|none) / canUpgrade / canUninstall / upgradeAvailable / lastOperationResult / lastModified / isSystemApp / iconBase64 / launchTarget(appBundle|executable|aumid|desktopEntry) / allowedActions{launch,reveal,upgrade,uninstall}。
- `AppScanResult`：apps / totalCount / userCount / systemCount / scanTimeMs / managedCount / platformCapabilities / lastScanTime / lastUpdateCheck / revision? / complete? / providers? / warnings?。
- `ProviderState`：ok | partial | unsupported | failed | timedOut；`ProviderStatus{provider,state,errorCode}`。
- `OperationResult`：success / message / exitCode / errorCode / permissionIssue。
- `BatchOperationResult`：total / succeeded / failed / cancelled / results[]。
- `InstallListAppInfo`（`_virtual`）：id / name / bundleId / category / series / description / installSource{brew,winget,apt,flatpak,snap,url} / iconKey / installed / installedAppId? / installedVersion? / installedPath? / installedCanUninstall?。
- `UpdateInfo`：updateId / inventoryRevision / appId / appName / source(homebrew|winget|windowsStore|macAppStore|sparkle|electron|squirrel|gitHub) / currentVersion / latestVersion / downloadUrl / adamId / releaseNotesUrl / releaseNotesInline / size / sourceMeta / feedUrl / ignored。
- `UpdateScanReport`：updates / providers / checkedAt / complete / inventoryRevision。
- `InstallPhase`（判别联合）：queued | downloading{percent,bytesTotal} | verifying | extracting | replacing | finalizing | done | failed{code,message} | rolledBack{reason}；`InstallProgressEvent`、`InstallFinishedEvent{appId,success,message,errorCode}`。

## 9. 边界与限制

- **平台差异**：macOS 用 Homebrew/MAS/Sparkle/Electron/Squirrel；Windows 用 winget/Windows Store；无对应 provider 时显式 `unsupported`，不得静默降级为空。
- **破坏性操作**：升级/卸载/授权/批量操作一律二次确认；卸载系统应用、未知来源被阻止；升级/卸载必须 exact evidence，heuristic 匹配不得开启破坏性动作。
- **真机状态**：设计文档声明「代码能力 ≠ 真机行为已通过」；Windows/macOS 真机 smoke（fixture、启动、winget/MSI、进程树 timeout、DMG/ZIP 取消、journal 恢复）是发布前置条件（见规划文档），未完成前不得把能力标记为发布对等。
- **安全**：renderer 不得提交路径/package ID/下载 URL/shell 参数作为最终执行依据；下载强制 HTTPS + 签名校验 + 资源上限；in-place 更新失败可回滚。
- **UX 约束**：首载 skeleton；刷新保留旧数据并显示真实/indeterminate 进度；partial 提示不得挤压列表。

## 10. 快捷键

- `Esc`：逐层关闭详情面板（软件更新详情 → 市场详情 → 已安装详情），同一按键只关最上层。
- 其余操作以按钮/右键菜单为主，未发现更多全局快捷键（未见实现的部分按界面操作）。

## 11. 交互 / 状态 / 键盘 / 并发补充（第二轮）

### 逐控件交互（未覆盖项）

- 表格操作列：启动/定位/升级/卸载均 `aria-label` + `title`；升级按钮运行中仅当 `canUpgrade` 时替换为转圈，卸载运行中转圈；卸载被阻止（系统应用/未知来源）显示灰色 ShieldAlert 图标 + `title` 说明禁用原因。
- 安装路径列：compact 缩写 `/…/xxx`（≤46 字符），点击复制（`stopPropagation` 不触发行选择），hover `title` 显示完整路径；复制失败静默（剪贴板不可用场景）。
- 更新行 checkbox `aria-label=appName`，点击行开详情、checkbox `stopPropagation`；行内操作按钮运行中禁用并显示「排队中」+ 转圈。
- 更新组头 sticky（backdrop-blur），组级操作按钮在**组内任一运行中**或组空时禁用。
- 右键菜单走**共享 context-menu 注册机制**：行挂 `data-context-type="app-manager-row"` + `data-row-id`，控制器注册 selector 委托；授权项仅 `canAuthorizeMacApp` 时出现；卸载标 destructive。
- 市场卡片：未安装显示「安装」按钮（运行中转圈 +「安装中」）、已安装显示「已安装」勾选并禁用；右键可复制网站/安装路径；「打开网站」按钮为 ToolbarButton（外点打开）。

### 状态流转与交互边界（未覆盖项）

- 进入批量模式会**关闭已打开的详情面板**；退出批量模式清空选择（installed 与 marketplace 一致）。
- 批量安装为前端串行：`batchInstallCancelRef` 中断后续项，**被取消项计入结果面板 cancelled**；批量安装完成后 **1.2s** 延迟重扫（单应用安装为 2s，见 §4）。
- 单应用启动/定位失败 toast（`launchFailed` / `revealFailed`）；非安装类更新操作打开外部 URL 成功后 operation status 置 success。
- in-place 安装队列：组级「全部安装」仅当无运行中安装时启动；串行队列待装列表存 ref，**关闭安装进度对话框（仅终态）后自动启动下一项（0ms 调度）**；安装失败清空剩余队列；安装成功关闭后自动重新检查 + 重扫。
- 软件更新 partial 警告 toast 由**模块级守卫去重**（切进/切出页不重复弹），dismiss 后守卫复位可再次提示；toast 常驻（duration Infinity）。
- 更新 tab 徽章 **99+ 封顶**。

### 键盘与无障碍

- 安装进度对话框：**非终态（queued/downloading/verifying/extracting/replacing/finalizing）无关闭按钮，Esc 与点击外部均 `preventDefault` 守卫**，仅终态（done/failed/rolledBack 或已收到 finished）可关闭；「取消」→ `cancelAppUpdate`。
- 批量确认对话框：名称列表 `max-h-48` 可滚动；卸载类确认按钮红色 destructive；`AlertDialog` 自带焦点陷阱/Esc。
- 扫描/批量进行中：工具栏批量卸载/安装按钮禁用（计数为 0 或运行中）；`当前/总数` 用 `tabular-nums` 展示。

### 错误场景补充（未覆盖行）

- `macAppStore` 单行缺 `adamId` → operation status error（「当前更新缺少 App Store 标识」）。
- `noDownloadUrl`（无 downloadUrl/releaseNotesUrl/feedUrl）→ operation status error（「没有可用的发布页或下载地址」）。
- `handleUpdateAction` 对运行中的 appId 直接 return（防重入）；组级操作先过滤掉运行中项再执行。
