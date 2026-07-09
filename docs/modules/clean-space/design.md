# Clean Space（存储空间清理）技术设计文档

> 状态：设计稿（待评审）
> 关联原型：`docs/modules/clean-space/clean-space-prototype.html`
> 关联旧模块：`docs/modules/dev-cleaner/`（开发项目清理将作为本模块的子流程保留）
> 遵循规范：`docs/coding-standards.md`（§2 前端目录 / §3 状态与异步 / §4 国际化 / §5 用户反馈）、`AGENTS.md`

---

## 0. 决策基线（来自需求确认）

1. **定位（主菜单模块）**：原型描绘的"整机存储空间清理"作为**顶层主菜单模块 `clean-space`**（与 dev-toolbox、port-manager 平级，独立侧边栏入口）；现有的"开发项目清理（dev-cleaner）"降级为其中的一个**工具按钮**，点击进入专门的开发项目清理子流程。dev-cleaner 不再作为独立主菜单项，也不在任何 tab 容器内。
2. **自定义清理**："自定义文件夹清理"只是 `clean-space` 内又一个**工具**，不另起炉灶；应**增强**现有 `custom_cleanup` 引擎，而非并行再造。
3. **风险模型**：将 `RiskLevel` 由 3 档扩展为 4 档（`safe` 加入），现有语义向上兼容。

---

## 1. 目标与范围

| 维度 | 内容 |
|------|------|
| 新增 | 存储空间总览、分类详情、优化建议、清理记录（持久化）、自定义文件夹清理（增强版：文件夹选择 + `du` 预估 + 规则） |
| 复用 | dev-cleaner 的扫描/清理引擎（`scan_dev_projects` / `cleanup_projects` / `safe_delete`）、`custom_cleanup` 引擎（`get_custom_cleanup_commands` / `execute_custom_cleanup`）、`DestructiveConfirmDialog` |
| 改造 | `RiskLevel` 扩档（Rust + TS + 渲染分支 + 测试）、dev-cleaner 从 dev-toolbox tab 迁移为 clean-space 子流程 |
| 不冲突增量 | 总览环形图、分类三级结构、清理记录 UI（现有代码库无对应实现） |

**跨平台前瞻（向后兼容）**：首期仅 macOS，但所有平台相关逻辑必须封装在 `PlatformStorageScanner` 抽象后，保证后续接入 Windows 时前端契约与共享类型**零改动**（详见 §12）。

---

## 2. 总体架构

### 2.1 新增顶层 feature

```
src/features/clean-space/
├── feature.tsx                      # 注册路由 / 顶部横向 tab 栏入口（id: "clean-space"）
├── page.tsx                         # 顶层壳：顶部横向 tab 栏 + 下方内容区域（统一 p-4 边距）
├── store.ts                         # 伞状 store：activeTool / overview / records / cleanupProgress
├── components/
│   ├── StorageOverview.tsx          # 总览：磁盘摘要 + 环形图 + 分类列表（hover 联动） + 优化建议卡
│   ├── CategoryDetail.tsx           # 分类详情：展开详情 + 优先级徽章 + 风险 tooltip + 批量操作栏
│   ├── CleanupProgress.tsx          # 清理进度：进度条 + 实时日志 + 结果摘要
│   ├── CleanupRecords.tsx           # 清理记录列表
│   ├── tools/
│   │   ├── DevProjectCleanerTool.tsx   # 嵌入现有 dev-cleaner 页面组件
│   │   └── CustomFolderCleanerTool.tsx # 自定义文件夹扫描 + 规则清理
│   └── shared/                      # 跨工具复用组件
│       ├── RiskPill.tsx              # 风险等级标签（4 档：safe/low/medium/high）
│       └── CleanupConfirmSheet.tsx   # 毛玻璃确认弹窗（命令预览 + 风险横幅 + 双勾选）
├── hooks/
│   └── useCleanSpaceController.ts
├── services/
│   ├── clean-space.use-cases.ts
│   └── clean-space.repository.ts
└── lib/
    └── priority.ts                  # P1/P2/P3 评分（纯函数，可单测）
```

> **导航结构变更（2026-07-08）**：原设计为左侧列状菜单，现已调整为**顶部横向 tab 栏**（与 dev-toolbox 等模块保持一致）。tab 选中状态通过底部蓝色下划线标识。所有 tab 内容区域统一由 page.tsx 提供 `p-4` 边距，子组件不再自带外层 padding。

### 2.2 dev-cleaner 的归宿

- **Rust 端**：`src-tauri/src/dev_cleaner/` 整体保留，作为"开发项目清理"与"自定义命令清理"的底层引擎，命令名（`scan_dev_projects` 等）**不变**。
- **前端端（关键重构——移出 tab，成为主菜单模块）**：
  - `dev-cleaner` **完全移出 dev-toolbox**：
    - `src/features/dev-toolbox/page.tsx`：删除 `DevCleaner` 的 `lazy` 引入、`tabs` 数组中的 `{ id: "dev-cleaner", ... }` 项，以及 `renderFullPageTool` 中 `case "dev-cleaner"` 分支。
    - `src/features/dev-toolbox/hooks/useDevToolboxController.ts`：从 `ToolboxTab` 联合类型移除 `"dev-cleaner"`。
    - `src/features/registry.tsx`：从 `TOOLBOX_FEATURE_IDS` 移除 `"dev-cleaner"`。
  - `dev-cleaner` **不再作为独立主菜单 feature**：从 `registry.tsx` 的 `appFeatures` 中移除 `devCleanerFeature` 引入与注册（见 §2.4 由 `cleanSpaceFeature` 替入）。`src/features/dev-cleaner/` 仅保留页面组件、`store.ts` / `use-cases` / `repository` 作为 clean-space 子流程内部实现，后续可统一收纳进 `clean-space/` 目录。
  - 现有 `DevCleanerPageContent` 由 `DevProjectCleanerTool.tsx` 嵌入 clean-space，点击"开发项目清理"工具按钮进入。dev-toolbox 剩余 tab：端口管理 / 环境检测 / Token 计算。
- **IPC 契约**：`contracts.ts` 中 `devCleaner.*` 命名保留；新增 `cleanSpace.*` 命名空间（见 §5）。

### 2.3 分层职责（对齐 §2/§3）

- `*.repository.ts`：只封装 Tauri `invoke`（新增 `scanStorageOverview` / `scanCustomFolder` / `getCleanupRecords` / `addCleanupRecord` 等）。
- `*.use-cases.ts`：业务编排（评分计算、选择聚合、记录组装），不出现 `invoke`。
- `store.ts`：伞状 UI 状态；子流程内部状态仍由各自 store 持有，避免不同数据域共享筛选条件（§2.6）。
- `components/`：纯展示 + `DestructiveConfirmDialog` 二次确认（§5.8）。

---

## 2.4 clean-space 作为主菜单模块

`clean-space` 是**顶层主菜单模块**（与 dev-toolbox、port-manager 平级），拥有独立侧边栏入口，内部采用**顶部横向 tab 栏**导航（与 dev-toolbox 保持一致）：

- `src/features/clean-space/feature.tsx` 导出 `AppFeature` 描述符：`id: "clean-space"`、`path: "/clean-space"`、`labelKey: "sidebar.cleanSpace"`、`icon`（建议 `Trash2`）、`desktopOnly: true`。
- `src/features/registry.tsx`：移除 `devCleanerFeature`，引入并注册 `cleanSpaceFeature`；`appFeatures` 总数维持 11（dev-cleaner 的占位被替换）。
- `src/i18n/locales/{zh,en}.json`：新增 `sidebar.cleanSpace` 等 key（命名空间 `cleanSpace.*`）。
- **顶部 tab 栏**：包含总览 / 开发项目清理 / 自定义文件夹清理 / 清理记录 4 个 tab，选中状态通过底部蓝色下划线标识（`border-b-2 border-primary`）。
- **内容区域**：统一由 `page.tsx` 提供 `p-4` 边距，子组件不再自带外层 padding（避免边距不一致）。
- 侧边栏主菜单直接展示"存储空间 / Clean Space"入口；内部工具切换通过 tab 完成，不再有独立侧边栏项。

## 3. 视图与交互映射（原型 → 设计）

| 原型视图 (`data-view`) | 设计落地 | 数据来源 | 复用/新增 |
|------------------------|----------|----------|-----------|
| `overview` 存储空间 | `StorageOverview`（磁盘摘要 + 环形图 + 分类列表 + 优化建议卡） | `scan_storage_overview()` | 新增（纯增量） |
| `category` 分类详情 | `CategoryDetail`（展开详情 + 优先级徽章 + 风险 tooltip + 批量操作栏） | `get_category_items(id)` | 新增（纯增量） |
| 工具：开发项目清理 | `DevProjectCleanerTool` | 现有 dev-cleaner 引擎 | 嵌入复用 |
| 工具：自定义文件夹清理 | `CustomFolderCleanerTool` | 现有 + `scan_custom_folder` | 增强复用 |
| `records` 清理记录 | `CleanupRecords` | `get_cleanup_records()` + 本地写 | 新增（需持久化） |
| 清理进度与结果 | `CleanupProgress`（进度条 + 实时日志 + 结果摘要） | store cleanupProgress | 新增（纯增量） |
| 确认执行清理弹窗 | `CleanupConfirmSheet`（毛玻璃效果） | 前端派生 | 新增（纯增量） |
| 系统设置快捷入口 | `StorageOverview` 头部按钮 | `open_system_storage_settings()` | 新增（macOS 跳转） |

**关键交互（来自原型，已实现）**：
- 环形图 + 分类列表 **hover 联动高亮**（用 `useState` + `onMouseEnter/Leave`，`useMemo` 派生）。
- **Drill-down 导航**：点击分类行进入详情，详情视图替换总览视图（非堆叠）；ESC 键返回总览。
- **混合快扫 + 后台精扫**：后端先用 APFS/df 容量和 Bench 自有 overview cache emit 总览；无缓存时先给出容器级 macOS 兜底占位。随后后台线程执行精确 `du` 扫描，按分类事件刷新 UI 并写入 7 天缓存。
- **扫描中允许下钻**：后台精扫时分类行显示 spinner 但保持可点击；点击后只懒扫描当前分类明细，不等待整盘扫描完成。
- 分类详情支持三种排序：按优先级 / 大小 / 风险；"仅看安全项"过滤；批量栏"全选安全 / 排除高风险"。
- **优先级徽章 P1/P2/P3**：基于 `score = 归一化空间×0.5 + (1−风险权重)×0.3` 公式，前端计算（不依赖后端）。
- **风险 Pill hover tooltip**：显示风险等级定义 + 本项命中原因。
- **清理确认弹窗（Glass Sheet）**：毛玻璃效果；按风险等级分组显示命令代码块（可展开）；风险横幅；双重确认 checkbox（基础 + 高风险额外）。
- **清理进度视图**：逐项执行 + 实时日志；完成后显示摘要（清理项数/释放空间/涉及路径/高风险项数）。

> **优化建议展示方式变更（2026-07-08）**：原设计为独立 `OptimizationSuggestions` 区块，后改为存储总览卡片内的统计数字展示（安全项数/可释放总量/高风险项数），不再占据额外空间。

---

## 4. 数据模型与类型（TS 侧）

### 4.1 风险模型扩展（§3 契约改动核心）

`src/lib/tauri/types/dev-cleaner.ts`：

```ts
// 由 3 档扩为 4 档，向上兼容
export type RiskLevel = "safe" | "low" | "medium" | "high"
```

`src-tauri/src/dev_cleaner/types.rs`：

```rust
#[serde(rename_all = "lowercase")]
pub enum RiskLevel {
    Safe,   // 新增
    Low,
    Medium,
    High,
}
```

**builtin_commands 重分类**（按原型语义：缓存/废纸篓/日志/临时文件 = safe）：

| 命令 | 现状 | 改为 |
|------|------|------|
| npm / yarn / pnpm / pip / cargo 缓存 | Low | **Safe** |
| Homebrew 缓存 | Low | **Safe** |
| 用户日志 / 临时文件 | Low | **Safe** |
| Xcode DerivedData / Docker builder | Medium | Medium（不变） |
| Docker system prune | High | High（不变） |

> 说明：将"纯缓存/日志/临时文件"从 `Low` 提升为 `Safe`，使"全选安全"能一键勾选这些项（原型默认 `safe+low` 选中）。

### 4.2 新增存储类型（`src/lib/tauri/types/clean-space.ts`）

```ts
export type PriorityTier = "P1" | "P2" | "P3"

export interface StorageItem {
  id: string
  name: string
  category_id: string
  risk_level: RiskLevel
  size_bytes: number
  command: string
  path: string
  files: string
  reason: string
  priority: PriorityTier
  score: number
}

export interface StorageCategory {
  id: string
  name: string
  color: string          // 主题色 token，非硬编码 hex
  total_bytes: number
  items: StorageItem[]
}

export interface StorageOverview {
  disk_total_bytes: number
  categories: StorageCategory[]
}

export interface CleanupRecord {
  id: string
  timestamp: number
  title: string
  scope: string          // 如 "开发者 · 文稿"
  items: number
  freed_bytes: number
  high_risk_count: number
  status: "ok" | "warn"
}
```

### 4.3 优先级评分（纯函数，移植原型算法）

`clean-space/lib/priority.ts`：

```ts
// 原型：score = 归一化空间×0.5 + (1−风险权重)×0.3 + 用户标记×0.2
// 用户标记项本期为 0（无标记 UI），保留扩展位
const RISK_WEIGHT = { safe: 0, low: 0.33, medium: 0.66, high: 1 }

export function scoreItem(sizeBytes: number, risk: RiskLevel, maxSize: number, marked = 0) {
  const norm = sizeBytes / maxSize
  return norm * 0.5 + (1 - RISK_WEIGHT[risk]) * 0.3 + marked * 0.2
}

// 全局按得分降序三等分 → P1 / P2 / P3
export function assignPriority(all: StorageItem[]): void { /* 见原型 L1134-1138 */ }
```

> 注意：`score` / `priority` 既可在 Rust 端算（扫描时），也可在前端 `use-cases` 算。建议**前端算**（便于调参与单测），Rust 只回原始 `size_bytes` + `risk_level`。

---

## 5. IPC 契约与 Rust 端

### 5.1 新增命令（`contracts.ts` → `cleanSpace` 命名空间）

```ts
cleanSpace: {
  scanStorageOverview: commandName("scan_storage_overview"),
  scanStorageStream: commandName("scan_storage_stream"),
  getCategoryItems: commandName("get_category_items"),
  executeCategoryCleanup: commandName("execute_category_cleanup"),
  scanCustomFolder: commandName("scan_custom_folder"),
  openSystemStorageSettings: commandName("open_system_storage_settings"),
  getCleanupRecords: commandName("get_cleanup_records"),
  addCleanupRecord: commandName("add_cleanup_record"),
}
```

### 5.2 新增 Rust 模块 `src-tauri/src/clean_space/`

```
clean_space/
├── mod.rs
├── commands.rs          # 上述 8 个命令
├── system_storage.rs    # 系统存储分类扫描（PlatformStorageScanner 抽象；macOS: system_profiler / du）
├── folder_scan.rs       # 自定义文件夹扫描预估（du + 规则）
├── system_settings.rs   # open_system_storage_settings：平台相关打开系统设置
├── records.rs           # 清理记录持久化
└── types.rs             # StorageCategory / StorageItem / StorageOverview / CleanupRecord
```

- `scan_storage_overview()`：返回 8 大类（应用程序 / 下载 / 文稿 / 系统数据 / App Data / 其他用户与共享 / macOS / 开发者）各自 `total_bytes`。扫描用 `df + du -skx` 估算，APFS 已用空间按 `total - available` 计算，避免只读系统卷 `Used` 列低估。目录归因使用一次批量 `du -skx <paths...>`，减少进程启动开销；System Data 额外解释 Time Machine 本地快照、VM/swap、`/private/var/folders`、系统日志、更新暂存、iPhone/iPad 备份、Mail、Messages、Spotlight；Developer 额外纳入 Homebrew、npm/pnpm/Yarn/Cargo/Go cache。更具体分类优先，Docker/MobileSync/Yarn/Homebrew 等子路径会从父分类扣除，避免重复计数。**平台判定在 Rust 端**（见 §12），前端契约不变。
- `scan_storage_stream()`：混合快扫命令。Rust 先 emit `clean-space:scan-start`，再立刻 emit 缓存总览（或 macOS 容器级占位总览），随后后台线程执行精确 `scan_overview()`，按分类再次 emit `clean-space:scan-category` 刷新 UI，完成后写入 7 天 overview cache 并 emit `clean-space:scan-complete`。前端扫描中仍允许点击分类，详情页按需调用 `get_category_items(id)`。
- `scan_custom_folder(folder, rules)`：返回 `{ freed_bytes, item_count, items }`，规则含 `include_subfolders` / `mtime_days`。实现使用 `find -print0` + Rust 元数据过滤，拒绝系统、App State、Keychains 等保护根。
- `get_category_items(id)`：按需展开单个分类的清理项，每条返回 `is_cleanable` / `protection_kind` / `protection_reason`。系统稳定性、安全性、跨用户数据和应用状态类 item 仅展示，不可勾选；System Data / Developer 的大额只读解释项用于解释占用，不作为释放空间候选。
- `execute_category_cleanup(items)`：不信任前端 `command`。后端按 `category_id + id + canonical path` 映射到白名单 `CleanupAction`（Downloads 直接子项、Caches/Logs/Trash、DerivedData/Docker、自定义 Home 内非保护路径），拒绝其他分类或路径。System Data 的 Caches 动作会跳过已归为 Developer 的受保护缓存子目录，避免父级清理误伤受保护解释项。清理进度由前端 use-case 逐项调用并写 store，不暴露 `clean-space:progress/completed` 事件。
- `open_system_storage_settings()`：按平台打开系统存储空间设置面板（macOS：`open "x-apple.systempreferences:com.apple.Settings?Storage"`，失败回退 `?General`；Windows 未来：`ms-settings:storage`）。不支持的平台返回 `AppError::Unsupported`，前端据此隐藏入口按钮（见 §3 快捷入口 / §12 跨平台）。
- **错误处理**：所有命令返回 `AppResult<T>`，禁止 IPC 路径 `.unwrap()/.expect()`（§7）。

### 5.3 契约一致性检查清单

- [x] TS 侧 DTO 字段名 snake_case ↔ Rust 一致（`contracts.test.ts` 已覆盖 `StorageItem` / `StorageCategory` / `StorageOverview` / `CleanupRecord` / `CleanupItemInput` / `CategoryCleanupResult` / `FolderScanResult`）。
- [ ] 新命令**必须**经 `contracts.ts` 注册，禁止前端绕过（§7.4）。
- [ ] 前端错误统一走 `parseCommandError` / `getErrorMessage` / `translateError`（§7.3），不散装 `String(error)`。

---

## 6. 状态管理与异步安全（§3/§5）

- **伞状 store** `clean-space/store.ts`：`activeTool`、`overview`、`records`、`categorySelection: Record<categoryId, Set<itemId>>`。
- **子流程状态**：开发项目清理沿用 `dev-cleaner/store.ts`；自定义文件夹清理新增子 store（保持独立作用域，避免与分类选择共享筛选条件）。
- **重入保护**：所有扫描/清理异步函数加 `loading` 守卫（参考现有 `useGuardedAsync`），防止重复点击（§4.3）。
- **Effect 清理**：`useEffect` 中注册的进度事件监听 / 定时器在卸载时 `unlisten` / `clear`（§4.4）。
- **平台边界**：扫描命令调用前用 `canUseDesktopFeatures()` / `canUseTauriCommands()` 判断，禁止在 JSX 中硬编码 `window.__TAURI__`（§4.5）。
- **写操作反馈**：清理成功/失败必须 toast + 写入记录；列表/详情必须有**空状态**与**错误态** UI（§4.6/§4.7）。

---

## 7. 国际化（§4，强约束）

原型目前**全部文案硬编码中/英**（"存储空间"、"原型演示数据" 等），违反 §4。落地须抽取：

- 命名空间 `cleanSpace.*`（总览/分类/工具/记录/建议），约 30+ key。
- 保留 `devCleaner.*` 供嵌入子流程使用（不重复翻译）。
- **禁止**顶层常量 / store 初始值 / 静态对象里直接 `t()`；`t()` 仅出现在渲染期 / `useMemo` / 工厂函数（§4.3）。
- zh / en 两语言 key 集合必须同步，CI 加 key 缺失校验。

---

## 8. 清理记录持久化

原型 `RECORDS` 为内存数组，无持久层。落地方案：

- **存储**：应用配置目录下 `clean-space/records.json`（每行一条 `CleanupRecord`），首期不选 SQLite（仅单表追加，文件足够）。
- **写入时机**：每次分类清理 / 自定义清理 / 开发项目清理完成后，由对应 use-case 调 `addCleanupRecord`。
- **读取**：进入记录视图时 `getCleanupRecords()`；支持分页/虚拟滚动（记录可能很多，§6 大列表虚拟化）。

---

## 9. 实施阶段（对齐 roadmap backlog）

原 dev-cleaner backlog：`扫描进度异步化` / `自定义扫描目录` / `清理历史记录`。本设计将其收编：

| 阶段 | 任务 | 收编的 backlog | 风险级别 |
|------|------|----------------|----------|
| P1 | `RiskLevel` 扩 `safe` + 重分类 + 测试 + 渲染分支 | — | 强制 |
| P2 | 脚手架：feature/page/store/路由/侧边栏/事件注册 | — | 强制 |
| P3 | 嵌入开发项目清理子流程（迁移出 dev-toolbox） | 扫描进度异步化（沿用现有） | 强制 |
| P4 | 自定义文件夹清理增强（文件夹选择 + `scan_custom_folder` + 规则） | 自定义扫描目录 | 强制 |
| P5 | 清理记录持久化 + `CleanupRecords` | 清理历史记录 | 建议 |
| P6 | `scan_storage_overview` + `StorageOverview` + `CategoryDetail` + 优化建议 | — | 建议 |
| P7 | i18n 全量抽取 + key 同步校验 | — | 强制 |

> P1 最小且解锁后续所有档位逻辑，建议最先合入。P4 复用现有 `CustomCleanupDialog` 的 Selecting/Running/Confirming 阶段，仅在其前插入"文件夹选择 + 规则"面板。

---

## 10. 风险与待确认

1. **入口重构（已定）**：dev-cleaner 从 dev-toolbox `ToolboxTab`、`registry.tsx` 的 `appFeatures` 与 `TOOLBOX_FEATURE_IDS` 中**完全移除**，不再有独立入口；clean-space 是唯一的清理主菜单模块。具体改动文件见 §2.2 / §2.4。
2. **跨平台（已定方向）**：Windows 已在后续规划中。`scan_storage_overview` 等必须基于 `PlatformStorageScanner` 抽象，平台判定在 Rust 端（不在前端）；首期仅 macOS 实现，其余平台返回 `AppError::Unsupported` 并由前端展示"平台暂不支持"空态。详见 §12。
3. **持久化选型**：本期选 JSON 文件；若后续记录需检索/统计，再迁 SQLite（接口预留）。
4. **命名**：feature id 用 `clean-space`（与原型一致）；侧边栏 labelKey 用 `sidebar.cleanSpace`，路径 `/clean-space`。
5. **tests**：`RiskLevel` 增 `Safe` 后 Rust `match` 变穷尽需补分支；`contracts.test.ts` 需补 `StorageOverview` / `CleanupRecord` 字段校验；`priority.ts` 需单测评分与分档。

---

## 12. 跨平台抽象与向后兼容（Windows 前瞻）

Mac 端功能参照「系统设置 → 通用 → 存储空间」扩展设计；Windows 已在后续规划，须保证其接入时**前端契约与共享类型零改动（向后兼容）**。

### 12.1 原则

- **平台逻辑隔离**：所有平台相关实现（macOS `system_profiler` / `du` / `open` scheme、未来 Windows `GetDiskFreeSpace` / WMI / `ms-settings:storage`）封装在 `clean_space::system_storage` 的 `PlatformStorageScanner` trait 后，前端与 `StorageOverview` / `StorageCategory` / `StorageItem` / `RiskLevel` 保持平台无关。
- **契约稳定（关键）**：前端只调用 `scan_storage_overview()` 等抽象命令，**平台判定在 Rust 端**（基于 `std::env::consts::OS` 或 Tauri 运行时），不在前端做平台分支。新增 Windows 时前端代码与 IPC 契约不变 → 向后兼容。
- **命令/路径数据驱动**：原型中硬编码的 `~/Library/...` 路径与命令字符串不得直接暴露给跨平台 UI；由 Rust 按平台生成 `command` / `path` 字段。分类名 / 颜色 / 风险文案走 i18n（§7），不硬编码 macOS 术语。对嵌套路径采用“更具体分类优先”规则，父分类必须扣除已归属子路径。
- **快速入口平台门控**：`open_system_storage_settings()` 在 Rust 端按平台选 scheme；返回 `AppError::Unsupported` 时前端隐藏"在系统设置中打开"按钮（§6 平台边界）。
- **空态兜底**：Windows 实现前，`scan_storage_overview` 返回 unsupported，前端须有"平台暂不支持"空态（§6 空/错状态）。

### 12.2 系统存储空间快捷入口（macOS）

参照 Mac 系统设置「通用 → 存储空间」，提供一键跳转：

- **新 IPC**：`open_system_storage_settings()`（见 §5.1 / §5.2）。macOS 执行 `open "x-apple.systempreferences:com.apple.Settings?Storage"`，失败时回退 `x-apple.systempreferences:com.apple.Settings?General`；返回 `AppResult<()>`（具体 scheme 需在目标 macOS 版本验证）。
- **前端位置**：`StorageOverview` 头部"存储空间"标题旁按钮「在系统设置中打开」（key：`cleanSpace.openInSystemSettings`）；调用 `repository.openSystemStorageSettings()`。
- **平台门控**：命令返回 unsupported 时按钮隐藏或置灰并提示；桌面能力判断沿用 `canUseDesktopFeatures()`（§6）。
- **（可选）quick-launch 集成**：macOS 下可将同动作注册为 `quick-launch` 的一条快捷指令（复用现有 quick-launch 机制），非必须。

---

## 11. 验收要点（PR 合并前）

- [ ] `pnpm run lint:fe && pnpm run test:critical` 通过（§Phase 8 检查）。
- [ ] 无 `window.__TAURI__` 硬编码、无散装错误判断、无顶层 `t()`。
- [ ] i18n zh/en key 同步。
- [ ] 所有写操作有反馈 + 空/错状态；危险操作走 `DestructiveConfirmDialog`。
- [ ] 新 IPC 命令全部经 `contracts.ts` 注册且 Rust 端返回 `AppResult`。
