# 硬件对比（Hardware）产品说明

> 本文件是 hardware 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。

## 1. 定位

- 路由 `/hardware`；`platforms: ["macos"]`——**仅 macOS**，Windows 隐藏导航，直达路由显示 unsupported（见 `docs/ROADMAP.md` R00 发布契约）。
- 用途：硬件参数与跑分**对比**工具——在「电脑硬件」「数码产品」两大组共 14 类目录中勾选型号，生成规格矩阵对比表，自动高亮每项的最优值。
- 纯前端静态数据，**不涉及任何 IPC / 网络 / 文件系统**；数据为内置目录（`src/data/*.ts`），含各型号定价与第三方跑分（Geekbench 6 / PassMark / Cinebench 2024，均注明来源）。

## 2. 界面布局

```
┌──────────────────────────────────────────────────────────┐
│ Tab 栏（分组标签 + 14 个 Tab 按钮，激活高亮）                │
│   电脑硬件：CPU/GPU/内存/SSD/主板/显示器/电源/机箱/散热/交换机 │
│   数码产品：手机/手机芯片/相机/望远镜                         │
├──────────────────────────────────────────────────────────┤
│ FilterBar（筛选）                                         │
│  ├ 标题行（点击整体收起/展开 + 清除筛选 + 固定⇄自动展开 pin）  │
│  ├ 级联筛选组（每个维度一个分组，badge 单选/点同值取消）        │
│  └ 型号选择（折叠面板）：已筛选结果的全部型号 chip + 清除已选    │
├──────────────────────────────────────────────────────────┤
│ 「正在对比 N 款型号」标题 + 对比矩阵表（sticky 首列规格行）     │
│   每列 = 一个已选型号；单元格 = 规格值 + 最优高亮 + 范围条       │
│   参考链接图标（ExternalLink，点击打开外部浏览器）             │
│  表头含「移除该型号」X 按钮                                  │
└──────────────────────────────────────────────────────────┘
```

- 未选任何型号时显示空态：「请从上方选择要对比的型号」（Plus 图标）。
- Tab 内容为懒加载（`React.lazy` + Suspense），数据模块动态 `import()`；加载失败显示 `FeatureLoadError`（含「重试」按钮，重试递增 `retryToken` 重新加载）。
- 整个页面包在 `FeatureErrorBoundary` 内。
- **Tab 切换**：仅渲染当前 Tab 内容（`active.content`），切换即卸载上一个 Tab；但已选型号与筛选条件存于 zustand store（按 scope），切换后回来自动恢复。筛选栏折叠/自动展开、型号选择折叠为组件**本地状态**，切 Tab 会重置。
- **Tab 按钮**：激活态 `variant=default`（主色实心）+ 图标 + 标题，`aria-selected` 标记；未激活 outline，hover 高亮；分组标签（电脑硬件/数码产品）为纯文案分隔条。
  - **Tab 键盘可达**：Tab 为真实 `<button>`（可 Tab + Enter/Space 激活，`role="tab"` + `aria-selected`）；**无左右方向键 roving 导航**（箭头切换未见实现）、无 `aria-controls` 关联 panel。
- **加载态**：切到新 Tab 后数据模块懒加载期间显示「加载中...」占位（Suspense fallback）。

## 3. Tab 目录（14 类，两分组）

- **电脑硬件**（groupPcHardware）：cpu（CPU）、gpu（GPU）、memory（内存）、ssd（SSD）、motherboard（主板）、monitor（显示器）、psu（电源）、case（机箱）、cooler（散热）、switch（交换机）。
- **数码产品**（groupDigitalProducts）：phone（手机）、chipset（手机芯片）、camera（相机）、telescope（望远镜）。
- 每个 Tab 一个独立的数据模块（`CompareDataModule<T>`），`i18nPrefix` 各自独立（`cpuCompare` / `gpuCompare` / …）。

## 4. 筛选（FilterBar，共享组件 `src/shared/compare/`）

- **标题行**：整行可点击——点击一次「收起 + 进入自动模式」，再点「展开 + 退出自动模式」。自动模式下鼠标悬停展开、移出 400ms 后自动收起（`#109` 已修复 unmount 时定时器泄漏）；pin 图标（Pin⇄PinOff）提示当前模式。
- **清除筛选**：有激活筛选时可用（否则禁用），一键清空所有维度。
- **级联筛选**（`useCascadingFilterGroups`）：每个维度只展示「在其余已选维度约束下实际存在的取值」并排序；badge 单选，点同值取消（再次点击移除该维度），激活维度显示 X。
- **型号选择**（`ModelPicker`，折叠面板）：列出**当前筛选结果**的全部型号 chip（带「+」/「-」图标），点击 toggle 选中；有筛选时显示「找到 N 个」；「清除已选」清空该 scope 的全部选中。
- **结果计数**：`resultCount` = 当前筛选下的型号数，标题行内可见。
- **级联空维度**：某维度在其余已选维度约束下无任何取值时，该分组显示「—」占位（`FacetedFilterGroups` 空 options 分支）。
- **chip 交互**：型号 chip 选中 = 主色实心 + 「-」图标（再点移除），未选 = outline + 「+」图标；hover 高亮、按压 `active:scale-95`；「清除已选」在无选中时置灰不可点。
- **筛选区键盘可达性（缺口）**：折叠标题行为 `div` + `onClick`（不可 Tab/Enter）；级联筛选 badge（`FacetedFilterGroups`）渲染为 `<span>`，**无 tabIndex / `aria-pressed`**——整个筛选区仅鼠标可操作；ModelPicker「清除已选」同为 `<span>`（有选中才可点，0 时 `cursor-default`）；仅 pin 与「清除」为真实 `<button>`，pin 有 `title` tooltip 但无 `aria-label` / `aria-pressed`。
- **筛选无结果态**：当前筛选下无任何型号时，ModelPicker chip 区为空并显示「请从上方选择要对比的型号」文案；对应维度分组显示「—」占位（见上文「级联空维度」）。

## 5. 对比矩阵表（CompareMatrixTable）

- 数据：行 = 规格项（specRows，`label` 为 i18n key），列 = 已选型号；首列「规格」吸顶（min-width 160px）。
- 每格：
  - 数值用 `tabular-nums`；`row.format` 优先（自定义展示，如价格 ¥、时钟 GHz）。
  - **最优高亮**：≥2 款已选时计算——`numericKeys` 取**最大值**、`inverseKeys` 取**最小值**（如 TDP/价格/制程为越小越好）；最优值绿色 + 加粗。
  - **范围条**：数值在[min,max]间按比例渲染背景渐变条（最优绿色、其余灰色，最小 4% 宽），直观展示相对大小。
  - **参考链接**：数据模块 `referenceUrl(model, key)` 返回链接的格子显示 ExternalLink 图标，点击 `openExternal` 在系统浏览器打开（悬停 tooltip 显示完整 URL，最长 400px 换行）。
- 表头：型号名 + 「移除」X 按钮（`aria-label` 含型号名）。
- 斑马纹行（奇数行 `bg-muted/15`）；基于 `@tanstack/react-table` + `StickyTable`（sticky 首列，横向滚动）。
- **移除型号**：点击表头 X 即从对比中移除（`toggleModel`）；当已选型号 < 2 款时，最优高亮与范围条不再计算（`bestValues`/`rangeValues` 仅 ≥2 款时产出）。
- **参考链接**：ExternalLink 图标 hover 时 tooltip 显示完整 URL（最长 400px 换行）；点击经 Tauri shell 打开，shell 打开失败（scheme 超 scope / 无默认浏览器）时**降级** `window.open`（见 `platform/shell.ts` #091），避免死链。
- **行列交互**：行/单元格为纯展示，无点击/勾选操作；表头 X 按钮 hover 时由 `opacity-60` 升至 `opacity-100`。
- **表头细节**：表头含型号色点（`bg-primary/40` 圆点）+ `truncate` 型号名 + 移除 X；X 按钮带 `aria-label`（含型号名）；ExternalLink 图标带 `aria-label`（完整 URL）+ hover tooltip 展示 URL（最长 400px 换行）。
- **单元格展示**：数值 `tabular-nums`；最优值绿色加粗（emerald）；斑马纹为奇数行 `bg-muted/15`；规格列 `min-width:160px`、数据列 `min-width:140px`（sticky 首列 + 横向滚动承载，无列虚拟化）。

## 6. 状态与数据

- 选中/筛选状态按 **scope**（= 各 Tab 的 `i18nPrefix`）隔离存储于 zustand（`useHardwareCompareStore`）：`selectedIdsByScope`、`filtersByScope`；动作 `toggleModel` / `setFilter` / `clearFilters` / `clearSelectedModels`。
- **持久化：无**——store 纯内存，切换 Tab / 刷新页面后清空（未见 localStorage / 磁盘持久化）。
- 数据为**静态内置目录**：`src/data/{cpu,gpu,memory,ssd,motherboard,monitor,psu,case,cooler,switch,phone,phone-chipset,camera,telescope}.ts`，每类数十款型号（如 CPU 60+、手机 60+、GPU 26、内存 17 等量级），含品牌/系列/参数/价格/跑分（来源注释于字段）。

## 7. 快捷键

- 无快捷键（未见实现）。
- **键盘与无障碍（缺口汇总）**：Tab 可键盘激活但**无方向键导航**（见 §2）；筛选栏折叠行/筛选 badge/「清除已选」均鼠标-only（见 §4）；矩阵行/单元格为纯展示不可交互；正向项：移除 X 与 ExternalLink 按钮均带 `aria-label`。

## 8. 技术实现要点

- **架构**：`page.tsx`（Tab 编排 + 分组标签）→ `components/HardwareCompareTab.tsx`（动态加载数据模块 + 错误/重试）→ `components/HardwareCompare.tsx`（筛选 + 矩阵 + 空态）→ `store.ts`（scoped 状态）；通用对比能力在 `src/shared/compare/`（CompareTabs / FilterBar / FacetedFilterGroups / ModelPicker / useCascadingFilterGroups / CompareMatrixTable / types）。
- **数据契约** `CompareDataModule<T>`：`data` / `specRows` / `numericKeys` / `inverseKeys` / `i18nPrefix` / `filterGroups?` / `referenceUrl?`。新硬件品类只需在 `src/data/` 新增模块并在 `page.tsx` 注册 Tab。
- **最优值计算**：`HardwareCompare` 内 `useMemo`——遍历 specRows，`numericKeys` 记 max、`inverseKeys` 记 min，产出 `bestValues`（key→最优型号 id 集合）与 `rangeValues`（key→min/max）。
- **懒加载**：每个 Tab 数据模块经 `import()` 动态引入，首屏只加载当前 Tab；`page.tsx` 中 14 个 Tab 均 lazy。
- **i18n**：zh/en 双语；规格标签、筛选组、Tab 标题均走 i18n key（`{prefix}.title` / `{prefix}.specification` / `hardwareCompare.*`）；品牌名经 `i18nBrand` 归一。
- **IPC**：无（纯前端）。

## 9. 数据模型

- `CompareDataModule<T>` 见 §8；型号接口如 `CpuModel`（brand/series/model/cores/threads/时钟/TDP/socket/架构/制程/缓存/集显/内存支持/PCIe/发布年份/价格/Geekbench6/PassMark/Cinebench2024 等）、`PhoneModel`、`TelescopeModel` 等，均含 `id` + `model`。
- store：`selectedIdsByScope: Record<string, string[]>`、`filtersByScope: Record<string, Record<string,string>>`。

## 10. 边界与限制

- 仅 macOS（平台门控），Windows/Linux 隐藏导航；直达路由显示 unsupported。
- 数据为**内置快照**，非实时联网；价格/跑分可能过期，且 roadmap 尚无「数据更新时间 + stale 状态」机制。
- 型号库规模固定，未覆盖的型号无法对比（需改 `src/data/` 扩展）。
- 无持久化：用户选择在退出后丢失。
- 大量选中时矩阵列多，靠 sticky 首列 + 横向滚动承载，无列虚拟化（规格行数有限，未见问题）。
- 窄窗口：FilterBar 维度标签 sm 以下左对齐 / sm 以上右对齐（`sm:text-right`）；型号 chip 文本 `max-w-[160px]` 截断；矩阵数据列 `min-width:140px`，窗口过窄靠横向滚动承载。

## 11. 异常处理（异常场景对照）

> 纯前端静态数据，**无 IPC / 网络 / 文件系统**，因此无运行时命令失败；异常集中在「数据模块懒加载」「平台门控」「打开外部链接」三类。

| 场景                                                               | 行为/提示                                                                                                         | 恢复/降级                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 当前 Tab 数据模块动态 `import()` 失败                              | `HardwareCompareTab` 捕获 → `FeatureLoadError`（标题「加载对比数据失败」+ `getErrorMessage` 描述 + 「重试」按钮） | 点「重试」递增 `retryToken` 重新 `import()`           |
| 未捕获的渲染异常                                                   | 整个页面包在 `FeatureErrorBoundary` 内（`hardwareCompare.loadFailedTitle`）                                       | 显示边界错误页（不白屏）                              |
| 非 macOS 平台直达 `/hardware` 路由                                 | Windows/Linux 隐藏导航；直达显示 unsupported 占位（R00 发布契约）                                                 | 无（不可用）                                          |
| 打开外部跑分链接失败（Tauri shell scheme 超 scope / 无默认浏览器） | shell 插件 reject                                                                                                 | **降级** `window.open` 新标签打开（#091），不静默失败 |
| 静态数据缺字段/值为空                                              | 单元格回退显示「—」（`String(value ?? "—")`）；`Unknown`/0/空值项在前端隐藏                                       | 无（纯展示）                                          |
| 数据过期（价格/跑分快照）                                          | 不提示（roadmap 尚无「数据更新时间 + stale」机制）                                                                | 见边界与限制 §10                                      |
| 无网络/IPC 环境（浏览器）                                          | 纯前端可正常运行（页面本身 `platforms:["macos"]` 门控仅影响桌面导航）                                             | 无                                                    |

- **幂等/取消**：所有操作均为本地同步状态变更（toggle/筛选），无异步任务，无重入/取消问题；`import()` 失败后 `cancelled` 标志防止卸载后 setState（`HardwareCompareTab` 已处理）。
- **数据损坏**：无持久化（store 纯内存），静态内置数据不可写，不存在数据损坏场景。
