# 环境检测（Env Detector）规划功能

> 本文件记录 env-detector 模块**未实现 / 待验证**的功能规划，与 `../product-specs/env-detector.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。

## 待实现

- [ ] **跨机器扫描结果对比**：支持导入另一台机器的结果做横向对比（本机「上次扫描 vs 本次」差异对比已交付）。

## 待验证（真机/跨平台）

- [ ] 为探测失败、部分结果和平台差异补测试：低信号 Node bin 过滤 / 声明 bin 解析已由 `src-tauri/src/env_detector/node_bins.rs` 单测覆盖；仍缺 macOS / Windows 真机探测、超时截断、多版本并存等场景验证。

- [ ] 跨平台：macOS 登录 shell PATH 收集（zsh/fish/bash）在真实 shell 环境下与 `which`/`type -p` 结果一致性。

## 远期

- [ ] 全局路线图（`docs/roadmap/ROADMAP.md`）未给 env-detector 单独 R 编号段；若有环境类发布项需在此登记。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：生成产品说明文档与规划文档（对齐 photo-triage 模板）。
- 2026-09-22：新增「CI 模板」导出（`env-ci.ts` 生成 asdf `.tool-versions` 风格版本清单，可选目标平台 macOS/Windows/Linux，复制剪贴板），planned#12 关闭。
- 2026-09-22：`node_bins.rs` 补 6 项纯函数单测（低信号 Node bin/命令名过滤、声明 bin 解析），planned#14 的「低信号 Node bin 过滤」子项覆盖（真机探测/超时仍待验）。
