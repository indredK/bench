# 环境检测（Env Detector）产品说明

> 本文件是 env-detector 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。

## 1. 定位

- 路由 `/env-detector`；`desktopOnly: true`，仅在 Tauri 桌面端可用，浏览器运行时显示「仅桌面功能」占位。
- 侧边栏**隐藏**（`TOOLBOX_FEATURE_IDS`），作为「开发工具箱」（/dev-toolbox）的「环境检测」Tab 使用，也可经直达路由访问。
- 用途：扫描本机 PATH 及常用安装目录，盘点已安装的开发工具（Node/Python/Rust/Go/容器/数据库/编辑器等），显示版本、路径、大小、安装时间与状态。
- 双视图（表格/网格）+ 多维度筛选 + 缺省工具提示，帮助快速判断开发环境是否就绪。

## 2. 界面布局

```
┌──────────────────────────────────────────────────────────┐
│ CardHeader：标题「环境检测」                                │
├──────────────────────────────────────────────────────────┤
│ 错误 Alert（如有）                                         │
│ 搜索框（禁用=loading）  [显示全部命令] [刷新/正在扫描…]       │
│ FilterBar：类别/来源/类型/状态（级联筛选 + 清除）             │
├──────────────────────────────────────────────────────────┤
│ ContentView：汇总行（共/可用/可见）+ 表格⇄网格切换            │
│ 表格：名称(吸顶)/版本/路径/大小/安装时间/状态                 │
│ 网格：卡片（名称+状态徽标+版本+路径+大小）                    │
│ ────────────────────────────────────────                  │
│ 底部「未检测到（N）」徽标面板（显示缺省工具名）                │
└──────────────────────────────────────────────────────────┘
```

### 首次进入

- 激活时若 `canUseDesktopFeatures()` 且尚未扫描（`scanned=false`）自动触发一次扫描；也可点「刷新」手动扫描。
- 扫描期间（`loading=true`）：搜索框与「显示全部命令」按钮禁用、刷新按钮变「正在扫描…」+ spinner；`tools` 置空，`ContentView` 显示骨架屏（顶部不确定进度条 + 8 行脉冲占位，不渲染表格/网格）。**无进度百分比**（未传 `loadingProgress`，进度条为不确定态）。
- 未扫描过且无数据时显示空态文案「点击「刷新」按钮扫描系统中的所有开发工具」；扫描后无匹配显示「没有匹配的工具」。
- 已扫描后再点「刷新」或触发全局刷新（`registerFeatureRefresh("env-detector", loadTools)`）会**重新扫描**；结果**不缓存**，每次全量重建。
- **重扫先清空旧数据**：`loadTools` 先置 `tools=[]` 并清空 `error` 再扫描——旧列表立即被骨架屏替换（不是「保留旧数据直到新结果」）。
- **失败态组合**：扫描失败置 `scanned=true` 且 tools 为空 → 顶部 error Alert 与「没有匹配的工具」空态**并存**；Alert 本身无内联「重试」按钮，需点工具栏「刷新」重试。

## 3. 工具栏

- **搜索框**：按名称 / 路径 / detector 模糊匹配（大小写不敏感）。
- **搜索框细节**：**无防抖、无「清除」按钮**——每次按键即时重算匹配集（controller `useMemo` 派生，非受控延迟）；无 `aria-label`（仅 placeholder「搜索工具...」）；`min-w-[200px]`。
- **显示全部命令 / 隐藏系统命令**（toggle）：开启时展示**全部**扫描到的可执行文件；关闭时隐藏「低价值」项——即 `detector === "path-scan"` 且 `category === "other"` 的纯路径扫描命中的杂项命令（避免噪音）。未安装（unavailable）的工具不受此开关影响，始终在「未检测到」面板展示。
- **刷新 / 正在扫描…**：点击重新扫描；扫描中禁用（防重入）。
- **FilterBar（筛选）**：四个维度——类别（category）、来源（source）、类型（kind）、状态（status），下拉选项带计数、级联（选中一个维度后其余维度只显示符合项）、点击同值取消、可「清除」；`resultCount` 显示当前筛选后可见数（可用可见数 + 未安装数）。
- **筛选栏折叠**：标题行整行可点击——点一次收起并进入「自动模式」（鼠标悬停展开、移出 400ms 自动收起），再点展开并退出自动模式；pin 图标（Pin/PinOff）指示当前模式；「清除」按钮仅在存在激活筛选时可用（否则禁用）。env-detector 的 FilterBar **不**挂载型号选择面板（ModelPicker），仅含筛选维度。
- **汇总行**：`共 {{total}} 个工具，{{available}} 个可用`；有筛选时追加 `当前筛选结果为 {{visible}} 个`。
- **视图切换**：表格 ⇄ 网格（ViewToggle），记忆在当前 store（内存，不持久化）。

## 4. 表格列（createEnvDetectorColumns）

| 列       | 宽度               | 说明                                                 |
| -------- | ------------------ | ---------------------------------------------------- |
| 名称     | 20%（吸顶 sticky） | 工具名，按名称排序                                   |
| 版本     | 14%                | 可用且探到版本则显示，否则「未找到」；标题提示       |
| 路径     | 自动               | mono 字体；多于 1 个路径时附「N 个路径」outline 徽标 |
| 大小     | 11%（右对齐）      | 文件字节数格式化显示；按字节排序（降序优先）         |
| 安装时间 | 16%（右对齐）      | `YYYY-MM-DD HH:MM:SS`；降序优先                      |
| 状态     | 11%（居中）        | 状态徽标（见 §7）                                    |

- **排序交互**：点击可排序列头循环「升序 → 降序 → 取消排序」（默认初始为名称升序）；名称按字典序，大小按字节数、安装时间按字符串比较，两者默认降序优先（`sortDescFirst`）。排序状态存于 store（内存，不持久化）。
- **排序可达性缺口**：可排序表头为 `div` + `onClick`，非 `<button>`——**无 tabIndex / `role` / `aria-sort`，Tab/Enter 无法触发排序**，仅鼠标可排（a11y 缺口，见 §10）。
- **行键盘可达缺口**：行/卡片为 `div` 且无 tabIndex，不可 Tab 聚焦；右键菜单（复制路径/版本）仅鼠标可达（见 §10）。
- **单元格 tooltip**：名称列经 `StickyTableText` 仅**截断时**弹 tooltip（`ResizeObserver` 检测）；版本列恒有 `title`（版本值或「未找到」）；路径列 `title` = 完整路径；大小/安装时间列**无 tooltip**。
- **行交互**：表格/网格均基于虚拟滚动（`VirtualDataTable` / `VirtualGridView`，长列表只渲染视口内行/卡片，表格 overscan 10 / 网格 overscan 2）；行/卡片带 hover 高亮与 pointer 光标，但 env-detector **行点击为空操作**（`onItemClick={() => {}}`，无详情跳转），操作入口为右键菜单（见 §9）。

## 5. 网格卡片（EnvToolGridCard）

- 卡片内容：首行「名称 + 状态徽标」，第二行「版本 或 未找到」，第三行 mono 字体路径，可用且有大小显示第四行大小。
- hover 主色 ring（`hover:ring-2 ring-primary/30`）；不可用项版本/路径显示「-」。卡片无点击行为（仅右键菜单）；网格虚拟滚动（只渲染视口内卡片）。
- **列数自适应**：列数由 `ResizeObserver` 按容器宽动态计算（`minCardWidth=240`、上限 3 列）；容器设 `min-width`，窗口过窄时**整网格横向滚动而非换行**（表格同理 sticky 首列 + 横向滚动）。

## 6. 状态徽标（EnvStatusBadge）

| status             | 徽标                 |
| ------------------ | -------------------- |
| `ok`               | 绿色实心「可用」     |
| `multipleVersions` | 琥珀色描边「多版本」 |
| `versionUnknown`   | 灰色描边「版本未知」 |
| 不可用             | secondary「未安装」  |

> 注意：后端还可能产生 `versionProbeThrottled`（探测预算截断）状态，但 `EnvStatusBadge` 未为其单独渲染，会落到默认绿色「可用」徽标（仅筛选选项中可能出现该值，属已知 UI 缺口）。

## 7. 筛选维度取值（FilterBar 级联）

- **类别 category**：ai / javascript / rust / python / container / cloud / database / editor / network / packageManager / runtime / build / other。
- **来源 source**：node / cargo / homebrew / volta / asdf / mise / scoop / chocolatey / go / local / path / pyenv / python / notFound。
- **类型 kind**：executable / shim / script / missing。
- **状态 status**：ok / missing / multipleVersions / versionUnknown。

## 8. 未检测到面板（missingTools）

- 底部独立面板「未检测到（{{count}}）」；列出**当前搜索/筛选下**未安装（`available=false`）的工具名徽标。
- 后端对 34 个已知工具探测器：任一别名未在 PATH 命中即生成 `unavailable` 条目（`source=notFound`、`kind=missing`、`status=missing`）。

## 9. 右键菜单（行上下文）

- 行/卡片带 `data-context-type="env-detector-row"` + `data-row-id`（path 或 name）。
- 菜单项：**复制路径**（恒有，路径为空则复制名称）；**复制版本**（仅当有版本时）。通过平台剪贴板写入。
- 复制反馈：**无成功 toast**（静默复制）；剪贴板写入失败被 `catch {}` 静默吞掉，同样无提示（已知「复制无反馈」缺口）。

## 10. 快捷键

- 无快捷键（未见实现）。
- **键盘与无障碍（缺口汇总）**：
  - 可排序表头为 `div` + onClick，**无 tabIndex / `role` / `aria-sort`**，键盘无法触发排序（见 §4）。
  - 表格行/网格卡片为 `div` 且无 tabIndex，不可 Tab 聚焦；右键菜单（复制路径/版本）仅鼠标可达（见 §4）。
  - 筛选栏（共享 FilterBar，见 §3）：折叠标题行为 `div`、级联筛选 badge 为 `<span>`，均不可键盘聚焦；仅 pin /「清除」为真实 `<button>`，但 pin 无 `aria-pressed`（仅 `title` tooltip：`autoExpandHint`/`pinnedHint`）。
  - ViewToggle 表格/网格两个图标按钮**无 `aria-label` / `aria-pressed`**（仅图标）；搜索框无 `aria-label`（仅 placeholder）。
  - 骨架屏带 `aria-busy="true"`（已标注）；扫描失败 Alert 由 shadcn 默认带 `role="alert"`（正向项）。

## 11. 技术实现要点

- **架构分层**：`page.tsx`（视图）→ `hooks/useEnvDetectorController.ts`（状态编排/筛选派生）→ `services/env-detector.use-cases.ts`（用例）→ `services/env-detector.repository.ts`（事件监听 + 超时）→ `lib/tauri/commands/env-detector.ts`（IPC）；状态在 `store.ts`（zustand）。
- **IPC 命令**：`detect_env_tools`（无参数、立即返回，后端异步扫描后经事件回传）；事件 `env-scan-done`，payload = `ScanDonePayload { tools: EnvTool[], unavailable: EnvTool[] }`。
- **扫描方式**：后端 `spawn_blocking` + `catch_unwind`（panic 吞掉并返回空结果，避免崩溃）。
- **事件+超时**：前端先监听 `env-scan-done` 再 invoke，`SCAN_TIMEOUT_MS = 90_000`（后端单工具 3s、shell PATH 4s、80 次版本探测预算，健康机器 <30s）；超时抛 `EnvScanTimeoutError` → 提示「扫描时间过长已取消，请稍后重试」。
- **搜索目录**：进程 `PATH` + macOS 登录 shell PATH（zsh `print -r -- $PATH` / fish / POSIX 兜底，4s 超时）+ 平台默认目录（PNPM_HOME、`~/.cargo/bin`、`~/.bun/bin`、`~/.deno/bin`、`~/.local/bin`、mise/asdf/volta shims、`~/go/bin`、nvm node 各版本 bin、`~/.npm-global/bin`、rbenv/pyenv shims、macOS `/opt/homebrew/bin` `/usr/local/bin` `/opt/local/bin`；Windows 注册表 App Paths + scoop + pyenv-win + APPDATA/ProgramFiles 常见路径）。
- **排除目录**：OS 系统目录（`/usr/lib`、`/lib`、`/library/apple/usr/bin`、`/system/`、`c:/windows`）与项目本地 bin（`node_modules/.bin`、`.venv/bin`、`venv/bin`、`env/bin`、`target/debug`、`target/release`、`.git/hooks`、Windows venv Scripts 等）。
- **Node bin 精修**：读 `node_modules/<pkg>/package.json` 的 `bin` 声明把候选重命名为声明名，并过滤低信号命令（`tsserver`、`*-language-server`、`*-lsp`、多 bin 包内非主名的 `*server`）。
- **版本探测**：执行 `<path> --version`（kubectl 用 `version --client=true`、go 用 `version`），3s 超时，stdout 空则取 stderr 首行，剥 ANSI 转义，取前 120 字符；全局最多 80 次探测（预算耗尽 → `versionProbeThrottled`）。
- **状态判定**：`all_paths>1` → `multipleVersions`；已知探测器但被探测预算截断 → `versionProbeThrottled`；探测过但拿不到版本 → `versionUnknown`；否则 `ok`。
- **持久化**：无（store 纯内存，不写 localStorage / 磁盘）。
- **数据刷新**：`registerFeatureRefresh("env-detector", loadTools)` 注册到全局刷新；激活且未扫描自动扫一次。
- **i18n**：zh/en 双语，key 前缀 `envDetector.*`。

## 12. 数据模型

`EnvTool`：`name` / `version` / `path` / `size_bytes` / `size_display` / `install_time` / `available` / `category` / `source` / `kind` / `status` / `detector` / `all_paths: string[]` / `issue`。

store 关键状态：`tools`、`loading`、`scanning`、`error`、`searchQuery`、`filters`（Record<维度, 值>）、`sorting`、`scanned`、`showAllCommands`、`viewMode`（table|grid）。

派生（controller 内 useMemo）：`filterGroups`（4 组）、`filterRows`、`statusCounts`（total/available/unavailable）、`matchingTools`（搜索+筛选）、`missingTools`（不可用）、`displayedTools`（可用且通过 showAllCommands 门控）。

## 13. 边界与限制

- 桌面专用：浏览器直接访问显示「仅桌面功能」占位，不扫描。
- 平台差异：Windows 用扩展名（exe/cmd/bat/com/ps1，按 PATHEXT 排序）+ 注册表路径；macOS/Linux 用可执行位 + 登录 shell PATH；macOS 额外收 /opt/homebrew 等目录。
- 性能约束：版本探测 3s/个、最多 80 个；shell 4s 超时；前端 90s 总超时。工具多或冷盘时可能截断版本探测（状态显示 versionProbeThrottled）。
- 错误处理：扫描失败/超时 → error Alert（不中断页面）；后端 panic 静默吞掉返回空结果。
- 只读功能：不修改任何文件，不执行除 `--version` 外的命令。

## 14. 异常处理（异常场景对照）

> 前端统一入口：扫描失败/超时都会置 `error`（i18n 文案）→ 页面顶部渲染 destructive Alert，`tools` 清空、`scanned=true`，页面不崩溃、其余控件可继续操作。

| 场景                                                                   | 行为/提示                                                                                                      | 恢复/降级                                                                          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| IPC 调用失败（invoke reject，非超时）                                  | `error = envDetector.loadFailed`（「扫描环境工具失败」），顶部红色 Alert                                       | 点「刷新」重试；工具列表为空                                                       |
| 90s 内未收到 `env-scan-done` 事件（含后端 panic 后未发事件）           | 抛 `EnvScanTimeoutError` → Alert「扫描时间过长已取消,请稍后重试。」                                            | 点「刷新」重试                                                                     |
| 后端扫描线程 panic                                                     | `catch_unwind` 吞掉 panic，不 emit 事件                                                                        | 前端等待至 90s 超时 → 超时提示（不崩溃）                                           |
| 浏览器环境（非 Tauri）                                                 | `RuntimeFeatureGate` 显示「仅桌面功能」占位，不扫描；`isAvailable()`=false 时 controller 直接置 `scanned=true` | 无（占位页）                                                                       |
| 已知 34 工具未安装                                                     | 生成 `unavailable` 条目（`source=notFound`/`kind=missing`/`status=missing`）                                   | 进入「未检测到（N）」面板，始终展示（不受「显示全部命令」开关影响）                |
| 版本探测预算耗尽（全局 80 次上限）                                     | `status = versionProbeThrottled`                                                                               | `EnvStatusBadge` 未单独渲染该状态，落到默认绿色「可用」徽标（已知 UI 缺口，见 §6） |
| 已探测但拿不到版本（单工具 3s 超时 / stdout·stderr 均空 / spawn 失败） | `status = versionUnknown`                                                                                      | 灰色「版本未知」徽标；版本列显示「未找到」                                         |
| 某搜索目录不可读/不存在                                                | 后端 `read_dir` 失败直接 `continue` 跳过                                                                       | 静默降级，不影响其余目录                                                           |
| macOS 登录 shell 取 PATH 失败（4s 超时/退出码非 0/spawn 失败）         | 返回空 PATH 列表                                                                                               | 降级为「进程 PATH + 平台默认目录」扫描                                             |
| 剪贴板写入失败                                                         | `handleCopyToClipboard` catch 静默吞掉                                                                         | 无提示（复制无反馈）                                                               |

- **幂等/防重入**：`loadTools` 入口检查 `scanning`（扫描中直接 return）；刷新按钮扫描期间禁用。
- **取消/并发**：**无取消机制**（scan 无 abort，仅 90s 超时兜底）；重复触发（点刷新/全局刷新）会被 `scanning` 门控挡住。
- **数据损坏**：无持久化（store 纯内存），不存在数据损坏场景。
