# Extension Center（插件中心）规划功能

> 本文件记录 extension-center 模块**未实现 / 待验证**的功能规划，与 [../product-specs/extension-center.md](../../reference/product-specs/extension-center.md) 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> **插件化的整体执行顺序不在此文件**，见 [../modules/extension-center/roadmap.md](../../modules/extension-center/roadmap.md)。

## 待验证（外部环境 / 真机）

- [ ] macOS 真机：bundled 插件随正式包安装后可见且可打开（P3.4 验收）
- [ ] market 真正签名端到端：使用 registry 私钥签出插件并配置 `BENCH_EXT_REGISTRY_URL`，验证真实 URL 安装与生命周期
- [ ] 作者可用性：邀请未接触过 Bench 的开发者，记录其是否能按模板 README 在 30 分钟内产出可安装插件
- [ ] Windows：插件子系统三处跨平台差异实测 —— `$APPDATA` 路径解析、`ext-` 窗口行为、`remove_dir_all` 文件占用（P6）
- [ ] Windows：`ext_uninstall` 在文件被占用时的可读提示与重试策略

## 变更记录

| 日期       | 变更                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-08 | 建立本文件；P2 骨架已完成项（列表/打开/启用禁用/卸载确认/空态/错误重试）不列入规划                                                                                                                                     |
| 2026-09-08 | 依 P3 路线复核结果，新增 P3.1 包完整性、P3.3 安全解压与审计、P3.4 发布集成、P4.5 作者侧交付的规划项                                                                                                                    |
| 2026-10-04 | P4.5 模板、SDK、脚手架、打包签名和作者 README 已在 [bench-extension-template](https://github.com/kindred-plugin-market/bench-extension-template) 交付并由 Ubuntu / Windows CI 验证；独立新作者 30 分钟上手实测仍待补充 |
