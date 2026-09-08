# Terminology（术语库）规划功能

> 本文件记录 terminology 模块**未实现 / 待验证**的功能规划，与 `../product-specs/terminology.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> 来源：`../modules/terminology/roadmap.md`。

## 待实现（Backlog）

- [ ] 清理 `constants.ts` 未使用导出。
- [ ] **术语收藏导出**（收藏列表导出功能）。
- [ ] 至少一项关键行为测试进入门禁（如筛选/去重/保留子分类）。
- [ ] 社区贡献流程；导入内容需校验 schema 和冲突。
- [ ] **术语语音朗读**，明确平台能力降级。

## 待验证

- [ ] 内置大数据量 seed（多行业/分类）在虚拟滚动下滚动流畅、无卡顿（`VirtualGridView`）。
- [ ] 前端分类 `__unclassified__` 保留子分类在增删改流程中保持不可改/删且排末尾（后端强制 + 前端 UI 一致）。

## 远期

- [ ] 术语批量导入（JSON/CSV）与 schema 校验。
- [ ] 术语间关联 / 同义词扩展（未见实现）。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：首版生成——依据 `docs/modules/terminology/roadmap.md` 提取未完成项；产品说明见 `../product-specs/terminology.md`。
