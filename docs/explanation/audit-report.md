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

- [前端 / §3.3 / UX] `src/features/network-probe/services/network-probe.use-cases.ts`、`src/features/network-probe/page.tsx`、`src/features/network-probe/components/PackInstallDialog.tsx` — 能力包列表刷新原先没有 single-flight 或加载反馈，慢响应期间刷新、安装/卸载入口可重复操作。已增加用例层 single-flight、刷新中状态和冲突操作禁用；回归覆盖并发请求与后续重试，`test:critical` 297 项、`lint:fe` 和 macOS 隔离 QA（人为延迟 1.5 秒，真机确认刷新与冲突操作禁用）通过；PR #154 提交 `77b31f0d` 的 GitHub checks 全部通过 — **中** — 状态：代码、本地、真机与远程 CI 已验证
- [前端 / §3.3 / §5] `src/features/network-probe/services/network-probe.use-cases.ts`、`src/features/network-probe/components/MultiNodePanel.tsx` — Agent 注册表 JSON 损坏时，启动用单个 `Promise.all` 丢弃已成功的本机能力、默认值和能力包；节点面板把读取失败误报为空列表。改为资源独立结算、保留部分成功、显式错误与重试；添加解析失败回归测试，`test:critical` 289 项、`lint:fe` 通过，macOS 隔离 QA bundle 真机确认本机数据仍显示且节点错误/重试明确 — **强制 / High** — 状态：代码、本地、真机已验证；PR #154 提交 `8c225d86` 的 GitHub CI 与 Security Scan 已通过
- [前端 / UX] `src/features/network-probe/components/MultiNodePanel.tsx` — 节点刷新期间按钮显示“刷新中”但仍可点击，而 use-case 会直接忽略重复请求，形成无反馈点击。现与 loading 状态同步禁用并补充回归测试；远程检查已随 PR #154 的 `e88e0f07` 全部通过。真机已验证节点面板和整体交互，刷新响应过快，瞬态禁用由回归测试覆盖 — **低** — 状态：代码、远程 CI 已验证
- [前端 / §3.3 / UX] `src/features/network-probe/components/SpeedPanel.tsx` — 测速失败后的 30 秒冷却 interval 到期后没有停止，导致页面持续每 500ms 重渲染。现到期清理 interval，并补回归测试；`lint:fe`、`test:critical`（55 文件 / 298 项）、Prettier、`build:fe` 通过；隔离 macOS QA bundle 仅请求 `127.0.0.1:9`，真机确认倒计时到期恢复重试且诊断计数连续 2.2 秒不变 — **低** — 状态：代码、本地与 macOS 真机已验证
- [后端 + 前端 / §3.3 / UX] `src-tauri/src/net_probe/session.rs`、`src-tauri/src/net_probe/speed.rs`、`src/features/network-probe/services/network-probe.use-cases.ts` — **Risk:** 取消测速只记录标记，reqwest 的请求发送或下载响应体读取仍可能等待到 45 秒超时，界面持续 loading 并阻止重跑。**Severity:** 中。**Refactor:** 测速会话使用 Tokio `watch`；HTTP 请求、响应体读取和阶段等待均以 `select!` 响应取消，并由 RAII 清理会话；前端回归覆盖取消后清除 loading/冷却并立即重试。**Philosophy:** 取消信号与每个可能阻塞的 await 同步竞争，让取消动作直接结束正在进行的 I/O 生命周期。`test:critical` 299 项、`test:be` 642 项（1 项跳过）、`clippy:be`、`lint:fe` 通过；隔离 macOS loopback QA 连续两次验证取消、立即重跑与连接关闭 — 状态：代码、本地、真机与 PR #154 提交 `92562ea7` 的远程 CI 已验证
- [后端 + 前端 / §3.3 / UX] `src-tauri/src/net_probe/speed.rs`、`src/features/network-probe/services/network-probe.use-cases.ts`、`src/features/network-probe/components/SpeedPanel.tsx` — **Risk:** `ok` 原先把 ping 样本也视为测速成功；当下载和上传都超时/失败但 ping 成功时，不进入失败冷却，UI 还会遗漏带宽失败。**Severity: Medium.** **Refactor:** 成功判定改为至少有一个带宽方向样本；两方向都缺失时冷却，单方向缺失时展示部分结果。**Philosophy:** 状态直接对应用户要测的上下行带宽，避免可达性 ping 掩盖测速失败。`test:critical` 303 项、`test:be` 643 项（1 项跳过）、`clippy:be`、`lint:fe`、cfg 检查、前端构建通过；隔离 macOS loopback QA 验证 ping 成功、下载实际 45s 超时、上传失败、冷却到期重试及取消不冷却 — 状态：代码、本地与真机已验证；PR #154 提交 `81d1787c` 的全部远程检查已通过
- [前端 / §4 i18n / UX] `src/features/network-probe/components/SpeedPanel.tsx`、`src/i18n/locales/{zh,en}.json` — **Risk:** 中文界面显示内置测速源的英文模板名，并直接显示后端英文失败 message，造成语言混杂与重复提示。**Severity: Low.** **Refactor:** 内置源名称映射到双语 locale；来源不可用与部分成功使用本地化状态文案，不渲染后端未本地化文本。**Philosophy:** 用户可见状态由界面语言统一呈现；自定义来源仍保留来源自身命名。回归用例覆盖内置源名、失败及部分结果；macOS QA 真机确认中文来源下拉与选中项显示，失败/部分状态由回归测试覆盖 — 状态：代码、本地与真机已验证；PR #154 提交 `81d1787c` 的全部远程检查已通过
- [§3.3/§5/§7.2] `src-tauri/src/net_probe/agent.rs` — 2026-10-22 复查发现：登记表读-改-写无锁且直接 `fs::write`，并发 add/remove 可丢更新或留下截断 JSON；WSS 被输入校验接受但健康检查仍走 HTTP `reqwest`；节点读取错误被 `unwrap_or_default()` 折叠为空列表；前端写操作无 single-flight，添加后再拉列表可丢失健康状态；列表刷新曾将所有 Agent 固定标为不可达。已改为原子串行写、WSS Upgrade 健康检查、错误向 UI 传播、revision 防陈旧响应、有界并发重查、稳定顺序及双语类型/状态反馈；Rust/前端门禁通过，隔离 macOS QA bundle 已验证 BasicView 与公开 WSS 握手/刷新；PR #154 的 `e88e0f07` 全部远程检查通过 — **强制** — 状态：代码、macOS 与远程 CI 已验证
- [§6/§7.4/§5] `src-tauri/src/system_settings/network.rs`、`src-tauri/src/net_probe/summary.rs`、`src/features/network-probe/components/OverviewPanel.tsx` — macOS 15.4+ 已移除私有 `airport` 工具；两个入口改用共享 CoreWLAN helper。真机确认系统未返回 SSID、但返回信号与信道且没有权限弹窗；此前概览只渲染 SSID，导致可用信号被显示为破折号，现改为 SSID 缺失时显示 dBm 且隔离 QA bundle 已真机显示 `-60 dBm`。frequency/security 暂无 CoreWLAN 映射；SSID 正向路径仍待系统允许读取的环境验证；PR #154 的 `e88e0f07` 全部远程检查通过 — **中** — 状态：macOS 与远程 CI 已验证，SSID 正向路径待验收

- [§7/§8/§4] `src/features/photo-triage/`、`src-tauri/src/photo_triage/` - 2026-09-03 复查发现并已修复：11 处 IPC 路径 `lock().unwrap()`（Mutex 中毒回归）、阻塞 I/O 未 `spawn_blocking`（7 命令）、sips/ffmpeg/qlmanage 无超时未复用 `subprocess.rs`、`prune` 源目录不可达时静默清除引用、`move_items` 部分失败不回滚、`ConfirmSheet` 硬编码中文插值、`window.confirm` 原生弹窗、文档注册三缺口（modules/README 索引、check-docs 豁免、D-020 决策）与持久化治理（config.json schema v1 + manifest 256MB 上限 + persistence-schema 登记） - 均已修复；`trash/restore/move/prune` 补 5 个 Rust 行为测试待验证链执行 - **强制** - 状态：代码已修复/待验证
- [§3/§5/§6/§9] `src/features/account-manager/` - 缺区域 error/retry 与大文件分层；Keyring/WebView/Deep Link 双平台行为未验收 - 区域 error/retry、分层拆分与错误统一已由 R01 关闭；真机部分执行 [R04](../roadmap/ROADMAP.md#r04-account-manager-双平台真机矩阵) - **强制** - 状态：代码已修复/待验收
- [§3.3/§7/§8] `src-tauri/src/account_manager/` - 同源 Web Storage/IndexedDB、canonical Cookie expiry、single-flight、Deep Link inbox 和 capability 已实现；partition key 不可用且目标平台行为未验收 - 保持 partitioned Cookie fail-closed，执行 [R04](../roadmap/ROADMAP.md#r04-account-manager-双平台真机矩阵) - **强制** - 状态：代码已修复/待验收
- [§7.4/§9] `src-tauri/src/app_manager/` - 缺双平台 inventory fixture、启动/更新/卸载 smoke 和 CI runner；快照缓存契约（损坏/上限/schema/取消）已由 R02 代码项关闭 - fixture 与 smoke 执行 [App Manager roadmap](https://github.com/kindred-plugin-market/plugin-market/tree/main/extensions/app-manager/docs/roadmap.md) - **强制** - 状态：代码已修复/待验收
- [§6/§9] `src/features/quick-launch/` - 缺 macOS/Windows 启动 smoke 和 500/2000 应用性能证据；2000 项虚拟化单元测试已入 `test:critical` - 性能数据执行 [Quick Launch roadmap](https://github.com/kindred-plugin-market/plugin-market/tree/main/extensions/quick-launch/docs/roadmap.md) - **强制** - 状态：代码已修复/待验收
- [§5/§7/§9] `src/features/system-settings/`、`src-tauri/src/clean_space/` - 核心保护已实现，macOS 权限拒绝、read-after-write、受保护目录、timeout 和真实释放量未真机验收 - 执行 [R03](../roadmap/ROADMAP.md#r03-macos-system-settings-与-clean-space) - **强制** - 状态：代码已修复/待验收
- [后端 / §3.3 / UX] `src-tauri/src/net_probe/globalping.rs` — Globalping 轮询曾只把 `finished` 视为顶层终态、吞掉非 429 HTTP/网络错误且没有整轮期限，部分失败响应也可能被标成成功。现按官方状态契约只在 `in-progress` 时继续，每 700ms 轮询、总期限 45 秒；终态失败、请求/解析错误与超时作为远程失败行返回，并保留本机及部分远程结果。4 个本地 HTTP 回归覆盖终态、HTTP 错误、截止时间和结果保留；macOS 隔离 QA 对 `example.com` 真机请求收到本机和 3 个 Globalping 区域结果（4 条答案，4.298 秒）— **强制 / Medium** — 状态：已修复；本地回归与 macOS 真机复验通过
- [前端 + 后端 / §3.3 / UX] `src/features/network-probe/hooks/useSitesMonitoring.ts`、`src/features/network-probe/services/network-probe.use-cases.ts` — **Risk:** 离开站点监测面板时，若后端尚未发布 scan-session ID，前端只停止定时器而不会取消当前站点探测，可能让本轮在离页后继续发起网络请求。**Severity: Medium.** **Refactor:** 面板卸载时对进行中的轮次发出取消意图；用例层按探测类型暂存意图，并在对应会话 ID 到达时取消该会话，tracker 结束时清理意图。回归覆盖晚到 session 事件、已完成轮次卸载及早期结束后取消不串入下一轮。macOS 隔离 QA 真机启动站点监测、离开面板后命令日志记录 `cancelScan()`，返回后显示本轮 `cancelled` 且按钮恢复；`lint:fe`、`test:critical` 与隔离 QA app 构建通过 — **建议 / Medium** — 状态：本地与 macOS 真机已验证；PR #154 本次提交远程检查待完成
- [前端 / §4 / UX] `src/features/network-probe/components/MultiNodePanel.tsx` — DNS 对比结果状态曾固定为 `OK` / `FAIL`，本机结果标题固定为 “This Mac”。现结果状态与本机名称使用当前语言，并为可达状态与失败结果保留本地化文案。组件回归及 macOS QA 中英文切换真机复验通过（中文“本机 / 成功”，英文“This device / OK”）— **建议 / Low** — 状态：已修复；本地回归与 macOS 真机复验通过
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
