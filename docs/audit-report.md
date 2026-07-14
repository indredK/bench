# Bench 审计记录

本文件只保留审计豁免、仍有效的风险和最近复核结论。已修复问题的逐条历史由 Git 保留；可复用规则已经进入 [coding-standards.md](./coding-standards.md) 和 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 不计违规决策

后续审计不得重复报告以下已评估模式，除非前提发生变化：

1. `src/data/phone.ts` 保留中文原始数据，展示层通过 `PHONE_*_KEYS` 和 `t()` 翻译；新增数据必须同步映射。
2. `src/features/hardware/` 当前无需空的 `hooks/`、`services/`；只有出现真实编排或适配职责时再补。
3. 各模块 `columns.tsx` 字段和交互差异大，不为了形式统一抽取。
4. `lib/tauri/commands/*` 已是纯 IPC 适配时，不增加只做 re-export 的 feature repository。
5. 页面级本地状态无需强制进入 Zustand store；跨组件/页面共享后再上提。
6. `src-tauri/src/lib.rs` 启动链末端的 `.expect()` 可保留；IPC 和可降级初始化路径仍禁止 panic。
7. 子组件用 selector 读取稳定 store action 可以保留；禁止无 selector 整 store 订阅进入 hook 依赖。
8. `dev-toolbox` 是聚合型 Tab 容器，`updater` 是全局对话框模块，不强制拥有导航 feature 的完整文件结构。

## 当前发布风险

- [§7.4/§9] `src-tauri/src/app_manager/` - macOS/Windows 核心实现已整改，但目标平台 fixture、真机 smoke 和 CI 行为测试未完成 - 按 [App Manager roadmap](./modules/app-manager/roadmap.md) 验收 - **强制** - 状态：待验收
- [§6/§9] `src/features/quick-launch/` - 共享 inventory 与虚拟列表已落地，但 macOS/Windows 启动 smoke 和 500+ 应用性能验收未完成 - 按 [Quick Launch roadmap](./modules/quick-launch/roadmap.md) 验收 - **强制** - 状态：待验收
- [§3.3/§7/§8] `src-tauri/src/account_manager/` - Session canonical map/v5 migration、恢复注入+probe、退出落盘、账号级 single-flight、有界瞬态重试、真实 ProbeStrategy 和 RefreshReport 已整改；per-origin storage、Cookie partition key 与目标平台 WebView 行为仍未完成 - 按 [Account Manager roadmap](./modules/account-manager/roadmap.md) Phase 1/6 实施并验收 - **强制** - 状态：部分修复
- [§7/§8] `src-tauri/src/account_manager/{commands,proxy,webview}.rs` - 一次性 ticket、精确 callback/state/origin 和自定义 scheme 注册已整改；App 根 Deep Link 队列与 Windows single-instance 仍缺 - 按 [Account Manager roadmap](./modules/account-manager/roadmap.md) Phase 2 实施 - **强制** - 状态：部分修复
- [§3.3/§7] `src-tauri/src/account_manager/{crypto,state,storage}.rs` - Keyring 和 store mutation 已接入跨进程锁及 reload-before-save；Dev/Prod/Windows 并发行为仍待验收 - 按 [Account Manager roadmap](./modules/account-manager/roadmap.md) Phase 6 验收 - **强制** - 状态：待验收
- [§5/§6/§9] `src/features/account-manager/` - 三栏 skeleton 和密码明文 TTL 已整改；窄屏详情 Sheet、500+ 虚拟化、删除 partial 和双平台行为测试仍缺 - 按 [Account Manager roadmap](./modules/account-manager/roadmap.md) 实施 - **强制** - 状态：部分修复
- [§5/§7/§9] `src/features/system-settings/` - 读取失败已显示 error/unknown，write-only 设置不再伪装为 off；Finder/网络/截图/系统开关仍缺后端 snapshot 与完整 read-after-write - 按 [System Settings roadmap](./modules/system-settings/roadmap.md) 实施 - **强制** - 状态：部分修复
- [§7/§9] `.github/workflows/ci-build.yml` - tag job 已接入 OS/updater 双签名、目标产物、checksum 和延迟发布门禁，但尚无正式 Secrets run、三平台签名 RC 和安装/升级 smoke - 按 [2.0.0 发布门禁 F07-F09](./roadmap/2.0.0-release-readiness.md#12-f07updater签名与供应链) 验收 - **强制** - 状态：待验收
- [§7/§9] `src-tauri/tauri.conf.json` - bundle identifier `com.bench.app` 以 `.app` 结尾，Tauri 2.11.4 构建警告与 macOS bundle extension 冲突；修改会影响 Keychain/数据命名空间/升级识别 - F09 前提交迁移决策并用 1.23.0 -> RC 验证，禁止直接改字符串 - **强制** - 状态：已报告

未完成目标平台行为测试前，不得把 App Manager 或 Quick Launch 标记为 macOS/Windows 发布对等。

Account Manager 的 macOS/Windows 状态均为 ⚠️；A-01 至 A-15 的 P0/P1 未关闭前不得标记生产就绪。

## 最近复核

### 2026-07-14 - 2.0.0 发布准备

- 平台导航和根路由统一 gate；Clean Space/Hardware/System Settings 的 macOS-only contract 有 macOS/Windows/browser fixture。
- Account Manager 首载三栏 skeleton 和密码 30 秒 TTL 已落地；System Settings/Preferences 读取失败不再显示默认 false。
- Updater 自动检查、退避、省流/离线策略、cancelling、受限 release notes 和真实进度语义已进入关键测试。
- release workflow 正式产物收集 fail-closed，在 GitHub Release 变更前验证 OS 签名、Tauri updater 签名、三目标 manifest、产物矩阵和 SHA-256；macOS 14.0、Windows 禁止降级和固定 WiX upgrade code 已写入配置。
- 本地通过 `lint:fe`、`test:critical`（24 files / 84 tests）、`test:fe`（34 files / 142 tests）、`test:be`（266 tests）、Clippy 和前端生产构建。Tauri debug 已生成 app/DMG/updater tar，但没有正式 updater 私钥，未生成 `.sig`，不计为签名 RC。
- 仍未发布就绪：Account Manager 剩余 Phase、Clean Space Rust 测试、App/Quick Launch 双平台 smoke、正式证书 Secrets/tag run、identifier 迁移决策、1.23.0 升级/回滚和 UX 视觉/键盘矩阵。

### 2026-07-14 - Account Manager GitHub 实现对照

- 参考 Moka、reqwest-middleware、Spider、cookie_store、oauth2-rs、Playwright、Tauri plugins 和 keyring-rs 的固定 commit；License、源码位置、采纳与拒绝理由见 [专题审计 §10](./modules/account-manager/audit-and-upgrade-2026-07-13.md#10-github-参考实现与采纳矩阵)。
- 后端新增账号级 single-flight；并发刷新同一账号只运行一次 probe，follower 共享结果，leader 取消会唤醒 waiter 并清理 registry。
- HTTP probe 只对瞬态状态/connect/timeout 做最多 3 次、10 秒总预算的 full-jitter 退避；服从短 `Retry-After`，过长时停止重试；请求沿用 Session User-Agent。
- Cookie HTTP 注入按 RFC 6265 path boundary 匹配，缺少 partition key 时拒绝发送 partitioned Cookie；probe URL 只允许无嵌入凭据的 HTTP(S)。
- 本地通过 `pnpm run lint:fe`、`pnpm run test:critical`（12 files / 34 tests）、`cargo test account_manager`（58 tests）、`cargo clippy -- -D warnings`。本机未安装 Windows Rust target，且 Windows/macOS WebView、Keyring、Deep Link 真机行为尚未验收。

### 2026-07-13 - Account Manager

- 结论：REQUEST CHANGES，macOS/Windows 均未达到生产就绪。
- 核心后端已整改 Session/Keyring/store、Auth Proxy ticket/callback/state/origin、批量 partial、探针策略、代理 fail-closed、删除引用、导入限额和剪贴板 TTL。
- 本地 `pnpm exec vitest run src/features/account-manager`（2 files / 8 tests）与 `cargo test account_manager`（49 tests）通过；尚未执行 Windows 行为测试。
- 剩余阻断：Deep Link 根队列/single-instance、可移植加密导出、删除 partial report、前端密码内存 TTL、平台能力/真机 smoke 和 UX。
- 详细位置、重构代码、实施顺序和目标平台矩阵见 [专题审计](./modules/account-manager/audit-and-upgrade-2026-07-13.md)。

### 2026-07-13 - Quick Launch / App Manager

- [§7/§8] `src-tauri/src/app_manager/` - 稳定 appId、LaunchTarget、SourceEvidence、revision、canonical update cache、平台 provider 和更新器安全边界已落地 - **强制** - 状态：已修复
- [§3.3/§5] `src/features/quick-launch/`、`src/shared/app-inventory/` - single-flight、取消、partial/stale 反馈、skeleton、虚拟网格、按需图标和版本化分类已落地 - **强制** - 状态：已修复
- [§6] `SoftwareUpdateView.tsx` - warning/error 曾占满主内容区并挤压更新列表；已改为纵向 flex，并补 warning + update 同屏测试 - **强制** - 状态：已修复
- [§4] `recommended-apps.ts` - 名称 heuristic 仅用于展示，不再授予破坏性 installedAppId - **强制** - 状态：已修复

本地复核已通过 `pnpm run lint:fe`、`pnpm run test:critical`、`cargo test app_manager`、`cargo clippy -- -D warnings` 和 `git diff --check`。这不替代 Windows/macOS 真机验收。

### 2026-07-06 - Phase 1-6

全量规范审计发现的问题均已修复或记录为上方豁免；历史逐条清单不再维护。后续只重查发生代码变化的领域，并将新发现追加到本文件。

## 记录规则

新记录格式：

```markdown
- [§X] `文件路径:行号` - 问题 - 修改建议 - **强制/建议** - 状态：已报告/已修复/不修复
```

审计前先读“当前发布风险”和“不计违规决策”；修复后更新状态，已稳定沉淀到规范且无追踪价值的历史记录可删除。
