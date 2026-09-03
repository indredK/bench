# Command Center（命令中心）产品说明

> 本文件是 command-center 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。
> 规划/未完成项见 `../planned/command-center.md`；技术设计见 `../modules/command-center/design.md`。

## 1. 定位

- **独立 feature**（`desktopOnly: true`），入口：路由 `/command-center`，侧边栏注册。
- 用途：把常用命令、脚本、快捷操作保存为**命令卡片**，一键运行。四种动作类型：`shell`（普通执行）、`shellAdmin`（提权执行）、`copy`（复制到剪贴板）、`open`（打开路径/URL）。
- 交互模型（v2）：紧凑卡片网格 → Hover 看实时输出 → 点击进详情抽屉（左输出 / 右详情）；Esc/点遮罩只关抽屉**不打断**命令；运行中可「终止」真正取消后端进程。
- 平台：`shell`/`copy` 双平台；`shellAdmin`/`open` 支持 macOS 与 Windows（Linux 返回 `UNSUPPORTED`）。

## 2. 主界面（卡片网格）

```
┌──────────────────────────────────────────────────────────────┐
│ 标题 + 副标题    [导入] [导出] [添加卡片]                       │
├──────────────────────────────────────────────────────────────┤
│ 卡片网格（@dnd-kit 拖拽排序，4 列自适应）                       │
│ 每卡：拖拽手柄 · 图标 · 标题+状态点 · 描述 · 徽章 · 命令预览      │
│      · 行内操作（运行/复制 · 编辑 · 删除）                      │
└──────────────────────────────────────────────────────────────┘
```

### 卡片（CommandCardTile）

- 信息分层：图标 + 标题（带**运行状态点**：running=琥珀脉冲 / success=绿 / failed=红）/ 类型徽章（shell/shellAdmin/copy/open，内置卡另带「内置」徽章）/ 命令预览（最多 3 行）/ 行内操作栏。
- **点击卡片（非按钮）→ 展开详情抽屉**；键盘 Enter/空格同样展开。
- **Hover 输出浮层**：仅当该卡已有运行结果（运行中或已完成，`hasResult` 为真）时，悬浮显示实时输出小窗（stdout/stderr，运行中 spinner）；无结果时 hover 无效果。浮层右上角可手动关闭（本次会话不再自动弹出，重新运行会恢复显示）。
- **行内操作**（`z-30` 恒在浮层之上）：非运行时「运行 / 复制」按钮；运行时同一位置变红色「终止」按钮；旁侧编辑、删除图标按钮。
- **运行状态边框色**：success 绿 / failed 红 / running 琥珀。
- **行内操作栏 z 序**：操作栏（`z-30`）恒在 Hover 输出浮层（`z-20`）之上，运行/终止/编辑/删除在浮层弹出时仍可点击。
- 内置卡（`id` 以 `builtin-` 开头）以主色边框 + ring 标识，不可删除约束未见（编辑/删除仍显示）。

**交互细节**：

- **卡片 hover**：仅 `hasResult`（运行中或已有结果）为真时浮出实时输出小窗（运行中 spinner + 滚动 stdout/stderr）；浮层右上角可手动关闭（本次会话不再自动弹出，重新运行恢复显示）；无结果 hover 无效果。
- **卡片点击（非按钮）**：展开详情抽屉；键盘 Enter/空格同样展开；点卡片内按钮（运行/终止/编辑/删除/复制）经 `stopPropagation` 不触发展开。
- **运行/终止切换**：非运行时显示「运行」；运行时同位置红色「终止」；复制类直接运行并 toast「已复制到剪贴板」，不进抽屉。
- **运行按钮防重入**：`useGuardedAsync` 全局锁保证**同一时刻只跑一张卡** + `useGuardedAsyncSet` per-card 锁（`runningIds`）；运行中该卡「运行」按钮不可重复触发，其它卡运行请求被全局锁挡下。
- **确认弹窗 loading**：提权运行确认弹窗的「确认运行」按钮在 `runningIds.has(card.id)` 时显示 loading 并禁用；删除确认无 loading。
- **空态**：无卡片时显示「还没有命令卡片，点击新建开始添加。」；加载失败显示错误 + 重试入口。
- **加载态细分**：`loading && cards.length === 0` 时显示居中 spinner；`loading && cards.length > 0`（如重进页面）直接展示已加载卡片、无 spinner。
- **加载失败无重试入口（标记「未见实现」）**：`loadCards` 仅在挂载时触发一次；失败后顶部只显示**可关闭**的错误横幅（`onDismissError`），无「重试」按钮，恢复需重进页面或刷新。

### 顶部工具栏

- **导入/导出互斥（`ioBusy`）**：两个按钮共用同一 `ioBusy`，任一执行中**两者都禁用**并各自显示 spinner；导出取消（保存对话框关闭）toast「已取消导出」，导入取消（文件选择取消）toast「已取消导入」，均不影响现有卡片。

- **导入**：`openPlatformDialog` 选 JSON → 按 id 合并（同 id 覆盖、其余追加），成功 toast 数量。
- **导出**：`savePlatformDialog` 默认 `command-cards.json` → 导出全部卡片，成功 toast 数量；取消有提示。
- **添加卡片**：打开编辑器（空草稿）。

## 3. 详情抽屉（RunDetailDrawer）

- 点击卡片从右侧滑出（Radix Sheet，宽 `min(50vw, 100vw-2rem)`）；**上 = 实时运行输出**（运行中显示 running 文案；结束后分 stdout/stderr 区块，均无则 noOutput），**下 = 卡片详情 + 命令原文 + 操作按钮**（命令区最多占抽屉一半高度，超出内部滚动）。
- 底部操作：非运行时「运行 / 复制」；运行时「终止」；「编辑」（先关抽屉再开编辑器，避免 Sheet 与 Dialog 抢焦点）。
- **Esc / 点击遮罩仅收起抽屉（`expandedId=null`），不打断正在进行的命令**；后台继续跑，结果反映在卡片状态与再次 hover/展开的输出中。

## 4. 卡片编辑器（CommandCardEditor）

- 字段：标题（必填）、描述、动作类型（四选一下拉）、命令/目标文本（按类型切换占位符与 label）。
- **类型智能建议**：`detect-card-kind` 根据命令内容推断类型，与当前选择不一致时显示琥珀提示条 +「应用建议」按钮。
- 保存按钮仅在标题与命令非空时可点；保存中 loading；保存成功自动关闭。
- **保存去抖**：`handleSubmit` 完成后**最少保留 300ms 的 saving 态**（避免按钮闪烁）；保存中按钮 `disabled`，但**「取消」按钮仍可点**（允许保存中途关闭，已提交的成功/失败以 toast 反馈）。
- **无障碍**：标题/描述/命令输入均以 `htmlFor` + `id` 关联 Label；命令文本域固定 `h-32`、等宽字体、内部滚动。
- 无删除入口在编辑器内（删除走卡片行内按钮 + 二次确认）。

## 5. 运行 / 终止 / 取消语义

- **运行**：`runCommandCard(kind, command)`。`copy` 类直接运行 + sonner toast「已复制」，不进抽屉；其余先展开抽屉再运行。
- **提权确认**：`shellAdmin` 运行前必弹 `DestructiveConfirmDialog`，以原文展示完整命令，确认后才执行。
- **删除确认**：删除卡片必弹 `DestructiveConfirmDialog`。
- **终止（应用内）**：运行中点「终止」→ `cancelCommandCard` 置全局 `RunAbortFlag` → 后端 `terminate_process_tree`（杀进程组）以 `CMD_ABORTED` 返回 → 前端标记失败（已终止）。**同一时刻只跑一张卡**（全局锁 + per-card guard），终止不误伤。
- **取消提权弹窗（系统级）**：macOS osascript / Windows UAC 用户点取消 → 后端返回 `CMD_CANCELLED`，前端标记失败但**不视为异常崩溃**。
- 运行结果 toast：成功「已执行成功」；失败显示 exitCode；异常显示错误信息。

## 6. 排序

- **@dnd-kit** 拖拽排序：仅卡片左上角**拖拽手柄（grip）**可发起（PointerSensor distance 4 + KeyboardSensor）；点击其它区域只展开抽屉不触发排序。
- **键盘拖拽**：手柄注册 `KeyboardSensor`——聚焦手柄后**空格/Enter 抓取、方向键移动、再按空格/Enter 放下、Esc 取消**；手柄带 `aria-label`「拖拽排序」；被拖卡以 `DragOverlay` 幽灵卡呈现，原卡透明度 0.4。
- 拖拽中有 DragOverlay 幽灵卡；排序后经 `saveCommandCards` 持久化；成功 toast「已重新排序」；持久化失败 toast `saveFailed` 且**本地排序已先行生效（未回滚）**。

## 7. 快捷键

无全局快捷键（本模块未实现）。

## 8. 技术实现要点

- **架构分层**：`page.tsx`（装配 + 确认弹窗 + 导入导出编排）→ `components/`（网格 / 抽屉 / 编辑器）→ `hooks/useCommandCenterController`（selector 桥接 + 防重入：`useGuardedAsync` 全局锁 + `useGuardedAsyncSet` per-card）→ `services/command-center.use-cases.ts`（业务规则：`requiresConfirm`、`createDraft`、`reorderByIds` 纯函数）→ `repository` → `@/lib/tauri/commands/command-center`。
- **持久化唯一在后端**：卡片经 `persistence.rs::atomic_write` 写入 `dirs::config_dir()/bench/command-center/cards.json`（`schema_version` + 2MB 上限）；renderer 不直接落盘。
- **执行唯一在后端**：`shell` 走 `subprocess.rs::run_output_with_timeout`（**300s 超时**、进程树清理、单路输出捕获上限 1 MiB）；`shellAdmin` macOS=`osascript ... with administrator privileges`、Windows=`Start-Process -Verb RunAs`；`open` macOS=`open`、Windows=`explorer`；`copy` 走 `tauri_plugin_clipboard_manager`；Windows `shell` 用 `cmd /C`（禁止 `start` 拉新窗口）。
- **取消**：全局 `RunAbortFlag`（Mutex<Arc<AtomicBool>>），每次运行建独立 flag 仅本次可取消。
- **契约**：`src/lib/tauri/contracts.ts` 与 `src-tauri/src/command_center/commands.rs` 双边集中维护（list/save/upsert/delete/run/cancel/export/import），组件不直接 `invoke`。
- **状态**：zustand store（cards / loading / error / runStatus / runOutcome / expandedId）；单卡结果用 selector 订阅避免整列表重渲染。

## 9. 数据模型

- `CommandCard`：`id`（`builtin-*` 为内置）/ `title` / `description` / `kind`（`shell|shellAdmin|copy|open`）/ `command` / `icon?` / `createdAt` / `updatedAt`。
- `RunResult`：`success` / `exitCode` / `stdout` / `stderr`。
- `RunStatus`：`idle | running | success | failed`；`RunOutcome = { status, result }`。

## 10. 边界与限制

- `shellAdmin` 与 `open` 仅 macOS/Windows；Linux 返回 `UNSUPPORTED`。
- 已知限制：**Windows 提权进程脱离进程树，无输出且「终止」对其无效**。
- 提权 / 删除必须二次确认；提权确认以原文展示完整命令。
- 单路输出捕获上限 1 MiB、单命令超时 300s；同一时刻仅运行一张卡。
- 用户取消系统提权对话框返回 `CMD_CANCELLED`（失败但非异常）。

## 11. 异常处理

### 11.1 错误码 → 前端提示映射

后端统一返回 `{ code, message }`（`src-tauri/src/error.rs` AppError）；controller 捕获后 `setError({ key: "commandCenter.errors.*", fallback: getErrorMessage(err) })`，页面经 `localizeError` 渲染。运行失败时卡片状态置 `failed`（红），抽屉/浮层展示 `stderr` 与 exitCode。

| 错误码                     | 场景                                                                                                                            | 前端行为/提示                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `CMD_SPAWN_FAILED`         | 进程无法启动（如 `open`/`osascript`/`powershell` 不可用）                                                                       | 运行失败 toast + 卡片 failed；展示错误信息                              |
| `CMD_FAILED`               | 命令非零退出（exitCode 非 0）                                                                                                   | toast「执行失败（退出码 {{code}}）」+ 抽屉显示 stdout/stderr            |
| `CMD_TIMEOUT`              | 命令超过 300s 超时（`subprocess.rs::run_output_with_timeout`）                                                                  | 视为失败（`CMD_TIMEOUT`），卡片 failed；可重新运行                      |
| `CMD_ABORTED`              | 用户点「终止」→ `cancelCommandCard` 置 `RunAbortFlag` → 杀进程树                                                                | 标记失败（已终止），非崩溃；抽屉显示已中止信息                          |
| `CMD_CANCELLED`            | macOS osascript / Windows UAC 提权对话框被用户取消                                                                              | 标记失败但**不视为异常崩溃**，不弹错误 toast                            |
| `CLIPBOARD_FAILED`         | `copy` 写剪贴板失败                                                                                                             | 运行失败 toast + 卡片 failed                                            |
| `UNSUPPORTED`              | Linux 上 `shellAdmin`/`open`                                                                                                    | 前端按平台禁用/隐藏该类按钮；直达返回 `UNSUPPORTED`                     |
| `INVALID_INPUT`            | 空命令、Windows `start` 拉新窗口被禁止                                                                                          | 编辑保存/运行前提示；后端拒绝执行                                       |
| 空命令前后端双校验         | 编辑器 `canSubmit` 仅查 `title/command` trim 非空；后端 `exec.rs` 对 trim 后为空再判 `INVALID_INPUT`（防止绕过前端直接 invoke） | 编辑时按钮禁用；直达运行返回 `INVALID_INPUT` toast                      |
| `PERSISTENCE_TOO_LARGE`    | cards.json / 导入文件超过 2MB                                                                                                   | 保存/导入失败 toast（`commandCenter.errors.saveFailed`/`importFailed`） |
| `PERSISTENCE_CORRUPT`      | cards.json JSON 损坏或 schema 缺失                                                                                              | 加载/导入失败 toast，不静默清空文件                                     |
| `PERSISTENCE_SCHEMA_NEWER` | 文件由更新版本写入（schema > 当前）                                                                                             | 加载失败，提示版本过旧                                                  |
| `IO_ERROR` / `TASK_FAILED` | 读写/序列化/JoinError                                                                                                           | 对应操作失败 toast                                                      |

### 11.2 常见失败场景与行为

| 场景                 | 行为/提示                                      | 恢复/降级                                                          |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| 命令长时间无输出     | 后台持续运行，Hover/抽屉实时滚动 stdout/stderr | 可随时「终止」（杀进程树）；Esc/点遮罩仅关抽屉不打断               |
| 输出超 1 MiB         | 单路输出捕获上限，超出截断                     | 显示已捕获部分；命令本身继续运行                                   |
| 命令超 300s          | `CMD_TIMEOUT` 终止                             | 标记 failed，可重试                                                |
| 用户取消系统提权弹窗 | `CMD_CANCELLED`                                | 标记失败但非异常，不弹错误 toast                                   |
| Windows 提权         | `Start-Process -Verb RunAs` 脱离进程树         | 无输出回传、「终止」无效（已知限制，文档提示）；仅返回启动成功与否 |
| Linux 平台           | `UNSUPPORTED`                                  | 前端按平台隐藏 shellAdmin/open 入口                                |
| 导入文件损坏/过大    | `PERSISTENCE_CORRUPT`/`PERSISTENCE_TOO_LARGE`  | 导入失败 toast，不影响现有卡片                                     |
| 取消命令本身失败     | controller 静默忽略（命令可能已结束）          | 不提示                                                             |

### 11.3 幂等 / 取消 / 并发保护

- **同卡防重入 + 全局单飞**：`useGuardedAsync` 全局锁保证同一时刻只跑一张卡；`useGuardedAsyncSet` per-card 锁避免同一张卡重复运行；终止不误伤其它卡片（全局 `RunAbortFlag` 每次运行建独立 `Arc<AtomicBool>`，仅最新一次可取消）。
- **终止幂等**：`cancelCommandCard` 仅置标志；命令已结束时取消为 no-op；Windows 提权进程脱离树，abort 信号不可达。
- **事件/状态清理**：`setRunStatus`/`setRunOutcome` 按 card.id 精确更新（selector 订阅），不整列表重渲染。

### 11.4 数据损坏 / schema 迁移

- `cards.json`（`dirs::config_dir()/bench/command-center/cards.json`）经 `persistence.rs::atomic_write` 原子写 + `schema_version` + 2MB 上限；`ensure_file_size` 超限报 `PERSISTENCE_TOO_LARGE`。
- 读取时 JSON 解析失败报 `PERSISTENCE_CORRUPT`（不静默重置文件）；schema 高于当前版本报 `PERSISTENCE_SCHEMA_NEWER`（fail-closed）。
- 内置卡（`builtin-*` seed）按 id 合并，用户删除过的内置卡不强制恢复；导入按 id 覆盖合并。
