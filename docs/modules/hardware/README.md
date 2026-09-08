# Hardware（硬件对比）

> **完备功能规格** → [product-specs/hardware.md](../../product-specs/hardware.md)
> **规划功能** → [planned/hardware.md](../../planned/hardware.md)

**形态**：bundled 插件（P5 迁移）——UI 源码 `extensions/hardware/`（纯前端零 IPC，`acl.commands` 为空；静态数据与共享对比组件随 bundle 打包）。

定位：硬件参数与跑分对比工具——在「电脑硬件」「数码产品」两大组共 14 类目录中勾选型号，生成规格矩阵对比表，自动高亮每项最优值；纯前端静态数据，无 IPC/网络/文件系统；仅 macOS。

全局顺序：[2.0 最终路线图](../../ROADMAP.md)
