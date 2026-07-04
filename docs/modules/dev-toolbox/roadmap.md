# Dev Toolbox 迭代规划

> 最后更新: 2026-07-05  
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐⚬ | controller 抽取完成，状态与 handler 集中管理 |
| 功能完备度 | ⭐⭐⭐⭐⚬ | 7 Tab 完整：端口/清理/环境/Token/工具/诊断/系统信息 |
| 用户体验 | ⭐⭐⭐⭐⚬ | Tab IA 清晰；devtools 区可再分组 |
| 性能 | ⭐⭐⭐⭐⚬ | 子页懒加载 |
| 测试覆盖 | ⭐⭐⚬⚬⚬ | 无测试 |
| 可维护性 | ⭐⭐⭐⭐⚬ | controller 持有所有状态，page.tsx 仅做渲染 |

## Backlog

- [ ] 拆分子模块（`devtools/`、`diagnostics/`、`info/`），避免 `page.tsx` 继续膨胀
- [ ] 正则测试器
- [ ] JSON 校验增强（schema 可选）
