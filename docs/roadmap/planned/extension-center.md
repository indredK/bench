# Extension Center（插件中心）未完成项

> 本文件只记录**未实现或未验收**的功能；执行顺序与状态唯一清单见 [extension-center roadmap](../../modules/extension-center/roadmap.md)，产品规格见 [Extension Center 产品说明](../../reference/product-specs/extension-center.md)。

## 待实现

### 市场详情与能力矩阵

- [ ] 专用插件详情页：发布者、完整宿主命令、`engines` 约束及信任/签名状态。
- [ ] 完整能力矩阵：`supported / degraded / unsupported / missing_pack`，对齐 D-017。

### P4.5 作者侧验收

- [ ] 邀请一位未接触过本项目的开发者，验证其能否在 30 分钟内从模板创建并在 Bench 中安装插件；记录卡点后更新作者指南。

## 待验收

- [ ] macOS：从正式 release 包全新安装，确认 bundled 插件存在且可打开；升级后用户禁用标记与 market 版本不会被错误覆盖（P3.4）。
- [ ] 官方 market：在干净用户数据目录中走完拉取目录、信任披露、安装、打开、升级与卸载；现有审计记录来自历史安装，不能替代干净环境验收。
- [ ] Windows：验证 `$APPDATA` 路径、`ext-` 窗口行为及文件占用下卸载的提示/恢复（P6）。
- [ ] 第三方 registry：用独立测试密钥验证签名通过、签名错误拒绝与版本回退拒绝；切换当前 registry 配置后，已安装插件仍按安装时记录的来源策略校验。

## 已完成范围（从未完成清单移除）

- P3.3 安全解压、追加式插件诊断、2 MB 滚动审计日志。
- P3.4 `bundle.resources` 发布集成与启动部署逻辑。
- P4 registry 目录、安装/更新两段式信任流程、ACL 披露、engines/yanked/revoked 处理及诊断面板。
- P4.5 公开模板仓（GitHub template 已开启、CI 全绿）、模板工作区 SDK、`extensions:create` 脚手架、pack/sign 脚本与作者指南；SDK 未单独发布到 npm。

## 变更记录

| 日期       | 变更                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-08 | 建立插件中心未完成项清单。                                                                                                                                                              |
| 2026-09-28 | 更新官方 registry 信任边界；提交阶段复验来源和完整性、安装来源持久化、取消/过期缓存清理与信任依据 UI 已交付；模板、SDK、脚手架、pack/sign 与作者指南已交付，保留新手验收和真机闭环。    |
| 2026-09-28 | 修复主面板切换只更新 hash、仍显示旧路由的问题；真机验证 DevToolbox、Command Center、Extensions、Network Probe 之间切换和返回，见 [PR #111](https://github.com/indredK/bench/pull/111)。 |
