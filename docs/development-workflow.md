# Bench 开发流程

> **执行手册** — 日常怎么开发、合码、回写文档。  
> 规范见 [coding-standards.md](./coding-standards.md)；发布主题见 [roadmap/release-themes.md](./roadmap/release-themes.md)；方法论背景见 [product-iteration-reference.md](./product-iteration-reference.md)（仅供参考）。  
> **不在此维护版本号或当前冲刺状态** — 以 `release-themes.md` 与各模块 `roadmap.md` 为准。

---

## 1. 流程总览

```
选主题 → release-themes 定目标与验收
    → modules/<id>/roadmap.md 拆 checkbox
    → （大改）补设计稿 / short RFC
    → 编码（features + src-tauri）
    → lint + test:critical + clippy
    → PR / 合码 + 回写 roadmap / bugs
    → 发版（CI + CHANGELOG）
    → Retro：文档是否过时？
```

**双轨文档：**

| 轨道 | 文件 | 职责 |
|------|------|------|
| 战略 | `roadmap/release-themes.md` | 当前发布主题、选品、验收标准 |
| 战术 | `modules/<id>/roadmap.md` | 模块六维评估、checkbox backlog |

---

## 2. 开始一项工作前

1. 打开 [release-themes.md](./roadmap/release-themes.md)，确认当前主题（例如 Polish & Trust / Developer Daily Loop）。
2. 打开对应 [modules/<id>/roadmap.md](./modules/README.md)，找到或新增 checkbox。
3. 若涉及 Account Manager Session、跨平台、大范围重构 → 先读/写模块内 [design.md](./modules/account-manager/design.md)，必要时 short RFC。
4. System Settings 新开关 → 参照 [design.md §8 键位映射](./modules/system-settings/design.md) 与 [roadmap.md](./modules/system-settings/roadmap.md) 候选清单，写入 roadmap 后再写代码。

**新增 feature 模块时同步创建：**

- `src/features/<id>/`（page、feature、store、hooks、services…）
- `docs/modules/<id>/README.md` + `roadmap.md`（见 coding-standards §11）

---

## 3. 编码约定（摘要）

完整规则见 [coding-standards.md](./coding-standards.md)。开发时优先记住：

| 层级 | 放什么 |
|------|--------|
| 组件 | 展示 + 用户交互，不直调 Tauri |
| controller / hooks | 编排、重入保护（`useGuardedAsync`） |
| use-cases | 业务规则 |
| repository / `lib/tauri/commands` | IPC、存储 |
| store | 状态与简单动作 |

**必须：** 文案走 i18n；危险操作用 `DestructiveConfirmDialog`；异步可重复触发处加重入保护；平台能力用 `canUseTauriWindow()` 等边界判断。

---

## 4. 本地开发与自检

```bash
npm install          # 或 npm run setup（含 hooks）
npm run dev          # Tauri 开发模式

npm run lint:fe      # i18n guard + tsc
npm run test:critical
cd src-tauri && cargo clippy -- -D warnings
```

发版前可选全量：

```bash
npm run verify       # test:fe + test:be + build:fe + build:debug
```

**合码前对照 release-themes 验收项**（随主题变化，以文件为准），常见包括：

- 中英文切换无漏翻
- 杀端口 / 删数据 / 撤销授权等有后果说明
- 连点启动、提交、刷新无重复副作用

---

## 5. 提交与合码

- **Commit**：Conventional Commits（`feat:` / `fix:` / `docs:` …），hook 会校验。
- **PR**：说明对应模块与 roadmap 项；合码后在该模块 `roadmap.md` 打 ✅。
- **Bug 修复**：更新或关闭 `modules/<id>/bugs.md`（若有）。
- **不要**只在 `product-iteration-reference.md` 里记进度——它不承载 checkbox。

---

## 6. 发版

- CI：[`.github/workflows/ci-build.yml`](./../.github/workflows/ci-build.yml) 四平台构建。
- 版本与 CHANGELOG：release-please 自动生成 [CHANGELOG.md](../CHANGELOG.md)（commit 风格）。
- 用户向发布说明（可选）：从 release-themes 摘 3–5 条可读改进（尚未制度化，见 product-iteration-reference §2.2）。

---

## 7. 改动类型速查

| 类型 | 怎么做 |
|------|--------|
| 小 bug / 文案 / 重入 | 改代码 → 更新 bugs 或 roadmap |
| 模块功能增强 | roadmap 已有项 → 实现 → 打勾 |
| Settings 新开关 | candidates 选品 → roadmap → 实现 |
| Account Manager 大改 | 设计稿 / RFC → 优先补引擎测试再改 |
| 架构债（分层、repository） | 对齐 App Manager / Account Manager 标杆模式 |

---

## 8. 当前基建认知（非完美清单）

**够用的底座：** 技术栈、IPC 契约、规范文档、模块文档目录、托盘/危险确认/Dev Toolbox IA、CI 发版。

**仍须补强的基建（开发时心里有数）：**

- Session 迁移与状态 UX（Account Manager）
- 约半数模块缺 feature 测试；Session/Probe Rust 引擎测试弱
- Issue 与 roadmap 未自动联动
- 部分模块技术债（Quick Launch `scenes.ts`、Dev Toolbox 单文件等）
- macOS 以外能力需 DesktopOnly / 平台矩阵诚实标注

细节与演进方向见 [product-iteration-reference.md](./product-iteration-reference.md) §2.2、§6。

---

## 9. 相关文档

| 文档 | 用途 |
|------|------|
| [coding-standards.md](./coding-standards.md) | 编码与文档目录（强制） |
| [roadmap/release-themes.md](./roadmap/release-themes.md) | 当前主题与验收（强制） |
| [modules/](./modules/README.md) | 各模块 roadmap / bugs / 设计 |
| [product-iteration-reference.md](./product-iteration-reference.md) | 方法论与未来方向（参考） |
| [README.md](./README.md) | 文档总索引 |
