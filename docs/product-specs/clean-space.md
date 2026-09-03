# Clean Space（清理空间）产品说明

> 本文件是 clean-space 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。

## 1. 定位

- **macOS-only 顶层清理入口**（非 Bench 主序列外的旁路，属于主应用），入口：路由 `/clean-space`，侧边栏注册（Trash2 图标），`desktopOnly: true`、`platforms: ["macos"]`，Windows 隐藏导航。

- 用途：一键盘点磁盘占用（对标 macOS「系统设置 → 存储空间」的 8 大分类），并在受控白名单内安全清理缓存/日志/废纸篓/开发产物/自定义目录。

- 核心保证：后端不信任前端下发的命令字符串；清理只允许 Home 内受控路径；危险操作强制二次确认（含高风险双确认）；部分失败分别报告，失败项不计入释放量。

## 2. 主界面布局（顶部横向 Tab）

```
┌──────────────────────────────────────────────────────────────┐
│ Tab 栏：存储总览 │ 开发项目清理 │ 自定义目录清理 │ 清理记录     │
├──────────────────────────────────────────────────────────────┤
│ 内容区（按 Tab 切换）                                          │
│  总览 = 存储总览卡片 + 清理进度（进行中时叠加显示）               │
└──────────────────────────────────────────────────────────────┘
```

- 四个 Tab：`overview`（存储总览）、`dev-project`（开发项目清理）、`custom-folder`（自定义目录清理）、`records`（清理记录）。

- 存储总览下，选中分类进入 `CategoryDetail` 下钻视图，`Esc` 返回总览。

- 清理执行期间 `isCleaning` 锁住清理入口；扫描进行中仍可浏览旧数据与进入已知分类。

## 3. 存储总览（StorageOverview）

- **自动扫描**：进入页面且无数据、未扫描时自动触发一次流式扫描；顶部「扫描」按钮可手动重扫（加载中禁用并显示 spinner）。

- **打开系统设置**：按钮调用 `openSystemStorageSettings` → macOS 系统设置「存储空间」面板（失败回退 General）。

- **磁盘摘要行**：总容量 + 可用空间（绿色高亮）。

- **环形图（Donut）+ 分类列表联动**：

  - 环图中心显示可用空间与「可用/总容量」；每个分类一段，hover 高亮（其余段淡化），点击进详情。

  - 分类行：色点 + 名称 + 大小 + 相对进度条 + 百分比；hover 与环图联动高亮；扫描中该行显示 spinner 而非 chevron。

- **底部建议卡**（固定贴底）：安全可清理项（system\_data+downloads）、总可清理量（除 macOS/other\_users 外）、高风险项计数（developer 分类有量则记 1）。

- **状态呈现**：

  - 首扫无数据 → 骨架屏（镜像真实布局：摘要/环图/列表/建议卡）；

  - 扫描中已有 overview → 顶部细进度条 + 各分类行 spinner；

  - 扫描中但无分类 → 「正在扫描」居中提示；

  - 未扫描无数据 → 「点击扫描」空态；

  - 出错 → 顶部红色错误文案。

- 分类采用渐进式流式呈现：磁盘容量瞬间返回，分类按 `du` 完成逐个刷新，边扫边渲染。

- **键盘与无障碍**：环形图为纯装饰（`aria-hidden`），hover 联动高亮仅鼠标可用；环图分段与分类行均为 `<div onClick>`，**无** **`role`/`tabIndex`**，进入分类详情无键盘入口（鼠标专用）。

- 「打开系统设置」按钮仅 `canUsePlatform`（macOS）时渲染；点击失败仅 `console.warn`，**无任何 UI 反馈**（无 toast/错误文案）。

- 「扫描」按钮 `disabled = isScanning || !canUsePlatform`；进入页面且无数据、未扫描时自动触发一次扫描（见上方）。

## 4. 分类详情（CategoryDetail）

- **入口**：点击总览分类行；顶部面包屑「← 存储总览 / 分类名 / 大小」，`Esc` 或点击面包屑返回。

- **懒加载**：进入时该分类 `items` 为空才请求 `getCategoryItems`（只扫该分类，不全盘遍历），加载中显示 spinner、失败显示错误文案可重试。

- **工具栏**：

  - 排序：优先级（P1→P3）/ 大小（降序）/ 风险（safe→high，同分按 score）；

  - 「仅看安全」：只显示 safe/low 项；

  - 右侧统计：总条目数 · 可释放总量（列表内全部条目之和）。

- **行内容**：复选框（仅 `is_cleanable` 项可勾选，否则禁用并 tooltip 显示保护原因）+ 名称 + 路径（含文件数）+ 优先级徽章（P1 主色 / P2 / P3 弱化）+ 风险标签（RiskPill，tooltip 展示风险定义与命中原因）+ 大小 + 展开箭头。

- **展开详情**：路径 / 文件数 / 风险等级与权重 / 得分（0\~100，`score*100`）/ 实际清理命令（代码块，左缘按风险着色）/ 保护原因。

- **优先级算法**（`lib/priority.ts`）：`score = 归一化空间×0.5 + (1−风险权重)×0.3 + 用户标记×0.2`，风险权重 safe/low/medium/high = 0/0.33/0.66/1；按 score 降序三等分 → P1/P2/P3。

- **批量操作栏**（sticky 底部）：选择全部安全项 / 排除高风险项 / 「已选 N 项 · 可释放 X」/ 清理选中（destructive，`isCleaning` 时禁用）。

- **交互细节**：

  - 整行点击 = 展开/收起详情；复选框区域点击 `stopPropagation` 只切换勾选、不触发展开。

  - 不可清理项（`is_cleanable=false`）复选框禁用态（`cursor-not-allowed` + 40% 透明 + title/tooltip 展示保护原因，如 AppBundle / AppState / SystemCritical / CrossUserData）。

  - 排序（优先级/大小/风险）、「仅看安全」、展开项均为**页内临时状态**；点面包屑「← 存储总览」或按 `Esc` 返回时清空选中与展开集合。

  - 「选择全部安全项」只勾选 `safe` 且可清理的项（保留既有选择，不清空）；「排除高风险项」仅从当前选中集中剔除 `high` 项。

  - 清理按钮在「未选中任何可清理项 || `isCleaning`」时禁用并显示 spinner；清理期间批量栏与复选框操作整体被锁。

  - 清理成功 → toast（`cleanSpace.toast.cleanupSuccess`，含数量与释放量）；整批抛错 → toast 失败（`cleanupFailed`）。

  - **键盘与无障碍**：行复选框为 `<span onClick>`，**无** **`role=checkbox`/`aria-checked`**（与「仅看安全」、确认弹窗 ack 复选框的 `role=checkbox` 不一致），键盘无法勾选；整行展开/收起同样无键盘焦点。

  - 排序/筛选/选中/展开均为页内临时状态，返回总览（面包屑/Esc）时组件卸载一并重置（含排序与 safeOnly，见上方「页内临时状态」）。

  - 懒加载同分类防重入：`loadingCategoryRef` 记录在途分类，未完成前重复进入不重复发请求。

## 5. 清理确认弹窗（CleanupConfirmSheet）

- 玻璃拟态（backdrop-blur）居中弹窗，点击遮罩或右上 X 关闭，打开时重置勾选状态。

- **影响范围条**：删除 N 项 · 预计释放 X · 涉及 N 个路径。

- **风险横幅**：含高风险项 → 红色「不可恢复」横幅 + 二次勾选确认；仅含中风险 → 橙色横幅（不要求额外勾选）。

- **命令列表**：按风险升序 + 大小降序；每行显示 `$ 命令`、风险标签、大小、展开按钮；展开显示名称/路径/文件数/风险/完整命令/保护原因。

- **双重确认**：ack1（理解影响范围，必选）+ 含高风险时 ack2（确认高风险项不可恢复，必选）；两项满足且存在可清理项才可提交。

- **交互细节**：

  - 弹窗每次打开都会重置 ack1 / ack2 / 命令展开集合；点遮罩（仅 `target === currentTarget`）或右上 X 关闭。

  - 提交按钮 `disabled = !(有可清理项 && ack1 && (无高风险 || ack2)) || loading`；loading 期间「取消」「提交」均禁用并显示 spinner。

  - 命令列表按「风险升序 + 大小降序」排列，每行可展开查看名称/路径/文件数/风险/完整命令/保护原因。

  - 确认后由详情页接管执行：先关弹窗、清空选中，再 toast 结果。

  - **键盘与无障碍**：弹窗为原生 div 覆盖层，**无** **`role=dialog`/`aria-modal`/焦点陷阱**，Tab 可跳出弹窗；ack1/ack2 复选框有 `role=checkbox`+`aria-checked`（可键盘触发）。

  - 现有快捷键表标注的「Esc 关闭确认弹窗」在代码中**未见实现**（仅遮罩点击与右上 X 可关闭），见 §10 说明。

## 6. 清理进度（CleanupProgress）

- 执行中：大百分比 + 当前项名 + 进度条 + done/total。

- **执行日志**：暗色代码块内按时间戳实时追加「成功/失败/跳过 · 名称 · 释放量」，高风险成功项标注「不可恢复」。

- **结果卡**：失败项 / 清理项 / 释放空间 / 涉及路径数 / 高风险项 五格统计（失败或高风险 > 0 时红色高亮）+「再次清理」/「完成」按钮。

- 完成头：有失败 → 橙色警告 +「完成但有 N 项失败」；否则绿色 ✓ +「全部完成」。

- 清理完成后：乐观移除当前分类已清理条目并扣减 total\_bytes，随后后台刷新一次总览校准（失败不影响已成功的清理）。

- **交互细节**：

  - 前端**逐项串行**调用 `executeCategoryCleanup`（每批仅 1 项，由前端循环驱动进度），日志按真实时间戳实时追加；期间**无取消/停止按钮**，`isCleaning` 锁住所有清理入口，只能等待完成。

  - 结果卡「再次清理」与「完成」行为相同：重置进度并返回存储总览（`setSelectedCategoryId(null)`）。

  - 单项失败（命令返回非 `cleaned` / `items_failed>0` / 命令抛错）记为红色日志，不计入 freed\_bytes；成功项即时从当前分类乐观移除。

  - **进度视图可达性（状态流转）**：从分类详情确认清理后前端**不自动切入** CleanupProgress —— 仍停留在分类详情（批量栏 spinner + 按钮禁用），进度视图仅在返回总览（面包屑/Esc）后可见；清理完成后「再次清理/完成」回到总览。

  - **清理中重扫边界**：清理执行期间顶部「扫描」按钮**未禁用**（仅 `isScanning` 时禁用），点击会重置总览并切回总览，但已启动的清理继续在后台执行（进度随后可见），不中断不冲突。

  - 清理完成后的后台总览刷新失败非致命（`console.warn`），不影响已成功的清理结果与乐观更新。

## 7. 开发项目清理（DevProjectCleanerTool）

- 直接嵌入 `dev-cleaner` 引擎的 `DevCleanerPageContent`（复用其 store/controller），不做二次封装。功能明细见 `docs/product-specs/dev-cleaner.md`。

## 8. 自定义目录清理（CustomFolderCleanerTool）

- 工具栏：路径输入框（可手动填，也可「浏览」用系统目录选择器选目录）+「超过 N 天」（mtime，默认 30，可调）+「包含子文件夹」勾选（默认开）+「扫描」按钮。

- 扫描调用 `scanCustomFolder(folder, mtimeDays, includeSubfolders)`，后端 WalkDir（不跟随符号链接）只统计超过 N 天的文件，取体积最大的前 100 个。

- **结果摘要**：找到 N 项 · 预计释放 X（绿色）。

- **结果列表**：每行名称 + 风险标签（均为 safe）+ 路径 + 大小。

- ⚠️ 界面目前只做**扫描与展示**，未见把扫描结果接入清理执行的按钮（后端 `custom_folder` 清理动作已支持，见规划文档）。

- **键盘与输入**：路径输入框可手动编辑（非只读）；mtime 输入 `Number(value)||30`，非法/0 回退 30，`min=1` 无上限校验；「包含子文件夹」为原生 checkbox。

- **扫描按钮禁用条件**：`!folder.trim() || isScanning || !canUsePlatform`；二次扫描先清空旧结果（`setResult(null)`）；扫描期间无取消按钮，也无防重入守卫（靠按钮 disabled 拦截）。

- **错误细分**（后端 `folder_scan.rs`）：相对路径 → `INVALID_INPUT`；路径不存在/不可访问（canonicalize 失败）→ `NOT_FOUND`；选中文件而非目录 → `INVALID_INPUT`。均在前端顶部错误文案（`scanFailed`）展示，扫描按钮复位可重试。

## 9. 清理记录（CleanupRecords）

- 全高列表 + 刷新按钮；加载中 / 空状态均有提示。

- 记录行：标题 + 状态徽章（ok=secondary / warn=destructive，含失败或高风险即 warn）+「scope · 时间」+ 绿色「+释放量」+「N 项（高风险 M）」。

- 数据持久化于 `config_dir/bench/clean-space/records.json`（见 §11）。

- **交互细节**：记录行为纯展示（不可点击/删除/展开）；刷新按钮 loading 态禁用并显示 spinner；`getCleanupRecords` 失败时**保留现有 records 不清空**，仅 `console.warn`，无错误 UI（见 §14 持久化错误行）。

## 10. 快捷键

| 键    | 功能                               |
| ----- | ---------------------------------- |
| `Esc` | 分类详情返回存储总览；关闭确认弹窗 |

> 说明：详情页 `Esc` 返回总览由窗口级 keydown 实现（仅当 `selectedCategoryId` 非空时注册）；「Esc 关闭确认弹窗」在代码中**未见实现**（确认弹窗仅遮罩点击/右上 X 可关，见 §5）。

## 11. 技术实现要点

- **架构分层**：前端 `src/features/clean-space/`（page.tsx / components / hooks / lib / services / store.ts），后端 `src-tauri/src/clean_space/`（commands.rs / system\_storage.rs / folder\_scan.rs / records.rs / shell\_util.rs / system\_settings.rs / types.rs）。

- **流式扫描**：`scan_storage_stream` 在 Rust 端逐个 emit 事件 `clean-space:scan-start`（磁盘容量）→ `clean-space:scan-category`（每个分类）→ `clean-space:scan-complete`；前端先注册 listener 再触发扫描，并维护 `activeUnlisteners` 防重复注册/重扫。

- **混合扫描模型**：

  1. `df -k /` 快速取 APFS **容器级**容量（total 与 Available 同容器，used = total − available，避免只读系统卷的 Used 列低估）；
  2. 后台 `du -skx` 精扫（`-x` 防止跨卷把整个数据卷算进 /System），`thread::scope` 并行 + 每 128 路径一批，减少进程开销；
  3. 分类详情按需再扫，避免首屏遍历所有文件。

- **总览缓存**：`cache_dir/bench/clean-space/overview.json`（版本 1、7 天有效、磁盘总容量变化即失效），首屏秒出上次精确值，后台刷新。

- **macOS 余量分类**：`macos = disk_used − 已知分类总和`，后端 `build_macos_category` 拆分「macOS System / System Library / Other macOS Files」子项（前端收到 `id === "macos"` 时直接采用，不再前端重算）。

- **8 大分类**：applications / downloads / documents / system\_data / app\_data / other\_users / macos / developer（固定顺序）。

- **清理白名单（后端强制）**：`execute_category_cleanup` 只接受 `downloads`（`dl_` 前缀 + Downloads 直接子项）、`system_data`（仅 sys\_caches / sys\_logs / sys\_trash）、`developer`（仅 xcode\_derived / docker\_data）、`custom_folder`（Home 内且非保护根）。路径一律 `canonicalize` 后校验；`command` 字段仅作展示，后端按 `category_id + id` 映射白名单动作。

- **清理动作**：remove\_path / remove\_children / remove\_children\_except（Library/Caches 清空但保留 `Library/Caches/Yarn`）/ delete\_old\_logs（`find -name '*.log' -mtime +30 -delete`，120s 超时）/ docker\_prune（`docker system prune -af`，300s 超时）。释放量 = 清理前后 `du` 差值。

- **批量上限与校验**：单批 ≤ 500 项、id ≤ 256 字节、路径 ≤ 4KB、id 去重，超限返回 `INVALID_INPUT`。

- **记录持久化**：`config_dir/bench/clean-space/records.json`，schema\_version=1，上限 200 条、2MB，原子写（临时文件 + 重命名），损坏/旧 schema 自动备份后恢复，未来 schema 拒绝写入（fail-closed）。

- **IPC 命令（8 个）**：`scanStorageOverview` / `scanStorageStream` / `getCategoryItems` / `executeCategoryCleanup` / `scanCustomFolder` / `openSystemStorageSettings` / `getCleanupRecords` / `addCleanupRecord`，全部经 `contracts.ts` 类型封装。

- **i18n**：分类名、风险、保护原因用 canonical value + `t()` 映射（如 `cleanSpace.categories.<id>`、`cleanSpace.risk.<level>`）。

## 12. 数据模型

- `StorageItem`：`id` / `name` / `category_id` / `risk_level(safe|low|medium|high)` / `size_bytes` / `command` / `is_cleanable` / `protection_kind` / `protection_reason` / `path` / `files` / `reason` / `priority(P1|P2|P3)` / `score`。

- `StorageCategory`：`id` / `name` / `color` / `total_bytes` / `items`。

- `StorageOverview`：`disk_total_bytes` + `categories`。

- `CleanupRecord`：`id` / `timestamp` / `title` / `scope` / `items` / `freed_bytes` / `high_risk_count` / `status(ok|warn)`。

- `CleanupItemInput` / `CleanupItemResult(status=cleaned|failed|rejected)` / `CategoryCleanupResult` / `FolderScanResult`。

- 前端 store 关键状态：`activeTool` / `overview` / `records` / `isScanning` / `scanDiskInfo` / `scannedCategoryCount` / `selectedCategoryId` / `isCleaning` / `cleanupProgress{active,total,done,currentItem,logs,finished,result}`。

## 13. 边界与限制

- **仅 macOS**（du/df/tmutil/diskutil/osascript）；Windows 隐藏导航。

- **保护红线**：系统根目录、/Applications、/Library、/System、/bin、/etc、/opt、/private、/usr、Application Support、Containers、Group Containers、Keychains、跨用户数据（/Users/Shared）一律拒绝清理；App Bundle / App State / UserData / SystemCritical 分类默认不可清理（`is_cleanable=false`）。

- **危险操作强制确认**：清空 Library/Caches、清空废纸篓、docker prune 等高风险项除通用确认外要求额外勾选（ack2）。

- **部分失败语义**：单批逐项执行，`Rejected`/`Failed` 分别计数，失败项不计入 freed\_bytes，`success = failed == 0`；后端拒绝的项返回结构化 `error_code`。

- **外部进程超时**：df 10s、du 120s、snapshot 30s、find 120s、docker 300s，超时即失败不悬挂。

- **性能**：首屏靠缓存 + 容量快速返回，精扫后台化；分类详情按需扫描；超大列表未见虚拟化（详情页为整页滚动，量级以「分类级」受控）。

- 自定义目录清理当前仅扫描展示，清理入口未接线（见规划文档）。

## 14. 异常处理

> 后端统一错误为 `{ code, message }`（`AppError`），前端经 `parseCommandError` 取 `code` 做机器判断、`message` 兜底展示；单条清理项则返回结构化 `CleanupItemResult{status, error_code}`。

### 错误码 → 前端提示映射

| 错误码                                                                                                            | 触发场景                                                                        | 前端行为/提示                                                                     | 恢复/降级                                                                          |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `INVALID_INPUT`                                                                                                   | 单批 >500 项 / id 空或 >256B / id 重复 / 路径 >4KB                              | 清理命令整体被拒，该项记 failed 红日志                                            | 减少/修正选择后重试                                                                |
| `FORBIDDEN_PATH`                                                                                                  | 分类不可清理、路径不在白名单/越界、命中保护根（系统目录、跨用户、Keychains 等） | 该项 `Rejected`，红日志，**不计入 freed\_bytes**                                  | 该项跳过，其余继续                                                                 |
| `NOT_FOUND`                                                                                                       | canonicalize 失败（路径不存在/不可访问）、Home 目录缺失                         | 该项 `Failed` 红日志                                                              | 跳过继续                                                                           |
| `CLEANUP_PROCESS_SPAWN_FAILED` / `CLEANUP_PROCESS_FAILED` / `CLEANUP_PROCESS_TIMEOUT` / `CLEANUP_PROCESS_ABORTED` | find（120s）/ docker（300s）等外部进程启动失败、非零退出、超时、被中止          | 该项 `Failed`，日志展示错误码                                                     | 超时即失败不悬挂，可重试                                                           |
| `IO_ERROR`                                                                                                        | 文件系统读写/删除失败                                                           | 该项 `Failed` 红日志                                                              | 跳过继续                                                                           |
| `PERSISTENCE_TOO_LARGE` / `PERSISTENCE_CORRUPT` / 未来 schema                                                     | 清理记录文件超 2MB、损坏、schema 过新                                           | 读取失败时前端**保留现有 records 不清空**（console.warn）；写入失败不影响清理结果 | 损坏自动备份后恢复（`backup_file` + 原子写）；未来 schema **fail-closed 拒绝写入** |

### 常见失败场景与行为

- **扫描失败**：`scanStorageStream` 抛错 → 顶部红色错误文案（`scanFailed`）+ 停止扫描 + 清理事件监听；可点「扫描」重试。

- **扫描中重复触发**：`isScanning` 防重入忽略；重扫前先注销旧 listener（`activeUnlisteners`），避免重复注册/叠加事件。

- **分类详情加载失败**：进入已扫分类请求 `getCategoryItems` 失败 → 详情区错误文案可重试；离开页面取消在途请求（`cancelled` 标志），后台总览刷新不会误伤在途加载。

- **自定义目录扫描失败**：路径非绝对/不存在/非目录 → 顶部错误文案（`scanFailed`），扫描按钮复位可重试。

- **保护路径拒绝**（系统根、/Applications、/Library、/System、/usr、Application Support、Containers、Keychains、/Users/Shared 等）：后端 `reject_protected_custom_path` 直接 `FORBIDDEN_PATH` 拒绝，不静默执行。

- **部分失败语义**：单批逐项执行，`Rejected`/`Failed` 分别计数，失败项不计入释放量，`success = failed == 0`；前端乐观移除只移除成功项。

- **记录持久化安全**：schema\_version=1、上限 200 条/2MB、原子写（临时文件+重命名）、损坏或旧 schema 自动备份后恢复、未来 schema 拒绝写入（fail-closed）。

- **幂等/并发保护**：清理入口 `isCleaning` 锁（重复点击/二次提交被拦）；扫描 single-flight + listener 防重入；清理本身不可取消、无停止按钮（当前版本）。
