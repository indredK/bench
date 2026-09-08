# Dev Cleaner（开发者清理）产品说明

> 本文件是 dev-cleaner 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。

## 1. 定位

- **Clean Space 复用的开发项目扫描/清理引擎**，不注册独立主菜单或 Dev Toolbox Tab；作为 Clean Space 顶部 Tab「开发项目清理」（`DevProjectCleanerTool`）嵌入展示。桌面端专用（`desktopOnly`）。
- 用途：扫描指定目录下的开发项目（Node/Python/Rust/Go 及通用工程），按语言规则估算可清理的构建产物/依赖目录体积，批量移入系统废纸篓（可恢复）；另提供「自定义清理」命令库（npm/Yarn/pnpm/pip/Homebrew/Docker/Cargo/Xcode 等缓存清理）。
- 核心保证：删除默认进系统废纸篓（不可恢复场景才直删并显式提示）；不跟随符号链接、不跨文件系统；清理前二次确认。

## 2. 主界面（在 Clean Space「开发项目清理」Tab 内）

```
┌──────────────────────────────────────────────────────────────┐
│ 标题卡：标题 · [自定义清理] [筛选折叠]                          │
│   路径输入(只读) [选目录] [扫描/停止]                            │
│   统计：项目数 | 总大小 | 可清理 | 扫描耗时 | 筛选后可清理        │
│   筛选行：全部 | Node.js | Python | Rust | Go（默认展开）        │
├──────────────────────────────────────────────────────────────┤
│ 项目表格：☑ 项目(名称/类型/路径/依赖数) | 总大小 | 可清理 | 修改 │
│   （排序、多选、行点击选中、右键复制路径）                        │
├──────────────────────────────────────────────────────────────┤
│ 底部：已选 N 个 · 可释放 X | [清空选择] [清理]（二次确认）        │
└──────────────────────────────────────────────────────────────┘
```

- 顶部「自定义清理」按钮在任何阶段都可用（打开独立弹窗，见 §4）。

## 3. 扫描与项目清理流程

### 路径与扫描

- 路径输入框只读（防手输错），通过「选目录」调系统目录选择器填充；有路径后「开始扫描」可用。
- **扫描**（`scan_dev_projects`，可取消）：
  - WalkDir 递归（`same_file_system(true)`），按 indicator 文件识别项目：`package.json`→NodeJs、`Cargo.toml`→Rust、`pyproject.toml`/`requirements.txt`→Python、`go.mod`→Go；同路径多语言 → `Mixed`；否则 `General`。
  - 命中 `node_modules/target/.venv/venv/__pycache__/.git/dist/.next/vendor/.nuxt/build/.cache` 等 skip 目录时跳过遍历，并把这类目录本身作为可清理项上报（名称形如 `父目录/目录名`）。
  - `dedupe`：同路径项目合并，`cleanup_paths` 取并集；两语言并存标记 `Mixed`；被父项目清理目录覆盖的直接清理项会被剔除。
  - 每项目计算：`total_size`（含 skip 目录的全量）、`target_size`/`cleanup_potential`（存在且匹配清理规则的目标目录体积之和）、`last_modified`、`dependencies_count`（各语言依赖清单计数）。
- **统计条**：项目总数 / 总大小 / 可清理总量 / 扫描耗时 / 当前筛选后的可清理量。
- **筛选**：全部 / Node.js / Python / Rust / Go（按 `project_type` 精确匹配，Mixed/General 仅在「全部」下可见）；可折叠。
- **取消扫描**：扫描中按钮变为红色「停止」，调用 `stop_scan`（后端原子标志），结果带 `aborted=true`，提示「已停止 · 已扫 N 项」。

### 表格与选择

- 列：项目（名称 + 类型徽章 + 折叠路径 + 依赖数）/ 总大小 / 可清理（橙色高亮块）/ 最后修改；均支持排序（名称自然序 `Intl.Collator numeric`）。
- 行点击选中/取消；表头全选；已选计数与可释放量实时汇总；底部「清理」按钮触发内联二次确认（`showConfirm`），确认后执行。
- 行右键：复制完整路径（上下文菜单）。
- 清理成功后：toast 提示释放量 → 自动清空选择 → **1 秒后自动重扫**（定时器随卸载清理，防卸载后孤儿扫描）。
- **交互细节**：
  - 扫描中：「开始扫描」按钮禁用并显示 spinner，旁边出现红色「停止」（`StopCircle`）图标按钮；结果带 `aborted=true` 时顶部显示 success 提示「已停止 · 已扫 N 项」。
  - 扫描中表格整体 `pointer-events-none + opacity-50`，中央覆盖 spinner；结果区二次点击扫描被防重入忽略（`isScanning` 守卫）。
  - 表格：表头点击排序（名称自然序 / 总大小 / 可清理 / 修改时间），行点击选中/取消、表头全选/取消；移动端额外提供排序按钮组；筛选行（全部/Node/Python/Rust/Go）可折叠（`ChevronUp/Down`）。
  - 清理为**内联二次确认**（非弹窗）：底部出现「确认清理 N 个项目（X）」文案 +「清空选择 / 清理」按钮；确认后「清理」按钮显示 spinner 且禁用（`isCleaningUp`）；取消回到仅显示统计。
  - 清理结果：成功 → 顶部 success Alert（释放量）+ 清空选择 + 1 秒后自动重扫；失败 → destructive Alert 展示 `errors[]` 拼接文案。
  - 行右键 → 全局上下文菜单「复制路径」（`writeClipboardText`，剪贴板失败静默）；行点击选中由 `selectOnRowClick` 提供。
  - 空态：筛选后无项目 → `AlertTriangle` 图标 +「未找到项目」；扫描失败且无结果 → `FeatureLoadError` 带「重试」按钮（重扫同一路径）。

  - **筛选联动选中清理**：切换筛选条件会把被筛掉项目的选中状态自动剔除（`visibleProjectPathSet` 守卫 effect），避免选中不可见项目；选中数降为 0 时清理确认（`showConfirm`）自动回落。

  - **窄屏/布局边界**：表格 `min-w-[760px]`，窄屏横向滚动；「筛选折叠」与筛选按钮位于表头卡外，扫描中仍可点击（仅表格区被 `pointer-events-none + opacity-50` 覆盖）。

  - **键盘与无障碍**：表头/行复选框带 `aria-label`（`getSelectAllCheckboxLabel` / `getRowCheckboxLabel`，含「全选/取消全选 + 项目名」）；行右键复制路径由全局上下文菜单提供（`data-context-type="dev-cleaner-row"`）。

### 清理执行（后端）

- `cleanup_projects` 对每个选中项目：`resolve_cleanup_paths`（优先用扫描到的 `cleanup_paths`，否则按语言规则重建）→ 逐个目标 `safe_delete_within_root`。
- 目标路径去重；不存在则跳过；可随时中止（`aborted` → 剩余项不再执行，报「Cancelled by user」）。
- **安全删除**（`safe_delete.rs`）：
  - `validate_path_within_root`：canonicalize 后目标必须仍在项目根内，且与根**同文件系统**（`st_dev`）；
  - 先走系统废纸篓：macOS `osascript`（Finder delete）/ Windows PowerShell `SendToRecycleBin` / Linux freedesktop Trash；含引号/反斜杠/换行的路径拒绝进废纸篓；
  - 废纸篓失败 → 回退 `safe_recursive_delete`（永不跟随符号链接/reparse point，跨文件系统拒绝下钻），结果标记「回收站不可用，已永久删除」并计入 errors。
- 结果：`success`、`cleaned_size`（只累计成功项）、`errors[]`。

## 4. 自定义清理弹窗（CustomCleanupDialog）

- 入口：标题卡右上「自定义清理」（Shield 图标，桌面端才可用）。
- **选择阶段**：列出后端内置命令（12 个，见 §6），每行 = 复选框 + 名称 + 命令 + 描述 + 环境徽章 + 风险（高风险红色 Alert 图标）；勾选后「下一步」。
- **确认阶段**：`DestructiveConfirmDialog` 展示将执行 N 条命令的警告；确认后进入运行。
- **运行阶段**：
  - 逐命令流式进度（`custom-cleanup:progress` 事件）：running（蓝色边框）/ completed（绿色 ✓）/ failed（红色 ✗）+ 输出内容 + 释放量徽章；
  - 底部「暂停」（前端只暂停状态流转）/「停止」（`stop_custom_cleanup`，只阻止后续命令，不杀已运行进程）/「恢复」；
  - 完成后汇总卡：释放空间 / 成功数 / 失败数，success=失败数与中止均为 0；中止显示黄色横幅。
- 关闭弹窗即清理 listener 并重置状态。
- **交互细节**：
  - 选择阶段：命令列表复选框勾选（高亮边框），「下一步」在未勾选时禁用；命令列表拉取失败 → 空列表 + 中央 spinner。
  - 确认阶段：`DestructiveConfirmDialog` 展示「将执行 N 条命令」警告；确认后进入运行，此时弹窗 X 与遮罩关闭被禁用（running/paused 阶段不可关闭）。
  - 运行阶段：逐命令卡片状态（running 蓝框 spinner / completed 绿 ✓ / failed 红 ✗）+ 输出内容 + 释放量徽章；底部「暂停」仅停前端状态流转、「停止」调 `stop_custom_cleanup`（只拦后续命令不杀已运行进程，2>/dev/null 式命令可继续跑完）、「恢复」继续。
  - 完成阶段：汇总卡（释放空间 / 成功数 / 失败数），中止为黄色横幅；「完成」关闭弹窗并清理 listener、重置状态。

  - 确认阶段命令复选框 `disabled`（只读展示，行样式 `cursor-default`）；completed 阶段右上 X **恢复可见**（仅 running/paused 阶段隐藏），点击关闭并重置状态。

  - **键盘与无障碍**：外层弹窗为原生 div 覆盖层，**无 `role=dialog`/焦点陷阱**；内层 `DestructiveConfirmDialog`（Radix AlertDialog）自带焦点陷阱与 Esc，确认阶段按 Esc 会把 phase 从 `confirming` 退回 `selecting`。

  - **命令列表拉取失败**：`getCustomCleanupCommands` 抛错 → `setCommands([])`，选择阶段显示**永久中央 spinner，无错误文案/重试按钮** —— 未见实现错误态。

## 5. 技术实现要点

- **架构**：前端 `src/features/dev-cleaner/`（DevCleanerPageContent / CustomCleanupDialog / columns / hooks / services / store.ts），后端 `src-tauri/src/dev_cleaner/`（commands / scanner / projects / rules / sizing / cleanup / safe_delete / custom_cleanup / types）。
- **IPC 命令（6 个）**：`scanDevProjects(rootPath)` / `stopScan` / `cleanupProjects(projects)` / `getCustomCleanupCommands` / `executeCustomCleanup(commandIds)` / `stopCustomCleanup`。
- **防重入**：扫描中忽略再次触发；清理中按钮禁用；自定义清理 `cleaningRef` 守卫。
- **事件**：`custom-cleanup:progress`（逐命令）、`custom-cleanup:completed`（最终结果）。
- **尺寸统计**（`sizing.rs`）：`calculate_dir_size` WalkDir 计数，**Unix 硬链接去重**（`(dev, ino)`，解决 pnpm store 重复计数）；`get_dir_size_fast` 用于 skip 目录（macOS 走 WalkDir、Linux `du -sk --apparent-size`、Windows PowerShell，均有超时并回退 WalkDir）；扫描定期检查 abort 标志。
- **依赖计数**：Node 读 package.json（dependencies+devDependencies）；Python 读 requirements.txt/pyproject.toml（**剔除 `-r/-c/-e` 等 pip 元选项行**）；Rust 读 Cargo.toml 的 dependencies 节；Go 读 go.mod 的 tab 缩进行。
- **自定义清理命令执行**：`sh -c`，5 分钟超时；释放量 = 命令前后 `df -k /` 可用空间差（防负值钳 0）；事件携带 stdout/stderr 合并输出。
- **i18n**：中英双语；类型名/状态用 canonical value + `t()`。
- **测试**：Rust 侧覆盖路径逃逸、硬链接去重、混合语言合并、abort、依赖计数等；前端有页面交互测试。

## 6. 内置自定义清理命令（12 个）

| id             | 命令                                                    | 风险     |
| -------------- | ------------------------------------------------------- | -------- |
| npm_cache      | `npm cache clean --force`                               | safe     |
| yarn_cache     | `yarn cache clean`                                      | safe     |
| pnpm_cache     | `pnpm store prune`                                      | safe     |
| pip_cache      | `pip cache purge`（失败尝试 pip3，`                     |          | true`） | safe |
| brew_cache     | `brew cleanup --prune=all`                              | safe     |
| docker_prune   | `docker system prune -af`                               | **high** |
| docker_builder | `docker builder prune -af`                              | medium   |
| cargo_cache    | `cargo cache -a`（失败回退删除 ~/.cargo registry 目录） | safe     |
| xcode_derived  | `rm -rf ~/Library/Developer/Xcode/DerivedData/*`        | medium   |
| ios_simulator  | `xcrun simctl delete unavailable`                       | safe     |
| user_logs      | `find ~/Library/Logs -name '*.log' -mtime +30 -delete`  | safe     |
| tmp_files      | 删除 `/tmp` 下当前用户超过 7 天的文件（最多 100 个）    | safe     |

## 7. 数据模型

- `ProjectInfo`：`path` / `name` / `total_size` / `target_size` / `last_modified` / `dependencies_count` / `project_type(NodeJs|Python|Rust|Go|Mixed|General)` / `cleanup_potential` / `cleanup_paths[]`。
- `ScanResult`：`total_projects` / `total_size` / `total_cleanup_size` / `projects[]` / `scan_time_ms` / `aborted`。
- `CleanupResult`：`success` / `cleaned_size` / `errors[]`。
- `CleanupCommandDef`：`id` / `name` / `command` / `environment` / `description` / `risk`（展示文案）/ `risk_level(safe|low|medium|high)`（程序化判断）。
- `CustomCleanupProgress` / `CustomCleanupFinalResult`。
- 前端 store 关键状态：`selectedPath` / `isScanning` / `scanResult` / `selectedProjects`（RowSelectionState，key=path）/ `sorting` / `filterType` / `showConfirm` / `customCleanupPhase(idle|selecting|confirming|running|paused|completed)` / `customCleanupCommands` / `selectedCommandIds` / `customCleanupProgresses` / `customCleanupResult`。

## 8. 边界与限制

- **删除一律优先系统废纸篓**，可恢复；仅在废纸篓不可用时回退永久删除，且必须在结果中显式提示。
- **安全红线**：symlink/reparse point 只删自身不跟目标；跨文件系统拒绝；canonical 后逃逸项目根拒绝。
- **不可恢复项**：docker prune（high）等高风险命令有风险标识，执行前需 `DestructiveConfirmDialog` 二次确认。
- **自定义清理命令**由后端内置白名单提供，不执行前端任意命令字符串；单命令 5 分钟超时；停止不杀已运行进程（只拦后续）。
- **Windows**：project 清理路径用 taskkill 无关（本模块是文件清理），废纸篓走 PowerShell；扫描/尺寸用 `du` 替代（macOS 无 `--apparent-size` 时走 WalkDir，尺寸口径与 Linux 可能略有差异）。
- 依赖计数为近似值（解析清单文件，不解析传递依赖）。

## 9. 快捷键

- 无全局快捷键；表格内为鼠标/键盘标准交互（Enter 等由 DataTable 提供）。

## 10. 异常处理

> 说明：本模块扫描/清理命令返回 `AppError{code,message}`（扫描）或**字符串数组 `errors[]`**（清理，非结构化错误码）；自定义清理单命令失败在 `CustomCleanupProgress.error` 中给出。前端对 `errors[]` 直接拼接展示。

### 错误码 → 前端提示映射

| 错误码                    | 触发场景                                           | 前端行为/提示                           | 恢复/降级            |
| ------------------------- | -------------------------------------------------- | --------------------------------------- | -------------------- |
| `INVALID_INPUT`           | 扫描路径选到了文件/坏符号链接（`Not a directory`） | `scanError` → `FeatureLoadError` 带重试 | 重新「选目录」后重扫 |
| `INTERNAL`                | 扫描路径不可访问（`Cannot access`，如权限/消失）   | 同上                                    | 重试 / 换目录        |
| `desktopOnly`（前端文案） | 非桌面端触发扫描                                   | 顶部错误 Alert                          | 桌面端才可用         |
| 清理 `errors[]` 字符串    | 见下方「常见失败场景」                             | destructive Alert 展示拼接文案          | 失败项跳过，其余继续 |

### 常见失败场景与行为

- **扫描中止**：`stop_scan`（后端原子标志）→ 结果带 `aborted=true`，提示「已停止 · 已扫 N 项」；清理中同理报「Cancelled by user」且剩余项不再执行。
- **目标路径不存在**：`resolve_cleanup_paths` / 目标已不存在 → 直接跳过（`!target_path.exists()` 提前 return，不报错）。
- **废纸篓不可用**（osascript/PowerShell/freedesktop 失败，或路径含引号/反斜杠/换行被拒）：回退 `safe_recursive_delete` **永久删除**，计入 `errors[]`（文案「回收站不可用，已永久删除」）——不可静默失败。
- **不安全路径跳过**（canonical 后逃逸项目根 / 跨文件系统 / symlink 目标）：`DeleteOutcome::SkippedUnsafe`，计入 `errors[]`（「Unsafe cleanup path skipped」），永不跟随符号链接。
- **自定义清理单命令失败**：非零退出 → `failed` 状态 + 错误输出（`Exit code: N`）；单命令 **5 分钟超时**被 kill → failed + 「Command timed out after 5 minutes」；释放量 = 命令前后 `df -k /` 差值，防负值钳 0。
- **停止语义**：`stop_custom_cleanup` 只置原子标志、不杀已运行进程（当前命令可跑完），仅阻止后续命令；`executeCustomCleanup` 在 `flag` 已置位时提前返回 `aborted=true`。
- **自定义清理无有效命令**：`command_ids` 全不匹配内置白名单 → `INVALID_INPUT`，弹窗内失败；命令由后端内置白名单提供，不执行前端任意字符串。
- **幂等/并发保护**：扫描 `isScanning` 防重入；清理 `isCleaningUp` 禁用按钮；自定义清理 `cleaningRef` 守卫 + 关闭弹窗清理 listener；自动重扫定时器随卸载清理（防孤儿扫描）。
- **剪贴板/打开目录失败**：复制路径失败静默；「选目录」系统对话框失败 → 顶部错误 Alert（`devCleaner.errors.openDirectoryFailed`）。

- **`executeCustomCleanup` 整体抛错**：前端合成 `{success:false, commands_executed:0, commands_failed:0}` 失败结果进入 completed 阶段，显示红色汇总卡（非中止黄色横幅）。

- **`stopScan` 失败**：仅 `console.error`，无任何 UI 反馈（可忽略）。
