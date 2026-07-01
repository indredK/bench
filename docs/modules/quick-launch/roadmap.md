# Quick Launch 迭代规划

> 版本: v1.15.0 | 最后更新: 2026-07-01  
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⚬⚬ | `scenes.ts` 800+ 行未拆分；无 use-case 层 |
| 功能完备度 | ⭐⭐⭐⭐⚬ | 自动分类/场景/最近使用/编辑/导出完整 |
| 用户体验 | ⭐⭐⭐⚬⚬ | 动画与分类清晰；AppCard 信息密度可优化 |
| 性能 | ⭐⭐⭐⭐⚬ | 懒加载好；AppCard 未虚拟化 |
| 测试覆盖 | ⭐⭐⚬⚬⚬ | 无测试文件 |
| 可维护性 | ⭐⭐⭐⚬⚬ | 场景逻辑集中但单文件过大 |

## v1.16

- [x] handleLaunch / handleReveal 重入保护
- [ ] scenes.ts → `services/` 目录迁移
- [ ] LaunchAppEntry 未使用导出清理
- [ ] App 启动 / Finder 操作封装到 use-case 层

## v1.17

- [ ] 大列表 AppCard 虚拟化
- [ ] 场景分类规则可配置化
- [ ] 应用使用频率统计
- [ ] ≥1 controller/use-case 测试（release 门禁）
