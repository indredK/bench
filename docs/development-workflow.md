# Bench 开发流程

规范见 [coding-standards.md](./coding-standards.md)，当前优先级见 [ROADMAP.md](./ROADMAP.md)。本文件只说明日常执行顺序和仓库特有排障。

## 1. 开始前

1. 在当前主题和模块 `roadmap.md` 中确认未完成项。
2. 读取模块 `README.md`，涉及架构、安全或跨平台时继续读 `design.md`。
3. Account Manager Session、跨平台能力或大范围重构先写短 RFC；System Settings 新键位先按其 `design.md` 验证系统版本、读写和回读。
4. 新 feature 同时创建 `src/features/<id>/` 与 `docs/modules/<id>/{README,roadmap}.md`。

## 2. 实现边界

| 层                         | 职责                                 |
| -------------------------- | ------------------------------------ |
| component/page             | 展示与交互，不直调 Tauri             |
| controller/hook            | 订阅状态、派生数据、effect、重入保护 |
| use-case                   | 业务规则和流程编排                   |
| repository / typed command | IPC、存储和外部适配                  |
| store                      | 状态与简单 setter                    |

文案走 i18n；危险操作使用 `DestructiveConfirmDialog`；长任务提供加载、失败、partial 和取消状态；平台能力通过 `platform/` 边界声明。

Controller 抽取时先确认同文件子组件仍需要哪些 hook/store import。主组件和子组件各自调用 `useTranslation()`；不要透传冻结的 `t`。只迁移真实编排，不创建空的 store/repository。

## 3. 本地验证

```bash
pnpm run lint:fe
pnpm run test:critical
cd src-tauri && cargo clippy -- -D warnings
```

有 Rust 领域改动时补跑相关 `cargo test <module>`；发版前可运行 `pnpm run verify`。验证失败时停止，不通过修改测试规避真实问题。

## 4. 文档与提交

- 已实现项从模块 roadmap 移除；新风险写入 `audit-report.md`，方向性取舍写入 `DECISIONS.md`。
- 新增/删除 feature 后运行 `pnpm run check:docs`。
- Commit 使用 Conventional Commits；只 stage 当前逻辑改动，禁止 `git add .`。
- `.husky/pre-commit` 按 staged 文件分流：通用空白/Prettier；文档一致性；前端 i18n、类型、测试和构建；后端 crate、fmt、check、Clippy 和测试。删除文件同样触发所属检查。
- 同一文件有部分暂存时 Hook 会停止；先把该文件整理为一个完整 staged 版本，避免工作区内容掩盖实际 commit。可用 `pnpm run check:precommit` 手动复核。
- i18n 门禁检查中英文 key/类型/插值/plural、动态 key family 和用户可见硬编码；语言自然度、长文本布局和切换语言行为仍由测试与人工验收负责。
- 仅在用户明确要求时提交或推送。

## 5. 发版

- CI 入口：[`ci-build.yml`](../.github/workflows/ci-build.yml)。
- CI/CD 只允许 macOS 与 Windows runner；`pnpm run check:ci-platforms` 会拒绝 Linux runner、容器和包格式。
- 版本与 `CHANGELOG.md` 由 release-please 根据 Conventional Commits 生成。
- 发布说明只列已实现且已验证的用户变化；未完成平台 smoke 不得写成完整支持。
- 2.0.0 只按[最终路线图](./ROADMAP.md)的 R00-R10 执行。当前 OS 包按 D-010 默认 ad-hoc/unsigned，updater minisign 仍为强制；未完成真机项不得写成已验证。

## 6. pnpm 与依赖

- 只使用 pnpm；版本以 `package.json#packageManager` 为准。
- 只保留 `pnpm-lock.yaml`；CI 使用 `pnpm install --frozen-lockfile`。
- 添加/升级依赖后同时提交 `package.json`、lockfile 和必要的 `pnpm-workspace.yaml` 策略变化。
- patch/minor 使用 `pnpm update`；major 升级先查迁移说明，再运行类型、测试和构建验证。
- pnpm 的 `minimumReleaseAge` 会跳过过新的版本；优先等待策略窗口，不要全局关闭供应链保护。

## 7. 常见日志

| 日志                                                                      | 处理                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `[deep-link] register bench-auth failed (non-fatal): UnsupportedPlatform` | macOS 开发期允许失败，打包后由 `Info.plist` 注册；其他 deep-link 错误需排查 |
| `IMKCFRunLoopWakeUpReliable`                                              | macOS 输入法/WebKit 系统日志，可忽略                                        |
| `npm warn Unknown env config ...`                                         | 项目中混用了 npm；检查 package scripts 和 Tauri build command               |
| `[account_manager] init failed: ...`                                      | 影响 Session 恢复，按 Account Manager design 排查并暴露降级状态             |

## 8. macOS 构建排障

若出现 `window_vibrancy` 重复符号或 bitcode 加载失败，检查 `src-tauri/Cargo.toml` 的 `window-vibrancy` 是否与 Tauri 依赖版本一致，再用 `cargo update -p window-vibrancy` 更新 lockfile。不要长期并存多个不兼容版本。

上游问题：[tauri#15478](https://github.com/tauri-apps/tauri/issues/15478)。
