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
- [§7/§9] `src-tauri/src/net_probe/nat_behavior.rs:304` - SRV 目标异步解析后全局优先 IPv4，可能让低优先级服务越过高优先级 IPv6 服务 - 改为保留 SRV 顺序并在各目标内优先 IPv4，补充顺序/去重回归测试 - **强制** - 状态：已修复；macOS 真机加载新构建并确认 NAT 面板与输入状态，SRV 排序回归测试通过
- [§3/§5/§9] `src/features/network-probe/`、`src-tauri/src/net_probe/session.rs` - 取消 IPC 失败会遗留 pending 会话标记；后端接受任意 session ID 会令取消集合随无效请求无限增长；长任务取消中没有禁用与进行中文案；网络服务刷新、节点注册/移除、系统设置打开可重复触发，Fix 面板缺加载/空列表恢复反馈 - 限制取消到活动 RAII 会话并自动清理；清理匹配前端标记以允许重试；共享取消/设置进行中组件；为服务加载和节点变更加防重入、反馈、空态与刷新恢复 - **强制** - 状态：已修复；新增注册表、全量 DTO、Advisor 与降级能力测试；P0-1 已经专用单测、全量前端测试与 `lint:fe` 通过，并在 macOS 真机确认体检运行/取消、Fix 面板读取并刷新到 Wi-Fi 服务、系统网络设置可打开；P0-2 本地门禁、macOS 真机取消后重试与 GitHub Actions #689 全部必需检查均通过
- [§7/§9] `src-tauri/src/net_probe/ports.rs` - nmap 在同步探测和扫描路径中没有统一的超时、取消与输出上限；nmap 与 TCP 回退分属不同会话，取消竞态可能启动下一条扫描 - 共用活动扫描会话，使用 `subprocess.rs` 的有界输出、35 秒总时限与进程组终止/回收，取消作为终态返回且不启动 TCP 回退 - **强制** - 状态：已修复；Rust 取消回归测试通过；macOS 真机在本机端口扫描界面连续取消两次，均显示已取消且无残留子进程；`lint:fe`、`test:critical`、Clippy、`check:be-cfg` 全通过；GitHub Actions #691 的 CI aggregate 与 Windows/macOS Rust、前端构建、E2E、静态守卫、Node 兼容检查均通过
- [§4] `src/features/network-probe/components/PortScanPanel.tsx` - 面板直接显示后端提供的英文端口扫描 `message`，中文界面取消后仍展示英文；降级和 nmap 完成态也绕过 locale - 按 `cancelled` 与扫描 `mode` 选择前端中英文资源，保持后端 `message` 不作为用户文案 - **强制** - 状态：中英文组件回归 4 项、`lint:fe` 与 `test:critical` 通过；macOS 真机取消与 TCP connect 完成态均显示正确中文；debug `.app` 签名校验通过（`build:debug` 仅因缺少 `TAURI_SIGNING_PRIVATE_KEY` 未生成 updater manifest）；GitHub Actions 待验证

未完成 R00-R08 前不得切换 2.0.0 版本；未完成目标平台行为测试前不得把对应能力标记为发布对等。

## 记录格式

```markdown
- [§X] `文件路径:行号` - 问题 - 修改建议 - **强制/建议** - 状态：已报告/已修复/不修复
```

审计前先读本文件；修复后更新或删除对应风险，不追加无追踪价值的流水账。
