# Clean Space（清理空间）

> **完备功能规格** → [product-spec.md](./product-spec.md)（唯一真相源，随插件自包含）
> **规划** → [planned.md](./planned.md) · **路线** → [roadmap.md](./roadmap.md) · **设计** → [design.md](./design.md) · **原型** → [clean-space-prototype.html](./clean-space-prototype.html)
> **dev-cleaner 子能力** → [dev-cleaner/](./dev-cleaner/)（规格/规划/路线）
> **测试** → `../src/__tests__/`（插件内 vitest 用例）

**形态**：bundled 插件（P5 迁移，manifest `platforms: ["macos"]`）——UI 源码 `extensions/clean-space/`（本目录即插件根，含 dev-cleaner 子模块 `src/dev-cleaner/`）；能力面 14 条命令（8 清理 + 6 dev-cleaner）留宿主核心（`src-tauri/src/clean_space/`，已登记 ACL）。

定位：macOS-only 顶层清理入口，负责存储总览、开发项目清理、自定义目录清理和清理记录；开发项目清理复用 `dev-cleaner` 引擎。

| 文档                     | 说明                           |
| ------------------------ | ------------------------------ |
| [design.md](./design.md) | 扫描模型、清理白名单和路径安全 |
