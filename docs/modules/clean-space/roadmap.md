# Clean Space 迭代规划

> 最后更新: 2026-07-09
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐⚬ | 分层清晰，i18n 全量抽取已完成，错误处理统一 |
| 功能完备度 | ⭐⭐⭐⭐⚬ | 四大核心交互已对齐原型，扫描规则待丰富 |
| 用户体验 | ⭐⭐⭐⭐⚬ | 正方形摘要环形图 + 大小排序分类列表 + Glass Sheet + 进度视图已就位，可访问性 a11y 改善 |
| 性能 | ⭐⭐⭐⭐⭐ | 首屏快扫 + 上次精确扫描缓存秒开，后台 `du` 精扫自动刷新，分类明细按需懒加载 |
| 测试覆盖 | ⭐⭐⚬⚬⚬ | Rust 命令待补单测 |
| 可维护性 | ⭐⭐⭐⭐⚬ | 分层清晰，dev-cleaner 引擎复用，业务编排集中在 use-cases |
| 安全 | ⭐⭐⭐⭐⭐ | 显式 cleanability 契约 + 前端不可勾选围栏 + 后端 CleanupAction 白名单路径裁决 |

## ✅ 已完成（2026-07-08 原型对齐）

### 存储总览增强
- [x] SVG 环形图（Donut Chart）可视化，中心显示可用空间
- [x] 环形图 + 分类列表 hover 联动高亮
- [x] 左侧正方形图表面板：环形图 + 已用 / 可释放 / 最大分类摘要，点击最大分类进入详情
- [x] 分类列表行：按大小降序排列，名称 + 大小 + 相对最大分类进度条 + 整盘百分比 + 箭头，点击进入详情
- [x] 优化建议卡：安全项数 / 可释放总量 / 高风险项数统计
- [x] 移除冗余堆叠条和图例网格（与环形图冲突）

### 分类详情页增强
- [x] 清理项可展开查看详细（路径、文件数、风险权重、得分、命令预览、风险原因）
- [x] 优先级徽章 P1/P2/P3（score = 归一化空间×0.5 + (1−风险权重)×0.3，前端计算）
- [x] 风险 Pill hover tooltip（显示风险等级定义 + 本项命中原因）
- [x] 工具栏分段排序控件（按优先级 / 按大小 / 按风险）+ 仅看安全项 checkbox
- [x] 底部批量操作栏（毛玻璃效果）：全选安全 / 排除高风险 / 已选数量大小 / 清理选中

### 清理确认弹窗（Glass Sheet）
- [x] 毛玻璃效果确认弹窗，展示影响范围（删除项数、释放空间、涉及路径数）
- [x] 按风险等级分组显示命令代码块（可展开详情 + 完整命令）
- [x] 风险横幅提示（高风险/中风险不同文案）
- [x] 双重确认 checkbox（基础确认 + 高风险额外确认）

### 清理进度与结果视图
- [x] 执行进度百分比 + 进度条 + 当前项名称
- [x] 实时执行日志（带时间戳、状态圆点、逐项显示）
- [x] 清理完成后结果摘要（清理项数、释放空间、涉及路径、高风险项数）

### 导航与布局
- [x] 左侧列状菜单 → 顶部横向 tab 栏（与 dev-toolbox 等模块一致）
- [x] 所有 tab 内容区域统一 p-4 边距（由 page.tsx 统一管理）

## ✅ 已完成（2026-07-09 审计修复）

### Rust 后端安全与性能
- [x] 提取共享 `shell_util.rs` 模块，统一 `shell_escape` 函数（消除 folder_scan / system_storage 重复）
- [x] `system_storage.rs` 所有 `rm -rf` / `find` 命令使用 `shell_escape` 转义路径，消除命令注入风险
- [x] `commands.rs` 清理执行改用后端 `CleanupAction` 白名单路径裁决 + 审计日志，替代前端 command 字符串解析
- [x] `system_storage.rs` 合并 `get_disk_total_bytes` / `get_disk_used_bytes` 为单个 `get_disk_info()`，`df` 调用次数减半
- [x] `records.rs` 损坏文件备份改用 `with_file_name` 语义清晰；新增 `MAX_RECORDS=200` 上限防止无限增长
- [x] **`get_disk_info()` 修复 APFS 磁盘已用空间计算 bug**：原直接读 `df` 的 `Used` 列（只反映只读系统卷 ~15GB），导致可用空间虚高数百 GB；改用 `total - available` 推算容器级已用空间，与 macOS 系统设置显示一致
- [x] **macOS / System Data 分类细化**：macOS 分类保留核心 OS 文件与 APFS/Preboot/Recovery 等 remainder；System Data 细分 Time Machine 本地快照、VM/swap、`/private/var/folders`、系统日志、更新暂存、iPhone/iPad 备份、Mail、Messages、Spotlight 等解释项，二级页面可下钻查看大额占用来源
- [x] **系统文件误删防护（前后端围栏）**：macOS 子项、应用包、文稿、App State、跨用户数据等均返回 `is_cleanable=false` 与保护原因；前端 checkbox / 全选 / 确认弹窗 / use-case 全链路过滤不可清理项，后端再按 `category_id + id + canonical path` 重新裁决，形成双围栏
- [x] **显式 cleanability 契约**：`StorageItem` 新增 `is_cleanable` / `protection_kind` / `protection_reason`，`CleanupItemInput` 新增 `category_id`。前端不再靠风险等级猜测能否删除，后端也不信任前端传入的 `command`，而是按 `category_id + id + path` 映射到受控 `CleanupAction`
- [x] **扫描算法准确性与抗阻塞**：目录枚举改为 `read_dir + du` 参数数组，避免 shell glob 对空格/引号路径解析错误；自定义文件夹扫描改为 `find -print0` + Rust 元数据过滤；重 I/O 命令统一 `spawn_blocking`，流式扫描按分类 Tauri event 渐进渲染
- [x] **后端存储扫描优化**：`scan_overview` 从多次 `du` 改为一次批量 `du -skx <paths...>` + 独立磁盘容量查询；`scan_overview_stream` 保留分类级事件，但每个分类内部改为批量路径 lookup；Developer 细化 Homebrew、npm/pnpm/Yarn/Cargo/Go cache，并修正 Docker、MobileSync、Yarn cache 等子路径同时落入父分类的重复计数
- [x] **混合快扫模式**：`scan_overview_stream` 首先用 APFS/df 容量 + 上次精确扫描缓存快速 emit 总览；没有缓存时先给出容器级 macOS 兜底占位；随后后台线程执行精确 `du` 扫描、写入 7 天缓存并按分类事件刷新 UI。扫描过程中分类行保持可点击，明细页按需懒加载，避免前端等待慢目录。

### 前端架构与错误处理
- [x] `CategoryDetail.handleCleanup` 业务逻辑（~80 行）迁移到 `use-cases.executeBatchCleanup`，组件只负责 UI 状态
- [x] `use-cases.loadOverview` 加 `isScanning` 防重入保护，避免重复注册 listener
- [x] `CategoryDetail` 清理失败的 `catch {}` 静默吞错改为 `getErrorMessage(err)` + `console.warn` 日志
- [x] `CleanupProgress` 日志时间戳 bug 修复：`CleanupProgressItem` 新增 `timestamp` 字段，render 时读取 `log.timestamp` 而非 `new Date()`（原 bug 导致所有日志显示同一时间）
- [x] `CleanupRecords` 加 loading 占位状态（首次加载显示 spinner + "加载中…"）
- [x] `CustomFolderCleanerTool` Browse 按钮实现（调用 `openPlatformDialog({ directory: true })`），去掉 Input 的 `readOnly` 允许手动输入路径

### i18n 与可访问性
- [x] `StorageOverview` 环形图中心 `可用 / X` 硬编码中文改用 i18n key `overview.freeOfTotal`
- [x] `CategoryDetail` 详情页 `（权重 X）` 中文全角括号改用 i18n key `detail.weightValue`
- [x] 新增 i18n key：`overview.freeOfTotal`、`detail.weightValue`、`records.loading`（zh/en 对等）
- [x] `CleanupConfirmSheet` 双重确认 `<label onClick>` 改为 `<button role="checkbox" aria-checked>`，支持键盘操作
- [x] `CategoryDetail` "仅看安全项" `<label onClick>` 同样改为 `<button role="checkbox">`

## 📋 Backlog

- [x] 扫描进度流式推送 + 渐进式渲染（Tauri Events）
- [x] i18n 全量抽取：所有硬编码中文文案移至 locale JSON
- [x] 自定义文件夹清理：文件夹选择器（NSOpenPanel 风格）
- [x] 清理记录持久化（JSON 文件 → 后续可迁 SQLite）
- [ ] Windows / Linux 存储扫描适配（PlatformStorageScanner 抽象）
- [ ] 智能清理建议（基于使用频率 / 文件活跃度）
- [ ] 定时清理提醒
- [ ] 清理操作 undo 支持
- [ ] Rust 命令单测覆盖（scan_storage_overview / execute_category_cleanup）
- [ ] `system_storage.rs` 中 `scan_overview` / `scan_overview_stream` ~200 行重复代码消除（抽离共享 Paths 结构体或 category 工厂函数）

---

## 🔧 实践经验沉淀（2026-07-08）

### 导航与交互
- **Drill-down 而非堆叠**：点击分类进入详情时，用条件渲染替换当前视图（而非在下方堆叠显示）。详情页“占据”总览的位置，而非追加在下方——避免页面越来越长、滚动位置混乱。
- **ESC 返回总览**：在详情页按 ESC 键返回总览视图。这是桌面应用的常见交互模式，与 macOS 系统设置的返回行为一致，降低用户“我怎么回去”的认知成本。
- **侧边栏 → 横向 tab**：左侧列状导航占用水平空间过多（`w-44`），改为顶部横向 tab 栏后内容区更宽敞，且与 dev-toolbox 等模块风格统一。
- **padding 统一管理**：各 tab 内容区的 padding 应由 `page.tsx` 统一提供（`p-4`），子组件不要自带外层 padding，否则不同 tab 间边距不一致。
- **可视化区域去重**：环形图（Donut Chart）已包含分类占比信息，堆叠条和图例网格属于冗余展示，应移除避免视觉冲突。

### 组件设计
- **Glass Sheet 确认弹窗**：替代 `DestructiveConfirmDialog` 用于清理场景，提供毛玻璃效果 + 影响范围展示 + 命令代码块预览 + 双重确认 checkbox，更适合高风险批量操作。
- **EnrichedItem 模式**：后端返回基础 `StorageItem`，前端通过 `enrichItems()` 运行时计算 `_score` / `_priority`，避免后端改造成本。类型用 `StorageItem & { _score, _priority }` 交叉类型。
- **Hover 联动**：使用单一 `hoveredId` 状态控制多个可视化区域（环形图 + 分类列表）的高亮/暗淡效果，实现简单且交互一致。

### 扫描体验设计
- **首屏快扫优先于现场全盘递归**：macOS 系统设置快，是因为依赖系统长期维护的元数据、索引与缓存；Bench 不依赖私有缓存，而是先用 APFS/df 容量 + Bench 自有 overview cache 秒级出图，再由后台精确 `du` 刷新分类。第一次没有缓存时先显示 macOS 容器级兜底，精确值随后覆盖。
- **扫描中允许下钻**：后台精扫期间分类行仍可点击，进入详情后只扫描当前分类。总览右侧保留 spinner 表示该分类总量仍可能被后台刷新，但不再阻塞用户进入明细页。
- **骨架屏须匹配真实布局**：首次扫描的加载占位必须与最终 UI 结构一致（环形图圆形 + 分类行列表 + 建议卡），而非通用矩形块。骨架屏的目的是让用户对即将出现的内容有空间预期，结构不匹配则失去意义。
- **重扫时保留旧数据**：用户点击“重新扫描”时，不清空已有数据，而是在旧数据上继续展示新到达的分类。避免重扫时出现闪烁或空白。

### 清理流程
- **逐项执行 + 实时进度**：将批量清理改为逐项执行，每项完成后更新进度状态，用户可看到实时进度百分比和执行日志。
- **优先级评分前端算**：后端 `priority` / `score` 字段始终为默认值，由前端基于 `size_bytes` + `risk_level` 运行时计算，便于调参和单测。

---

## 🔧 实践经验沉淀（2026-07-09 审计修复）

### Shell 命令安全
- **共享 `shell_escape` 而非各自实现**：folder_scan 和 system_storage 都需要拼接 `rm -rf <path>` 命令，应提取到 `shell_util.rs` 共享，避免一处修复遗漏另一处。转义方式：单引号包裹 + `'` → `'\''`，这是 shell 字符串中唯一安全的嵌入方式。
- **动作白名单优于命令字符串白名单**：`execute_category_cleanup` 原先用黑名单过滤危险字符（`;` `&&` 等），但黑名单永远列不全；命令前缀白名单也仍需解析前端字符串。最终改为后端 `CleanupAction` 枚举，按分类、id、canonical path 生成受控动作，更安全且可审计。同时加 `eprintln!` 审计日志记录每条执行结果。
- **后端不信任前端 command**：最终执行不再解析前端传入的 shell 字符串，而是由后端按 `category_id + id + canonical path` 生成 `CleanupAction`。Downloads 仅允许直接子项，System Data 仅允许 Caches/Logs/Trash，Developer 仅允许 DerivedData/Docker，自定义文件夹必须位于 Home 且避开系统/App State/Keychains 等保护根。
- **`df` 调用合并**：`get_disk_total_bytes` + `get_disk_used_bytes` 各调一次 `df -k /`，合并为 `get_disk_info()` 返回 `(total, used)` 元组，外部并行扫描时少一个线程开销。

### APFS 磁盘空间计算
- **`df` 的 `Used` 列在 APFS 上只代表单卷**：macOS APFS 将多个卷打包进一个共享容器。`/` 挂载的是只读系统卷（Macintosh HD），其 `df` 的 `Used` 列只反映该卷的 ~15GB 系统文件，而非整个容器的已用空间。用户数据在独立的数据卷（`/System/Volumes/Data`）。直接读 `Used` 列会导致 `disk_used` 严重偏低，可用空间虚高数百 GB。
- **`1K-blocks` 和 `Available` 是容器级共享值**：APFS 容器内所有卷的 `1K-blocks`（总量）和 `Available`（可用）都相同（因为共享容器空间）。因此正确的容器级已用 = `total - available`，而非 `Used` 列。这是 macOS 特有的坑，Linux 的 ext4/xfs 上 `Used` 列是正确的。
- **`macos_remainder` 只吸收核心 OS 未归因空间**：`du` 只扫描特定路径，APFS 元数据、Preboot/Recovery、Unix 兼容目录、克隆/快照差异等无法可靠映射到普通目录。已知运行数据归入 System Data（VM、本地快照、更新暂存、Mail/Messages/备份/Spotlight 等），开发工具归入 Developer，剩余空间才由 macOS remainder 承接，保证 `freeBytes = disk_total - Σ(categories)` 与 macOS 系统设置口径接近。
- **分类必须互斥**：路径有天然嵌套关系，不能简单把父目录和子目录都相加。更具体的归属优先：Docker 归 Developer 并从 App Data 扣除；MobileSync/iOS 备份归 System Data 并从 App Data 扣除；Yarn cache 归 Developer 并从 System Data Caches 扣除；Homebrew 归 Developer，不再混入 macOS。

### 后端扫描算法最佳实践
- **容量口径用 APFS 容器级可用空间**：Apple APFS 支持 space sharing、snapshot、clone，目录大小之和不等于容器已用空间。总量/可用量以 APFS 容器口径为准，分类只做 attribution，未知空间进入 macOS remainder。
- **目录归因用批量、同文件系统、低进程数**：`du -skx` 保持在同一文件系统内，避免跨 APFS volume 把 Data 卷算进 `/System`；一次批量传入多个路径，少起进程，比每个目录一个 `du` 更稳。
- **流式不是全量并发**：对 UI 友好的做法是分类级并发 + 分类内批量 lookup，而不是把几十个路径全部打成独立线程。这样既有渐进结果，又不会在慢盘上制造进程风暴。
- **可解释优先于“可删除”**：System Data / Developer 的 VM、快照、更新暂存、备份、Mail、Messages、Spotlight、Homebrew、npm/pnpm/Yarn/Cargo/Go cache 用于解释空间来源，但默认受保护展示；真正删除仍走系统设置、Time Machine、对应 App 或包管理器自身 prune 流程。

### macOS 分类细化
- **remainder 不应是黑盒**：原 macOS/System Data 只有粗粒度项，用户看到几十 GB 到上百 GB 的占用却无法下钻查看来源。修复后 System Data 明细列出 Time Machine 本地快照、VM/swap、`/private/var/folders`、系统日志、更新暂存、iPhone/iPad 备份、Mail、Messages、Spotlight；macOS 明细只解释 `/System`、`/Library`（扣除更新暂存）和 "Other macOS Files" 兜底项。
- **流式扫描中 macOS 必须最后 emit**：macOS 分类的 `total_bytes = disk_used - Σ(其他 7 个分类)`，依赖其他分类的总和。因此 `scan_overview_stream` 中 7 个分类线程并行 emit，macOS 在 `thread::scope` 结束后（所有线程 join 完成）才 emit。前端 `mac-os-remainder.ts` 识别 `incoming.id === "macos"` 时直接使用后端值（含子项），不重新计算单 item remainder——前 7 个分类 emit 时仍走原逻辑计算占位 macOS，最后 macOS emit 时用后端完整子项覆盖。
- **Homebrew 路径按架构选择并归入 Developer**：Apple Silicon 上 Homebrew 装在 `/opt/homebrew`，Intel 上装在 `/usr/local`。两者都作为 Developer 受保护解释项显示，避免把开发工具依赖误算成 macOS 核心系统。
- **root 权限路径降级为解释项或兜底**：`/private/var/vm`（sleepimage、swapfiles）和部分系统路径可能因权限返回 0；可读时显示为 System Data 解释项，不可读时仍由 macOS/System Data remainder 兜底，不让空间凭空消失。

### 系统文件误删防护
- **`is_cleanable` 是唯一可删除信号**：macOS 系统路径、应用包、用户文稿、App Support、Containers、Group Containers、Other Users、Xcode Archives 等都返回 `is_cleanable=false`，并带 `protection_kind/protection_reason`。`command` 只用于预览，不再作为唯一语义源。
- **前后端双围栏缺一不可**：系统文件误删是高风险场景，需要多层防护：(1) 前端 checkbox 灰显 + `cursor-not-allowed` + tooltip 提示；(2) `selectAllSafe` / 确认弹窗 / use-case 全部用 `canCleanStorageItem` 过滤；(3) IPC 带上 `category_id`；(4) 后端忽略前端 command，按白名单 `CleanupAction` 重新裁决；(5) System Data 的 Caches 清理会跳过已归为 Developer 的受保护缓存子目录；(6) 自定义目录扫描和删除都拒绝系统/App State/Keychains 等保护根。
- **`risk_level: Safe` 不等于"可删除"**：macOS 系统文件子项的 `risk_level` 是 `Safe`（表示信息展示风险低），但 `is_cleanable=false`。这两个字段语义独立：`risk_level` 描述用户认知风险，`is_cleanable/protection_kind` 描述是否允许清理。

### 状态管理分层
- **业务编排集中在 use-cases**：`CategoryDetail.handleCleanup` 原本含 ~80 行业务逻辑（progress 跟踪 + 批量执行 + 记录添加 + overview 刷新），违反"组件只负责 UI、业务编排放 use-cases"规范。迁移到 `executeBatchCleanup(category, items)` 后，组件只传选中项和分类，store 操作和 repository 调用都集中在 use-cases。
- **防重入用 store 状态而非模块标志**：`loadOverview` 原本无防重入，用户连点 Scan 会注册重复 listener。修复时检查 `useCleanSpaceStore.getState().isScanning`——这是流式扫描的"正在工作"标志，天然适合做重入门控，不需要额外的模块级 flag。

### 日志时间戳的正确姿势
- **时间戳必须在事件发生时记录**：`CleanupProgress` 原本在 render 时用 `new Date().toLocaleTimeString()` 计算时间，导致每次重渲染所有日志行显示同一时间（当前时间）。正确做法是在 push log entry 时记录 `timestamp: Date.now()`，render 时读取 `log.timestamp`。这是"事件时间 vs 渲染时间"的经典区分——日志显示的是事件发生时刻，不是用户查看时刻。

### 可访问性：label vs button
- **`<label onClick>` 是反模式**：原本双重确认 checkbox 用 `<label onClick={...}>` 包裹视觉 span，没有真实 `<input>`。问题：键盘用户无法 Tab 到 label（label 不是 focusable），屏幕阅读器不识别为 checkbox。修复为 `<button type="button" role="checkbox" aria-checked={...}>`，键盘可操作 + ARIA 语义正确。

### 持久化记录的防御性
- **损坏文件备份而非静默吞错**：`records.rs.add_record` 读取已有记录失败时，原实现直接用空数组覆盖（静默丢失历史）。修复为：先把损坏文件 rename 到 `records.json.corrupt-<timestamp>` 备份，再从空开始。用户可手动恢复，且 `eprintln!` 留下日志。
- **记录数量上限**：`records.json` 无限增长会导致读写越来越慢。加 `MAX_RECORDS=200` 上限，每次 add_record 时 `truncate` 到 200 条（保留最新的，丢弃最旧的）。200 条足够覆盖数月使用历史。

### 文件路径操作的语义清晰
- **`with_extension` vs `with_file_name`**：原代码 `path.with_extension(format!("json.corrupt-{}", ts))` 把扩展名从 `json` 改成 `json.corrupt-xxx`，语义不直观（看起来像在改扩展名，实际在改整个文件名）。改用 `path.with_file_name(format!("records.json.corrupt-{}", ts))` 直接指定完整文件名，意图一目了然。
