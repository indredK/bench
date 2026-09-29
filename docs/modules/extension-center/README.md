# Extension Center（插件中心）

> 插件中心的市场闭环（P4）已实现；P4.5 模板、SDK、脚手架、打包工具和作者指南已交付，新开发者 30 分钟验收仍待完成。**执行顺序与状态唯一清单见 [roadmap.md](./roadmap.md)**。
> 架构边界与作者工作流见 [extension-workflow.md](../../explanation/extension-workflow.md)。

## 定位与当前能力

- 宿主前端的一部分，本身不是插件；用于管理已安装的 bundled / market 插件。
- 已安装页支持打开、启用/禁用、卸载确认、不兼容提示与刷新。
- 市场页从宿主配置的 registry 读取版本，支持安装/更新前的权限披露、兼容性与下架状态提示。
- 诊断页显示最近的插件审计记录和运行时错误；跨端接入页展示宿主能力状态。
- 作者 SDK 是模板仓工作区包，未单独发布到 npm；P4.5 新手验收与完整市场生命周期验收见 [roadmap.md](./roadmap.md)。

## 关联文档

- [roadmap.md](./roadmap.md) — 执行状态与验收顺序
- [extension-spec.md](../../reference/extension-spec.md) — manifest、签名、registry、产物格式与 ACL 契约
- [extension-workflow.md](../../explanation/extension-workflow.md) — 仓库组织、作者侧与宿主侧工作流
- [产品规格](../../reference/product-specs/extension-center.md)
- [未完成项](../../roadmap/planned/extension-center.md)
