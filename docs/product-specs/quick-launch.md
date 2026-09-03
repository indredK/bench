# Quick Launch（快速启动）产品说明

> 本文件是 quick-launch 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。

## 1. 定位

- **桌面端跨平台（macOS/Windows）场景化应用启动器**，入口：路由 `/quick-launch`，侧边栏注册（LayoutGrid 图标），`desktopOnly: true`，为默认落地页（与 App Manager 共享应用清单）。
- 用途：把已安装应用按 14 个「启动场景」自动分类（AI 编程 / AI 办公 / 开发 / 写作 / 浏览器 / 娱乐 / 系统等），一键启动或在 Finder 中显示；支持用户手动改分类并持久化。
- 核心保证：**只消费共享 App Manager inventory，不新建扫描流程**；前端只传 `appId` 启动，不传路径/URL/shell 参数；进入页面只恢复上次快照、不自动扫描（D-019）。

## 2. 主界面布局

```
┌──────────────────────────────────────────────────────────────┐
│ 搜索框 | 统计(搜索结果 / 总应用·场景数) | [重置分类][导出][完成] │
│         [编辑] [重扫]                                          │
│ 扫描中：进度文案 + 进度条 + [取消]                              │
├──────────────────────────────────────────────────────────────┤
│ 场景网格（页面滚动，分类表头吸顶）                                │
│  「常用应用」合并区：Tab 折叠（AI 编程/AI 助手/AI 办公/AI 模型/  │
│     AI 工具/开发/系统工具）                                    │
│  独立场景区：写作/浏览器/沟通/设计/娱乐/其他（吸顶表头+展开/收起）│
│   卡片：图标+名称；hover 显示版本/修改时间；右键 Finder 显示      │
└──────────────────────────────────────────────────────────────┘
```

## 3. 数据来源与加载（D-019 按需扫描）

- 数据来自共享 `src/shared/app-inventory/`（App Manager 的 `InventorySnapshot`：`apps[]`、`revision`、`providers`、`complete`）。
- **进入页面不自动全量扫描**：无数据时调用 `ensureLoaded()` 只恢复上次会话持久化的磁盘快照（`get_cached_app_inventory`，inventory.json）；恢复中显示「正在恢复上次的应用列表」骨架屏（不可取消）。无缓存 → 空状态 +「扫描」按钮，点击后才扫描。
- 手动「重扫」/空状态按钮触发 `refresh()`：single-flight（并发去重）、按 `revision` 重新分类、旧数据保留并标记刷新状态；进度事件（`app-scan:progress`）驱动进度条，可取消。
- 部分成功（`complete=false`）→ 顶部红色 Alert 列出失败 provider，可重扫；错误且无数据 → 空状态 + 错误文案 + 扫描按钮。
- **交互细节**：
  - 加载态两种骨架屏：恢复快照（`hydrating`）→ 「正在恢复上次的应用列表」，**不可取消**（无取消按钮）；扫描中 → 阶段文案（scanning / processingMetadata / resolvingSources）+ 进度条 + 可「取消」。
  - 空态（无缓存、未扫描）→ 居中图标 + 文案 +「扫描」按钮，点击才触发全量扫描。
  - 刷新 single-flight：`loading` 期间「重扫」按钮禁用（图标旋转）；扫描中旧数据保留并整体 60% 透明度 + `aria-busy`。
  - 顶部红色 Alert（部分成功/错误）自带「重扫」按钮，可重复触发刷新。

## 4. 搜索

- 匹配 `app.name + bundleId + source`（Unicode **NFKC 归一化** + 小写）；场景标题文案命中则整场景保留。
- 统计行切换为「搜索结果 N」；无命中显示「无结果」空态。

## 5. 场景分类（scenes.ts + classification-engine.ts）

- **14 场景**（含标签文案与图标）：`ai-ide` / `ai-office` / `ai-claw` / `ai-model` / `ai-tool` / `ai-assistant` / `dev` / `system` / `writing` / `browser` / `communication` / `design` / `entertainment` / `other`。
- **自动分类**：`classifyAppToScene(app)` 按固定顺序 if-else 白名单（bundleId 或名称子串匹配，含中文名称匹配），精确枚举、无启发式兜底；未命中 → `other`。规则版本 `SCENE_RULES_VERSION = "quick-launch-rules-v1"`。
  - 判定顺序：ai-ide → ai-office → ai-claw → ai-model → ai-tool → ai-assistant → dev → browser → communication → entertainment → design → writing → system → other。
  - 关键排除逻辑：ai-ide 排除 Trae Solo/Work（→ai-office）、Antigravity Tools、Kiro AccountManager、Cursor 助手等；`tv`/`news`/`developer` 等易误判名称带 bundleId 守卫。
- **不可启动项**（`allowedActions.launch=false`）不进任何场景、卡片禁用（aria 标注「无法启动」）。
- 每个场景内按名称升序（localeCompare）排序。
- 仅在 `inventory revision` 变化时重跑分类（`inventoryRevisionRef` 守卫）。

## 6. 界面区块与交互

### 卡片（AppCard）

- 图标（App Manager 提取的 `iconBase64`，`AppIcon` 组件）+ 名称（截断）。
- 点击启动（仅 `launch=true`）；**右键 → 在 Finder 中显示**（非编辑模式）；hover tooltip 显示版本号与相对修改时间（今天/昨天/N 天前/周/月）。
- 启动失败/显示失败 → toast 报错（带重试守卫，同一 appId 防重复触发）。
- **交互细节**：
  - 不可启动项（`allowedActions.launch=false`）卡片 `disabled`，`aria-label` 标注「无法启动」，点击无响应。
  - hover：卡片主色描边 + 背景高亮；版本/修改时间经 Tooltip（`side=top` + 碰撞翻转）展示，避免被下一行卡片遮挡。
  - 卡片动画：小场景用 framer-motion `layout="position"` 温和补位（tween，无回弹），`prefers-reduced-motion` 下关闭；>48 项大场景 `animated=false` 关闭布局动画避免重排卡顿。

  - **键盘与无障碍**：卡片为 `<motion.button>`，可 Tab 聚焦、Enter/Space 触发启动；不可启动项 `disabled` + `aria-label`「无法启动」。**搜索框**为原生 `<input>`，无关联 `<label>`/`aria-label`（placeholder 提示）；搜索无防抖，每次 keystroke 直接重算分类过滤。

### 常用应用合并区（MergedSceneSection）

- 把 `ai-ide / ai-claw / ai-assistant / ai-office / ai-model / ai-tool / dev / system` 8 个场景合并为一个「常用应用」区，顶部 Tab pills 折叠切换（默认 `ai-assistant`），各 Tab 带计数。
- 总数为 0 时不渲染；合并区与普通场景一样吸顶。
- **交互细节**：Tab 切换即时换内容（淡入淡出 0.15s）；当前 Tab 高亮 + 计数徽章；大 Tab（>48 项）切到随页面滚动的普通网格（关闭布局动画）。

### 普通场景区（SceneSection）

- 表头吸顶：图标 + 场景名 + 计数 + 展开箭头；点击整行展开/收起。
- **折叠时只显示前 6 个** +「显示更多 N 个」按钮（点击展开）。
- **大场景（>48 项）**：用随页面滚动的普通网格（`animated=false` 关闭 framer-motion 布局动画避免大列表重排卡顿），保证表头吸顶。
- 小场景：framer-motion 布局动画（位置补位，tween 温和过渡，支持 `prefers-reduced-motion`）。
- **交互细节**：表头点击整行展开/收起，箭头随状态旋转；折叠态末尾虚线「显示更多 N」按钮点击展开该场景；空场景（0 项）不渲染。

- **默认展开**：分类后 `batchSetScenes` 将全部场景**默认展开**（`expandedScenes` 全 true）；表头为 `<div onClick>`，**无键盘焦点**（展开/收起仅鼠标）；「显示更多」为 Button 可聚焦。

- **布局/状态**：搜索统计行仅在 `md+` 屏显示（窄屏隐藏）；底部提示行随模式切换（普通 `hint` / 编辑 `editModeHint`）。

### 编辑模式（分类覆盖）

- 顶部「编辑」进入；卡片出现主色描边 + 当前场景名角标；底部提示文案。
- 右键卡片 → 上下文菜单「移动到场景…」（视口越界自动翻转定位），点击把该应用移到目标场景并**立即持久化**。
- 编辑模式下提供「重置分类」（清空全部覆盖，二次确认）与「导出分类」（导出全量分类 JSON，见 §7）。
- 编辑模式禁用卡片启动。
- **交互细节**：
  - 「编辑」按钮在 `appManagerLoading` 或覆盖持久化异常（`newerSchema` / `tooLarge`）时禁用；进入后切换为「完成」（✓）。
  - 右键菜单：点击外部任意处关闭；菜单内再次右键不触发；当前所在场景项高亮 + ✓。
  - 「重置分类」在「无覆盖数据 || 扫描中」时禁用，点击弹 `DestructiveConfirmDialog` 二次确认；成功后 toast。
  - 「导出分类」导出中按钮禁用 + 图标旋转；导出需先弹系统保存对话框（默认 `quick-launch-classification.json`），取消则无操作。
  - 移动分类成功后**立即写入 localStorage**，无需「保存」按钮；卡片在主色描边 + 场景角标下可预览目标归属。

  - **编辑模式键盘/无障碍**：右键菜单为原生 `<div>`（`fixed` 定位 + 视口越界翻转），**无焦点管理**——无 Esc 关闭、无焦点陷阱，仅「点击外部」关闭；菜单内再次右键被拦截不触发（见上方）。

  - **加载中禁用**：编辑模式下移动分类/打开右键菜单在 `appManagerLoading`（扫描/刷新中）时直接无响应（`handleContextMenuEdit`/`handleMoveApp` 提前 return）；启动/显示防重入 key 为 `launch:${appId}` / `reveal:${appId}`（`useGuardedAsyncSet`，同一 appId 并发去重）。

## 7. 导出（开发者工具）

- 编辑模式「导出分类」：调系统保存对话框（默认 `quick-launch-classification.json`），用 Tauri 写文件导出**全量分类快照**：`{appId, appName, bundleId, autoScene, finalScene, overridden}`（覆盖项排前、按名称排序），用于完善 scenes.ts 规则。

## 8. 技术实现要点

- **架构**：页面/交互 `src/features/quick-launch/`（page.tsx / hooks / classification-engine.ts / scenes.ts / store.ts / types.ts / services），共享清单 `src/shared/app-inventory/`；后端能力由 App Manager `appId -> LaunchTarget` 提供。
- **分类引擎与规则分离**：`classification-engine.ts` 只管执行/过滤/结果初始化（带规则版本），`scenes.ts` 只存规则数据；overrides 带 schema 版本持久化。
- **用户覆盖持久化**：localStorage `quick-launch-overrides`（`{version:1, overrides:{appId:scene}}`）；上限 2MB / 10000 条；解析校验：版本过新 → 拒绝进入编辑（`newerSchema`）、损坏/旧版 → 备份后恢复（`recovered`）、超限 → `tooLarge`；异常以「必须手动关闭」的持久 toast 提示（会话级去重，避免重复弹）。
- **刷新**：single-flight；按 revision 重新分类；旧数据保留 + 刷新状态；错误保留旧快照。
- **性能**：大场景（>48）用页面滚动普通网格替代虚拟化（代码未见 `VirtualGridView` 应用于本页，与 design.md 描述有出入）；卡片图标按可见项加载（App Manager 侧按需提取）。
- **IPC**：quick-launch 自身不直接调 Tauri 命令，全部经 `appInventoryUseCases`（`launch(appId)` / `reveal(appId)` / `refresh()` / `cancel()` / `ensureLoaded()`）与文件写入命令 `writeTextFile`（导出）。
- **i18n**：中英双语；场景标签/状态用 key 映射。

## 9. 数据模型

- `LaunchSceneKey`：14 个场景 key 联合类型。
- `LaunchScene`：`key` / `labelKey` / `icon`。
- `LaunchAppEntry`：`app(AppInfo)` / `pinned`（**未见使用**）。
- `OverrideEntry` / `FullClassificationEntry`（导出用）。
- 前端 store：`scenes` / `sceneOrder` / `expandedScenes` / `searchQuery` / `loading` / `isEditMode` / `appOverrides` / `overridePersistenceIssue` / `autoClassified`。
- 消费类型：`AppInfo`（`appId/name/version/bundleId/source/iconBase64/allowedActions/launchTarget/lastModified`）、`AppScanResult`。

## 10. 边界与限制

- **数据源单一**：只消费 `InventorySnapshot`，不得直接写 App Manager store 或复制扫描流程；不新增平台分支/直调。
- **启动**：前端只传 `appId`；不可启动项不得进入可点击场景；Windows 用 EXE/AUMID target、macOS 用 `.app` target（真机 smoke 待完成）。
- **扫描按需**：应用启动进入页面不触发全量扫描；首次无缓存展示空状态 + 扫描按钮（D-019）。
- **覆盖持久化红线**：schema 过新/损坏/超限时禁止编辑，避免破坏用户数据。
- **分类为白名单精确枚举**：未收录应用落入 `other`，需靠导出 + 回填规则完善。
- 大列表为「页面滚动网格」方案（>48 项），500+ 应用场景的虚拟化性能验收未完成（见规划文档）。

## 11. 快捷键

- 无全局快捷键；卡片/按钮均为鼠标交互。

## 12. 异常处理

> 本模块不直接调 Tauri 命令（除导出写文件），错误主要来自共享 `app-inventory` 扫描/启动与本地 overrides 持久化；错误文案经 `getErrorMessage` 兜底。

### 错误码/场景 → 前端提示映射

| 场景/错误码                                | 前端行为/提示                                                 | 恢复/降级                                     |
| ------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------- |
| 扫描部分成功（`complete=false`）           | 顶部红色 Alert 列出失败 provider（`quickLaunch.scanPartial`） | 旧数据保留，点「重扫」重试                    |
| 扫描错误且无数据                           | 空状态 + 错误文案 +「扫描」按钮（`EmptyState`）               | 手动重扫                                      |
| 启动失败 / Finder 显示失败                 | toast（`launchFailed`/`revealFailed`，含应用名 + 底层错误）   | 同一 appId 防重复触发（`useGuardedAsyncSet`） |
| 刷新失败                                   | toast `scanFailed`                                            | single-flight 防并发；**错误保留旧快照**      |
| 取消扫描失败                               | toast `cancelFailed`                                          | 可忽略                                        |
| 导出写文件失败 / 保存对话框异常            | toast `exportFailed`                                          | 重新导出                                      |
| 覆盖持久化 `recovered`（损坏/旧版）        | **持久 toast 警告**（`duration: Infinity`，须手动关闭）       | 原数据备份到 `.corrupt-backup` 后恢复空覆盖   |
| 覆盖持久化 `newerSchema`（版本过新）       | 持久错误 toast + **禁止进入编辑**（防破坏用户数据）           | 等应用升级后再编辑                            |
| 覆盖持久化 `tooLarge`（>2MB 或 >10000 条） | 持久错误 toast + **禁止进入编辑**                             | 清理 localStorage 覆盖数据                    |
| 快照恢复失败                               | 静默保持空状态，用户可手动扫描（不弹错打断）                  | 手动「扫描」                                  |

### 常见失败场景与行为

- **overrides 解析安全**：`parseOverrideStorage` 依次校验——超 2MB → `tooLarge`；JSON 解析失败/版本不符 → `recovered`（自动备份原串后返回空覆盖）；版本过新 → `newerSchema`；条目过滤（appId ≤128 且以 `app-v1-` 开头、scene 在合法枚举内、截断到 10000 条）后才采用。
- **写入失败**：`persistOverrides` 超 2MB 返回 false → `tooLarge`，移动操作不生效（`moveAppToSceneOverride` 回滚为不写入）。
- **会话级去重**：持久化异常 toast 以 `lastNotifiedIssue` 做会话级守卫，重进页面不重复弹；用户手动关闭后才视为已处理，异常清除后守卫复位。
- **并发/防重入**：刷新 single-flight（`loading` 守卫）；启动/显示用 `useGuardedAsyncSet` 按 appId 防重入；恢复快照 `ensureLoaded()` 只跑一次（`cancelled` 标志防卸载后写入状态）。
- **数据源单一**：只消费 `InventorySnapshot`，不直接写 App Manager store；overrides 与自动分类分离（`autoClassified` vs `scenes`），`revision` 变化才重跑分类。
- **大列表性能**：>48 项场景用页面滚动普通网格（非虚拟化），500+ 应用的虚拟化性能验收未完成（见规划文档）。
