# Extension Center（插件中心）待验收项

> 本文件只记录未完成的实现与验收；插件化阶段顺序见 [模块路线图](../../modules/extension-center/roadmap.md)，manifest、签名和 registry 契约见 [extension-spec.md](../../reference/extension-spec.md)。

## 待合入

- [ ] [Bench PR #138](https://github.com/indredK/bench/pull/138)：插件详情/能力矩阵、诊断面板、market 安装事务硬化和网络探测改进。macOS 隔离真机已验证详情披露及 Token 计算器 market 更新成功路径；macOS/Windows Rust、前端、E2E、静态守卫与安全 CI 全绿。PR 尚未合并。
- [ ] [模板仓库 PR #1](https://github.com/kindred-plugin-market/bench-extension-template/pull/1)：将作者打包器的平台声明限制为 Bench 支持的 macOS / Windows。模板仓库 macOS / Windows CI 已通过，PR 仍开放；Windows 真机验证按用户安排暂缓。

## 待验收（真机 / 外部条件）

- [ ] **P3.4 macOS release 验收**：构建正式安装包，在全新用户环境安装后确认 bundled 插件可见、可打开，并在升级时保留用户禁用状态。
- [ ] **P4 官方 registry 端到端验收**：独立 macOS 测试实例已完成浏览、信任披露、Token 计算器从 bundled 1.1.3 更新到 market 1.1.4、安装状态与权限详情检查及插件打开；仍需验证撤回/吊销后的拦截与禁用、卸载、取消清理和更新失败回滚。官方源按 registry SHA-256/size + `manifest.files` 验证，不使用 minisign。
- [ ] **P4.5 作者体验验收**：邀请未接触过 Bench 的前端开发者，按[模板作者指南](https://github.com/kindred-plugin-market/bench-extension-template)在 30 分钟内创建、构建和签名一个可安装插件，并记录卡点。
- [ ] **P6 Windows 插件验收**：在 Windows 11 真机检查 `$APPDATA` 路径解析、`ext-` 窗口行为、文件占用时的卸载提示与重试。

## 变更记录

| 日期       | 变更                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-08 | 建立规划清单；P2 骨架已完成项不列入待办                                                                                                                                                 |
| 2026-10-04 | 对照代码、官方 registry 与模板仓修正待办；新增插件详情/能力矩阵缺口，保留真机、外部体验和 Windows 回归项                                                                                |
| 2026-10-05 | PR #138 的详情/诊断/market 硬化与网络改进已过远程 CI；隔离 macOS 真机完成插件详情及官方 market 更新成功路径。剩余失败/取消、吊销、卸载、作者体验、release 新装和 Windows 真机项继续跟踪 |
