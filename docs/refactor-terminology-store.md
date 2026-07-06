# Terminology Store 分层重构方案

> 违反: §3.1 store 分层 — `store.ts` (295 行) 同时承担状态管理、业务编排、筛选/排序逻辑

## 当前结构问题

- `filteredTerms()` 含多维筛选 + 排序逻辑（~30 行）
- `syncSelection()` 含级联选择校验逻辑（~25 行）
- `matchesSelectedSubcategory()` 含特殊 sentinel 处理
- 所有 CRUD action 直接调 `@/lib/tauri/commands/terminology` 层（无 repository 间接层）
- 缺少 `services/` 目录

## 目标结构

```
src/features/terminology/
├── store.ts                    # 纯状态 + 轻量 action（只调 use-cases）
├── page.tsx
├── feature.tsx
├── types.ts
├── constants.ts
├── hooks/
│   └── useTerminologyController.ts
└── services/
    ├── terminology.use-cases.ts   # 业务编排（筛选/排序/级联校验/错误处理）
    └── terminology.repository.ts  # 外部适配（封装 @/lib/tauri/commands/terminology）
```

## 拆分步骤

### Step 1: 创建 `terminology.repository.ts`

将当前 store 中直接调用的 `@/lib/tauri/commands/terminology` 全部代理到 repository：

```ts
export const terminologyRepository = {
  listTerminologyData,
  createIndustry,
  updateIndustry,
  deleteIndustry,
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  createTerm,
  updateTerm,
  deleteTerm,
  setTermPinned,
}
```

纯透传，无业务逻辑。

### Step 2: 创建 `terminology.use-cases.ts`

从 `store.ts` 迁移以下逻辑：

1. **`filteredTerms()`** → `getFilteredTerms(state)` — 纯函数入参 `(terms, pinnedTermIds, industryId, categoryId, subcategoryId, searchQuery)`，返回排序后的 `Term[]`
2. **`syncSelection()`** → `validateSelection(data, industryId, categoryId, subcategoryId)` — 纯函数，返回 `{industryId, categoryId, subcategoryId}` 校正后的选择
3. **`matchesSelectedSubcategory()`** — 保留为模块内辅助函数
4. **CRUD 编排** — 包装 repository 调用加错误处理：

```ts
export const terminologyUseCases = {
  async hydrate(): Promise<TerminologyData> { ... },
  async addIndustry(label: string): Promise<string> { ... },
  // ... 每个 CRUD 调用 repository 对应方法
  getFilteredTerms(state: FilterState): Term[] { ... },
  getValidatedSelection(data: TerminologyData, ...): ValidatedSelection { ... },
}
```

### Step 3: 瘦身 `store.ts`

Store 只保留：
- 9 个状态字段（不变）
- 4 个同步 setter（`setIndustry`, `setCategory`, `setSubcategory`, `setSearch`）
- 1 个 `hydrate` action → 调 `terminologyUseCases.hydrate()`
- 12 个 CRUD action → 每个只调 `terminologyUseCases.xxx()` 再更新状态

```ts
addIndustry: async (label) => {
  const id = await terminologyUseCases.addIndustry(label)
  set({ industries: await terminologyUseCases.listIndustries() })
  return id
},
```

`filteredTerms` 改为从 store 读取状态再调 use-cases：

```ts
filteredTerms: () => {
  const s = get()
  return terminologyUseCases.getFilteredTerms({
    terms: s.terms, pinnedTermIds: s.pinnedTermIds,
    industryId: s.selectedIndustryId, categoryId: s.selectedCategoryId,
    subcategoryId: s.selectedSubcategoryId, searchQuery: s.searchQuery,
  })
},
```

### Step 4: 验证

```bash
pnpm run lint:fe
cargo check
```

## 风险与注意事项

- `filteredTerms()` 是 `get()` 派生计算 — 改为调 use-cases 后行为一致，无性能退化
- `syncSelection()` 调用点在 `hydrate` 和 `setIndustry`/`setCategory` → 改为 `getValidatedSelection()` 后需保证级联逻辑不变
- 本重构不涉及 IPC 契约变更，无需 Rust 侧修改
- **待人工确认后执行**
