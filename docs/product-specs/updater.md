# Updater（更新器）产品说明

> 本文件是 updater 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。

## 1. 定位

- **非独立页面**：无路由；UI 是全局组件 `src/components/common/UpdateDialog.tsx`，逻辑在 `src/features/updater/`（store + controller + services），由应用外壳挂载。
- 桌面能力门控：`canUseDesktopFeatures()` 为假（Web）时，手动检查弹出 `desktopOnly` 错误，自动检查静默跳过。
- 用途：检查并安装 Bench 应用自身的更新（基于 Tauri updater / GitHub Releases 的 `latest.json` manifest），支持自动检查、下载、取消、重启安装。
- 核心保证：状态机清晰、错误分类可重试、取消/失败保留已下载产物、凭据/URL 不外泄。

## 2. 状态机

```
idle ──检查──▶ checking ──▶ available（有更新） / upToDate（最新）
available ──下载安装──▶ downloading ──▶ cancelling（取消中） ──▶ installing ──▶ readyToRestart
available ──▶ downloading ──▶ installFailed（下载完成但安装失败，保留进度可重试）
任一步 ──▶ error（检查/下载/安装/重启失败，分类后可重试）
```

- 下载中/取消中/安装中禁止关闭对话框（关闭被守卫）。
- `installFailed`：下载已完成但安装失败，保留已下载产物状态，允许直接重试安装（A3-3）。

## 3. 功能清单

### 更新检查

- 手动检查 `checkUpdates()`：`checkForAppUpdate` → 返回 `currentVersion` 与 `available/version/date/body`；有更新弹窗并显示 `available`，无更新显示 `upToDate`。
- 后端 single-flight：`UpdaterCache` 保证同一时刻只有一个真实检查（leader-follower），follower 共享 leader 结果或错误；结果缓存供下载阶段复用。
- 检查中状态 `checking`，防重入（checking/downloading/cancelling/installing/installFailed/readyToRestart 时忽略再次触发）。

### 自动检查策略（policy）

- 启动后延迟 `AUTO_CHECK_STARTUP_DELAY_MS = 30s` 首检；成功后续按 `24h` 间隔；失败按 `15min × 2^(min(10, failureCount-1))` 指数退避（上限 24h）。
- 离线（`navigator.onLine === false`）或弱网（`saveData` / `slow-2g` / `2g`）时**延后**自动检查；监听 `online` 事件重新调度。
- 自动检查失败静默（交互检查失败才弹错误）；失败计数上限 16。
- 策略持久化：localStorage `bench.updater.policy.v1`（autoCheckEnabled / lastSuccessfulCheckAt / lastFailureAt / failureCount）。
- 自动检查开关（`autoCheckEnabled`）可在界面切换并持久化。

### 下载与安装

- `downloadAndInstall()` → `downloadAndInstallAppUpdate`：优先复用已缓存 update，否则先检查；下载进度经事件 `app-updater-download` 实时回推。
- 下载事件（`AppUpdateDownloadEvent`）：started（contentLength）→ progress（chunkLength/downloadedBytes/contentLength）→ finished；或 cancelled / failed。
- **取消**：下载中「取消下载」→ `cancelDownload()`（置 `cancelling`）→ `cancelAppUpdateDownload` 后端发取消信号；取消成功回到 `available`（保留更新可重试）；后端取消时保留缓存 update。
- **重启**：下载安装完成后 `readyToRestart`，提供「立即重启」(`restartNow` → `restartAfterUpdate` → `app.request_restart()`) 与「稍后」；重启失败进入 `error`（kind=restartFailed，retryAction=restart，保留已下载产物状态）。

### 更新对话框（UpdateDialog）

- 状态 alert（icon + 标题 + 描述）：checking / upToDate / available（含版本）/ downloading / cancelling / installing / readyToRestart / installFailed（destructive）/ error（destructive，文案按错误分类）。
- 版本信息网格：当前版本、最新版本（有则显示）、发布时间、上次检查时间、已下载大小。
- 进度条：有总量 → determinate（百分比）；无总量 → indeterminate 脉冲；`role="progressbar"`。
- **发布说明**：markdown 简化渲染（标题/无序列表/段落 + `[text](https://…)` 链接），正文截断 20 000 字符；无说明则不显示该区块。
- **错误详情**：error 状态显示可折叠「技术细节」（原始错误文本，collapsible）。
- 操作按钮（按状态）：检查更新（idle/upToDate）、立即安装（available）、取消下载（downloading）、稍后/关闭、立即重启（readyToRestart）、重试（error/installFailed 按 `retryAction` 决定 检查/安装/重启）、打开 Releases 页（releaseInfoUnavailable 时，`https://github.com/indredK/bench/releases`）。
- 描述（sr-only）拼接：当前版本 + 最新版本 + 发布时间 + 上次检查时间。
- **交互细节**
  - 状态 alert（icon + 标题 + 描述）随状态切换；`error`/`installFailed` 用 destructive 样式。
  - 版本信息网格：当前版本、最新版本（有则显示）、发布时间、上次检查时间、已下载大小（>0 才显示）。
  - 进度条：有总量 → determinate（百分比），无总量 → indeterminate 脉冲；`role="progressbar"`；进度文案「已下载 X / 未知大小」。
  - 发布说明：markdown 简化渲染（标题/无序列表/段落 + `[text](https://…)` 链接），正文截断 20 000 字符；无说明则不显示该区块。
  - error 状态显示可折叠「技术细节」（原始错误文本，collapsible，状态切换时自动收起）。
  - 操作按钮按状态：检查更新（idle/upToDate，checking 时禁用）、立即安装（available）、取消下载（downloading）、稍后/关闭、立即重启（readyToRestart）、重试（error/installFailed 按 `retryAction` 决定 检查/安装/重启）、打开 Releases 页（releaseInfoUnavailable 时）。
  - 下载中「取消下载」→ 进入 cancelling（按钮禁用转圈）→ 回到 available；`downloading/cancelling/installing` 时「稍后/关闭」禁用，`Esc`/关闭被守卫（对话框不可关闭）。

### 错误分类（error-classifier）

- 分类维度：`kind`（desktopOnly / releaseInfoUnavailable / serviceBusy / networkUnavailable / proxyUnavailable / rateLimited / downloadFailed / signatureVerificationFailed / installBlocked / updateStateChanged / restartFailed / unknownCheckFailure / unknownInstallFailure）+ `operation`（check/install/restart）+ `retryAction`（check/install/restart/null）。
- 判定顺序：后端错误码（`UPDATER_RATE_LIMITED` / `UPDATER_MANIFEST_NOT_FOUND` / `UPDATER_MANIFEST_INVALID` / `UPDATER_PLATFORM_MISSING` / `UPDATER_SIGNATURE_INVALID` / `UPDATER_UPDATE_NOT_AVAILABLE` / `UPDATER_NETWORK_UNAVAILABLE` / `UPDATER_DISK_FULL` / `UPDATER_PERMISSION_DENIED`）优先，再按文本模式（rate limit / release json / service / proxy / network / signature / install-blocked 等）。
- 代理失败（proxy/407/tunnel）显式区分于通用网络错误。

## 4. 异常处理

- 错误分类顺序：**后端错误码优先**（`parseCommandError`），再按文本模式（中英文）尽力而为；无法穷举时落入 `unknown*` 但保留原始错误供「技术细节」查看。映射关系：

| 后端错误码                                                                             | 前端 kind                                              | 提示/行为                                                        | 恢复（retryAction） |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | ------------------- |
| `UPDATER_RATE_LIMITED`                                                                 | rateLimited                                            | 429/rate-limit 文案                                              | 检查                |
| `UPDATER_MANIFEST_NOT_FOUND` / `UPDATER_MANIFEST_INVALID` / `UPDATER_PLATFORM_MISSING` | releaseInfoUnavailable                                 | 发布信息不可用；额外显示「打开 Releases」按钮（GitHub Releases） | 检查                |
| `UPDATER_SIGNATURE_INVALID`                                                            | signatureVerificationFailed                            | 签名校验失败文案                                                 | 检查                |
| `UPDATER_UPDATE_NOT_AVAILABLE`                                                         | updateStateChanged                                     | 无可用更新                                                       | 检查                |
| `UPDATER_NETWORK_UNAVAILABLE`                                                          | networkUnavailable（check）/ downloadFailed（install） | 网络不可用 / 下载失败                                            | 检查 / 安装         |
| `UPDATER_DISK_FULL` / `UPDATER_PERMISSION_DENIED`                                      | installBlocked                                         | 磁盘满 / 权限不足                                                | 安装                |
| `UPDATER_CANCELLED`                                                                    | （非错误）                                             | 回到 `available`，保留已缓存 update                              | 可再次下载          |
| 文本模式 proxy/407/tunnel                                                              | proxyUnavailable                                       | 显式区分于通用网络错误（先于 NETWORK_PATTERNS 判定）             | 检查 / 安装         |
| 重启失败                                                                               | restartFailed                                          | 保留已下载产物状态                                               | 重启                |
| 其他                                                                                   | unknownCheckFailure / unknownInstallFailure            | 分类尽力而为，原始错误进「技术细节」                             | 检查 / 安装         |

- **自动检查失败静默**：不弹错误、不打断用户；失败计数上限 16，按 `15min × 2^(min(10, failureCount-1))` 指数退避（上限 24h），成功后清零。
- **离线/弱网**：自动检查延后（不丢计划），监听 `online` 事件重新调度；手动检查失败给出网络错误分类。
- **并发/幂等**：后端 `UpdaterCache` single-flight（leader-follower 共享结果或错误），结果缓存供下载阶段复用；下载/取消/安装/重启均有状态守卫防重入。
- **取消/失败保留产物**：取消与失败均保留缓存 update；`installFailed` 保留已下载进度供直接重试安装；重启失败保留已下载产物。
- **安全脱敏**：后端错误映射输出脱敏 public message，不暴露原始 URL/query（可能含 token），有测试保证；progress 载荷做 `isFinite` 守卫避免 NaN 渲染。

## 5. 技术实现要点

- **架构**：`src/features/updater/store.ts`（纯状态 + 简单动作）、`hooks/useUpdaterController.ts`（编排）、`services/updater-policy.ts`（策略计算）、`services/updater-policy.repository.ts`（localStorage 读写）、`error-classifier.ts`（错误分类）；UI 在 `src/components/common/UpdateDialog.tsx`。
- **后端** `src-tauri/src/app_updater/`：`types.rs`（AppUpdateInfo / AppUpdateInstallResult / AppUpdateDownloadEvent + 事件名）、`state.rs`（UpdaterCache：检查结果缓存、下载取消信号、single-flight leader/follower）、`commands.rs`（命令与 UPDATER_* 错误映射）。
- **IPC 命令**：checkForAppUpdate / downloadAndInstallAppUpdate / cancelAppUpdateDownload / restartAfterUpdate / getCurrentAppVersion。
- **事件**：`app-updater-download`（`AppUpdateDownloadEvent`）。
- **依赖**：`tauri-plugin-updater`（UpdaterExt）。manifest 来自发布供应链生成的 `latest.json`；更新包用 minisign 私钥签名（.sig）。
- **安全**：后端错误映射把原始 URL/query（可能含 token）替换为脱敏 public message（有测试保证）；取消/失败均保留缓存 update 供重试；progress 载荷做 `isFinite` 守卫避免 NaN 渲染。
- **持久化**：policy 存 localStorage；其余状态为内存态，重启后回到 `idle`。
- **i18n**：zh/en 双语；每个错误 kind 有独立标题/描述文案。

## 6. 数据模型（关键类型）

- `AppUpdateInfo`：available / currentVersion / version? / date? / body?。
- `AppUpdateInstallResult`：installed / requiresRestart。
- `AppUpdateDownloadEvent`（判别联合）：started{contentLength?} | progress{chunkLength,downloadedBytes,contentLength?} | finished | cancelled | failed{error}。
- `UpdaterStatus`：idle | checking | available | upToDate | downloading | cancelling | installing | installFailed | readyToRestart | error。
- `UpdaterErrorInfo`：kind / operation / message / retryAction；`UpdaterPolicy`：autoCheckEnabled / lastSuccessfulCheckAt / lastFailureAt / failureCount。
- store 附加状态：open / currentVersion / updateInfo / error / errorInfo / downloadedBytes / totalBytes / lastCheckedAt / autoCheckEnabled / autoCheckFailureCount / lastAutoCheckFailureAt / policyHydrated。

## 7. 边界与限制

- **桌面专用**：Web 端 `canUseDesktopFeatures` 为假，手动检查显示 `desktopOnly` 错误，自动检查不执行。
- **离线/弱网**：自动检查延后（不丢计划，恢复在线后重排）；手动检查失败给出网络错误分类。
- **取消/失败语义**：`UPDATER_CANCELLED` 保留可重试；`installFailed` 保留已下载进度；重启失败保留已下载产物。
- **供应链**：发布阻断要求真实 Tauri updater 私钥生成 macOS arm64/x64 + Windows x64 的 bundle/.sig/latest.json 并验证；当前 OS 签名模式为 `BENCH_OS_SIGNING_MODE=unsigned`（macOS ad-hoc / Windows unsigned，附明确提示），Apple notarization/staple 与 Windows Authenticode 待取得证书后验证（见规划文档）。
- **防重入**：检查/下载/取消/安装/重启均有状态守卫；下载中/取消中/安装中对话框不可关闭。
- **错误分类尽力而为**：基于错误码 + 文本模式（中英文），无法穷举时落入 unknown* 但保留原始错误供「技术细节」查看。

## 8. 快捷键

- 对话框本身未注册全局快捷键；`Esc` 走 Dialog 默认行为，但 downloading/cancelling/installing 时 `closeDialog` 被守卫，无法关闭。

## 9. 交互 / 状态 / 键盘 / 并发补充（第二轮）

### 逐控件交互（未覆盖项）

- 底部「稍后/关闭」按钮语义区分：`readyToRestart` 时文案为「稍后」，否则「关闭」；点击走 `dismissDialog`（**重置 transient 状态 → idle、清空 updateInfo/error/进度后关闭**），而 Esc/关闭按钮/外点走 `closeDialog`（仅关闭、不重置）。
- `downloading` 状态显示「取消下载」按钮；`cancelling` 状态显示**禁用的转圈按钮**（不可重复取消）。
- 「技术细节」折叠仅 `error` 状态显示（`installFailed` 不显示），且 status/open 变化时自动收起。
- 发布说明内联链接仅 `[label](https://…)` 形态渲染为 `<a target="_blank" rel="noreferrer">`（http 等其他协议不渲染为链接）；无效日期格式 fallback 原文显示。
- 进度条：有总量 determinate（`role="progressbar"` + aria 值）；无总量 animate-pulse 不确定条；`readyToRestart` 显示 100%；进度文案「已下载 X / 未知大小」（无总量时）。
- 版本信息网格文本 `[overflow-wrap:anywhere]`，超长版本号/日期不撑破布局。

### 状态流转与并发边界（未覆盖项）

- 自动检查定时：挂载后 30s 首检（自挂载计时，非固定启动后 30s）；`autoCheckEnabled=false` 或 `policyDelay=null` 时**不再定时**；离线/弱网（saveData/slow-2g/2g）延后，监听 `online` 事件重排（现有 §3 已覆盖退避策略，此处补充「关闭开关即不再定时」）。
- 下载事件 `failed` **不改状态**（依赖命令 promise rejection 进入 installFailed/error，防双重提示）；`cancelled` 事件回 available（有更新时）或 idle。
- `downloadAndInstall` 守卫 downloading/cancelling/installing/readyToRestart，但**允许从 available/installFailed/error 进入**（重试安装路径）。
- `loadCurrentVersion`（版本号引导）失败静默忽略，不打断首屏。
- 进度事件 payload 经 `isFinite` 守卫（NaN→0/null），`formatBytes` 对 NaN/负值返回 "—"（现有 §4 已提 isFinite，此处补充渲染侧 formatBytes 兜底）。
- busy（downloading/cancelling/installing）时「稍后/关闭」禁用 + Esc/关闭守卫（现有 §8 已提，此处确认外点同样被守卫）。

### 错误场景补充（未覆盖行）

- 分类优先级再次确认：后端错误码 → 代理文本（proxy/407/tunnel）→ 通用网络 → 其余 unknown*（现有 §4 表格覆盖，此处补充代理判定**先于**网络判定已在 error-classifier 中固化）。
- `desktopOnly`（Web 手动检查）→ error 状态 + `retryAction=null`，仅提供关闭，不提供重试/打开 Releases。
