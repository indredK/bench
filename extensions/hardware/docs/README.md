# Hardware（硬件对比）

> **完备功能规格** → [product-spec.md](./product-spec.md)（唯一真相源，随插件自包含）
> **规划** → [planned.md](./planned.md) · **路线** → [roadmap.md](./roadmap.md)
> **测试** → `../src/__tests__/`（插件内 vitest 用例，随插件体系维护）

**形态**：bundled 插件（P5 迁移）——UI 源码 `extensions/hardware/`（纯前端零 IPC，`acl.commands` 为空；静态数据与共享对比组件随 bundle 打包）。

定位：硬件参数与跑分对比工具——在「电脑硬件」「数码产品」两大组共 14 类目录中勾选型号，生成规格矩阵对比表，自动高亮每项最优值；纯前端静态数据，无 IPC/网络/文件系统；仅 macOS。

全局顺序：[2.0 最终路线图](../../../../docs/ROADMAP.md)
