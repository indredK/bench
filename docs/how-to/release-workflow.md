# 发布与合并工作流

> 事实来源：`.github/workflows/{ci-build,release-please,security}.yml` 与仓库 ruleset。流程变化时同步改本文。

## 1. 分支与 PR

- `main` 受 ruleset 保护：必须通过 `CI OK (aggregate)`，且 PR 分支要与 `main` 保持最新（落后时 `gh pr merge` 会拒绝）。
- 做法：从 `origin/main` 开 `feat/*` / `fix/*` 分支 → 本地跑门禁 → 推送 → 开 PR → CI 全绿后 `gh pr merge --merge`（本仓历史使用 merge commit）。
- 禁止 `git add .`；禁止在 CI 红灯时合并；`git push` 只在明确要求时执行（见 `.cursorrules` §0/§2）。

## 2. 本地门禁（与 CI 同源）

```bash
pnpm run lint:fe && pnpm run test:fe && pnpm run test:critical
pnpm run check:be-cfg          # 改 Rust 平台分支时必跑
cd src-tauri && cargo fmt --all -- --check && cargo clippy -- -D warnings && cargo test --lib <module>
```

首次编译 Rust 前先 `pnpm run build:bench-host`（生成 `src-tauri/binaries/bench-host-<triple>`，已 gitignore）。

## 3. Dependabot 批处理

严格「必须最新」规则下，逐个合并 N 个依赖 PR 要串行等 N 次 CI（单次约 10–12 分钟）。推荐：

1. 从 `origin/main` 开一个分支，把 CI 通过的 Dependabot 分支依次 `git merge`（`pnpm-lock.yaml` / `package.json` 冲突时：取 `package.json` 手改版本号，再 `pnpm install --lockfile-only` 重算锁文件）。
2. 一次推送、一次 CI、一次合并；被合并的 Dependabot PR 随后手动关闭并注明「已并入 #N」。
3. **major 升级不批量**：`@types/node` 大版本与 `engines.node` 不一致时会让前端构建 / Node 兼容性 job 失败，保持关闭，等运行时升级。

## 4. 安全扫描（`security.yml`）

- `cargo deny` 设 `yanked = "deny"`：依赖被撤回（yanked）时 main 会红。修法：`cd src-tauri && cargo update -p <crate>`，提交 `Cargo.lock`。
- `deny.toml` 里已不再命中的 advisory ignore 会产生 `advisory-not-detected` 警告，可择机清理，但不是失败原因。

## 5. 发版

1. 合并到 `main` 后，`release-please` 自动维护 **`chore(main): release X.Y.Z`** PR（含 `CHANGELOG.md` 与版本号）。
2. 版本只在需要发布时合并该 PR：合并即打 tag，`ci-build.yml` 的 `Release Build` / `Publish Release` 产出 macOS（ad-hoc）与 Windows（unsigned）包，以及 updater 的 `.sig`、`latest.json`、`SHA256SUMS`。
3. 发布后在 GitHub Releases 页确认：包齐全、`latest.json` 版本正确；再用旧版本的 Bench 跑一次「检查更新 → 下载 → 重启」验收（见 DIRECTION.md Next-1）。
4. 发布说明只写已实现且已验证的用户变化；未验证平台不得写成完整支持。

## 6. 子仓库（`kindred-plugin-market` 组织）

| 仓库                       | 角色                                                   | 发布方式                                                |
| -------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| `plugin-market`            | 插件源码 + `registry.json`（每个插件按版本发 Release） | release-please 按插件分组件发版；registry 随之同步      |
| `command-market`           | 命令 `registry.json` + 登录规则 `rules.json`           | 静态文件，合并到 `main` 即生效（raw.githubusercontent） |
| `bench-quality-cli`        | 质量门禁生成器（宿主 / 市场仓库的 hook 与脚本）        | 无发布；宿主通过 `update --profile` 同步                |
| `bench-extension-template` | 插件作者模板                                           | 无发布                                                  |

命令市场发布步骤见 `command-market/README.md`：改 `commands/<id>.json` → `pnpm run build:registry` → `check:indexes` → 源文件与索引同一个 commit。**更新命令 = 递增 `version`**，宿主据此判断「可更新」。
