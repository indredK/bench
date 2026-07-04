# Terminology 迭代规划

> 版本: v1.15.0 | 最后更新: 2026-07-05  
> 发布节奏见 [release-themes.md](../../roadmap/release-themes.md)

## 📊 当前评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码质量 | ⭐⭐⭐⭐⚬ | controller 抽取完成，store 订阅改精细 selector |
| 功能完备度 | ⭐⭐⭐⭐⚬ | 多领域词库、搜索/收藏完善 |
| 用户体验 | ⭐⭐⭐⭐⚬ | 中英对照、复制交互好 |
| 性能 | ⭐⭐⭐⚬⚬ | 大词表无虚拟化 |
| 测试覆盖 | ⭐⭐⚬⚬⚬ | 无测试 |
| 可维护性 | ⭐⭐⭐⭐⚬ | controller / store / view 分层清晰 |

## ✅ 已交付 (v1.15.x)

- [x] 删除术语 `DestructiveConfirmDialog`

## v1.16

- [x] `navigator.clipboard` → `@/platform/clipboard`
- [x] api 层命名对齐 repository 模式（直接删除 `api.ts`，store 从 `@/lib/tauri/commands/terminology` 导入）
- [x] 抽出 `hooks/useTerminologyController.ts`，12 个 store 字段改精细 selector、本地 UI 状态 / 派生数据 / handler 全部迁入（Commit 86f621d）

## v1.17

- [ ] constants.ts 未使用导出清理
- [ ] 大词表虚拟化渲染
- [ ] 术语收藏导出
- [ ] ≥1 测试（release 门禁）

## v1.18

- [ ] 术语社区贡献/PR
- [ ] 术语语音朗读
