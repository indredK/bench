# Token Calculator（Token 计算器）产品说明

> 本文件是 token-calculator 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。

## 1. 定位

- 主序列功能，入口：路由 `/token-calculator`，侧边栏注册（`sidebar.tokenCalculator`），图标 Coins。
- **非 desktopOnly**：Web/桌面均可使用（仅价格标准持久化走 Tauri store，前端其余逻辑纯浏览器可跑）。
- 用途：估算文本 token 数、按官方/自建定价标准计算成本、多模型成本/预算对比。
- 核心保证：CJK-aware 估算、缓存/命中率定价支持、USD/CNY 汇率换算、内置定价 + 可自定义标准。

## 2. 页面结构

```
┌────────────────────────────────────────────────┐
│ 标题 + 工具栏（显示货币 USD/CNY 切换 · 汇率输入 · 刷新 · 来源/过期徽章） │
├────────────────────────────────────────────────┤
│ 页签：标准 | 对比 | 计算器                        │
└────────────────────────────────────────────────┘
```

- 首载：加载中提示；加载失败显示 `FeatureLoadError`（重试 `loadStandards`）。
- 三个页签（`forceMount` 保持状态，切换不丢输入）。

## 3. 顶部工具栏（货币与汇率）

- **显示货币**：USD / CNY 分段切换（默认 USD）。
- **汇率输入**：数值框（min 0.1，step 0.1，空/非法回退默认 7），语义 = **1 USD = N CNY**。
- **刷新**：调 `fetchUsdCnyExchangeRate({ forceRefresh: true })`；成功 toast「汇率已更新」，失败 toast 错误。
- **来源/过期徽章**：`ExchangeRateInfo.source`（frankfurter.app / cache / default）+ `stale` 标记；stale 时显示「过期」徽章，否则显示来源。
- 汇率获取：Frankfurter 免费 API（`https://api.frankfurter.app/latest?from=USD&to=CNY`，无需 key）；localStorage 缓存 `token-calculator.exchange-rate.v1`，**TTL 1 小时**；请求失败回退缓存（stale=true）或默认 7（stale=true）。
- 汇率刷新防重入（`useGuardedAsync`）。
- **交互细节**
  - 显示货币 USD/CNY 分段切换（默认 USD），切换即时按当前汇率重算全部价格。
  - 汇率输入为数值框（min 0.1 / step 0.1），输入非法或留空时回退默认 7；语义恒为 **1 USD = N CNY**。
  - 刷新按钮在 `rateLoading` 时禁用且图标旋转；成功 toast「汇率已更新」，失败 toast 错误（不静默）。
  - 来源/过期徽章 hover 有 tooltip：stale 时显示「过期」徽章（secondary），否则显示来源（frankfurter.app / cache / default）。

## 4. 标准页签（StandardsTab）

- **内置标准**（`isBuiltIn` 徽章）：OpenAI Official（gpt-5.5 / gpt-5.5-pro / gpt-5.4 / gpt-5.4-mini / gpt-5.4-nano / o3 / o4-mini）、Anthropic Official（claude-opus-4.8/4.7 / sonnet-4.6 / haiku-4.5）、Google Official（gemini-2.5-pro / gemini-2.5-flash）、DeepSeek Official（deepseek-v4-pro / v4-flash / v3.2 / r1）、国内模型参考（通义/文心/豆包/Moonshot/GLM，CNY 计价）。
- 每个标准卡片：名称 + 内置徽章 + 编辑/删除按钮；表头「模型名 / 输入价 / 缓存写价 / 缓存读价 / 输出价（每 1M tokens）」，价格按显示货币 + 汇率换算展示。
- **新增**：弹窗（名称 + 模型行列表，可增删行）→ `createPricingStandard`；名称为空或全部模型无名称时禁用提交；重复名 toast「已存在」。
- **编辑**：行内展开（名称 + 模型行），保存 → `updatePricingStandard(id, name, models)`；内置标准同样可编辑（保存为覆盖版本）。
- **删除**：`AlertDialog` 二次确认 → `deletePricingStandard(id)`；删除内置标准会持久化到「已移除内置」集合，重启不再出现。
- 模型行字段：模型名、inputPrice、cachedWritePrice、cachedReadPrice（可空，空串→null）、outputPrice、货币（USD/CNY）。
- 写操作统一 `useGuardedAsync` 防重入 + toast 成功/失败；成功后 `onRefresh` 重拉列表。

## 5. 对比页签（CompareTab）

### 模型选择

- 选择标准 + 模型 → 「添加」加入已选列表（badge 显示 标准名/模型名，可移除）；重复添加被忽略。

### 两种模式（分段切换）

**工作量模式（workload）**：

- 输入 token 数 + 输出 token 数（各自带单位：single / 千 / 万 / 百万 / 亿），显示总 token 数。
- 输入:输出比例滑块（预设 1/2/3/5/10/20/50/100），拖动按 `总token × ratio/(ratio+1)` 重算输入、`总token × 1/(ratio+1)` 重算输出。
- 公式说明块（总/比例换算、成本公式、有效输入价公式）。
- 结果表（按成本升序）：模型、缓存命中率（可编辑 0–100%，默认 90%，无缓存价时显示 —）、输入价/缓存写价/缓存读价/输出价（显示货币）、总成本（USD 小字 + CNY 大字；最便宜绿、≥10× 红）。

**预算模式（budget）**：

- 输入预算金额（显示货币）+ 比例滑块。
- 结果表（按最大混合 token 数降序）：每模型在预算下最大输入 / 最大输出 / 最大混合 token 数（价格>0 时 `floor(预算/价 × 1M)`，价格为 0 显示 ∞）。
- 公式说明块（最大输入/输出/混合 token 公式、有效输入价公式）。

### 有效输入价（cache 定价）

- 模型有 `cachedWritePrice`/`cachedReadPrice` 时：`有效输入价 = ((100-命中率)% × 缓存写价 + 命中率% × 缓存读价)/100`；无缓存价时命中率不生效（按 inputPrice）。
- 命中率钳制 0–100。

## 6. 计算器页签（CalculatorTab）

- 文本框（实时估算 token 数；估算算法见 §7）。
- 选择标准 + 模型（模型下拉依赖标准选择）。
- 有缓存定价时显示缓存命中率输入（默认 90%）。
- 结果卡片（有文本时显示）：估算 token 数、输入成本、输出成本、总成本（= 输入+输出，按显示货币）；定价信息行（有效输入价 / 输出价）。
- 成本 = `token数/1M × 每M价格`（输入用有效输入价）。
- **交互细节**
  - 文本框实时估算（输入即更新 token 数，无需提交）；无文本时结果卡片不显示。
  - 模型下拉依赖标准选择（未选标准时禁用，切换标准会清空已选模型）。
  - 仅当所选模型有缓存定价时才显示缓存命中率输入（默认 90%，钳制 0–100）。
  - 结果卡片展示估算 token 数、输入/输出/总成本（按显示货币）与有效输入价/输出价信息行。

## 7. 估算与价格换算（model/pricing.ts）

- **token 估算**：逐字符——CJK 相关码位（CJK 统一/扩展、CJK 标点、全角、假名、谚文等）按 `1/1.5`，其他按 `1/4`，四舍五入，最少 1。
- **汇率换算**：`displayCurrency === 源币` 直接返回；CNY 显示 USD 源 → `×rate`；USD 显示 CNY 源 → `÷rate`；其余原样。非有限值按 0/默认处理。
- **格式化**：价格（<0.01→4 位、<1→3 位、否则 2 位）；成本（数量级更多小数位）；符号 `$`/`¥`。
- **混合价**：`(input×ratio + output)/(ratio+1)`。

## 8. 异常处理

- 后端错误统一为结构化 `TokenCalculatorError`（code + message），前端经 `getErrorMessage`/`translateError` 归一化后 toast；错误码映射如下：

| 错误码               | 触发场景                                                                   | 前端行为/提示                                                      | 恢复/降级                   |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------- |
| `INVALID_INPUT`      | 名称为空 / 无模型 / 模型名空或标准内重复 / 价格负或非有限 / 货币非 USD/CNY | toast「创建/更新/删除失败」；新增弹窗在非法时禁用提交              | 修正输入后重试              |
| `DUPLICATE_NAME`     | 标准名重复（大小写不敏感）                                                 | toast「已存在」（前端按 message 含 `already exists` 判定）         | 改名后重试                  |
| `NOT_FOUND`          | 更新/删除不存在的标准（并发删除等）                                        | toast「更新/删除失败」                                             | 重拉列表（`onRefresh`）     |
| `STORE_FAIL`         | 打开/序列化/保存 store 失败、文件超 8MB                                    | 首载 `FeatureLoadError`（重试 `loadStandards`）；写操作 toast 失败 | 重试；清理或恢复 store 文件 |
| `BUILT_IN_IMMUTABLE` | 已定义，当前代码未见启用                                                   | —                                                                  | 内置标准当前可编辑/删除     |

- **首载失败**：整页 `FeatureLoadError`（标题 + 说明 + 重试 `loadStandards`）；列表加载失败不得静默留空。
- **汇率获取失败**：fetch 非 2xx 或返回非法 rate 一律视为失败；失败时回退缓存（`stale=true`）或默认 7（`stale=true`），计算/换算功能仍可用，不做硬失败；手动刷新失败 toast「汇率获取失败」。
- **汇率缓存损坏**：`parseCached` 捕获解析异常返回 null，视为无缓存重新拉取，不静默沿用脏值。
- **数据损坏 / schema 迁移**：`schema_version=1`，迁移前备份 `pre-v1`（保留 3 份）；未来 schema 版本 `validate_schema` 返回 `StoreFail`（fail-closed，有测试）；损坏的已存值 `decode_optional` 报错而非静默重置（有测试）。
- **非有限值防护**：价格校验后端要求有限且非负；命中率输入钳制 0–100；换算对非有限值按 0/默认处理。

## 9. 技术实现要点

- **架构**：page（本地 `useState`，无 zustand）→ `useTokenCalculatorController` → repository（IPC）+ exchange-rate.use-cases（fetch + localStorage 缓存）。价格与换算纯函数在 `model/pricing.ts`，有单元测试。
- **IPC 命令**（`src-tauri/src/token_calculator/commands.rs`）：listPricingStandards / createPricingStandard / updatePricingStandard / deletePricingStandard。
- **后端**：`types.rs`（ModelPricing / PricingStandard / TokenCalculatorError / builtin_standards）、`storage.rs`、`state.rs`。
- **持久化**：tauri-plugin-store 文件 `token-pricing-store.json`（app_data_dir），schema_version=1；文件大小上限 8 MB；内置标准 = 内置默认 + 已保存覆盖 + 排除 `removed_builtin_ids`；schema 升迁前备份（`pre-v1`，保留 3 份）；未来 schema 版本 fail-closed。
- **输入校验（后端）**：名称非空、至少一个模型、模型名非空且标准内唯一（大小写不敏感）、价格有限且非负、货币仅 USD/CNY、标准名全局唯一（大小写不敏感）；错误码：NOT_FOUND / INVALID_INPUT / DUPLICATE_NAME / BUILT_IN_IMMUTABLE / STORE_FAIL（`BUILT_IN_IMMUTABLE` 已定义，当前代码未见启用）。
- **汇率**：仅前端实现（fetch + localStorage 1h TTL），无后端命令。
- **i18n**：zh/en 双语；所有文案、toast、空态走 i18n。

## 10. 数据模型（关键类型）

- `ModelPricing`：modelName / inputPrice / cachedWritePrice?(每 1M) / cachedReadPrice?(每 1M) / outputPrice / currency(USD|CNY)。
- `PricingStandard`：id / name / isBuiltIn / models[] / createdAt / updatedAt。
- `DisplayCurrency`：USD | CNY；`ExchangeRateInfo`：rate / fetchedAt? / source / stale。
- `TokenCalculatorError`：NotFound / InvalidInput / DuplicateName / BuiltInImmutable / StoreFail（code + message）。

## 11. 边界与限制

- **汇率**：仅支持 USD↔CNY（Frankfurter 免费接口）；离线/接口失败时用缓存（stale 徽章）或默认 7，计算功能仍可用。
- **估算精度**：`estimateTokens` 为启发式估算，非真实 tokenizer，仅作参考；CJK 混合文本可能偏差。
- **定价时效**：内置价格为 2026-06 快照，可能过期，用户可自建/编辑标准；定价缓存与汇率缓存的 stale 状态对齐尚未实现（见规划文档）。
- **内置标准可编辑/可删除**（删除后不再出现），未启用 `BUILT_IN_IMMUTABLE` 强制只读。
- **历史统计未实现**：无 token 用量历史记录（见规划文档）。
- 所有写操作（增/改/删标准）有 loading 防重入与 toast 反馈；删除有二次确认。

## 12. 快捷键

- 未注册专用全局快捷键；输入框与下拉为标准表单交互。

## 13. 交互 / 状态 / 键盘 / 并发补充（第二轮）

### 逐控件交互（未覆盖项）

- 新增标准弹窗为**手写 modal**（`fixed inset-0 bg-black/40` + 居中 Card），**无 Esc 关闭、无焦点陷阱/焦点恢复**（未见实现）；名称与模型行输入即改本地 state，提交前本地校验非空；内容区 `max-h-[60vh]` 可滚动。
- 模型行价格输入：`type="number" min=0 step="any"`，输入价/输出价空串按 0，缓存写/读价空串→null；行删除按钮 `aria-label=common.remove`。
- 对比结果表：命中率输入行内可编辑（0–100，step 5，钳制），无缓存价显示 "—"；**移除某个已选模型会同时清除该模型保存的命中率记录**。
- 汇率输入：`value={exchangeRate || ""}`（空/非法回退默认 7）；**仅 `forceRefresh && !stale` 才 toast「汇率已更新」**（命中缓存或回退默认时手动刷新不提示成功）。
- 比例滑块为原生 `<input type="range">`（索引 0–7 映射预设 1/2/3/5/10/20/50/100）：workload 模式拖动按「总 token × ratio/(ratio+1) / ×1/(ratio+1)」重算输入/输出；budget 模式仅改 ratio 重算。
- 页签 shadcn Tabs（`forceMount` 保持各 tab 输入状态，切换不丢）；Compare/Calculator 的模型下拉**切换标准即清空已选模型**。

### 状态流转与边界补充（未覆盖项）

- 首载：loading 提示 → 成功列表 / 整页 `FeatureLoadError`（重试 `loadStandards`）；标准列表加载失败不留空白。
- 汇率：页面挂载即自动拉取一次（`refreshExchangeRate()`），此后仅手动刷新；请求失败回退缓存（stale=true）或默认 7（stale=true），计算功能不硬失败。
- 新增/编辑/删除标准均为 `useGuardedAsync` 防重入（提交中按钮禁用）；删除内置标准二次确认（AlertDialog）。
- 估算实时：Calculator 文本框逐字符输入即重算（无提交按钮）；估算结果显示 `toLocaleString` 千分位。
- 对比模型选择：重复添加（同 standardId + modelName）被忽略；未选任何模型时显示「选择模型后对比」占位提示。
