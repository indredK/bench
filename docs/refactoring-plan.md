# Bench 项目复杂重构方案

> **生成日期**: 2026-07-05
> **触发依据**: `docs/audit-report.md` Phase 1.4 / Phase 4.2 / Phase 6.1 / Phase 1.6 未修复项
> **执行原则**: AGENTS.md Phase 8 注意事项 — "复杂重构输出方案描述即可，不做大范围重写，待人工确认后再执行"
>
> 本文档覆盖 4 类需人工确认的剩余问题：
> 1. Feature 目录补全（5 个模块拆分 hooks/services）— Phase 1.4 强制
> 2. account-manager controller 整 store 订阅 selector 化 — Phase 4.2 强制
> 3. updater 模块测试覆盖 — Phase 6.1 强制
> 4. columns.tsx 跨模块统一抽取 — Phase 1.6 建议
>
> **注**: `data/phone.ts` 纯数据部分不做国际化改造 — 数据层保留原始值，展示层通过反向映射表 + `t()` 翻译，详见审计报告 Phase 3.4 说明。

---

## 一、Feature 目录补全方案

### 1.1 现状与目标

| 模块 | 当前结构缺失 | page.tsx 行数 | 目标 |
|------|--------------|---------------|------|
| `dev-toolbox` | 无 `store.ts` / `hooks/` / `services/` | 255 | 按 roadmap v1.17 拆 `devtools/` / `diagnostics/` / `info/` 子模块 |
| `terminology` | 无 `hooks/` / `services/` | 1160 | 抽 `hooks/useTerminologyController.ts` |
| `token-calculator` | 无 `store.ts` / `hooks/` | 1401 | 补 `store.ts` + 控制器抽到 `hooks/` |
| `quick-launch` | 无 `hooks/` / `services/` | 815 | 抽 `hooks/useQuickLaunchController.ts` |
| `hardware` | 无 `hooks/` / `services/` | 183 | 暂不强制补（page.tsx 仅组合，无内联编排） |

### 1.2 优先级与拆分策略

#### 优先级 A — terminology（收益最高、风险中等）

**问题**: `page.tsx` 1160 行，`useEffect` 编排、本地编辑态（5+ `useState`）、CRUD handler 全部内联。

**拆分方案**:

```
src/features/terminology/
├── page.tsx                    # 仅做组合（目标 < 200 行）
├── store.ts                    # 已存在，保持
├── constants.ts                # 已存在，保持
├── types.ts                    # 已存在，保持
├── hooks/
│   └── useTerminologyController.ts   # 新建：迁入 page.tsx 的 CRUD handler、effect、派生数据
├── components/                  # 新建目录
│   ├── TermCard.tsx             # 从 page.tsx 抽出（行 137-219）
│   ├── TermEditor.tsx           # 从 page.tsx 抽出（行 223-?）
│   └── WebsiteChip.tsx          # 从 page.tsx 抽出（行 83-133）
└── services/
    └── terminology.repository.ts   # 可选：包装 @/lib/tauri/commands/terminology 的错误处理 / 缓存
```

**hooks/useTerminologyController.ts 职责**:
- 暴露 `useTerminologyStore` 的 selector 与 setter（精细订阅，避免整 store 解构 — 修复 Phase 4.2 建议）
- 包装 `addTerm` / `updateTerm` / `deleteTerm` / `setTermPinned` 为 `useCallback`
- 持有 `editingTerm` / `isEditorOpen` 等本地 UI 态
- 派生 `filteredTerms` / `groupedTerms`（用 `useMemo`）

**风险点**:
- `TermCard` / `TermEditor` / `WebsiteChip` 之间通过 props 传递回调，迁移时需仔细对齐接口
- `toastTerminologyError` 是模块私有 helper（依赖 `getTauriErrorCode`），可保留在 `page.tsx` 或移入 `hooks/`

#### 优先级 B — token-calculator（收益高、风险中等）

**问题**: `page.tsx` 1401 行，价格 CRUD、汇率逻辑、3 个 Tab（Standards / Compare / Calculator）全内联。

**拆分方案**:

```
src/features/token-calculator/
├── page.tsx                    # 仅做 Tabs 容器组合（目标 < 100 行）
├── store.ts                    # 新建：持有 standards / displayCurrency / exchangeRate / rateInfo
├── model/
│   └── pricing.ts              # 已存在，保持
├── services/
│   ├── token-calculator.repository.ts   # 已重命名（本批次已修复）
│   └── exchange-rate.ts        # 已存在，保持
├── hooks/
│   └── useTokenCalculatorController.ts  # 新建：包装 CRUD + 汇率刷新
└── components/
    ├── StandardsTab.tsx         # 从 page.tsx 抽出
    ├── CompareTab.tsx           # 从 page.tsx 抽出
    ├── CalculatorTab.tsx        # 从 page.tsx 抽出
    └── CurrencyToolbar.tsx      # 从 page.tsx 抽出（行 164-231，currencyToolbar JSX 块）
```

**store.ts 职责**:
- `standards: PricingStandard[]`
- `displayCurrency: DisplayCurrency`
- `exchangeRate: number`
- `rateInfo: ExchangeRateInfo | null`
- `rateLoading: boolean`
- 各 setter

**风险点**:
- 3 个 Tab 之间共享 `displayCurrency` / `exchangeRate` / `t`，需通过 props 或 store 传递
- `loadStandards` 内的错误处理（行 121-139）有 `typeof error === "object"` 散装判断，迁移时一并改用 `getErrorMessage`

#### 优先级 C — quick-launch（收益中、风险中）

**问题**: `page.tsx` 815 行，扫描编排、导出、右键菜单、场景分类全内联。但已有 `store.ts` / `scenes.ts` / `types.ts`，只需补 `hooks/` 与 `services/`。

**拆分方案**:

```
src/features/quick-launch/
├── page.tsx                    # 仅做场景网格渲染（目标 < 300 行）
├── store.ts                    # 已存在，保持
├── scenes.ts                   # 已存在，保持
├── types.ts                    # 已存在，保持
├── hooks/
│   └── useQuickLaunchController.ts   # 新建：迁入扫描 / 导出 / 右键菜单 handler
└── services/
    └── quick-launch.repository.ts    # 新建：包装 exportFullClassification 的文件写入逻辑
```

**hooks/useQuickLaunchController.ts 职责**:
- 包装 `loadApps` / `handleExportOverrides` / `handleRefresh` 为 `useCallback`
- 持有 `contextMenu` / `editingApp` 等本地 UI 态
- 派生 `groupedAppsByScene`（用 `useMemo`）

**services/quick-launch.repository.ts 职责**:
- `exportClassificationToFile(apps, overrides)` — 调用 `writeTextFile` + `savePlatformDialog`
- 把 `page.tsx` 行 564-566 的 `loading` + `useAppManagerStore.getState().loading` 双重检查封装为 `isScanning` selector

**风险点**:
- `quick-launch` 复用 `useAppManagerStore`（共享扫描数据），controller 不能重复触发扫描
- `MERGED_SCENE_KEYS` / `SCENE_ICON_MAP` 是常量，可保留在 `page.tsx` 或移入 `scenes.ts`

#### 优先级 D — dev-toolbox（收益中、风险高）

**问题**: `page.tsx` 255 行，但承载 7 个子 Tab，devtools / diagnostics / info 三个子模块的状态全内联。

**拆分方案**（按 roadmap v1.17）:

```
src/features/dev-toolbox/
├── page.tsx                    # 仅做 7-Tab 容器组合（目标 < 100 行）
├── devtools/                   # 新建子模块
│   ├── DevToolsPanel.tsx       # 从 page.tsx 抽出 jsonInput/b64/hash/ts/uuid 5 个工具
│   └── useDevTools.ts          # 持有 5 个工具的 input/output 状态
├── diagnostics/                # 新建子模块
│   ├── DiagnosticsPanel.tsx    # 从 page.tsx 抽出 diagnosticTarget/Result
│   └── useDiagnostics.ts       # 持有诊断状态 + runDiagnostic 包装
├── info/                       # 新建子模块
│   ├── SystemInfoPanel.tsx     # 从 page.tsx 抽出 systemInfo 状态
│   └── useSystemInfo.ts        # 持有 systemInfo + loadSystemInfo effect
└── components/
    └── ToolboxTabButton.tsx    # 通用 Tab 按钮（已用 cn() 修复）
```

**风险点**:
- `useSettingAction` 来自 `system-settings/hooks/`，dev-toolbox 直接复用 — 拆分后子模块需各自导入
- 4 个 lazy 子页（PortManager / DevCleaner / EnvDetector / TokenCalculatorPage）已用 `lazy()` + `<Suspense>`，拆分时保持
- `systemInfoUseCases` / `systemSettingsUseCases` 来自 `system-settings/services/`，dev-toolbox 直接复用 — 同上
- 子模块拆分会产生大量小文件，需权衡是否真的有必要（dev-toolbox 本身是"工具箱"性质，内联编排可接受度较高）

**建议**: 与产品确认 v1.17 计划是否仍需执行；若不执行，可降级为"补 `hooks/useDevToolboxController.ts` 持有所有状态"的最小方案。

#### 优先级 E — hardware（暂不强制补）

**现状**: `page.tsx` 183 行，仅做 `CompareTabs` 组合 + 7 个 hardware module loader 的 `useMemo`。无内联编排、无 CRUD、无本地状态。

**结论**: 符合 §2.1 "page.tsx 仅做组合"的规范，不强制补 `hooks/` / `services/`。审计报告 Phase 1.4 的违规描述（"缺少 hooks/、services/"）可降级为建议或不计违规。

### 1.3 执行顺序建议

1. **先做 terminology**（收益最高，1160 行 → 目标 < 200 行）
2. **再做 token-calculator**（1401 行 → 目标 < 100 行）
3. **再做 quick-launch**（815 行 → 目标 < 300 行）
4. **dev-toolbox 待产品确认**（v1.17 计划是否执行）
5. **hardware 不动**

每个模块拆分独立提交，commit 格式:
```
refactor(<module>): 拆分 page.tsx 为 hooks/services/components

违反: §2.1 Feature 目录结构
文件: src/features/<module>/page.tsx
```

### 1.4 验收标准

- `page.tsx` 行数降至目标值以下
- 新增 `hooks/useXxxController.ts` 暴露 selector + handler，避免整 store 解构
- 新增 `components/` 子目录持有抽出的子组件
- pre-commit hooks（tsc / vitest / vite build）全部通过
- 各模块既有测试（如 `HardwareCompare.test.tsx`）继续通过

---

## 二、account-manager controller selector 化方案

### 2.1 现状

`src/features/account-manager/hooks/useAccountManagerController.ts:28` 用 `const store = useAccountManagerStore();` 订阅整 store，返回值需暴露 store 约 36 个字段给 `page.tsx`。

**已修复部分**（Commit 55998e3）:
- `useCallback(handleOpenExternalApps, [store])` → 改为 `useAccountManagerStore.getState()` + `[]` 依赖

**未修复部分**:
- 行 28 整 store 订阅保留 — controller 是胶水层，返回值需暴露 store 大量字段（stations / accounts / selectedStationId / selectedAccountId / loading 等约 36 个），彻底 selector 化需为每个字段写独立 selector，属大范围重写

### 2.2 方案

**方案 A（推荐）: `useShallow` 批量订阅**

```typescript
import { useShallow } from "zustand/react/shallow";

const {
  stations, accounts, selectedStationId, selectedAccountId,
  loading, // ... 其他需要的字段
} = useAccountManagerStore(useShallow((s) => ({
  stations: s.stations,
  accounts: s.accounts,
  selectedStationId: s.selectedStationId,
  selectedAccountId: s.selectedAccountId,
  loading: s.loading,
  // ... 其余 31 个字段
})));
```

- 优点：`useShallow` 做浅比较，只有引用变化才重渲，比整 store 订阅精细
- 缺点：仍需列出 36 个字段，但一次性改造后后续维护成本低

**方案 B: 拆分 controller 为多个细粒度 hook**

```typescript
const useStationManager = () => { /* stations 相关 */ };
const useAccountOperations = () => { /* accounts 相关 */ };
const useExternalAppsPanel = () => { /* externalApps 相关 */ };
```

- 优点：每个 hook 只订阅自己需要的字段，最精细
- 缺点：`page.tsx` 需调用 3-4 个 hook，改造量大

**建议**: 方案 A，用 `useShallow` 一次性批量订阅，改造量最小且效果显著。

### 2.3 风险

- 36 个字段需逐一核对，遗漏会导致 controller 返回 undefined
- `useShallow` 对嵌套对象（如 `stations: Station[]`）做浅比较，数组内容变化但引用不变时不触发重渲 — 需确认 store 的 setter 是否总是返回新数组引用（Zustand 默认是）

---

## 三、updater 模块测试覆盖方案

### 3.1 现状

`src/features/updater/__tests__/` 仅有 `error-classifier.test.ts`（6 个测试），缺少：
- `useUpdaterController` 行为测试（check → download → install → restart 流程）
- 更新下载/安装流程契约测试（IPC 调用参数 / 返回 DTO 字段一致性）

### 3.2 方案

#### 步骤 1: `useUpdaterController.test.tsx` — 行为测试

```typescript
// src/features/updater/__tests__/useUpdaterController.test.tsx
describe("useUpdaterController", () => {
  it("checkForUpdates 成功时更新 updateInfo 状态", async () => {});
  it("checkForUpdates 失败时设置 errorMessage", async () => {});
  it("downloadAndInstall 在已检查更新后调用 IPC", async () => {});
  it("downloadAndInstall 未检查更新时不调用 IPC", async () => {});
  it("downloadAndInstall 期间 isDownloading 为 true", async () => {});
  it("下载进度更新 progress 状态", async () => {});
  it("下载取消后 isDownloading 为 false", async () => {});
  it("安装完成后调用 restartAfterUpdate", async () => {});
});
```

- 需 mock `@/lib/tauri/commands/updater` 的 `checkForAppUpdate` / `downloadAndInstallAppUpdate`
- 需 mock `@/lib/tauri/events` 的 Tauri 事件监听（下载进度、安装完成）
- 使用 `renderHook` + `act` 包装状态更新

#### 步骤 2: `updater.contracts.test.ts` — 契约测试

```typescript
// src/lib/tauri/__tests__/updater.contracts.test.ts
describe("updater IPC 契约", () => {
  it("check_for_app_update 无参数", () => {});
  it("download_and_install_app_update 无参数", () => {});
  it("AppUpdateInfo DTO 字段与 Rust 侧一致", () => {});
  it("UpdaterErrorInfo DTO 字段与 Rust 侧一致", () => {});
});
```

- 已有 `src/lib/tauri/__tests__/contracts.test.ts`（5 个测试），可在此扩展或新建独立文件

### 3.3 风险

- Tauri 事件 mock 较复杂，需理解 `@tauri-apps/api/event` 的 `listen` 接口
- `useUpdaterController` 内部有 `useGuardedAsync` 重入保护，测试需覆盖重入场景
- 下载进度是流式事件，需模拟多次 `emit`

### 3.4 工作量

- 行为测试：~8 个用例，预计 0.5 人日
- 契约测试：~4 个用例，预计 0.25 人日
- 合计：~0.75 人日

---

## 四、columns.tsx 跨模块统一抽取方案

### 4.1 现状

`columns.tsx` 文件在 3 个 feature 重复出现：
- `src/features/app-manager/columns.tsx`
- `src/features/dev-cleaner/columns.tsx`
- `src/features/env-detector/columns.tsx`

各自定义 DataTable 的列配置，结构相似但字段不同。

### 4.2 方案

**评估**: 3 个 `columns.tsx` 虽然文件名相同，但内容差异较大（不同 feature 的字段、格式化函数、筛选逻辑不同），统一抽取可能过度抽象。

**建议**:
- **不强制统一**：3 个文件的相似性仅在于"都是列配置"，实际内容差异大
- **可选优化**: 若未来新增 feature 也需要 `columns.tsx`，可考虑抽一个 `shared/data-table/columns-builder.ts` 工具函数，但当前 3 个文件不足以驱动抽象
- **降级为不计违规**：审计报告 Phase 1.6 的这条建议可降级为"已知设计，不强制统一"

### 4.3 结论

不建议立即执行。若审计需要关闭此项，标记为"评估后不采纳"即可。

---

## 五、待人工确认事项

1. **terminology / token-calculator / quick-launch 拆分是否立即执行？**
   - 收益：page.tsx 从 1000+ 行降至 < 300 行，符合 §2.1 规范
   - 风险：迁移过程中可能引入回归 bug，需逐模块独立提交 + 测试覆盖
   - 建议：先做 terminology（收益最高），观察 1-2 个迭代后再做其余

2. **dev-toolbox 是否按 v1.17 计划拆子模块？**
   - 若不拆：可降级为"补 `hooks/useDevToolboxController.ts` 持有所有状态"的最小方案
   - 建议待产品确认 v1.17 路线图

3. **hardware 是否仍计为违规？**
   - 现状 page.tsx 仅 183 行，符合"仅做组合"规范
   - 建议降级为建议或不计违规

4. **account-manager controller 用方案 A（useShallow）还是方案 B（拆分 hook）？**
   - 建议方案 A，改造量最小

5. **updater 测试覆盖是否立即补？**
   - 建议补，~0.75 人日工作量

6. **columns.tsx 统一抽取是否执行？**
   - 建议不执行，降级为"评估后不采纳"

---

## 六、已完成项回顾

本批次（Commit 90a3e21）已完成的简单文件移动：
- ✅ `app-manager/CategoryFilter.tsx` → `components/CategoryFilter.tsx`
- ✅ `hardware/HardwareCompare.tsx` + `HardwareCompareTab.tsx` → `hardware/components/`
- ✅ `system-settings/useSettingAction.ts` → `hooks/useSettingAction.ts`
- ✅ `token-calculator/api.ts` → `services/token-calculator.repository.ts`
- ✅ `terminology/api.ts` 删除（store.ts 直接从 `@/lib/tauri/commands/terminology` 导入）
- ✅ `hardware/HardwareCompareTab.tsx` 散装错误判断 → `getErrorMessage`
