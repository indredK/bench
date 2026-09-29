# Bench 审计记录

本文件只保留审计豁免和仍有效的风险；已修复历史由 Git 保留，可复用规则已进入 [coding-standards.md](../how-to/coding-standards.md) 与 [ARCHITECTURE.md](../reference/architecture.md)。

## 不计违规决策

除非前提变化，后续审计不重复报告：

1. `src/data/phone.ts` 保留中文原始数据，展示层通过 `PHONE_*_KEYS` 和 `t()` 翻译；新增数据必须同步映射。
2. `src/features/hardware/` 无真实编排时无需空 `hooks/`、`services/`。
3. 各模块 `columns.tsx` 差异大，不为形式统一抽取。
4. `lib/tauri/commands/*` 已是纯 IPC 适配时，不新增只 re-export 的 feature repository。
5. 页面本地状态无需强制进入 Zustand；跨组件/页面共享后再上提。
6. `src-tauri/src/lib.rs` 启动链末端 `.expect()` 可保留；IPC 和可降级初始化路径仍禁止 panic。
7. 子组件用 selector 读取稳定 store action 可保留；禁止无 selector 整 store 订阅进入 hook 依赖。
8. `dev-toolbox` 是聚合 Tab，`updater` 是全局对话框，不强制拥有导航 feature 的完整结构。

## 当前风险

- [前端/后端 §7.4/§8] `src-tauri/src/net_probe/packs.rs`、`src-tauri/src/net_probe/traceroute.rs`、`src/features/network-probe/hooks/useNetworkProbeController.ts` - Windows traceroute 在能力矩阵中标记为 `supported`，前端据此启用操作，但后端 Windows 路径只尝试特权 ICMP、没有无特权回退或提权流程；普通用户可能只能得到 unavailable。Trippy 文档说明 Windows 需要管理员权限、无特权支持限于 macOS：[Privileges](https://trippy.rs/guides/privileges/) - **Medium** - Windows UI/权限行为尚未真机验证；用户要求先记录，Windows 环境将在本轮目标完成后另行安排。本轮不改 Windows 行为、不宣称该风险已修复。
- [前端 §3/§5/§9] `src/features/network-probe/services/network-probe.use-cases.ts` 与 Network Probe 面板 - `loadNetworkServices`、`openSystemNetworkSettings`、`addAgent`、`removeAgent` 缺少加载状态/防重入；网络服务或节点列表失败/为空时反馈不明确。另有 bootstrap `Promise.all` 把任意子请求失败误标成节点加载失败并丢弃其他成功结果；agent 写入成功后节点刷新失败会误报写入失败，诱发重复注册 - **Medium** - 修复：加载结果独立落 store；节点刷新错误与 agent 写操作错误区分，成功创建/删除保留本地状态，成功注册清空表单；状态文案、重试与防重入已补齐。设计：局部失败只影响对应数据域，写操作成功不会被后置刷新失败覆盖 - 状态：代码、回归测试及 PR #111 远程 CI 已通过；macOS QA 真机已验证面板正常路径。
- [后端 §7/§8] `src-tauri/src/net_probe/agent.rs` - `add_agent`/`remove_agent` 以无锁 load-modify-`fs::write` 更新共享 `agents.json`，并发调用会覆盖另一写入且写入中断可留下损坏 JSON - 已在同一写锁内读取、修改并通过 `crate::persistence::atomic_write` 替换，锁同时覆盖同进程与多实例 - **High** - 状态：代码、并发回归测试及 PR #111 远程 CI 已通过。
- [前端/后端 §7/§8] `src-tauri/src/net_probe/agent.rs` 与 `src/features/network-probe/services/network-probe.use-cases.ts` - agent URL 接受 userinfo/query/fragment，完整 endpoint 被写进命令日志并原样呈现在节点 UI；若用户把凭证放进 URL，凭证会进入日志、界面及持久化记录，而规格要求凭证进入安全存储 - 已拒绝 URL 凭证字段，命令日志不记录 endpoint，并对既有记录的节点展示做脱敏；认证能力仍按 C2-3 单独完成 - **High** - 状态：代码与 macOS QA 输入校验已验证，PR #111 远程 CI 已通过。
- [后端 §7/§8] `src-tauri/src/net_probe/agent.rs` - 校验原先接受 `wss://`，健康检查却始终以 HTTP GET 交给 reqwest；WebSocket 地址会被保存成不可达节点，用户无法从反馈判断协议不匹配 - 当前已改为在 UI 与后端一致拒绝 WSS，并明确仅支持 HTTPS JSON 健康检查；WSS 传输列入 C2-3 - **Medium** - 状态：代码与 macOS QA 输入校验已验证，PR #111 远程 CI 已通过。
- [§7/§8/§4] `src/features/photo-triage/`、`src-tauri/src/photo_triage/` - 2026-09-03 复查发现并已修复：11 处 IPC 路径 `lock().unwrap()`（Mutex 中毒回归）、阻塞 I/O 未 `spawn_blocking`（7 命令）、sips/ffmpeg/qlmanage 无超时未复用 `subprocess.rs`、`prune` 源目录不可达时静默清除引用、`move_items` 部分失败不回滚、`ConfirmSheet` 硬编码中文插值、`window.confirm` 原生弹窗、文档注册三缺口（modules/README 索引、check-docs 豁免、D-020 决策）与持久化治理（config.json schema v1 + manifest 256MB 上限 + persistence-schema 登记） - 均已修复；`trash/restore/move/prune` 补 5 个 Rust 行为测试待验证链执行 - **强制** - 状态：代码已修复/待验证
- [§3/§5/§6/§9] `src/features/account-manager/` - 缺区域 error/retry 与大文件分层；Keyring/WebView/Deep Link 双平台行为未验收 - 区域 error/retry、分层拆分与错误统一已由 R01 关闭；真机部分执行 [R04](../roadmap/ROADMAP.md#r04-account-manager-双平台真机矩阵) - **强制** - 状态：代码已修复/待验收
- [§3.3/§7/§8] `src-tauri/src/account_manager/` - 同源 Web Storage/IndexedDB、canonical Cookie expiry、single-flight、Deep Link inbox 和 capability 已实现；partition key 不可用且目标平台行为未验收 - 保持 partitioned Cookie fail-closed，执行 [R04](../roadmap/ROADMAP.md#r04-account-manager-双平台真机矩阵) - **强制** - 状态：代码已修复/待验收
- [§7.4/§9] `src-tauri/src/app_manager/` - 缺双平台 inventory fixture、启动/更新/卸载 smoke 和 CI runner；快照缓存契约（损坏/上限/schema/取消）已由 R02 代码项关闭 - fixture 与 smoke 执行 [App Manager roadmap](https://github.com/kindred-plugin-market/plugin-market/tree/main/extensions/app-manager/docs/roadmap.md) - **强制** - 状态：代码已修复/待验收
- [§6/§9] `src/features/quick-launch/` - 缺 macOS/Windows 启动 smoke 和 500/2000 应用性能证据；2000 项虚拟化单元测试已入 `test:critical` - 性能数据执行 [Quick Launch roadmap](https://github.com/kindred-plugin-market/plugin-market/tree/main/extensions/quick-launch/docs/roadmap.md) - **强制** - 状态：代码已修复/待验收
- [§5/§7/§9] `src/features/system-settings/`、`src-tauri/src/clean_space/` - 核心保护已实现，macOS 权限拒绝、read-after-write、受保护目录、timeout 和真实释放量未真机验收 - 执行 [R03](../roadmap/ROADMAP.md#r03-macos-system-settings-与-clean-space) - **强制** - 状态：代码已修复/待验收
- [§7/§9] `.github/workflows/ci-build.yml` - RC dry-run 入口与 Release 副作用 guard 已由 R05 落地；仍缺真实 updater 私钥三目标 run - 执行 [R05](../roadmap/ROADMAP.md#r05-updater供应链与-rc-流水线) dry-run - **强制** - 状态：部分修复/待验收
- [§9] 全局 UX - Playwright/axe 基建、viewport 矩阵与键盘用例已落地（`pnpm run test:e2e`）；截图 baseline 人工审查与屏幕阅读器 smoke 未执行 - 执行 [R07](../roadmap/ROADMAP.md#r07-ux可访问性与视觉回归) - **强制** - 状态：部分修复/待验收
- [§7/§9] 持久化与 updater - 持久化 schema 清单已建立（[persistence-schema.md](../reference/persistence-schema.md)），1.23.0 脱敏 fixture 与迁移幂等测试已入 `cargo test`；真机升级/回滚演练未执行 - 执行 [R06](../roadmap/ROADMAP.md#r06-1230-升级迁移与回滚) - **强制** - 状态：代码已修复/待验收
- [§7/§9] `src-tauri/tauri.conf.json` - `com.bench.app` 后缀警告已接受；D-011 要求 2.0 保留，不得直接改字符串 - **建议** - 状态：接受风险

未完成 R00-R08 前不得切换 2.0.0 版本；未完成目标平台行为测试前不得把对应能力标记为发布对等。

## 记录格式

```markdown
- [§X] `文件路径:行号` - 问题 - 修改建议 - **强制/建议** - 状态：已报告/已修复/不修复
```

审计前先读本文件；修复后更新或删除对应风险，不追加无追踪价值的流水账。
