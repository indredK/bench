# Token Calculator 迭代规划

> 最后更新: 2026-07-05  
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐⚬ | controller 抽取完成，散装错误判断改用 getErrorMessage |
| 功能完备度 | ⭐⭐⭐⭐⭐ | 多模型计算 + 价格对比 + 实时 USD/CNY 汇率 |
| 用户体验 | ⭐⭐⭐⭐⚬ | 即时反馈；汇率 stale 提示 |
| 性能 | ⭐⭐⭐⭐⚬ | 纯前端计算 |
| 测试覆盖 | ⭐⭐⭐⚬⚬ | pricing 测试存在 |
| 可维护性 | ⭐⭐⭐⭐⚬ | controller / model / services 分层清晰 |

## Backlog

- [ ] `model/` 目录结构评估（是否归入 `services/`）
- [ ] 定价数据缓存策略（与汇率缓存对齐）
- [ ] Token 用量历史统计
