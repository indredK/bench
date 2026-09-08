# photo-triage（照片筛选）

> **形态**：bundled 插件（[D-024](../../../../docs/DECISIONS.md#d-024--extension-仓库组织与-photo-triage-试点拆法)，P2b 迁出）。
> 源码：`extensions/photo-triage/`（本目录即插件根）；能力面：15 条 `photo_triage_*` 命令留宿主核心（`src-tauri/src/photo_triage/`）。
> 本目录为该插件的模块文档入口（与 `src/features` 模块同等参与 docs 对齐门禁）。

## 概述

从导出相册中快速「留 / 删」筛选：扫描目录 → 缩略图预览 → 键盘快捷批量筛选 → 回收站删除。Rust 能力（扫描 / trash / 移动 / 空目录清理）留核心，UI 与编排在插件 bundle。

> **完备功能规格** → [product-spec.md](./product-spec.md)（唯一真相源，随插件自包含）
> **规划** → [planned.md](./planned.md) · **路线** → [roadmap.md](./roadmap.md)
> **测试** → `../src/__tests__/`（插件内 vitest 用例，随插件体系维护）

## 文档

- [roadmap.md](./roadmap.md) — 当前状态与未完成项
- 契约：[extension-spec.md](../../../docs/extension-spec.md)；工作流：[extension-workflow.md](../../../docs/extension-workflow.md)
