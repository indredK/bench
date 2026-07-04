# bettertolive 项目参考

> 来源：`/Users/apple/Documents/github/bettertolive/`  
> 视角：样式设计与基建设计中可借鉴的模式（不含代码实现）  
> 日期：2026-07-05

---

## 一、样式设计

### 1. OKLCH 双主题令牌体系

`globals.css` 中 `:root` 与 `.dark` 完整对应，使用 OKLCH 色彩空间（如 `oklch(0.43 0.083 246)`），保证明暗模式色相一致、感知均匀。相比 HSL，OKLCH 在明暗切换时不会出现色相漂移。

### 2. Tailwind 4 `@theme inline` 映射

把 CSS 变量映射成 `--color-*` 语义令牌，Tailwind 类自动响应主题切换。所有颜色走 CSS 变量 + Tailwind 语义类，**禁止硬编码 hex/rgb**。

### 3. 半径系统化

`--radius` 单一基准值，派生 `sm/md/lg/xl/2xl/3xl/4xl` 七档（`calc(var(--radius) * 0.6)` 等），全站圆角比例一致。

### 4. 程序化消费令牌

单独定义 `--graph-palette-*`、`--graph-impact-*`、`--graph-weight-*`、`--tone-*`、`--splash-*` 等 JS 运行时读取的颜色变量，用于图谱/图表可视化着色，带 SSR fallback。

### 5. z-index 语义层级

`UI_LAYERS` 常量定义语义层级（header:20 / canvas:4 / dialogOverlay:140 / dialogContent:150 / floatingContent:160 / graphFullscreen:200），禁止 `z-[999]` 魔法数字。

### 6. 按钮 variant 收口

`default / outline / secondary / ghost / destructive / link` 固定 variant，调用处不允许 className 覆盖出新变体。

### 7. 字体自托管

`--font-sans: "Geist Variable"`，通过 `@fontsource-variable/geist` 自托管，不依赖 Google Fonts CDN。

### 8. 动画语义常量

`src/lib/app-motion.ts` 定义 `APP_FADE_TRANSITION` 等语义常量，全站复用，不硬编码魔法数字。位移/缩放/旋转必须有 `useReducedMotion` 降级。

---

## 二、基建设计

### 1. Pre-commit 双阶段门控

值得重点参考的"自动修复 + 严格检查"双阶段：

- **阶段一 auto-fix**：检测部分暂存（partially staged）会拒绝；按文件类型分组自动修复（JS/TS → eslint+prettier，CSS/MD → prettier，Rust → cargo fmt）；改动 Rust 自动跑 `generate:bindings` 刷新绑定；自动修复后若文件被改动，退出 1 让用户重新 review
- **阶段二 strict check**：依次跑 format:check → lint → typecheck → build:bundle → check:rust → generate:bindings，最后检查绑定文件是否有未提交变更

### 2. GitHub Actions 三套 workflow

| Workflow | 触发 | 内容 |
|----------|------|------|
| `ci.yml` | push main + PR | format:check → lint → typecheck → build → check:rust |
| `release.yml` | tag `v*` | 矩阵构建 macOS (aarch64+x86_64) / Ubuntu / Windows，tauri-action 发布 |
| `security.yml` | 每周一 02:00 | `cargo audit` + `cargo deny check advisories licenses bans sources` |

### 3. Dependabot 三生态并行

npm / cargo / github-actions 三个生态每周一升级，每个生态最多 10 个 PR。

### 4. Cargo Deny 安全扫描

`deny.toml` 配置 licenses 白名单（MIT / Apache-2.0 / BSD-2/3-Clause / ISC / Zlib）、`multiple-versions: "warn"`、`unknown-registry/git: "warn"`。

### 5. `prettier-plugin-tailwindcss`

Prettier 自动排序 Tailwind 类名，无需手动维护顺序。

### 6. Changesets 版本管理

`.changeset/config.json` + `CHANGELOG.md`，每次改动生成 changeset 文件，发布时自动汇总版本号 + changelog。

### 7. i18n 命名空间分层

- `common.actions.*` 收口通用动作（save/cancel/delete/edit 等 13 个）
- `common.validation.*` 放带参数的通用校验模板（required/maxLength/maxItems 等）
- `<模块>.<子层级>.<具体>` 按业务职责分（page/tabs/actions/fields/empty/toast/edit/validation/error/enum/filter/...）
- **禁止内联兜底**：`t("x", "中文")` 一律禁止，译文唯一存在于 locale JSON

### 8. Rust/TS 契约自动同步（Specta）

Rust 端 `#[derive(Type)]` + `#[specta::specta]`，改 command 后必须跑 `generate:bindings` 刷新 `src/bindings.ts`；前端不得手写/修改绑定文件，pre-commit 自动检测 Rust 改动并刷新。

### 9. 错误处理双轨

- **类型化错误**：Rust 端 `thiserror` enum，跨 IPC 序列化成带错误码的结构
- **command 永不 panic**：禁止 `unwrap/expect/越界`，错误一律 `Result` 返回
- **前端分工**：Query 的 `isError` 走组件内错误 UI + toast；渲染期意外错误才走 ErrorBoundary

### 10. 弹窗交互事实标准

固化 `*-edit-dialog` 统一约定：

- 关闭三通道（ESC/遮罩/X）不得无故关掉
- 页脚按钮构成与顺序：编辑态 `[删除 mr-auto | 取消 | 保存]`，新建态 `[取消 | 保存]`
- 删除统一走 `confirmUndoableDelete`（5 秒撤销窗口），不再用 `window.confirm`
- 提交期间 `disabled={isPending || !canSubmit}` + 文本切"保存中"
- 三项输入体验：回车提交、自动聚焦首字段、脏数据关闭二次确认

### 11. 状态归属与乐观更新

- 服务端数据归 Query；纯客户端 UI 状态归 zustand
- **禁止把服务端数据塞进 zustand 维护副本**
- 乐观更新默认不用，确需时必须完整四步（onMutate 快照+改缓存 → onError 回滚 → onSettled invalidate）

---

## 三、文档组织

### 1. standards 三件套

| 文档 | 职责 |
|------|------|
| `conventions.md` | **立规** — 提炼自现有代码的既成做法，分"硬约定"（违反即 bug）和"建议"（偏好/技术债） |
| `review-scope.md` | **收敛** — 三档分级（数据丢失/功能阻断 vs 影响真实决策 vs 风格偏好），明确"什么算 bug、何时停" |
| `module-organization.md` | **模板** — 定义"最小模块"和"完整模块"两套文件清单 |

### 2. Spec 驱动开发流水线

`specs/` 下每个功能一个目录，固定 6 阶段：初始化 → 需求 → 方案设计 → 方案评估（GO/NO-GO）→ 开发 → 质量门，三处人工检查点。

### 3. 审查报告模板

`docs/bugs/audit-*.md` 包含：工具检查结果表、已确认合规项重新验证、存量技术债对照、新增违规发现（按维度+档位）、已确认无需处理项、汇总表。

---

## 四、可参考引入优先级

| 优先级 | 项目 | 理由 |
|--------|------|------|
| 高 | z-index 语义层级 | 防止魔法数字，Bench 已有 dialog/overlay 层级问题 |
| 高 | 审查收敛三档分级 | 避免审计无限挖风格偏好，已在 audit-report.md 体现但未成规范 |
| 高 | `prettier-plugin-tailwindcss` | 零成本统一类名顺序 |
| 中 | OKLCH 色彩空间 | 明暗模式色相一致性更好，但迁移成本高 |
| 中 | Pre-commit 双阶段门控 | auto-fix 减少手动 format，但需要重构现有 hook |
| 中 | i18n common.actions 收口 | Bench 已有类似分层但未强制 |
| 中 | GitHub Actions security workflow | `cargo audit` + `cargo deny` 安全扫描 |
| 低 | Spec 驱动流水线 | 适合大功能，Bench 当前规模可能过重 |
| 低 | Changesets | Tauri 已有 release 流程，叠加 changesets 复杂度高 |
| 低 | Specta 自动绑定 | Bench 已有 contracts.ts 手动维护，迁移成本高 |
