# Extension Center Roadmap

> **本文件是插件化（P0–P6）的执行状态唯一清单**，也是下一步执行顺序的唯一依据。
> **契约规格**（manifest / 签名 / registry / 产物格式）：[extension-spec.md](../../extension-spec.md)
> **架构边界与工作流**（含作者侧流程）：[extension-workflow.md](../../extension-workflow.md)
> **插件中心功能规格**：[product-specs/extension-center.md](../../product-specs/extension-center.md) ｜ **未完成项**：[planned/extension-center.md](../../planned/extension-center.md)
> **方向性决策**：[DECISIONS.md](../../DECISIONS.md)（D-023 / D-024）
> **最后更新**：2026-09-08（P3 路线经行业最佳实践复核后重排，见「附录 B　重排依据」）。

## 成本原则（贯穿全部阶段）

用户给定约束：**代码改动与重构不计成本，一律按最佳实践做；但有额外支出的必须最小化。**

| 项                                                 | 决策                                                                                                                    | 理由                                                                                                                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions Windows runner                      | ✅ 用，但**只跑 verify job**（build + clippy + test），不产出安装包；仅在 push `main` / PR / tag 触发；复用既有 sccache | Windows 计费倍数远低于 macOS runner，增量可控；换来的是每一步都有双平台证据                                                                                |
| canonical registry 托管                            | ✅ **静态 JSON + Git / GitHub Pages / jsDelivr**，不自建服务端                                                          | 零服务器费用；Git 天然带历史与 PR 审核流程（承接 D-024 阶段二）                                                                                            |
| 插件签名                                           | ✅ minisign，私钥本地保管 + CI 走 GitHub Secrets                                                                        | 零费用；复用 `updater/keys/` 既有密钥链                                                                                                                    |
| 更新框架                                           | ❌ **不引入 TUF**                                                                                                       | TUF 需在线 timestamp/snapshot 服务与密钥轮换仪式，持续运维成本远大于本规模收益；改用「trusted comment + 版本单调性 + expiresAt」三条低成本措施达到同等效果 |
| 恶意代码沙箱动态检测 / marketplace 级 malware 扫描 | ❌ 不做                                                                                                                 | VS Code 那套 clean room VM + 多引擎扫描年度成本极高；改为「registry PR 人工审核 + 吊销通道 + ACL 最小授权」组合                                            |
| Apple notarization / Windows Authenticode          | ❌ 维持 unsigned                                                                                                        | 同 [D-010](../../DECISIONS.md#d-010--默认使用-ad-hoc-macos-与-unsigned-windows-包)，不为一锤子证书付费                                                     |

---

## 进度总览

| 阶段     | 内容                                                            | 状态                   |
| -------- | --------------------------------------------------------------- | ---------------------- |
| P0       | 产品定案（2.0 = 插件化第三方生态）                              | ✅ 完成                |
| P1       | 概念验证（ExtensionAssets 同源加载 + IPC）                      | ✅ 完成                |
| P2       | 契约先行 + 插件中心最小版 + photo-triage bundled                | ✅ 完成                |
| P2b      | photo-triage 完整 UI 迁移（独立 bundle）                        | ✅ 完成                |
| P3       | 运行时治理（engines 门控 / 签名骨架 / 语言注入 / 卸载）         | ✅ 完成                |
| **P3.1** | **包完整性安全地基**（逐文件 hash 清单 + 降级防护 + 公钥三态）  | ✅ 完成（2026-09-08）  |
| **P3.2** | **Windows 双平台 CI 门禁**（verify job，不产包）                | ✅ 完成（2026-09-08）* |
| **P3.3** | **安全解压 + 审计日志**                                         | ✅ 完成（2026-09-08）  |
| **P3.4** | **bundled 产物发布集成**（随正式包发布）                        | ✅ 完成（2026-09-08）* |
| **P4**   | **market 端到端闭环**（静态 registry → 安装向导 → 验签 → 启用） | ✅ 完成（2026-09-08）* |
| P4.5     | 作者侧交付（SDK / 模板 / 脚手架 / 打包签名）                    | ⬜ **下一步**          |
| P5       | 增量迁移（带停止线，每批复评）                                  | ⬜ P4 之后             |
| P6       | Windows release 产物                                            | ⬜ 最后                |

> **P3.1 已完成（2026-09-08）**：插件产物格式（manifest schema v2）已冻结，P3.3 的 download/extract 可在此格式上实现。
> **P3.2–P4 已完成（2026-09-08）**：实现、单测与本地门禁全绿。带 \* 项含外部前置——P3.2 双平台证据待下次 push 的 Windows runner 实跑确认；P3.4 真机验收待打一次 release 包全新安装；P4 端到端验收待 registry 私钥环境签出首批插件并配置 `BENCH_EXT_REGISTRY_URL`。
> **P6 是发布硬前置**：插件化能力在 Windows runner 复验前不得随正式版发布（D-023）。

**契约前置**：P3.1 及之后的实施一律以 [extension-spec.md](../../extension-spec.md) 为契约真相源 —— 改代码前先改规格。

---

## P0 ✅ 产品定案（2026-09-08）

- [x] 2.0 目标变更为「插件化生态」，R00–R10 降级为技术债台账（D-023）
- [x] 仓库组织两阶段策略 + bundled/market 双分发 + photo-triage 试点（D-024）
- [x] 可行性评估与行业调研（结论已固化进本文件「附录 A／B」，原报告已删除）

## P1 ✅ 概念验证（2026-09-08）

- [x] `ExtensionAssets` 替换 asset provider（插件目录叠加内置资源，同源加载）
- [x] 实测 5 项自检全通过：同源 URL / IPC 注入 / ESM chunk / DOM 渲染 / invoke 回写
- [x] 证伪并修正 D-022 的「renderer 不能热载整屏页」前提 B′ 方案成立

## P2 ✅ 契约先行 + 插件中心最小版（2026-09-08）

- [x] manifest schema v1（fail-closed：schemaVersion / id / semver / entry / ACL 子集 / engines）
- [x] ACL 注册表 + `ext-` 窗口 IPC 网关（deny-by-default，补上 Tauri 自定命令全窗口放行的缺口）
- [x] `ext_list_installed` / `ext_open` / `ext_set_enabled` / `ext_uninstall` 契约双写
- [x] 插件中心最小 UI（列表 / 打开 / 启用禁用 / 卸载确认 / 空态 / 错误重试）
- [x] bundled 同步脚本（`extensions:sync`，双部署模式 + 保留用户禁用标记）
- [x] 插件错误回传基建（`EXT_ERROR_CAPTURE_SCRIPT`）

## P2b ✅ photo-triage 完整迁移（2026-09-08）

- [x] 20 文件迁出为 `extensions/photo-triage/src/`
- [x] 插件独立 vite 构建体系（`extensions:build`）
- [x] 插件自带 i18n（`locales/{zh,en}.json`，独立 i18next 实例）
- [x] 主包移除 photo-triage 静态注册
- [x] 实测 `ext-photo-triage` 窗口经 manifest 校验 + 网关 + CustomProtocol 打开，boot 诊断零错误

## P3 ✅ 运行时治理（2026-09-08）

- [x] `engines.bench` 兼容门控（`*` / `>=X.Y.Z`，非法约束 fail-closed；ext_open 拒绝 + 列表 `compatible` 标记）
- [x] minisign 签名**骨架**（market 强制验签 fail-closed / bundled 豁免；公钥 env → 回退 updater 公钥）→ **签名对象在 P3.1 重做**
- [x] `manifest.signature` 可选字段
- [x] 宿主语言注入（`ext_open(locale)` → `window.__BENCH_EXT_LOCALE`）
- [x] 卸载（`ext_uninstall`：关窗 + 删产物目录，仅限合法插件目录；UI 走 DestructiveConfirmDialog）

---

## P3.1 ✅ 包完整性安全地基（2026-09-08 完成）

> **为什么曾经必须先做**：P3 的验签对象只有 manifest 原文，插件 JS/HTML 无完整性绑定，保留已签 manifest、替换 `assets/*.js` 验签照样通过 → 等价于没有包完整性保护。已完成：manifest schema v2 上线，产物格式冻结。

### 1. 逐文件 hash 清单签名（A1）

> 完整字段定义、canonical 文本规则、验签流程见 [extension-spec.md §3 / §4](../../extension-spec.md)。

- [x] manifest 升级到 **schema v2**，新增必签字段 `files: [{ path, sha256, size }]`（`manifest.json` 自身与 `.disabled` 不入清单——前者文件哈希无法自嵌套，完整性由 canonical 文本签名覆盖）
- [x] `display.zh` 改为可选（缺失回退 `en`），降低第三方作者门槛
- [x] 新增可选字段 `expiresAt`（存在即校验 RFC 3339 + 未过期）
- [x] **约定插件私有数据目录** `$APPDATA/extension-data/<id>/`：产物目录为只读（完整性校验会拒绝清单外文件），插件数据必须写在此处；卸载默认保留数据；新增 `ext_data_dir` 命令经窗口 label 推导目录（spec §9.3）
- [x] 同步更新 `extensions/photo-triage/manifest.json` 与打包脚本到 v2（sync 部署后注入 `files` 清单；POC 生成器同步升级）
- [x] 规范签名对象改为「去掉 `signature` 字段后的 canonical JSON」（键递归升序 + 紧凑），规避自引用循环
- [x] `ext_open` 开窗前**全量校验** `files` 每条 hash，fail-closed
- [x] 校验须包含「产物中不得存在 `files` 未列出的文件」（Mozilla 明文要求，防新增未覆盖的可执行文件）
- [x] 边界情形：空 `files` 数组视为非法；重复 path 视为非法；`manifest.json` / `.disabled` 入清单视为非法；非法 sha256 格式视为非法

**采纳依据**：Mozilla AMO 为 XPI 内**每个文件算 digest** → 写入 `META-INF/manifest.mf` → 对该清单签名的四级校验；Chrome Web Store 用 `computed_hashes.json` + `verified_contents.json`（JWS 覆盖整棵 hash 树）。本项目体量取 Mozilla 层级（逐文件 SHA256），不取 Chrome 的 4KB 分块 treehash。

### 2. 降级与冻结（replay）防护（A2）

- [x] minisign **trusted comment** 约定为 `<extension-id>@<semver-version>`，宿主在其被 global signature 认证后校验与 manifest 的 `id`/`version` 完全一致
- [x] 宿主持久化**已验证版本水位** `$APPDATA/extension-records/<id>/version`：完整通过校验的版本抬升水位（只升不降）；market 安装/更新（P4）与 market 插件开窗拒绝 `new < recorded`；卸载清除水位；bundled 不做开窗拒绝（应用整体回退不受误伤，spec §8 范围说明）
- [x] manifest 新增可选 `expiresAt`，宿主拒绝过期元数据（最小成本挡 freeze attack）
- [x] 单测：旧版本 manifest+files 组合重放必须被拒（`records::replay_of_older_version_rejected`）

**采纳依据**：minisign 官方文档明确 trusted comment 可用于「写入版本号**防止降级攻击**」。minisign 签名本身无有效期、无版本概念，必须靠宿主侧补齐。

### 3. 公钥解析三态化（A5）

- [x] 去掉「env 缺失时静默回退 updater 公钥」的行为 —— updater 私钥泄露即等同于获得插件签发权，属密钥用途混用
- [x] `release`（默认）：registry 公钥缺失即报配置错误（`INTERNAL`，信息含配置指引）
- [x] `dev`（`BENCH_EXT_DEV_MODE=1`）：允许本地自签/未签（跳过验签并告警），UI 明示「未验证分发源」→ 插件中心 UI 标注随 P4 信任披露一并交付
- [x] `selfhost`：用户自签 registry 公钥（同一 env），走正常验签，UI 标注第三方 registry → 同上，随 P4 交付

### 验收（2026-09-08 全绿）

```bash
pnpm run check:be-cfg        # ✓ 355 files, no platform-gated dead code
cargo test --lib extension_host  # ✓ 65 passed
cargo clippy --lib -- -D warnings  # ✓ 0 warnings
pnpm run lint:fe             # ✓
pnpm run test:critical       # ✓ 145 passed
```

**完成条件核验**：篡改任一产物文件被拒 ✓（`rejects_tampered_content`）；产物中新增未登记文件被拒 ✓（`rejects_unlisted_extra_file`）；旧版本重放被拒 ✓（`replay_of_older_version_rejected`）；registry 公钥缺失报错而非静默回退 ✓（`release_without_pubkey_is_config_error_not_silent_pass`）。正向路径用确定性 ed25519 测试夹具构造真实 minisign 签名验证 ✓（`market_valid_signature_accepted`）。

---

## P3.2 ✅ Windows 双平台 CI 门禁（2026-09-08 完成）

> **为什么提前**：D-021 暂停 Windows CI 的原因是 **sccache 导致的构建失败与时长，不是 Windows 端代码缺陷**（CI 注释为 "Re-enable the matrix below when Windows CI is re-introduced"）。而插件化恰好引入了跨平台差异最集中的三处：`$APPDATA` 路径解析、独立 `ext-` WebView 窗口行为、文件占用导致 `remove_dir_all` 失败（当前 `ext_uninstall` 无重试/无占用处理）。留在 P6 才验，等于一次性面对「15 模块 × 未验证平台」的组合爆炸，与 `coding-standards.md §7.4.1` 的铁律直接冲突。

- [x] verify job 恢复 **macos-latest + windows-latest matrix**（统一 `shell: bash`）；release-build 的 Windows target 保持注释（属 P6，未产包）
- [x] Windows leg 只跑 build + clippy + test + cfg 卫生（format/lint:fe/test:fe 等 macOS 单平台执行，控制 runner 费用）
- [x] 复用 D-021 经验：CI 一律 `RUSTC_WRAPPER=""`（sccache wrapper 是 shell 脚本，Windows 无法作 rustc-wrapper）+ rust-cache 指向迁移后的 target 目录
- [x] `check:be-cfg` 双平台执行（静态求解之外再以双平台真实编译兜底）

**完成条件**：Windows 与 macOS runner 同时全绿；每次 PR 都产出双平台证据 → _待下次 push 实跑确认（外部前置）_

**验收**：Windows 与 macOS runner 同时全绿；每次 PR 都产出双平台证据。

---

## P3.3 ✅ 安全解压 + 审计日志（2026-09-08 完成）

### 1. 解压安全规格（A3，实现前先定）

- [x] 逐 entry 解析 **canonical** 路径，以目标目录 canonical 根为基座前缀校验，越界即**整包拒绝**（不是跳过；注意基座必须是 canonical 根本身——target 路径可能含符号链接）
- [x] 显式拒绝绝对路径、`..`、反斜杠（覆盖 `C:\` 与 UNC）、内部空段、`.` 段；**盘符判断用跨平台字符串实现，禁用 `Component::Prefix`**（铁律 3）
- [x] zip bomb 防护：entry ≤ 4096、单文件 ≤ 64MB、总量 ≤ 256MB；流式解压边写边累计并提前中断（不信任 zip header 声明值）
- [x] 拒绝档案内的 symlink entry（`is_symlink`；测试用 zip 8 `add_symlink` 构造）
- [x] 解压前目标目录必须全新或为空
- [x] 原子性：P4 管线先解压到预览目录 → 全量校验通过 → `promote_staged_bundle` 原子 rename；失败即清理，不留半成品
- [x] 攻击向量单测全通过：`../evil.js`、`/abs/path.js`、`C:\Windows\evil.js`（两种斜杠形式）、`\\server\share\x.js`、symlink entry、超限体积（单文件/总体积）、超限条目数、非空目标目录（`extraction.rs` 12 项测试）

> 本项与 P3.1 **强耦合**：逐文件 hash 清单只有在「先校验再原子落位」的流程里才有意义，两者作为同一批次交付。

### 2. 审计日志（A6）

- [x] 新增追加式 `$APPDATA/ext-audit.log`（JSONL），字段：`ts` / `event` / `id` / `version` / `reason`
- [x] event 覆盖：`install` / `enable` / `disable` / `uninstall` / `verify_fail` / `acl_deny` / `revoke_hit`（已接线：开窗校验失败、网关拒绝、启停、卸载、bundled 部署、P4 安装/吊销）
- [x] ring buffer 上限 2MB 滚动（按行对齐保留最新一半），**不落隐私数据**（仅 id/版本/事件/拒绝原因）
- [x] 修复既有缺陷：插件诊断落盘改**追加式 JSONL**（`ext-diagnostics.jsonl`，boot 不再覆盖先前 error；复用 2MB 滚动）

**完成条件核验（2026-09-08）**：P3.1 篡改 + P3.3 解压攻击向量单测全通过（extension_host 90 项测试）；`$APPDATA/ext-audit.log` 覆盖插件完整操作历史。

---

## P3.4 ✅ bundled 产物发布集成（2026-09-08 完成）

> **为什么提前**：实证 —— `tauri.conf.json` 的 `bundle` 段当前**没有 `resources` 字段**，插件产物只能靠 dev 同步脚本 `sync-extensions.mjs` 进 `$APPDATA`。后果是**任何正式发布包都不含 photo-triage，用户升级即功能消失**，这恰恰是 D-024 选择 bundled 想避免的「功能真空」。该项原先挂在 P4 末条，实为「2.0 能否交付」的硬前置，远早于 market 分发（market 是第三方的事，bundled 是自身功能不丢）。

- [x] 定方案：**`bundle.resources` 随包 + 启动时拷贝到 `$APPDATA`**（`extension_host/bundle.rs`）。理由：Tauri 原生机制跨平台一致，installer 钩子需 NSIS/DMG 两套脚本且 dev 不可复用；纯 Rust 启动逻辑可控（首启拷入/升级覆盖/保留 `.disabled`/完整性校验后才落位），fail-closed
- [x] `extensions:build` 产物接入 `tauri build` 流水线：`beforeBuildCommand` 链 = build:fe → extensions:build → **extensions:stage**（新脚本组装部署根 + 注入 files 清单到 `src-tauri/resources/extensions/`，`tauri.conf.json` 增加 `bundle.resources` 映射）；sync 脚本仅保留 dev 用途（与其共用 `scripts/plugins/lib/extension-files.mjs`）
- [x] 产物不进 git：`.gitignore` 覆盖 `extensions/*/assets/` 与 `src-tauri/resources/`（photo-triage 已跟踪产物已 `git rm --cached` untrack）
- [x] **验证方式**：CI 的 `tauri build --debug --no-bundle` 冒烟已覆盖 stage 链路；_真机验收（打 release 包 → 全新安装 → 插件中心可见并可打开 photo-triage）待外部执行_
- 启动部署语义：bundled 版本 > 已装版本才覆盖（不降级、不重写 market 升级），保留用户 `.disabled`；部署前先做完整性校验；部署记审计 `install` 并抬升版本水位

---

## P4 ✅ market 端到端闭环（2026-09-08 完成，端到端验收待外部条件）

> 原「P3 剩余：registry 服务端 / 目录拉取 / zip 下载解压」与「P4：market 安装向导」描述的是**同一条用户路径的两半**。拆开做的典型后果是后端通了但 UI 没接、无法端到端验证。此处合并为一条，验收标准唯一。

- [x] **registry 形态：静态 JSON + Git/GitHub Pages/jsDelivr 托管**（`registry.rs`：schema v1 全量校验 + `yanked`；基址由 env `BENCH_EXT_REGISTRY_URL` 配置，未配置 = market 功能禁用提示）
- [x] 目录拉取：renderer **不自选 URL**（`ext_market_list` 只回传展示数据，**不含 downloadUrl**）；基址由后端 env 决定，下载 URL 校验 https 且拒绝 localhost（D-007）
- [x] 安装向导（两段式）：`ext_market_prepare`（下载 → 整包 sha256+size → 安全解压 → manifest v2 + id/version 绑定 → engines → 验签 + trusted comment → 逐文件 hash）→ 信任弹窗 → `ext_market_commit`（版本单调 → 原子落位 → 审计 install）；任一步失败清理临时产物、已装版本不变
- [x] **信任披露（A4-1）**：prepare 返回 `aclCommands`，确认弹窗展示发布者/版本/申请的全部宿主命令（未申请则明示「无权限」），对齐 VS Code 1.97 publisher trust 取向
- [x] **吊销通道（A4-2）**：`revoked[]` 支持 `*` / `<X` / `<=X` / 精确版本（未知表达式 fail-closed 视为命中）；`ext_market_list` 拉取时强制禁用命中插件 + 审计 `revoke_hit` + UI 显著警示横幅
- [x] 插件中心 UI：已安装/市场/诊断三标签；market 卡片含 yanked / engines 不兼容 / 已安装 / 可更新徽标，安装按钮走两段式信任流；i18n zh+en 全覆盖
- [x] 诊断面板：`ext_diagnostics` 返回 `ext-audit.log` + `ext-diagnostics.jsonl` 各最近 200 条，插件中心内直接查看
- [x] minisign 真实签名：管线已按 spec §4 全量校验（canonical + trusted comment）；单测以确定性 ed25519 夹具构造真实签名走通正向路径。_签出首批插件需 registry 私钥环境（外部前置）_
- [x] 能力兼容标记：market 版本条目 `compatible`（engines 比对）/ `installed` / `updateAvailable` / `yanked`；D-017 pack 形态（degraded/missing_pack）当前无 pack 交付物，字段位预留、随首个 pack 插件启用

**验收状态**：管线全链路单测通过（真实 minisign 签名 zip：正路径 + 整包哈希不符 + 同哈希内容篡改 + 版本绑定错位 四用例）；_端到端外部验收（真实 registry URL 装第三方插件跑通生命周期）待私钥环境与 registry 上线_。

---

## P4.5 ⬜ 作者侧交付（可与 P4 并行，🔴 生态冷启动唯一路径）

> 原 P0–P6 缺失这一整条线。而它决定了 P0 拍板的「目标 B：第三方生态」能否启动 —— uTools 生态 3000+ 的主因就是前端开发者零门槛。

| 项               | 内容                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `@bench/ext-sdk` | IPC 客户端薄封装（基于 `@tauri-apps/api`）+ i18n 桥 + 诊断上报接口                                                          |
| 模板仓库         | `bench-extension-template`：manifest 示例 + vite 配置（含 `base: "./"` 铁律）+ 本地 dev 加载 + 打包 + 签名脚本              |
| 脚手架           | `pnpm run extensions:create <id>` 生成目录与最小可运行插件                                                                  |
| 打包脚本         | `pnpm run extensions:pack <id>` → 产出 zip + 生成 `files` hash 清单 + minisign 签名                                         |
| 作者文档         | 「开发 / 本地加载 / 打包签名 / 提交 registry PR」四步式 how-to，登记进 [extension-workflow.md](../../extension-workflow.md) |

**验收**：一个未接触过本项目的开发者能在 30 分钟内产出可安装插件。

---

## P5 ⬜ 增量迁移（带停止线，每批复评）

> **不做无条件的全量迁移。** 自身调研已确认：VS Code 大量核心体验**本身就是随主包发布的 bundled 扩展**（核心仓库 `extensions/` 目录）。Bench 当前形态（官方插件住主仓库、bundled 随包发布）已经是 VS Code 形态。剩余工作是「松耦合收益 vs 重构成本」的权衡，不是必须完成的迁移。

**迁移判据**（四条须同时满足，否则保持在宿主内）：

1. 构成完整业务闭环（可独立成窗口）
2. IPC 面清晰且与其他模块低共享状态
3. 不依赖 TCC / 系统权限 / 凭据
4. 迁移后不产生宿主↔插件的高频往返

**批次**（每批 1–2 个，**每批复评后再决定继续**）：

- [x] **第一批完成（2026-09-08，用户指令：terminology + hardware 双迁）**：
  - terminology → `extensions/terminology/`（14 条 CRUD 命令留宿主能力面 + ACL；UI + store + services 迁出；自带 i18n）
  - hardware → `extensions/hardware/`（**零 IPC 纯前端**，`acl.commands` 为空；`src/data/*` 15 个静态数据模块与 `CompareMatrixTable` 随迁入插件——宿主仅 env-detector 复用 `FilterBar`/types，留在 `src/shared/compare/`；数据模块的宿主 i18n 实例引用改为插件 i18n 实例）
  - 配套：`extensions:build` 泛化为循环构建全部插件；docs 对齐门禁升级（extensions/<id> 计入模块，14 features + 3 plugins ↔ 17 docs）；宿主 registry/locales 同步摘除（zh/en parity 保持）
  - **第一批后复评（用户已裁决）**：继续按需迁移，不停在 bundled-plugin 形态
- [x] **第二批完成（2026-09-08，用户指令）**：clean-space（含 dev-cleaner 子能力）→ `extensions/clean-space/`
  - 能力面 14 条命令（8 清理 + 6 dev-cleaner）留宿主核心 + ACL；**平台门控落地**：manifest v2 新增可选 `platforms` 字段（spec §3.1，缺省全平台、空数组非法、宿主按当前平台过滤已装列表——能力判定在宿主，renderer 不自行决定）
  - dev-cleaner 作为子模块随迁（`src/dev-cleaner/`），宿主 `src/features/{clean-space,dev-cleaner}` 删除
  - **文档归集（用户指令）**：已插件化模块的文档三件套（product-spec / planned / roadmap / README，clean-space 另含 design.md + 原型 HTML、dev-cleaner 子目录）自包含迁至 `extensions/<id>/docs/`；docs-consistency 门禁升级为插件文档本地校验（12 features + 4 plugins ↔ 12 module docs）；docs/ROADMAP、modules/README、planned/README、dev-toolbox README 等入链全部重定向，390 条相对链接校验通过
  - **i18n 归集（用户指令）**：插件文案自包含于 `extensions/<id>/locales/{zh,en}.json`（独立 i18next 实例消费）；主包 locales 删除全部已迁模块键（photoTriage 残留清零）；**i18n 守卫扩展**：自动校验全部插件 locales 成对/结构/无重复键（缺 locales 直接挂 CI）
  - **迁移清单沉淀（用户指令）**：完整 checklist（代码/能力面/manifest/i18n/文档/测试/宿主摘除/冒烟，含历次教训）写入 [extension-workflow.md §11](../../../docs/extension-workflow.md)
  - **已知缺口**：插件测试不在 CI 执行（宿主 vitest exclude extensions）——插件测试 runner 归入 P4.5 SDK 范围
- [x] ~~插件测试 runner~~ **已提前交付（2026-09-08）**：`pnpm run test:extensions`（逐插件 vitest + jsdom + 与构建一致的 alias），4 插件全配 `vitest.config.ts` + 页面冒烟测试（31 用例）；建议并入 CI verify 链
- [x] **命令市场（2026-09-08，用户指令）**：命令中心 UI 留宿主、命令脚本市场化——`command_center/market.rs`（list/install，sha256 + 版本单调 + `market` 来源标记）+ 同级独立仓库 `../command-market/`（registry.json + build-registry.mjs + 现有 3 命令迁入）+ 命令中心「命令市场」弹窗（未配置源 = 空态）。详见 [extension-workflow.md §12](../../../docs/extension-workflow.md)
- [x] **插件发布仓库 + CI（2026-09-08，用户指令）**：GitHub 组织 `kindred-plugin-market`（待用户手动创建组织本体）——4 插件独立仓库 + `registry` 索引仓库已本地初始化（`~/Documents/github/kindred-plugin-market/`，各含 release.yml：tag `v*` → 借 Bench 宿主工作区构建 → Release zip）；Bench 新增 `pack-extension.mjs` / `update-extension-registry.mjs` / `sync-extension-repos.mjs` 与 `pack:ext` / `update:ext-registry` / `sync:ext-repos` scripts。卡点与手动步骤见 [extension-workflow.md §13](../../../docs/extension-workflow.md)
- [ ] 候选后续批次（中等）：port-manager / env-detector
- [x] **重系统耦合模块降级为「按需」而非计划内**：quick-launch / app-manager / command-center / network-probe / updater / system-settings / account-manager（涉及权限、凭据、系统级动作，插件化收益低而破坏面高）
- [ ] dev-toolbox host 泛化（删 `TOOLBOX_FEATURE_IDS` 与硬编码 tabs）—— 仅在前述迁移确有收益时执行
- [ ] 宿主主包残留清理：`src/shared/compare/`（ModelPicker 已无宿主消费者）、photo-triage 主包 i18n 遗留键（`sidebar.photoTriage` + `photoTriage` 命名空间）
- [ ] 253 条命令的 ACL 能力面按批登记，不预先全量登记（每批 `verify` + 双平台 CI 护航）

---

## P6 ⬜ Windows release 产物（发布硬前置）

- [ ] 恢复 Windows 安装包产出（依赖 P3.2 已跑通的 verify job）
- [ ] 插件子系统双平台实测：`ext-` 窗口 capability、asset provider、独立 WebView 行为、`remove_dir_all` 文件占用
- [ ] 插件产物 Windows 签名策略确认（与 D-010 ad-hoc/unsigned 约定对齐）
- [ ] 全部门禁双平台绿后，插件化能力才允许随正式版发布

---

## 已知风险与依赖

| 风险 / 依赖                                     | 影响阶段  | 说明                                                   |
| ----------------------------------------------- | --------- | ------------------------------------------------------ |
| ~~P3.1 未做先写 download~~ 已消除（2026-09-08） | P3.3 / P4 | manifest schema v2 已冻结，download/extract 可安全实现 |
| registry 私钥不在本机                           | P4        | 验签骨架已就绪，签名与 market 上架需私钥环境           |
| Windows CI 暂停（D-021）                        | P3.2 / P6 | 非代码缺陷；已提前到 P3.2 处置                         |
| bundled 不随包发布                              | P3.4      | 用户升级即插件消失；已提前处置                         |
| 诊断文件单条覆写                                | P3.3      | boot 覆盖先前 error，改追加式即可                      |
| 253 条命令的 ACL 登记量                         | P5        | 改为按批登记 + 停止线，不再全量规划                    |
| 缺少作者侧交付物                                | P4.5      | 生态无法冷启动；已新增该阶段                           |

---

## 附录 A　已固化的技术铁律

> 这些经验原本散落在过程性文档中，删除文档后在此固化，避免重蹈覆辙。违反者会在特定环境下静默失败，且本机不一定能复现。

| #   | 铁律                                                                                                        | 背景                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **extension URL 一律显式 `tauri://localhost/ext/…` + `WebviewUrl::CustomProtocol`，禁用 `WebviewUrl::App`** | Tauri 源码 `manager/mod.rs:353 get_app_url`：`#[cfg(dev)]` 时 `App(path)` 会 join 到 `build.devUrl`（vite 1420），永远到不了 asset provider；只有生产构建走 `tauri://localhost` |
| 2   | **插件 vite 构建必须 `base: "./"`**                                                                         | 产物默认绝对路径 `/bundle/...`，在 `tauri://localhost/ext/<id>/` 子路径下丢前缀 → 404 白屏                                                                                      |
| 3   | **Rust 跨平台路径判断用字符串，禁用 `Component::Prefix`**                                                   | 该枚举变体仅 Windows 存在，直接匹配会破坏 macOS 编译                                                                                                                            |
| 4   | **不要在 `#[cfg(...)]` 与其绑定变量之间插入代码**                                                           | P1 曾因此导致 cfg 错误作用于新变量，且 single-instance 分支在 macOS debug 下错误参与编译                                                                                        |
| 5   | `handle()` 已返回 `&AppHandle`，不要再写 `&app.handle()`                                                    | clippy `needless_borrow`                                                                                                                                                        |
| 6   | **Tauri 自定命令默认全窗口放行**，capability 只约束 core/plugin 命令                                        | 插件场景必须走 `acl::guarded` 网关，不能依赖 capability 隔离                                                                                                                    |
| 7   | 改动 Rust `#[cfg]` / 平台分支前必跑 `pnpm run check:be-cfg`                                                 | 本机 macOS 编译通过 ≠ 双平台验证（`coding-standards.md §7.4.1`）                                                                                                                |
| 8   | 插件 bundle 部署须用「产物模式」（`assets/` 为部署根），不要用 vite 源码入口                                | 曾因部署了源码入口导致引用 `/src/main.tsx` 404 白屏                                                                                                                             |
| 9   | `docs/modules/<x>/` 下指向 docs 顶层文件的相对路径是 `../../`（两级）                                       | 相对路径踩坑三次                                                                                                                                                                |

---

## 附录 B　重排依据（行业最佳实践，2026-09-08 联网核验）

**包完整性 —— 没有任何主流生态只签 manifest**

| 生态                | 做法                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Mozilla AMO         | XPI 内逐文件算 digest → `META-INF/manifest.mf` → 对该清单签名（`.sf` + PKCS7 `.rsa`）；安装时四级校验，且要求包内所有文件都被清单列出   |
| Chrome Web Store    | `computed_hashes.json`（每文件 4KB 分块 SHA256）+ `verified_contents.json`（JWS 签名覆盖 hash 树，payload 含 `item_id`/`item_version`） |
| VS Code Marketplace | 发布时对**整个扩展包**签名，安装时校验包的完整性与来源                                                                                  |

**更新通道攻击面**：rollback（提供旧的、签名合法的包诱使降级）与 freeze（持续提供旧元数据让用户看不到安全更新）是「只验签名」挡不住的头两号攻击。TUF 的设计围绕它们展开（root/targets/snapshot/timestamp 四角色 + 阈值 + 有效期 + 一致快照），但 TUF 自身的适用边界也写明「低运维规模的内部构建宜用更简单签名」—— 本项目据此选择三条低成本措施而非引入 TUF。

**签名工具自身边界**：minisign 官方 README 明确 trusted comment 可用于写入「文件名、时间戳、资源标识或**版本号以防止降级攻击**」；同时 minisign 无内置有效期与版本概念，需在宿主侧补齐。

**信任模型**：VS Code 1.97 起首次安装第三方 publisher 扩展会弹窗确认信任；Marketplace 保留 block list，确认恶意后下架并**强制卸载已安装实例**（本项目对应采取「吊销 + 强制禁用 + 显著警示」）。Marketplace 侧的动态沙箱检测与多引擎扫描因成本原因不做。

**UI 与生态规模**：成功插件市场（uTools 3000+ / VS Code 5 万+ / Raycast / Obsidian）的插件**必能贡献 UI**；纯逻辑插件生态（Zed / Lapce / dprint）规模仅数十至数百。Bench 是工具箱，模块 90% 工作量是 UI → B′ 路线正确。

**registry 形态**：静态 JSON + Git 托管是当前主流轻量做法（Claude Code plugin marketplace 的 `marketplace.json` + Git；Obsidian `community-plugins.json` + GitHub Release；Rubick 的 npm 源 + WebDAV）。静态托管**不降低**验签安全性 —— 前提是 P3.1 的完整性校验已到位。
