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
pnpm install          # 或 pnpm run setup（含 hooks）
pnpm run dev          # Tauri 开发模式

pnpm run lint:fe      # i18n guard + tsc
pnpm run test:critical
cd src-tauri && cargo clippy -- -D warnings
```

发版前可选全量：

```bash
pnpm run verify       # test:fe + test:be + build:fe + build:debug
```

**合码前对照 release-themes 验收项**（随主题变化，以文件为准），常见包括：

- 中英文切换无漏翻
- 杀端口 / 删数据 / 撤销授权等有后果说明
- 连点启动、提交、刷新无重复副作用

---

## 5. 常见启动日志说明

`pnpm run dev` 启动时可能看到以下日志，**绝大多数是正常的**，不用慌。

| 日志 | 级别 | 说明 |
|------|------|------|
| `[deep-link] register bench-auth failed (non-fatal): UnsupportedPlatform` | ✅ 正常 | macOS 不支持运行时动态注册 URL scheme。打包后由 `Info.plist` 的 `CFBundleURLTypes` 生效；此调用仅服务于 Linux / Windows 开发环境，失败不影响任何功能。代码位置：`src-tauri/src/lib.rs` setup 阶段。 |
| `error messaging the mach port for IMKCFRunLoopWakeUpReliable` | ✅ 正常 | macOS 输入法（Input Method Kit）系统日志，WebKit / WKWebView 通病，与应用代码无关，不影响功能。 |
| `npm warn Unknown env config "manage-package-manager-versions"` | ⚠️ 可避免 | 说明某处还在调用 `npm`。项目统一使用 **pnpm**，出现此警告意味着脚本或配置中混用了 `npm run` / `npm ci` 等命令。排查方向：`tauri.conf.json` 的 `beforeDevCommand` / `beforeBuildCommand`、`package.json` scripts。 |
| `[account_manager] init failed: ...` | ❌ 需关注 | Account Manager 初始化失败，可能影响登录态恢复。见 `modules/account-manager/bugs.md`。 |
| `[deep-link] register bench-auth failed` 之外的 `failed` / `error` | ❌ 需关注 | 除上表明确标注"正常"的条目外，其他 `failed` / `error` 日志都建议排查。 |

> **快速判断原则**：日志里带 `non-fatal` 的 → 非致命，设计上就是允许失败的；纯系统框架日志（`IMKCFRunLoop`、`WebKit` 等）→ 忽略。

---

## 6. 提交与合码

- **Commit**：Conventional Commits（`feat:` / `fix:` / `docs:` …），hook 会校验。
- **PR**：说明对应模块与 roadmap 项；合码后在该模块 `roadmap.md` 打 ✅。
- **Bug 修复**：更新或关闭 `modules/<id>/bugs.md`（若有）。
- **不要**只在 `product-iteration-reference.md` 里记进度——它不承载 checkbox。

---

## 7. 发版

- CI：[`.github/workflows/ci-build.yml`](./../.github/workflows/ci-build.yml) 四平台构建。
- 版本与 CHANGELOG：release-please 自动生成 [CHANGELOG.md](../CHANGELOG.md)（commit 风格）。
- 用户向发布说明（可选）：从 release-themes 摘 3–5 条可读改进（尚未制度化，见 product-iteration-reference §2.2）。

---

## 8. 改动类型速查

| 类型 | 怎么做 |
|------|--------|
| 小 bug / 文案 / 重入 | 改代码 → 更新 bugs 或 roadmap |
| 模块功能增强 | roadmap 已有项 → 实现 → 打勾 |
| Settings 新开关 | candidates 选品 → roadmap → 实现 |
| Account Manager 大改 | 设计稿 / RFC → 优先补引擎测试再改 |
| 架构债（分层、repository） | 对齐 App Manager / Account Manager 标杆模式 |

---

## 9. 当前基建认知（非完美清单）

**够用的底座：** 技术栈、IPC 契约、规范文档、模块文档目录、托盘/危险确认/Dev Toolbox IA、CI 发版。

**仍须补强的基建（开发时心里有数）：**

- Session 迁移与状态 UX（Account Manager）
- 约半数模块缺 feature 测试；Session/Probe Rust 引擎测试弱
- Issue 与 roadmap 未自动联动
- 部分模块技术债（Quick Launch `scenes.ts`、Dev Toolbox 单文件等）
- macOS 以外能力需 DesktopOnly / 平台矩阵诚实标注

细节与演进方向见 [product-iteration-reference.md](./product-iteration-reference.md) §2.2、§6。

---

## 10. 包管理与依赖升级

> 项目统一使用 **pnpm**。以下规则适用于本地开发与 CI。

### 10.1 基本约定

| 项 | 规则 |
|------|------|
| 包管理器 | pnpm，版本由 `package.json` 的 `packageManager: pnpm@11.8.0` 固化（corepack 自动识别） |
| Lock 文件 | 只保留 `pnpm-lock.yaml`，**禁止** `package-lock.json` 并存（双 lock 会导致本地与 CI 解析分叉） |
| CI 安装 | `pnpm install --frozen-lockfile`（严格按 lockfile，不更新） |
| 本地安装 | `pnpm install`（lockfile 存在时尊重它；package.json 变更时更新 lockfile） |
| 脚本与配置 | **禁止**在 `package.json` scripts、`tauri.conf.json` 等项目文件中使用 `npm run` / `npm ci` / `npm install` 等 npm 命令。混用会触发 `npm warn Unknown env config "manage-package-manager-versions"` 等环境警告，且可能导致行为不一致。 |

### 10.2 常用命令

```bash
pnpm install                      # 安装依赖（尊重 lockfile）
pnpm install --frozen-lockfile    # CI 用，严格按 lockfile
pnpm add <pkg>                    # 添加生产依赖
pnpm add -D <pkg>                 # 添加开发依赖
pnpm update                       # 在 ^ 范围内升级所有 patch/minor
pnpm outdated                     # 查看可升级项
pnpm tsc --noEmit                 # 类型检查（major 升级后必跑）
```

### 10.3 依赖升级流程

1. **查可升级项**：`pnpm outdated`
2. **patch / minor**（`^` 范围内）：`pnpm update` 直接升，风险低
3. **major**（跨版本，如 25.x → 26.x）：
   - 手动改 `package.json` 约束（如 `"@types/node": "^26.1.0"`）
   - `pnpm install --no-frozen-lockfile` 更新 lockfile
   - 跑 `pnpm tsc --noEmit` 确认无类型错误
4. **验证 CI 能通过**：`pnpm install --frozen-lockfile`
5. **提交**：`pnpm-lock.yaml` 必须随 `package.json` 一起提交

### 10.4 pnpm 11 供应链策略（minimumReleaseAge）

pnpm 11 默认开启 `minimumReleaseAge: 1440`（24 小时）：**发布不足 24 小时的包版本会被自动跳过**，不参与解析。这是供应链保护 —— 恶意包通常在发布后数小时内被检测并下架，延迟 24 小时让你错过最高风险窗口。

| 场景 | 怎么处理 |
|------|------|
| `pnpm update` 跳过了刚发布的新版本 | 等 24h 后再 `pnpm update`，或用 `pnpm add pkg@version` 显式安装 |
| `pnpm add pkg@version` 被策略拦截 | pnpm 自动在 `pnpm-workspace.yaml` 写入 `minimumReleaseAgeExclude` 豁免；该文件需提交，否则 CI `--frozen-lockfile` 会失败 |
| lockfile 残留被策略拒绝的旧条目 | `pnpm clean --lockfile` 清理后 `pnpm install` 重建 |
| 想全局关闭策略（不推荐） | `pnpm-workspace.yaml` 加 `minimumReleaseAge: 0` |

> **注意**：`minimumReleaseAgeExclude` 是逐包豁免，不是漏洞警告 —— 它只表示该包"太新"，由你显式放行。是否信任该包仍需自行判断。

### 10.5 CI 配置要点

[ci-build.yml](../.github/workflows/ci-build.yml) 每个 job 需在 `setup-node` 之前加 pnpm 初始化：

```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 11.8.0
- uses: actions/setup-node@v6
  with:
    node-version: "24"
    cache: pnpm          # 不是 npm
- run: pnpm install --frozen-lockfile
```

---

## 11. 相关文档

| 文档 | 用途 |
|------|------|
| [coding-standards.md](./coding-standards.md) | 编码与文档目录（强制） |
| [roadmap/release-themes.md](./roadmap/release-themes.md) | 当前主题与验收（强制） |
| [modules/](./modules/README.md) | 各模块 roadmap / bugs / 设计 |
| [product-iteration-reference.md](./product-iteration-reference.md) | 方法论与未来方向（参考） |
| [README.md](./README.md) | 文档总索引 |
