# Rust 依赖风险接受记录（SEC01）

> 维护规则：本文件记录"无法立即升级、以书面条件接受"的 Rust 依赖告警。
> 每条记录必须有：告警 ID、影响范围、当前处置、**接受期限（复查日期）**与
> **升级触发条件**。期限到期时安全 workflow 会提示复查；启用 Linux 发布前
> 必须把标有 Linux 前置条件的条目全部清零。

## 2026-10-22 扫描基线

- `cargo audit` 当前有 **0 条 vulnerability**。`quinn-proto`、`rustls`、
  `rustls-webpki`、`webpki-root-certs` 已更新到对应修复版本。
- `zip` 的 RUSTSEC-2026-0367/0368/0369 已通过 `zip 9.0.5` 修复。Tauri 官方
  updater 的 crates.io 版本仍依赖 `zip 4` 并调用 `ZipArchive::extract()`；宿主
  因此固定使用官方 `plugins-workspace` v2 源码 revision
  `df594206ce03f67e25da04283dea023815a45058`，该 revision 使用 `zip 9`。
  Bench 自己的 app-manager 与 extension-center 解压路径也拒绝 symlink，并将
  ZIP 权限限制为 `0o755` 掩码。
- 仍有 1 条 unsound（glib，见 SEC01）和 6 条 unmaintained 提示；安全 workflow
  会继续列出它们，不把 warning 误报成漏洞清零。

## 2026-10-23 扫描复核

- PR #154 的首次远程扫描发现新公告 RUSTSEC-2026-0385：`ctutils 0.4.2` 的常量时间
  mask 生成与 `u128` 比较存在问题，修复版本为 0.4.4。该 crate 经 `aes-gcm`、摘要/HMAC
  与通用哈希依赖进入 Bench。
- 已将 `src-tauri/Cargo.lock` 中 `ctutils` 精确升级到 0.4.4；依赖树确认所有路径均解析到
  修复版本。`cargo deny check` 随后发现 `arboard` 锁定了已 yanked 的 `clipboard-win 5.4.1`，
  已一并更新到兼容的 5.4.3。macOS 本机 `cargo audit` 漏洞数为 0、`cargo deny check` 通过；
  `pnpm run test:be` 为 643 项通过、1 项跳过，更新后的 macOS release app bundle 构建成功。
- 其余既有 7 条 allowed warnings（glib unsound 与 6 个 unmaintained crate）沿用现有处置；
  不计入漏洞数。yanked 依赖已清除。PR #154 提交 `81d1787c` 的 `Cargo Audit + Deny`
  与完整 GitHub checks 均通过；Windows/macOS Rust CI、前端、E2E、静态检查及 Node 24
  兼容性检查通过，发布构建按条件跳过。

## 2026-10-24 扫描复核

- PR #154 提交 `30379b32` 的 `cargo deny` 新发现 Tokio 1.53.1 命中 [RUSTSEC-2026-0386](https://github.com/RustSec/advisory-db/blob/main/crates/tokio/RUSTSEC-2026-0386.md)：`AsyncFd` 安全构造器允许仅实现 `AsRawFd` 的类型进入 I/O driver，存在 I/O safety / use-after-free 风险。该公告的修复范围为 Tokio `>=1.53.3`；已只将 `src-tauri/Cargo.lock` 中 Tokio 更新到 1.53.3，Cargo.toml 的 semver 约束无需改变。
- 更新后 `cargo deny check` 通过；`cargo audit` 无 vulnerability，仍报告 7 条既有 allowed warning（glib unsound 与 unmaintained crate）；`clippy:be` 通过、Rust 后端 647 项通过（1 项跳过）。最终最小锁文件构建的隔离 macOS QA app 在真机启动并完成 Tauri/Rust 初始化；后续复验已从该 bundle 打开 Network Probe 与站点延迟面板。PR #154 提交 `46d9b046` 的 Cargo Audit + Deny、macOS/Windows Rust、前端、E2E、静态与 Node 24 检查全部通过，发布构建按条件跳过。

## SEC01 — glib 0.18.5（unsound）

| 字段           | 值                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 告警           | RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g                                                                                                                            |
| 类别           | unsound（cargo audit 归入 warning，非 vulnerability；GitHub 显示 medium alert）                                                                                    |
| 当前版本       | glib 0.18.5（修复版本 0.20.0）                                                                                                                                     |
| 依赖路径       | Linux GTK/WebKit/Tauri 原生栈（`gtk` → `gdk` → `glib`）                                                                                                            |
| 已交付平台影响 | **无** —— 正式发布仅 macOS（aarch64/x86_64 DMG + updater），Windows 发布尚未恢复（T29 独立里程碑），无 Linux 产物。macOS 链路不经过 gtk/glib。                     |
| 处置           | 有期限风险接受（本记录）                                                                                                                                           |
| 接受条件       | 1) 保持"仅 macOS 正式发布"；2) 启用任何 Linux 打包/发布前**必须**完成 glib 0.20 升级并验证 GTK/Tauri 链；3) 若 GitHub 把该告警升级为 vulnerability，本接受立即失效 |
| 复查日期       | 2027-03-16（每 6 个月复查一次升级可行性：跟踪 gtk-rs 0.20 迁移与 tauri 的 GTK 依赖矩阵）                                                                           |
| 升级路径       | glib 0.18 → 0.20 与 gtk-rs 生态 major 迁移绑定，需与 `gtk`/`gdk`/`webkit2gtk` 同批评估（audit md §5 已标注"不能只改 lockfile"）；独立批次，不与常规 CI 修复混批    |
| 记录时间       | 2026-09-16                                                                                                                                                         |

## 附带记录 — unmaintained 提示（informational）

`cargo audit` 另报 6 条 unmaintained 警告：`paste`、`proc-macro-error`、
`unsafe-libyaml`、`zbus_names`、`zvariant`、`zvariant_derive`。其中 proc-macro
与 Linux GTK/D-Bus 栈按上游迁移统一处理；`unsafe-libyaml` 属于现存 YAML 解析
路径，后续评估迁移到维护中的兼容实现，不把它描述成仅构建期依赖。
