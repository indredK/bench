# Terminology（术语库）产品说明

> 本文件是 terminology 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。
> 规划/未完成项见 `../planned/terminology.md`。

## 1. 定位

- **独立 feature**（**非 desktopOnly**，全平台可用），入口：路由 `/terminology`，侧边栏注册。
- 用途：**术语知识库 / 术语管理**——按「行业 → 分类 → 子分类」三层组织术语卡片，支持搜索、收藏（置顶）、CRUD，每个术语可挂多个参考网站。
- 内置大量领域词条数据（Rust `terminology/data/` 按行业/分类拆分 seed，如航空航天、农业、AI、建筑、艺术设计等，前端行业 `computer/frontend` 有保留「未分类」子分类）。

## 2. 界面总览

```
┌────────────────┬─────────────────────────────────────────────┐
│ 左栏 行业列表    │ 分类 pill 栏 + 子分类 pill 栏                 │
│ （+ 管理按钮）   │ 搜索框 [添加术语]                             │
│                ├─────────────────────────────────────────────┤
│                │ 术语卡片虚拟网格（置顶优先）                    │
└────────────────┴─────────────────────────────────────────────┘
```

- **左栏**：行业列表（当前选中高亮 + 左侧竖条指示）；顶部「管理」按钮（齿轮）打开 行业/分类/子分类管理器。
- **工具栏**：分类 pill（「全部」+ 当前行业下各分类）、子分类 pill（「全部分类」+ 各子分类，仅当前分类有子分类时显示）；搜索框（标题/描述包含匹配，小写）；「添加术语」按钮。
- **卡片网格**：`VirtualGridView` 虚拟滚动（`minCardWidth 220`，避免长列表卡顿）。

**交互与反馈细节**：

- **加载/错误态**：首次进入 `hydrate` 期间整页居中 loading；`loadError` 非空时显示 `FeatureLoadError`（标题「术语数据加载失败」+ 描述 + 重试按钮，重试即再次 `hydrate`）。
- **筛选即时生效**：分类 pill（「全部」+ 当前行业各分类）、子分类 pill（「全部分类」+ 各子分类，仅当前分类有子分类时显示）与搜索框均为即时过滤（纯函数 `getFilteredTerms`，小写包含标题/描述），无独立「应用」按钮；切换行业/分类时自动重置无效的子分类选中。
- **术语卡片**：hover 时显示置顶/复制操作（非置顶卡在小屏下常显）；点击卡片打开编辑器；置顶卡主色边框 + 阴影并优先排序；复制标题按钮点击后 1.5s 内显示 ✓ + toast「已复制」。
- **WebsiteChip**：默认 Globe，hover 变 Copy（点击复制 URL）；tooltip 展示完整 URL + 外部打开按钮（浏览器打开）；复制后 1.5s 显示 ✓。
- **空态（标记「未见实现」）**：i18n 键 `terminology.noTerms`（「暂无术语，点击右上角「新增」添加。」）**未被任何组件引用**；实际空列表由 `VirtualGridView` 渲染通用 `common.empty.noData`（「暂无数据」），且**无「新增」快捷按钮**——文档此前所述的空态文案与代码不符。
- **术语编辑器**：保存按钮在标题为空时禁用；`savingRef` 防重入（快速连点/连按 `Ctrl/Cmd+S` 只执行一次）；保存成功 toast + 自动关闭；删除（编辑态）红色按钮 → `DestructiveConfirmDialog` 二次确认。
- **管理器（行业/分类/子分类）**：各栏顶部新增输入框 Enter 或「+」按钮提交；行内编辑点击铅笔进入 Input（Enter 保存 / Esc 取消 / blur 保存）；hover 行显示编辑/删除图标；保留子分类 `__unclassified__` 灰底（muted）、不可编辑/删除。

## 3. 术语卡片（TermCard）

- 展示：标题（粗体单行）、描述（两行截断）、网站 chips（最多 3 个 Globe 图标）。
- **置顶（Pin）**：标题旁图钉按钮——置顶卡主色边框 + 阴影，置顶项在列表中**优先排序**（钉置顶 → 按标题 zh-Hans-CN 排序）；再点取消置顶。
- **复制**：复制按钮把术语标题写入剪贴板（1.5s 内显示 ✓ + toast「已复制」）。
- **WebsiteChip**：默认 Globe 图标；hover 变 Copy 图标（点击复制 URL）；tooltip 显示完整 URL + 外部打开按钮（点击在浏览器打开）。
- **操作按钮可见性**：置顶卡操作按钮常显（`opacity-100`）；非置顶卡大屏 `sm` 下 hover 才显示、**小屏下常显**；置顶/复制按钮均带 `title` + `aria-label`；置顶图标以 `fill-current` 填充态区分已置顶。
- **WebsiteChip 交互细节**：点击图标**复制 URL**（仅图标变 ✓ 1.5s，**无 toast**，区别于标题复制）；tooltip 内按钮在浏览器打开；图标与 tooltip 按钮的点击均 `stopPropagation`（防触发展开编辑器）；`aria-label` 为完整 URL；卸载时清理反馈计时器（防卸载后 setState）。
- 点击卡片 → 打开术语编辑器（查看/编辑）。

## 4. 术语编辑器（TermEditor）

- 字段：标题（必填）、描述（必填非空）、子分类下拉（当前分类有子分类时显示；无子分类分类可选「未设置」）、网站列表（url + 可选 label，可增删行，保存时过滤空 url）。
- 保存：`Ctrl/Cmd+S` 快捷键或「添加 / 保存」按钮；标题为空禁用；保存成功 toast。
- **描述必填的前后端不一致（标记）**：前端保存按钮**只校验 `title.trim()`**，描述为空仍可点保存；后端 `create_term`/`update_term` 拒绝空描述（`INVALID_INPUT` → toast「输入不合法」）。即「描述必填」由后端兜底，前端未做按钮级拦截。
- **子分类下拉逻辑**：当前分类有保留子分类 `__unclassified__` 时**不显示「未设置」选项**（默认归入未分类）；无子分类/无保留子分类时可选「未设置」（`__none__` 置空）。前端分类下新增术语默认落到 `__unclassified__`。
- **网站行编辑**：「添加网站」按钮动态加行（url + 可选 label），每行 X 按钮删除（`aria-label=删除`）；保存时过滤空 url 行；未保存的空白行不提交。
- 删除（编辑态）：红色「删除」→ `DestructiveConfirmDialog` 二次确认。
- 分类解析：前端分类（`computer/frontend`）缺子分类时归入保留子分类 `__unclassified__`。

## 5. 行业/分类/子分类管理器（IndustryManager）

- 三栏布局：行业列表 | 分类列表 | 子分类列表（各栏顶部带「新增」输入框 + 按钮；hover 行显示编辑/删除图标）。
- **行内编辑**：点击铅笔进入 Input（Enter 保存 / Esc 取消 / blur 保存）。
- **删除**：行业 / 分类 / 子分类均经 `DestructiveConfirmDialog` 二次确认；删除行业连带删除其下术语；删除分类连带该行业分类下术语；删除子分类时其中术语回退到「未分类」（前端分类）或置空 subcategory（其余分类）。
- **保留子分类** `__unclassified__`：展示为灰底（muted），**不可编辑、不可删除**；前端分类下新增子分类时保持它在列表末尾。
- **新增后选择跟随（状态流转）**：新增行业成功 → 自动选中新行业（`setActiveId` + `setIndustry`）；新增分类成功 → 自动选中新分类；新增术语成功 → store 选中该术语所在行业/分类/子分类（`stateFromData` 带 created id）。
- 删除后自动切换到剩余首个条目；前端分类删除子分类后回选 `__unclassified__`。
- **删除级联同时清理 pinned**：删除行业/分类/术语时后端在**同一事务**内同步清理 `pinned_term_ids` 中的失效 id（`retain_existing_term_ids`），不残留幽灵置顶。

## 6. 筛选逻辑（纯函数 `getFilteredTerms`）

- 依次过滤：industryId 匹配 → categoryId（空=全部）→ 子分类（空=全部；`__unclassified__` 匹配 `null/空/__unclassified__`）→ 搜索（标题或描述小写包含）。
- 排序：置顶优先，再按标题 `localeCompare(..., "zh-Hans-CN")`。

## 7. 快捷键

- `Ctrl/Cmd + S`：术语编辑器内保存（含新增与编辑态）。

## 8. 技术实现要点

- **架构分层**：`page.tsx`（主页面 + 两个 Dialog）→ `hooks/useTerminologyController`（页面状态 + store 桥接 + 错误 toast 映射）→ `store.ts`（zustand：数据 + 选择 + CRUD 编排，各操作后重读全量数据）→ `services/terminology.use-cases.ts`（纯函数：`getFilteredTerms` / `validateSelection`，以及 loadData/CRUD 编排）→ `repository` → `@/lib/tauri/commands/terminology`。
- **后端**（Rust `src-tauri/src/terminology/`）：`commands.rs`（全部 IPC）+ `storage.rs`（原子读写 bundle）+ `data.rs`（内置 seed 合并）+ `state.rs`（内存状态，`ensure_ready` 惰性加载）。ID 生成 `ind-*`/`cat-*`/`subcat-*`/`t-*` + UUID。
- **数据模型**：`TerminologyBundle { industries, terms, pinnedTermIds }` 单 bundle 往返；每次写操作后整体重读。
- **校验**：标签 trim 非空；**同作用域下标题大小写不敏感去重**（行业/分类/子分类/术语均有，术语按 industry+category+subcategory+title）；引用完整性 `validate_bundle`（term 引用的行业/分类/子分类必须存在）；错误码 `DUPLICATE_NAME` / `INVALID_INPUT` / `NOT_FOUND` 映射到本地化 toast。
- **前端特殊处理**：`FRONTEND_INDUSTRY_ID=computer`、`FRONTEND_CATEGORY_ID=frontend`、`UNCLASSIFIED_SUBCATEGORY_ID=__unclassified__`（constants.ts 提供 `isUnclassifiedSubcategoryId` / `toUnclassifiedSubcategoryId`）。
- **虚拟滚动**：`VirtualGridView`（`@/components/content/VirtualGridView`）。
- 数据随应用内置（data seed），用户增删改后持久化于应用数据目录（后端 storage）。

## 9. 数据模型（关键类型）

- `Industry { id, label, categories: TermCategory[] }`；`TermCategory { id, label, subcategories: TermSubcategory[] }`；`TermSubcategory { id, label }`。
- `Term { id, industryId, categoryId, subcategoryId?, title, description, websites }`；`TermWebsite { url, label? }`。
- `TermInput`（创建用）；`TerminologyBundle { industries, terms, pinnedTermIds }`。
- store 关键状态：industries、terms、pinnedTermIds、selectedIndustryId/CategoryId/SubcategoryId、searchQuery、isLoading、loadError。

## 10. 边界与限制

- **保留子分类** `__unclassified__` 不可改/删（后端 `is_reserved_subcategory` 强制）。
- 同作用域标题重复拒绝（大小写不敏感）；空标签/空描述拒绝。
- 删除级联：行业→其术语、分类→该分类术语、子分类→术语回退未分类/置空。
- 剪贴板/打开外部依赖平台能力（`writeClipboardText` / `openExternal`），失败静默。
- 内置数据量大但仅浏览时虚拟化渲染；编辑类弹窗滚动上限 90vh。

## 11. 异常处理

### 11.1 错误码 → 前端提示映射

后端 `TerminologyError`（`src-tauri/src/terminology/types.rs`，`#[serde(tag="code")]`，SCREAMING_SNAKE_CASE）输出同构 `{ code, message }`；前端 `toastTerminologyError`（`useTerminologyController.ts`）按 code 映射本地化 toast：

| 错误码           | 场景                                                               | 前端行为/提示                                                     |
| ---------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `DUPLICATE_NAME` | 同作用域标题重复（行业/分类/子分类/术语，大小写不敏感）            | toast「名称已存在」（`terminology.toasts.duplicateName`），不提交 |
| `INVALID_INPUT`  | 空标签/空描述、非法 id、保留子分类 `__unclassified__` 被改/删      | toast「输入不合法」（`terminology.toasts.invalidInput`）          |
| `NOT_FOUND`      | 引用的行业/分类/子分类不存在（引用完整性校验失败）、删除不存在的项 | toast「目标不存在」（`terminology.toasts.targetNotFound`）        |
| `STORE_FAIL`     | 打开/解码/保存 store 失败、schema 过新、文件超 32MB                | toast 操作级兜底（saveFailed/addFailed/deleteFailed/pinFailed）   |

- 前端规则：`code` 命中前三者用统一映射，其余（含 `STORE_FAIL`）落到**操作级 fallback**（保存→`saveFailed`、新增→`addFailed`、删除→`deleteFailed`、置顶→`pinFailed`）。
- 加载失败不弹 toast：`hydrate` 抛错 → `loadError` 状态 → `FeatureLoadError` 整页错误态（可重试）。

### 11.2 常见失败场景与行为

| 场景                             | 行为/提示                                              | 恢复/降级                      |
| -------------------------------- | ------------------------------------------------------ | ------------------------------ |
| 首次加载/数据损坏                | `hydrate` 失败 → `FeatureLoadError`                    | 重试按钮再次 `hydrate`         |
| 同作用域标题重复                 | `DUPLICATE_NAME` → toast「名称已存在」                 | 修改标题后重存；不覆盖现有数据 |
| 空标签 / 空描述                  | `INVALID_INPUT` → toast「输入不合法」                  | 补全后重存                     |
| 删除的行业/分类被子分类/术语引用 | 删除前 `validate_bundle` 校验，级联删除在**单事务内**  | 失败不落盘（store 不变）       |
| 保留子分类被编辑/删除            | `INVALID_INPUT`（后端 `is_reserved_subcategory` 强制） | 前端灰底禁操作；直达也拒绝     |
| 存储打开/保存失败                | `STORE_FAIL` → 操作级失败 toast                        | 不乐观更新；重试               |
| 剪贴板 / 打开外部失败            | 静默忽略（`copyText` catch）                           | 无提示，功能降级               |

### 11.3 幂等 / 取消 / 并发保护

- **编辑器防重入**：`savingRef` 保证同一次保存只执行一次（连点/连按 `Ctrl/Cmd+S` 短路）；保存中标题为空直接 return。
- **read-after-write**：所有 CRUD 成功后再 `loadData()` 整体重读全量 bundle 更新 store（失败则状态不变，不乐观更新）；置顶（`setTermPinned`）同样重读。
- **删除事务**：`with_state_mut` 内「先修改 + `validate_bundle` 校验 → 后 `save_state` 落盘 → 才提交内存」，中途出错不写库、内存不变。
- **pinned 一致性**：删除行业/分类/术语时后端在事务内同步清理失效的 `pinned_term_ids`；加载合并时也做 `retain_existing_term_ids` 过滤（双保险）。
- **删除级联后选择重置**：删除行业/分类后自动切换到剩余首个条目；前端分类删除子分类后回选 `__unclassified__`（store 内按行业判定）。

### 11.4 数据损坏 / schema 迁移

- 持久化经 `tauri-plugin-store`（`terminology-store.json`，app_data_dir），`ensure_file_size` 32MB 上限，超限报 `STORE_FAIL`。
- **fail-closed**：`validate_schema` 对 schema > 当前版本（1）报错，**不静默降级**（有单测 `future_terminology_schema_is_fail_closed`）；`decode_optional` 对 malformed 值报错而非重置为空（有单测 `malformed_terminology_values_are_not_silently_reset`）。
- **降级迁移**：schema < 当前版本时先 `backup_file`（`pre-v1`，保留 3 份）再重写并置 schema_version，迁移失败不覆盖原文件。
- **内置数据合并**：内置 seed（`builtin_industries`/`builtin_terms`）与用户数据按 id 合并；无效 pinned id 过滤（`retain_existing_term_ids`）；前端分类缺子分类自动归入 `__unclassified__`。
