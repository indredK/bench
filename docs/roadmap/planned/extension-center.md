# Extension Center（插件中心）待验收项

> 本文件只记录未完成的实现与验收；插件化阶段顺序见 [模块路线图](../../modules/extension-center/roadmap.md)，manifest、签名和 registry 契约见 [extension-spec.md](../../reference/extension-spec.md)。

## 待实现

- [ ] **插件详情与能力矩阵**：当前工作树已实现详情、权限分类、宿主能力状态和来源校验披露；须本机界面复验与 CI 后勾销。发布者必须标作 registry 声明；官方 registry 的 SHA-256 完整性不能标成插件签名。
- [ ] **诊断面板优化**：结构化记录、时间、搜索、筛选、最近记录优先与刷新失败保留旧数据已在 Bench 工作树实现，须经本机界面复验、合并与 CI 后勾销。

## 待合入

- [ ] [模板仓库 PR #1](https://github.com/kindred-plugin-market/bench-extension-template/pull/1)：将作者打包器的平台声明限制为 Bench 支持的 macOS / Windows。模板仓库 macOS / Windows CI 已通过，PR 仍开放；Windows 真机验证按用户安排暂缓。

## 待验收（真机 / 外部条件）

- [ ] **P3.4 macOS release 验收**：构建正式安装包，在全新用户环境安装后确认 bundled 插件可见、可打开，并在升级时保留用户禁用状态。
- [ ] **P4 官方 registry 端到端验收**：使用兼容的 Bench 版本，通过官方 registry 完成浏览、信任披露、安装、升级、撤回、吊销和卸载；官方源按 registry SHA-256/size + `manifest.files` 验证，不使用 minisign。
- [ ] **P4.5 作者体验验收**：邀请未接触过 Bench 的前端开发者，按[模板作者指南](https://github.com/kindred-plugin-market/bench-extension-template)在 30 分钟内创建、构建和签名一个可安装插件，并记录卡点。
- [ ] **P6 Windows 插件验收**：在 Windows 11 真机检查 `$APPDATA` 路径解析、`ext-` 窗口行为、文件占用时的卸载提示与重试。

## 变更记录

| 日期       | 变更                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| 2026-09-08 | 建立规划清单；P2 骨架已完成项不列入待办                                                                  |
| 2026-10-04 | 对照代码、官方 registry 与模板仓修正待办；新增插件详情/能力矩阵缺口，保留真机、外部体验和 Windows 回归项 |
| 2026-10-05 | 工作树补上插件详情与能力矩阵、安装提交重验及缓存取消清理；待本机界面复验和远程 CI 后勾销                 |
