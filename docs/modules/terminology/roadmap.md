# Terminology 迭代规划

> 版本: v1.15.0 | 最后更新: 2026-07-01  
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⚬⚬ | `navigator.clipboard` 未走 platform 封装 |
| 功能完备度 | ⭐⭐⭐⭐⚬ | 多领域词库、搜索/收藏完善 |
| 用户体验 | ⭐⭐⭐⭐⚬ | 中英对照、复制交互好 |
| 性能 | ⭐⭐⭐⚬⚬ | 大词表无虚拟化 |
| 测试覆盖 | ⭐⭐⚬⚬⚬ | 无测试 |
| 可维护性 | ⭐⭐⭐⚬⚬ | constants 死导出待清理 |

## ✅ 已交付 (v1.15.x)

- [x] 删除术语 `DestructiveConfirmDialog`

## v1.16

- [x] `navigator.clipboard` → `@/platform/clipboard`
- [ ] api 层命名对齐 repository 模式（若仍存 feature 内 api）

## v1.17

- [ ] constants.ts 未使用导出清理
- [ ] 大词表虚拟化渲染
- [ ] 术语收藏导出
- [ ] ≥1 测试（release 门禁）

## v1.18

- [ ] 术语社区贡献/PR
- [ ] 术语语音朗读
