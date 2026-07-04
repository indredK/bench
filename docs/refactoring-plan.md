# Bench 项目复杂重构方案

> **生成日期**: 2026-07-05
> **触发依据**: `docs/audit-report.md` Phase 1.4 / Phase 3.4 强制违规项
> **执行原则**: AGENTS.md Phase 8 注意事项 — "复杂重构输出方案描述即可，不做大范围重写，待人工确认后再执行"
>
> 本文档覆盖两类需人工确认的重构：
> 1. Feature 目录补全（5 个模块拆分 hooks/services）
> 2. `data/phone.ts` canonical value 反转（数据模型层改造）

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

## 二、`data/phone.ts` canonical value 反转方案

### 2.1 现状

`src/data/phone.ts` 共 2295 行，所有字段的 canonical value 是中文原始值：

```typescript
{
  material: "玻璃机身 + 钛金属边框",   // 中文做 canonical
  waterproof: "IP68 (6米/30分钟)",     // 中文做 canonical
  fingerprint: "Face ID",              // 混用
  mainCamera: "12MP f/1.6 主摄 + 12MP f/2.4 超广角",  // 中文做 canonical
  displayType: "Super Retina XDR OLED", // 英文做 canonical
  chipset: "Apple A14 Bionic",         // 英文做 canonical
  // ...
}
```

文件末尾的 `PHONE_WATERPROOF_KEYS` / `PHONE_FINGERPRINT_KEYS` / `PHONE_MATERIAL_KEYS`（行 2099-2150）是把中文反向映射到 key，再由 `phoneSpecRows` 的 `format` 函数用 `t(`phoneCompare.materialTerms.${key}`)` 翻译。

`CAMERA_TERM_TO_KEY`（行 2179-2188）同样以中文做 key。

`frontCamera` 的 `format`（行 2196-2200）用 `str.replace(/\(屏下\)/g, ...)` 在数据层改正文。

### 2.2 问题

- 英文界面在用中文做查表（`PHONE_MATERIAL_KEYS["玻璃机身 + 钛金属边框"]` → `"glassTitan"` → `t("phoneCompare.materialTerms.glassTitan")`）
- 新增机型时必须写中文才能命中映射表，否则英文界面会显示原始中文
- `str.replace(/\(屏下\)/g, ...)` 在数据层用正则改中文括号注释，违反 §4 "数据层应输出 canonical，由展示层组合翻译"

### 2.3 反转方案

**目标**: data 层用 canonical key，展示层 `t()` 翻译。

#### 步骤 1：定义 canonical key 枚举

新建 `src/data/phone/constants.ts`:

```typescript
export type PhoneMaterial =
  | "glassAluminum"
  | "glassStainless"
  | "glassTitanium"
  | "aluminum"
  | "plastic"
  | "titanium";

export type PhoneWaterproof =
  | "ip68_6m_30min"
  | "ip68_1_5m_30min"
  | "ip68_2m_30min"
  | "ip66"
  | "ip54"
  | "none";

export type PhoneFingerprint =
  | "faceId"
  | "underDisplayUltrasonic"
  | "sideCapacitive"
  | "rearCapacitive"
  | "inDisplayOptical"
  | "none";

export type PhoneCameraTerm =
  | "main"
  | "ultrawide"
  | "telephoto"
  | "periscope"
  | "macro"
  | "leica"
  | "hasselblad"
  | "zeiss";

export type PhoneScreenTerm =
  | "underDisplay";
```

#### 步骤 2：改造 `PhoneModel` 接口

```typescript
export interface PhoneModel {
  // ... 其他字段保持
  material: PhoneMaterial;           // 从 string 改为枚举
  waterproof: PhoneWaterproof;       // 从 string 改为枚举
  fingerprint: PhoneFingerprint;     // 从 string 改为枚举
  displayType: string;               // 保持 string（已是英文 canonical）
  chipset: string;                   // 保持 string（已是英文 canonical）
  cpu: string;                       // 保持 string（已是英文 canonical）
  gpu: string;                       // 保持 string（已是英文 canonical）
  mainCamera: PhoneCameraSpec;       // 改为结构化对象（见步骤 3）
  frontCamera: PhoneCameraSpec;      // 改为结构化对象
  // ...
}
```

#### 步骤 3：mainCamera / frontCamera 改为结构化

```typescript
export interface PhoneCameraSpec {
  mp: number;                        // 主像素
  aperture: string;                  // "f/1.6"
  lenses: PhoneCameraLens[];         // 多摄
  brandCoating?: PhoneCameraTerm;    // "leica" | "hasselblad" | "zeiss"
  isUnderDisplay?: boolean;          // 屏下摄像头
}

export interface PhoneCameraLens {
  type: PhoneCameraTerm;             // "main" | "ultrawide" | "telephoto" | "periscope" | "macro"
  mp: number;
  aperture: string;
}
```

**示例**:
```typescript
// 改造前
mainCamera: "12MP f/1.6 主摄 + 12MP f/2.4 超广角",

// 改造后
mainCamera: {
  mp: 12,
  aperture: "f/1.6",
  lenses: [
    { type: "main", mp: 12, aperture: "f/1.6" },
    { type: "ultrawide", mp: 12, aperture: "f/2.4" },
  ],
},
```

#### 步骤 4：删除反向映射表

删除 `PHONE_WATERPROOF_KEYS` / `PHONE_FINGERPRINT_KEYS` / `PHONE_MATERIAL_KEYS`（行 2099-2150）与 `CAMERA_TERM_TO_KEY`（行 2179-2188）。

#### 步骤 5：改造 `phoneSpecRows` 的 `format`

```typescript
{ key: "material", label: "phoneCompare.material", format: (v) => t(`phoneCompare.materialTerms.${v}`) },
{ key: "waterproof", label: "phoneCompare.waterproof", format: (v) => v === "none" ? t("common.no") : t(`phoneCompare.waterproofTerms.${v}`) },
{ key: "fingerprint", label: "phoneCompare.fingerprint", format: (v) => {
  if (v === "faceId") return "Face ID";
  if (v === "none") return t("common.no");
  return t(`phoneCompare.fingerprintTerms.${v}`);
}},
{ key: "mainCamera", label: "phoneCompare.mainCamera", format: (v) => formatCameraSpec(v) },
{ key: "frontCamera", label: "phoneCompare.frontCamera", format: (v) => formatCameraSpec(v) },
```

新建 `formatCameraSpec` helper:
```typescript
function formatCameraSpec(spec: PhoneCameraSpec): string {
  const lenses = spec.lenses.map(l => `${l.mp}MP ${l.aperture} ${t(`phoneCompare.cameraTerms.${l.type}`)}`);
  let result = lenses.join(" + ");
  if (spec.brandCoating) {
    result += ` (${t(`phoneCompare.cameraTerms.${spec.brandCoating}`)})`;
  }
  return result;
}
```

#### 步骤 6：补 i18n key

在 `src/i18n/locales/zh.json` 与 `en.json` 的 `phoneCompare.materialTerms` / `waterproofTerms` / `fingerprintTerms` / `cameraTerms` / `screenTerms` 节点下补全新枚举 key。

### 2.4 风险与权衡

**风险**:
- 全文件 ~50 个机型需逐一改写 `material` / `waterproof` / `fingerprint` / `mainCamera` / `frontCamera` 字段
- `phoneFilterGroups` 的 `format` 函数需同步改造
- 若有其他模块（如 `phoneCompare` 页面）直接读 `material` 字符串做判断，需同步改造
- 测试覆盖不足（当前 `data/phone.ts` 无单元测试）

**权衡**:
- 方案 A（推荐）: 完全反转，data 层用枚举，展示层 `t()` — 一次性改造，彻底解决问题
- 方案 B（折中）: 仅反转 `material` / `waterproof` / `fingerprint` 三个字段（已有反向映射表），`mainCamera` / `frontCamera` 保留字符串但删除中文括号注释 — 改造量减半
- 方案 C（最小）: 保留现状，把 `PHONE_*_KEYS` 映射表移到 `i18n` 层由展示层维护 — 不解决根本问题，不推荐

**建议**: 采用方案 B（折中），先反转三个有反向映射表的字段，`mainCamera` / `frontCamera` 的结构化改造留待 v1.18。

### 2.5 执行顺序

1. 新建 `src/data/phone/constants.ts` 定义枚举
2. 改造 `PhoneModel` 接口（`material` / `waterproof` / `fingerprint` 改为枚举类型）
3. 逐一改写 ~50 个机型的三个字段（可用脚本辅助，但需人工核对）
4. 删除 `PHONE_*_KEYS` 映射表
5. 改造 `phoneSpecRows` 的 `format` 函数
6. 补 i18n key（zh / en 同步）
7. 运行 pre-commit hooks 验证

**预计工作量**: 1-2 人日（含测试）

---

## 三、待人工确认事项

1. **terminology / token-calculator / quick-launch 拆分是否立即执行？**
   - 收益：page.tsx 从 1000+ 行降至 < 300 行，符合 §2.1 规范
   - 风险：迁移过程中可能引入回归 bug，需逐模块独立提交 + 测试覆盖
   - 建议：先做 terminology（收益最高），观察 1-2 个迭代后再做其余

2. **dev-toolbox 是否按 v1.17 计划拆子模块？**
   - 若不拆：可降级为"补 `hooks/useDevToolboxController.ts` 持有所有状态"的最小方案
   - 建议待产品确认 v1.17 路线图

3. **`data/phone.ts` 反转采用方案 A / B / C？**
   - 建议方案 B（折中），先反转三个有反向映射表的字段

4. **hardware 是否仍计为违规？**
   - 现状 page.tsx 仅 183 行，符合"仅做组合"规范
   - 建议降级为建议或不计违规

---

## 四、已完成项回顾

本批次（Commit 90a3e21）已完成的简单文件移动：
- ✅ `app-manager/CategoryFilter.tsx` → `components/CategoryFilter.tsx`
- ✅ `hardware/HardwareCompare.tsx` + `HardwareCompareTab.tsx` → `hardware/components/`
- ✅ `system-settings/useSettingAction.ts` → `hooks/useSettingAction.ts`
- ✅ `token-calculator/api.ts` → `services/token-calculator.repository.ts`
- ✅ `terminology/api.ts` 删除（store.ts 直接从 `@/lib/tauri/commands/terminology` 导入）
- ✅ `hardware/HardwareCompareTab.tsx` 散装错误判断 → `getErrorMessage`
