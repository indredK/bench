# Token Calculator 迭代规划

> 版本: v1.15.0 | 最后更新: 2026-07-01  
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⚬⚬ | model/services 分层合理；异步重入保护缺失 |
| 功能完备度 | ⭐⭐⭐⭐⭐ | 多模型计算 + 价格对比 + 实时 USD/CNY 汇率 |
| 用户体验 | ⭐⭐⭐⭐⚬ | 即时反馈；汇率 stale 提示 |
| 性能 | ⭐⭐⭐⭐⚬ | 纯前端计算 |
| 测试覆盖 | ⭐⭐⭐⚬⚬ | pricing 测试存在 |
| 可维护性 | ⭐⭐⭐⭐⚬ | `model/pricing.ts` 易扩展 |

## ✅ 已交付 (v1.15.x)

- [x] 实时 USD/CNY 汇率（Frankfurter API + 1h localStorage 缓存）
- [x] CSP 允许 Frankfurter 域名

## v1.16

- [x] 异步重入保护（标准 CRUD + 汇率刷新）
- [ ] `model/` 目录结构评估（是否归入 `services/`）

## v1.17

- [ ] 定价数据缓存策略（与汇率缓存对齐）
- [ ] Token 用量历史统计
