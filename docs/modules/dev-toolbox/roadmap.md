# Dev Toolbox Roadmap

> 规划功能（待验证 / 远期）已汇总至 [planned/dev-toolbox.md](../../roadmap/planned/dev-toolbox.md)。
> 已完成功能与详情见 [product-specs/dev-toolbox.md](../../reference/product-specs/dev-toolbox.md)。

## 仓库开发维护（不属于应用内 Dev Toolbox）

- [x] **Rust 构建缓存可恢复整理（2026-09-28）**：`scripts/maintenance/rust-cache-clean.mjs` 使用 `trash` 包把过期副本移入系统废纸篓/回收站；拒绝跟随符号链接、按批统计与移动。通用清理排除共享 target 和 `node_modules`。结果记录见[缓存调优调研 §8](../../explanation/rust-build-cache-optimization-research.md#8-实施状态2026-09-28-更新)。
