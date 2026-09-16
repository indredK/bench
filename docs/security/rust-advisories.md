# Rust 依赖风险接受记录（SEC01）

> 维护规则：本文件记录"无法立即升级、以书面条件接受"的 Rust 依赖告警。
> 每条记录必须有：告警 ID、影响范围、当前处置、**接受期限（复查日期）**与
> **升级触发条件**。期限到期时安全 workflow 会提示复查；启用 Linux 发布前
> 必须把标有 Linux 前置条件的条目全部清零。

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

`cargo audit` 另报 7 条 unmaintained 警告（paste / proc-macro-error / unic-*），
均为构建期 proc-macro 或字符属性库，不进入发布二进制的运行时攻击面；随上游
（tauri/tauri-build）迁移统一处理，不逐条立记录。
