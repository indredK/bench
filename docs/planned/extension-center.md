# Extension Center（插件中心）规划功能

> 本文件记录 extension-center 模块**未实现 / 待验证**的功能规划，与 [../product-specs/extension-center.md](../product-specs/extension-center.md) 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> **插件化的整体执行顺序不在此文件**，见 [../modules/extension-center/roadmap.md](../modules/extension-center/roadmap.md)。

## 待实现（P3.4 bundled 发布集成）

- [ ] bundled 产物进正式发布包（`bundle.resources` 或 installer 钩子二选一），替代 dev 同步脚本作为发布路径
- [ ] `.gitignore` 显式覆盖 `extensions/*/assets/`

## 待实现（P4 market 端到端闭环）

- [ ] 市场目录浏览（从后端 canonical registry 拉取，renderer 不提供 URL）
- [ ] 安装向导：下载 → 权限披露 → 验签 → 解压 → 启用
- [ ] **权限披露**：安装前展示 `manifest.acl.commands` 的人类可读描述
- [ ] 插件详情页：版本 / 发布者 / 能力矩阵 / 申请的命令 / engines / 签名状态
- [ ] 更新提示：registry 版本比对 + `engines` 升级引导
- [ ] `yanked` 版本提示（已安装仍可运行，不再出现在可安装列表）
- [ ] 吊销处理：命中 registry `revoked` → 强制禁用 + 显著警示
- [ ] 诊断面板：插件中心内查看 ext 日志（替代裸 JSON 文件），按 kind 过滤
- [ ] 能力矩阵展示（supported / degraded / unsupported / missing_pack，对齐 D-017）
- [ ] minisign 真实签名启用（需 registry 私钥环境）

## 待实现（P4.5 作者侧交付）

- [ ] `@bench/ext-sdk`：IPC 客户端薄封装 + i18n 桥 + 诊断上报接口
- [ ] `bench-extension-template` 模板仓库
- [ ] `pnpm run extensions:create <id>` 脚手架
- [ ] `pnpm run extensions:pack <id>`：构建 → 生成 files 清单 → 签名 → 打 zip
- [ ] 作者文档：快速开始（30 分钟）/ SDK 用法 / 提交 registry 三步式 how-to

## 待实现（P3.3 运行时缺陷）

- [ ] 诊断日志改**追加式**（当前 boot 会覆盖先前的 error）
- [ ] 审计日志 `$APPDATA/ext-audit.log`（install/enable/disable/uninstall/verify_fail/acl_deny/revoke_hit，2MB 滚动）

## 待验证（真机 / 双平台）

- [ ] macOS 真机：bundled 插件随正式包安装后可见且可打开（P3.4 验收）
- [ ] Windows：插件子系统三处跨平台差异实测 —— `$APPDATA` 路径解析、`ext-` 窗口行为、`remove_dir_all` 文件占用（P6）
- [ ] Windows：`ext_uninstall` 在文件被占用时的可读提示与重试策略

## 变更记录

| 日期       | 变更                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------- |
| 2026-09-08 | 建立本文件；P2 骨架已完成项（列表/打开/启用禁用/卸载确认/空态/错误重试）不列入规划                  |
| 2026-09-08 | 依 P3 路线复核结果，新增 P3.1 包完整性、P3.3 安全解压与审计、P3.4 发布集成、P4.5 作者侧交付的规划项 |
