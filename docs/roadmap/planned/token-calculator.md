# Token Calculator（Token 计算器）规划功能

> 本文件记录 token-calculator 模块**未实现 / 待验证**的功能规划，与 `../product-specs/token-calculator.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> 本模块不在 2.0（R00–R10）执行序列内，按需迭代。

## 待实现 / 待评估

- [ ] **职责边界评估**：评估 `model/` 与 `services/` 的职责边界，只在能减少混淆时迁移。
- [ ] **定价缓存策略**：定价数据缓存策略与汇率缓存对齐，并显示更新时间 / stale 状态。
- [ ] **Token 用量历史统计**：先定义本地留存、清除和隐私策略，再实现历史统计。

## 远期

- 以上三项 backlog 全部完成后，按需拆分子项进入开发（暂无其他远期项）。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：生成产品说明与规划功能文档（依据 `src/features/token-calculator/`、`src-tauri/src/token_calculator/`、`docs/modules/token-calculator/`）。
