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
- [§9] `src/features/account-manager/` - Session/Probe Rust 行为测试和大账号列表虚拟化仍缺 - 按 [Account Manager roadmap](./modules/account-manager/roadmap.md) 实施 - **建议** - 状态：Backlog

未完成目标平台行为测试前，不得把 App Manager 或 Quick Launch 标记为 macOS/Windows 发布对等。

## 最近复核

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
