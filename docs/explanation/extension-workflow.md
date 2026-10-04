# Extension 开发仓库组织与工作流

> **日期**：2026-10-04 ｜ **状态**：**已落地并演进**（[D-024](./decisions.md#d-024--extension-仓库组织与-photo-triage-试点拆法) 的早期决策已实施；插件源码真源于 2026-09-09 起迁入官方集合仓）
> **定位**：本文档是插件化的**架构边界 + 工作流唯一文档**（原 `plugin-architecture.md` 的 B-lite 设计已被 D-023 的 B′ 路线取代，其中仍有效的内容已并入本文 §7）。**执行顺序与状态唯一清单见 [modules/extension-center/roadmap.md](../modules/extension-center/roadmap.md)**。
> **背景**：P1 已证实 B′ 方案（宿主 + 可下载前端 bundle）。本文件定案「插件在哪个仓库开发、怎么开发、怎么发布」，并以 photo-triage 纳入插件为首个试点场景。

> **当前实现优先**：早期章节中“官方源码留在 Bench 主仓库、无需官方插件集合仓”的提案已被后续 D-024 执行记录和官方仓工作流取代。当前官方插件源码唯一真源是 [kindred-plugin-market/plugin-market](https://github.com/kindred-plugin-market/plugin-market) 的 `extensions/<id>/`；本文件第 13 节记录现行发布流程。

---

## 0. 问题定义

photo-triage 纳入插件范围后：

1. 还在 bench 主仓库开发？
2. 每个插件独立仓库？
3. 一个「插件集合仓库」？

---

## 1. 行业先例（都是怎么做的）

| 项目                | 官方/内置插件住哪                                                                     | 第三方插件住哪                              | 本地开发方式                        |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| **VS Code**         | **核心仓库 `extensions/` 目录**（TypeScript/JSON 语言特性等全是捆绑扩展，随主包发布） | 各自独立仓库 → Marketplace PR/发布          | `--extensionDevelopmentPath` 热加载 |
| **uTools / Rubick** | 极少官方插件                                                                          | 独立项目 → 市场提交                         | 开发者模式本地加载                  |
| **Raycast**         | 少数内置                                                                              | 独立 repo（npm 安装 `@raycast/api`）→ Store | `ray develop` 本地热重载            |
| **Obsidian**        | 无内置                                                                                | 独立仓库 → 社区插件 GitHub PR 审核入目录    | 手动复制到 vault 调试（BRAT 辅助）  |
| **dprint**          | **官方插件 monorepo**                                                                 | 独立发布 + registry checksum                | —                                   |

**共同规律**：

- **官方/捆绑插件住主仓库**（VS Code 是最典型的「绝大部分功能插件化」实现——它的很多核心体验就是随主包捆绑的扩展）；
- **第三方插件独立仓库**，经 registry/市场审核进入生态；
- 开发期一律支持**本地加载**（不经过市场）。

---

## 2. 三个选项对比（针对 Bench 现状）

| 维度                              | A. 主仓库 `extensions/` 目录         | B. 每插件独立仓库 | C. 官方插件集合仓库 |
| --------------------------------- | ------------------------------------ | ----------------- | ------------------- |
| 契约演进期同步成本                | **最低**（改契约+改插件一次 commit） | 高（跨仓库 PR）   | 中（跨仓库 PR）     |
| 复用基建（CI/lint/clippy/vitest） | **直接复用**                         | 每仓库重建        | 集合仓库重建一份    |
| 第三方作者准入                    | 不合适（会看到核心代码与内部文档）   | **合适**          | 不适用（仅官方）    |
| 仓库体积/治理                     | 主仓库变胖（可控，插件产物不进 git） | 各仓库小          | 多一个治理单元      |
| 版本发布                          | 插件版本随 manifest 独立             | 完全独立          | 集合仓库统一发版    |

**历史结论（2026-09-08）**：契约在 P2–P4 频繁演进时，主仓库插件降低同步成本；该结论解释了早期试点选择，不再代表当前源码位置。

---

## 3. 当前仓库模型（以 2026-09-09 后实际流程为准）

### 官方插件集合仓库

官方插件集合仓 `plugin-market` 同时保存 `extensions/<id>/` 源码和 `registry.json`。Bench 主仓库不再维护官方插件源码，也不运行 `sync:ext-repos`；宿主 release 构建按固定 Bench 基线从集合仓构建所需插件。插件产物和 registry 元数据经 GitHub Release、受保护分支与 PR 检查发布。

bundled 与 market 描述的是分发方式：bundled 随 Bench 安装包发布；market 从 registry 获取。两种形态均进入 `$APPDATA/extensions/<id>/`，开窗前都校验 manifest 与逐文件 hash。

### 第三方插件

- 作者从公开的 [bench-extension-template](https://github.com/kindred-plugin-market/bench-extension-template) 创建插件仓库；模板包含 SDK、脚手架、本地调试、打包签名和提交流程；
- 第三方在自有仓库开发，通过模板打包并按第三方 registry 规则使用 minisign；向 registry 仓库提交插件条目 PR，经检查和审核后上架。

官方集合仓库与作者模板仓均已存在；当前 GitHub 组织还保留独立命令市场仓。仓库清单与发布步骤见 §13。

---

## 4. photo-triage 具体怎么拆（回答「如何继续开发」）

历史迁移盘点：前端 21 个 ts/tsx；Rust 9 文件 / 2350 行 / **15 条 IPC 命令**（`trash_ops.rs` 870 行，含进程树回收）。photo-triage 已迁入 plugin-market，以上文件计数是拆分时的基线，不代表当前目录结构。

### 拆法：Rust 能力面留核心，UI + 编排出插件

| 部分                                              | 去向                                                                                                                      | 理由                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rust 侧 15 条命令（扫描 / trash / 移动 / 空目录） | **留在核心**，改造为「宿主能力」：登记进 `bench_host` 能力面 + ACL 注册表（`photo.scan` / `photo.trash` / `photo.move`…） | ① TCC 权限、进程树回收、持久化 schema 是**宿主级系统能力**，天然属于核心；② B′ 插件形态是前端 bundle，**Rust 逻辑不随插件走**；③ 能力面是共享的——将来其他插件可复用 photo 能力 |
| 前端 21 文件（UI + 编排）                         | **迁出为插件** `plugin-market/extensions/photo-triage/`                                                                   | 界面、筛选交互、批量操作编排——这些是「插件」的部分，可独立迭代/卸载                                                                                                            |

**对开发节奏的影响：接近零。**

- photo-triage 的迁移路径决策（Python→Rust 重写 vs Rust 调用 Python / sidecar）**不受影响**——那是核心能力面的实现细节。若最终选 sidecar，manifest `delivery: "sidecar"` 正好复用 D-017 pack 模型；
- 日常开发照旧在主仓库：改前端 → `pnpm run dev` → 插件窗口即时生效；改 Rust → 照常走 `cargo` 链路；
- 唯一的新增工作是 P2 的一次性改造：15 条命令加入 ACL 注册表 + photo-triage 前端从 `src/features/` 迁到 `extensions/photo-triage/`（IPC 契约不变，契约测试天然护航）。

---

## 5. 发布与版本

- 插件版本由 `manifest.version` 独立管理，与宿主版本解耦；
- 版本规则、兼容门控、单调性、卸载与禁用语义统一见 **[extension-spec.md §8 版本与兼容](../reference/extension-spec.md)**；
- `distribution: "bundled" | "market"`：bundled 产物随主包构建并捆绑；market 产物从 registry 下载。官方源按 registry ZIP SHA-256/size + manifest `files` 校验，第三方源额外要求 minisign（[extension-spec.md §5.4](../reference/extension-spec.md#54-官方-registry-的信任与完整性)）；
- 具体分发步骤见 §8.4～§8.6。

---

## 6. 决策记录（2026-09-08 原始决策 · 已回写 [D-024](./decisions.md#d-024--extension-仓库组织与-photo-triage-试点拆法)）

| #   | 问题                                                                                                   | 结论                                             |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 1   | 两阶段组织（试点期主仓库 `extensions/`，生态期模板仓库 + 独立仓库 + registry PR）                      | ✅ 原始决定；2026-09-09 后源码真源转入官方集合仓 |
| 2   | photo-triage 拆法（Rust 15 条命令留核心转宿主能力 + ACL；前端 21 文件迁出 `extensions/photo-triage/`） | ✅ 采纳                                          |
| 3   | bundled / market 双分发（bundled 保证 2.0 过渡期功能不真空）                                           | ✅ 采纳                                          |
| 4   | 首个迁移试点用 photo-triage（替换 token-calculator）                                                   | ✅ 采纳                                          |

2026-09-09 起，按后续组织决定将官方插件源码统一迁入 `plugin-market` 仓库，并把该仓库同时用作 canonical registry；早期两阶段方案仅保留为决策历史。

---

## 7. 架构边界与安全模型（吸收自已被取代的 B-lite 设计）

### 7.1 宿主架构（B′，D-023）

| 组件                                     | 职责                                                                    | 说明                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ExtensionAssets`（asset provider 包装） | 资源解析顺序：插件目录 `$APPDATA/extensions/<id>/…` → 内置资源          | P1 实读 Tauri 源码后选择的路径，优于原计划的 `asset://` 顶层窗口：IPC 天然同源、CSP 零改动、无 `asset://` 与 `http://asset.localhost` 的平台差异 |
| `acl::guarded`（IPC 网关）               | `ext-` 前缀窗口只能调用 `EXTENSION_ALLOWED_COMMANDS` 注册表内的命令     | 补上 **Tauri 自定命令默认全窗口放行**的缺口；capability 只约束 core/plugin 命令，不能替代此网关                                                  |
| `manifest.rs`                            | schema 校验、id/semver/entry/ACL 子集/engines，fail-closed              | 新增与其对接的签名与完整性校验见 roadmap P3.1                                                                                                    |
| 命令面                                   | `ext_list_installed` / `ext_open` / `ext_set_enabled` / `ext_uninstall` | 契约双写，单测护航                                                                                                                               |

**单个插件的权限边界** = `manifest.acl.commands` ⊆ `EXTENSION_ALLOWED_COMMANDS` ⊆ 后端全部命令。越权一律 fail-closed。

### 7.2 仍然有效的约束（来自被取代的设计，未失效）

- **D-017 红线**：禁止运行时 cargo/npm 拉依赖；核心 Rust 命令保持编译期链接；插件是数据/bundle，不进核心二进制完整性边界。
- **单二进制 + minisign**：核心随主包签名；插件与其并列，不削弱主包签名链。
- **IPC 契约双写铁律不削弱**（[ARCHITECTURE.md §2](../reference/architecture.md#2--ai-编码规则--禁止模式) 第 7 条）：插件经命令白名单网关，反而收窄了 renderer 信任边界。
- **i18n**：`labelKey` / manifest `display` 仍须落 locale；插件自带 namespace。
- **renderer 信任边界**：下载 URL / 版本 / hash / 签名材料**只由后端 canonical 配置决定**，renderer 不得提交最终下载地址或可执行路径（D-007）。

### 7.3 明确的非目标

- 不运行时热载核心 Rust crate / npm 包进主程序（D-017 红线）。
- 不改变编程语言：宿主仍是 Rust + WebView；插件是前端 bundle。
- **WASM 仅作为未来的「附属形态」**：若将来需要纯计算/规则引擎类插件，可作为 bundle 内的本地 wasm 模块存在，**不作为独立交付形态、不引入 wasmtime 到宿主**（规避 Windows CI 与 MSVC 编译风险）。
- 不自建 registry 服务端、不引入 TUF、不做 marketplace 级动态恶意代码沙箱（成本与规模不匹配，见 roadmap「成本原则」）。

### 7.4 技术铁律

实施时的硬性约束（含踩坑来源）统一维护在 [modules/extension-center/roadmap.md](../modules/extension-center/roadmap.md) 的「附录 A　已固化的技术铁律」，**动手前必读**。

---

## 8. 作者侧流程（P4.5 交付物）

> 目标：**前端开发者零门槛** —— 会写 React 就能做插件，不需要懂 Rust（对标 uTools 生态的成功要素）。
> 契约细节一律以 [extension-spec.md](../reference/extension-spec.md) 为准。

作者工具的代码和上手步骤统一维护在公开模板仓库：[kindred-plugin-market/bench-extension-template](https://github.com/kindred-plugin-market/bench-extension-template)。不要在 Bench 宿主仓库里运行旧的 `extensions:create`、`extensions:sync` 或 `extensions:pack` 指令；这些作者侧入口已迁到模板仓库。

### 8.1 创建与本地调试

1. 在模板仓库点击 **Use this template**，创建自己的插件仓库；
2. 安装仓库指定版本的 Node.js 与 pnpm，再运行 `pnpm run extensions:create <id>`；
3. 修改插件页面、双语 locale 和 manifest；通过 `--dev-unsigned` 生成本地开发包并安装到 Bench 的插件目录；
4. 以 `BENCH_EXT_DEV_MODE=1` 启动 Bench 开发构建，在插件中心打开。开发包仅供本机调试，不能提交正式 registry。

模板 README 提供 macOS / Windows 的逐步命令、覆盖保护与启动方式。插件 ID 必须匹配 `^[a-z][a-z0-9-]*$`；manifest 约束见 [spec §3](../reference/extension-spec.md)。

### 8.2 SDK 与宿主边界

模板内的 `@bench/ext-sdk` 提供类型化 IPC 薄封装、宿主语言桥、插件数据目录和本机诊断接口。浏览器预览可用 `isBenchExtension()` 隐藏宿主操作；`getHostCapabilities()` 只供 UI 提示，**不是授权边界**。每次 IPC 仍由 Bench 后端按 manifest ACL 校验。诊断写入本机日志，不会自行发起网络请求，并限制字段和文本长度；作者仍不得记录凭据或真实用户数据。

SDK API、依赖方式和示例见[模板 SDK 文档](https://github.com/kindred-plugin-market/bench-extension-template/tree/main/packages/ext-sdk)。

### 8.3 构建、签名与发布

```bash
pnpm run extensions:pack <id> --key <private-key> --pubkey <public-key>
```

模板脚本会构建插件、生成 `manifest.files` 逐文件 SHA-256 清单和 canonical manifest，也可使用 minisign 生成签名 ZIP。第三方 registry 必须配置 minisign 公钥；官方 plugin-market 发布流程依赖受保护 GitHub 仓库、PR 检查和 registry 整包摘要，不要求插件作者提供官方私钥。私钥不得提交到仓库；无签名的 `--dev-unsigned` 产物只用于本地开发，或在显式开发模式下测试。

正式分发时，作者按[市场提交流程](https://github.com/kindred-plugin-market/bench-extension-template#提交到插件市场)提交源码和 registry 元数据 PR。维护者复核 manifest、最小 ACL、SHA-256 与产物来源。官方和第三方来源采用不同验证策略，详见 [extension-spec.md §4 / §5.4](../reference/extension-spec.md)。

### 8.4 版本升级与下架

| 场景       | 操作                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 发新版     | 更新 manifest semver 版本 → 用模板仓库 `extensions:pack` 生成签名 ZIP 与元数据 → 向 registry PR 追加 `versions[]` 条目       |
| 撤回某版本 | 该版本 `yanked: true`（已安装仍可运行，不再出现在可安装列表）                                                                |
| 紧急吊销   | registry `revoked[]` 增加条目 → 宿主**强制禁用 + UI 显著警示**（不静默删除，见 [spec §5.3](../reference/extension-spec.md)） |

模板操作手册和 SDK 指南以[作者模板仓库](https://github.com/kindred-plugin-market/bench-extension-template)为准；本节只保留宿主与市场之间的长期契约。

---

## 9. 宿主侧运维流程

| 场景                 | 流程                                                                                                | 归属   |
| -------------------- | --------------------------------------------------------------------------------------------------- | ------ |
| **bundled 随包发布** | `extensions:build` 产物接入 `tauri build` → 随正式包分发 → 首次启动拷入 `$APPDATA/extensions/`      | P3.4   |
| **市场安装**         | 见 [spec §6.1](../reference/extension-spec.md) 端到端步骤                                           | P4     |
| **权限披露**         | 安装前展示 `manifest.acl.commands` 的人类可读描述                                                   | P4     |
| **更新提示**         | registry 版本比对 + `engines` 升级引导 + `yanked` 提示                                              | P4     |
| **吊销**             | 拉取 registry 时同步 `revoked[]` → 强制禁用 + 警示                                                  | P4     |
| **审计**             | 追加式 `$APPDATA/ext-audit.log`，字段见 [spec §6.2](../reference/extension-spec.md) 与 roadmap P3.3 | P3.3   |
| **诊断**             | 插件中心诊断面板查看 ext 日志（替代裸 JSON）                                                        | P4     |
| **卸载**             | `ext_uninstall`：关窗 + 删目录（仅限合法插件目录）+ `DestructiveConfirmDialog`                      | 已实现 |

---

## 10. 文档地图（插件化）

| 文档                                                                                | 层                   | 职责                                                                                                                                    |
| ----------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [extension-spec.md](../reference/extension-spec.md)                                 | Reference            | **契约唯一规格**：manifest / 签名 / registry / 产物格式 / ACL / 版本                                                                    |
| [extension-workflow.md](./extension-workflow.md)（本文）                            | Explanation + How-to | 架构边界、仓库组织、开发→发布工作流                                                                                                     |
| [modules/extension-center/roadmap.md](../modules/extension-center/roadmap.md)       | Roadmap              | **执行顺序与状态唯一清单**（含行业依据与技术铁律附录）                                                                                  |
| [product-specs/extension-center.md](../reference/product-specs/extension-center.md) | Reference            | 插件中心的功能规格（界面 / 交互 / 异常）                                                                                                |
| [planned/extension-center.md](../roadmap/planned/extension-center.md)               | Roadmap              | 插件中心未实现项                                                                                                                        |
| [DECISIONS.md](./decisions.md) D-023 / D-024                                        | Explanation          | 方向性决策                                                                                                                              |
| `extensions/<id>/docs/`（README / product-spec / planned / roadmap）                | Reference + Roadmap  | **已插件化模块的自包含三件套**（P5 起随插件走，不再放 docs/modules；dev-cleaner 类子能力在 `extensions/clean-space/docs/dev-cleaner/`） |

## 11. 模块插件化迁移清单（P5 实践沉淀，照单执行）

> 已完成：photo-triage（P2b）、terminology、hardware、clean-space（含 dev-cleaner 子能力）。
> 每一步都有门禁兜底；**照单打钩，漏一步 CI 会替你补课**——但别赌，按顺序来。

### 11.1 前置判据（四条须同时满足，见 roadmap P5）

1. 构成完整业务闭环（可独立成窗口）；2. IPC 面清晰且低共享状态；3. 不依赖 TCC / 系统权限 / 凭据；4. 迁移后无宿主↔插件高频往返。重系统耦合模块（quick-launch / app-manager / command-center / network-probe / updater / system-settings / account-manager）**降级为按需**，不进计划。

### 11.2 代码迁移

- [ ] 建目录 `extensions/<id>/`：`manifest.json`（schema v2）+ `vite.config.ts` + `index.html` + `src/` + `locales/{zh,en}.json`（对照任一现有插件脚手架）
- [ ] `vite.config.ts`：`base: "./"` 铁律；`@` → 宿主 `src/`（复用 UI 组件/契约 wrapper，随 bundle 打包）；`@extension` → 插件 `src/`；outDir `assets/`
- [ ] 插件源码位于 `kindred-plugin-market/plugin-market/extensions/<id>/`（唯一真相源；宿主没有 `src/extensions/<id>/`，也不再有 `sync:ext-repos` 同步；AppFeature 描述符 `feature.tsx` 是宿主概念，不随插件走）；内部 `@/features/<id>/` 引用改 `@extension/`
- [ ] 插件私有子能力（如 dev-cleaner）作 `src/<sub>/` 子目录随迁
- [ ] 宿主独占实例的引用要换成插件内实例：数据模块若 import `@/i18n/config`（宿主 i18n，会把全量语言资源拖进插件 bundle），改为 `@extension/i18n`（hardware 的教训）
- [ ] **i18n 资源不得双重包装**：插件 locale 文件本身是 `{ "translation": { 命名空间... } }`，`i18n.ts` 里必须解包一层 `resources: { zh: { translation: zh.translation } }`——直接 `{ translation: zh }` 会让 `t()` 全部返回 key 原文（P5 四插件曾集体中招；用 i18next 离线复演 `t(key) !== key` 验证）
- [ ] 仅剩唯一插件消费的共享组件/数据（如 `CompareMatrixTable`、`src/data/*`）随插件迁走；**多方共用的**（如 `FilterBar`）留宿主 shared，插件经 `@` 引用
- [ ] **vite.config 必须加 `"@/i18n/config" → 插件 src/i18n.ts` 别名，且必须放在 `"@"` 之前**：多方共用的宿主模块（`FilterBar`/`i18nBrand`/`FeatureErrorBoundary` 等）import 宿主 i18n config，会在插件窗口里二次 init、用宿主资源覆盖插件实例（宿主资源没有插件命名空间 → 同样显示 key）。**键序是命门**：vite alias 按声明顺序匹配，`"@"` 是前缀规则，精确别名排在它后面 = 完全不生效（P5 实测踩坑）。验证方法：构建产物中 grep 宿主 locales 独有值（如 sidebar 的「跨平台工具集」）应为 0 命中
- [ ] 改插件源码后必须手动 `pnpm run extensions:build && pnpm run extensions:sync`（dev 模式不自动重建插件），然后**重开插件窗口**才能看到效果

### 11.3 能力面与 manifest

- [ ] IPC 命令**留在宿主 Rust 核心**，仅登记 ACL 注册表（`extension_host/acl.rs`）+ 补 `capability_face_all_allowed` 测试；纯前端插件 `acl.commands: []` 并在注释声明
- [ ] manifest `engines.bench` 门槛必须 ≤ 宿主版本——**别硬编码**：验证包脚本是动态读 `tauri.conf.json` 的 version（bench-poc 曾写死 `>=2.0.0` 导致插件中心显示「宿主版本不兼容」）
- [ ] 平台限制用 `platforms` 字段（spec §3.1，P5 增补；缺省全平台；宿主在已装列表按当前平台过滤）
- [ ] 契约（contracts.ts / types）**留在宿主**不动——双写规则针对宿主 Rust 面，与 UI 位置无关

### 11.4 i18n 归集（守卫已强制）

- [ ] 插件文案放 `extensions/<id>/locales/{zh,en}.json`（`{ "translation": { <命名空间>, common } }` 结构；`common` 整份拷贝保持插件自包含）
- [ ] 插件入口建**独立 i18next 实例**（`src/i18n.ts`，语言取 `window.__BENCH_EXT_LOCALE` 注入 → 回退 navigator.language）
- [ ] **主包 locales 删除该模块全部键**：模块命名空间 + `sidebar.<labelKey>`，zh/en 同步（parity 由守卫强制）
- [ ] `check-i18n-guards.mjs` 已自动校验插件 locales 成对/结构一致/JSON 无重复键（输出 `Plugin locales passed: N plugin(s)`）——新增插件若缺 locales 会直接挂 CI
- [ ] **文案自包含验收（用户约定：插件目录将来整体搬去独立仓库）**：跑 `pnpm run audit:ext-i18n`——扫描插件源码 + 其经 `@/` 引用的宿主共享模块的全部 `t()` key/动态族，必须 100% 命中插件 locales（7/7 自包含为准）。宿主共享组件新增 key 时重跑审计并同步各插件 common；**插件专用的工具/命名空间（如 `i18nBrand` + `brands`）直接迁入插件**，不留宿主引用

### 11.5 文档归集（守卫已强制）

- [ ] 文档三件套随插件走：`extensions/<id>/docs/{README.md, product-spec.md, planned.md, roadmap.md}`（自 `docs/reference/product-specs/`、`docs/roadmap/planned/`、`docs/modules/<id>/` 用 `git mv` 迁入，保留历史）
- [ ] 技术设计 / 原型等模块独有文档一并迁入（clean-space 的 `design.md` + `clean-space-prototype.html`）；子能力文档放 `docs/<sub>/`（dev-cleaner 先例）
- [ ] README 顶部标明**插件形态**（bundled / 平台限制 / 能力面归属 / 测试位置）
- [ ] 删除 `docs/modules/<id>/`；`check-docs-consistency.mjs` 对插件自动改查 `extensions/<id>/docs/`（输出 `N features + M plugins ↔ K module docs`）
- [ ] 全库入链梳理：`docs/roadmap/ROADMAP.md`、`docs/modules/README.md` 索引、`docs/roadmap/planned/README.md`、相关模块 README 中指向被迁文件的相对链接逐个重定向，跑 `check:docs` 验证

### 11.6 测试

- [ ] 插件测试放 `extensions/<id>/src/__tests__/`（随代码迁入）；**每个插件建 `vitest.config.ts` + `vitest.setup.ts`**（jsdom + 与构建一致的 alias，含 `"@/i18n/config"` 重绑定），并加**页面冒烟测试**（jsdom 渲染根组件 + 最小 invoke 桩）——"打开即白屏"类回归直接浮出
- [ ] 跑 `pnpm run test:extensions -- --market <插件源码根>`（runner 循环全部带 vitest.config 的插件，fail-fast；缺输入/零发现/零实测一律失败，见 [D-036](./decisions.md)）；宿主 vitest 仍 exclude `extensions/**`，两套并行
- [ ] 宿主侧更新：`src/features/registry.test.tsx` 断言反转（`not.toContain` 被迁路由）；`test:critical` 名单核对（被迁 feature 的测试若在列需移除）
- [ ] **迁走共享工具前必须查全宿主消费者**（`grep -rln` 全 src，含测试文件）：两边都用 → 各留一份副本（如 `refresh.ts`：宿主原件保留、插件内 `lib/feature-refresh.ts` 副本，与 common 快照同理）；只删不查 = 宿主测试收集直接红（P5 实测踩坑）

### 11.7 宿主摘除与冒烟

- [ ] `src/features/registry.tsx` 删除 import 与注册项；`git rm -r src/features/<id>/`（**删完检查空目录残留**——空目录会让 docs 门禁误报 feature 仍存在）
- [ ] 冒烟全链：`pnpm run lint:fe`（含 i18n + docs 双守卫）→ `test:fe` → `cargo test --lib extension_host` + `clippy:be` → `pnpm run extensions:build`（自动循环全部插件，fail-fast）→ `extensions:stage` + `extensions:sync` → 核对部署 manifest（schema/acl 数/platforms/files 数）
- [ ] 打包分发无需额外动作：`tauri.conf.json` 的 `bundle.resources` 已映射整个 `resources/extensions/`，新插件 stage 后自动随包（启动时宿主拷入 + 完整性校验，见 §9）

## 12. 命令市场（P5，命令脚本独立发布）

> **决策**：命令中心 UI 留在宿主，**命令脚本数据市场化**——发布/更新命令无需重新发布 Bench 客户端。
> 市场仓库：`kindred-plugin-market/command-market`（与 Bench 仓库同级，独立 git 仓库；发布指南见其 README.md）。

### 12.1 架构

- 市场仓库 = `registry.json`（索引：id/version/title/kind/file/sha256/size）+ `commands/<id>.json`（完整命令定义，schema v1）；
- 宿主 `command_center/market.rs`：`command_market_list`（浏览 + 已装状态比对）/ `command_market_install`（**sha256 → 解析绑定 → 版本单调 → 落位 cards.json**，fail-closed）；
- 市场源（后端独占配置，renderer 不得自选 —— D-007）：优先级 `BENCH_COMMAND_MARKET_DIR`（本地调试）> `BENCH_COMMAND_MARKET_URL`（覆盖）> **官方默认源**（内置：`https://raw.githubusercontent.com/kindred-plugin-market/command-market/main/registry.json`，P5 零配置上线）；
- 安装的卡片带 `market` 来源标记（version + installedAt），命令中心显示市场徽标；升级走版本单调检查（拒绝降级）。

### 12.2 发布与开发

- 发布命令：在 command-market 仓库新增/修改 `commands/*.json` → `node scripts/build-registry.mjs`（重算 sha256）→ git push；
- 开发调试：`BENCH_COMMAND_MARKET_DIR=<command-market 目录> pnpm run dev`；
- 接远程仓库（下一步）：建好 Git 托管后，配置 `BENCH_COMMAND_MARKET_URL` 指向 raw `registry.json` 即可，宿主能力已就绪。

### 12.3 边界

- 命令内容为**任意 shell 脚本**，安装进本地卡片库后由用户手动执行（与现有卡片一致）；市场安装只解决分发与完整性，执行安全沿用命令中心现有确认机制（shellAdmin 二次确认等）。

## 13. 插件发布仓库（GitHub 组织 kindred-plugin-market）

> **当前模型（四个公开仓库）**：插件市场、命令市场、作者模板与质量工具各自独立；前三者构成插件发布链。
>
> - `plugin-market`：8 个插件源码（`extensions/<id>/`，含 app-manager / clean-space / douyin-content-assets / hardware / photo-triage / quick-launch / terminology / token-calculator）+ `registry.json`（插件市场索引真相源）+ Release Please 与 release.yml；
> - `command-market`：命令中心的市场（`commands/*.json` + `registry.json` + build 脚本；**源文件与生成索引在同一 PR 提交，CI 只读校验**，无自动写回）。
> - `bench-extension-template`：第三方作者模板，含 `@bench/ext-sdk`、脚手架、打包器和作者指南。
> - `bench-quality-cli`：维护与检查 Bench 质量的辅助 CLI，不参与插件运行时分发。
>   main 受 Ruleset 保护（PR + required check `gate / quality gate (node 26.8.2 / macos)`）；Bench 经 `BENCH_EXT_REGISTRY_URL` /
>   `BENCH_COMMAND_MARKET_URL` 拉取安装。

### 13.1 本地与远端

- 本地：用户配置的 GitHub 工作目录中分别检出 `plugin-market`、`command-market`、`bench-extension-template`；SSH 可经 443 访问；
- `plugin-market` CI：quality / Build（rolling `build-latest`，只保留当前 main 快照）/ Release Please（维护 release PR；合入后打 `<pluginId>-v<version>` tag）→ release.yml 走 gate → pack → provenance → Release 上传 → registry.json 以 bot PR 写回（P11 后 main 直推一律被 Ruleset 拒绝）。registry bot PR 所需检查通过后由维护者合入；不得绕过 Ruleset。宿主 checkout 固定 `.github/host-baseline.txt` 的完整 SHA（indredK/bench 为 public，匿名 checkout，不携带 PAT）；
- `command-market` CI：只读校验（索引漂移 → 失败并提示在 PR 中重建；无 bot 写回、无并发环）；
- 市场源（**官方默认已内置**，env 仅作覆盖/本地调试）：
  - 插件市场默认：`https://raw.githubusercontent.com/kindred-plugin-market/plugin-market/main/registry.json`（`BENCH_EXT_REGISTRY_URL` 覆盖）
  - 命令市场默认：`https://raw.githubusercontent.com/kindred-plugin-market/command-market/main/registry.json`（`BENCH_COMMAND_MARKET_URL` 覆盖；`BENCH_COMMAND_MARKET_DIR` 调试优先）
- **官方源免 minisign**：`registry::is_official_registry` 精确命中内置 URL 时豁免插件级签名（HTTPS + registry 整包 `sha256`/`size` + manifest `files` 清单双重完整性校验）；第三方 registry 一律强制 minisign。该完整性策略不抵御官方 GitHub 仓库本身被攻陷，详见 [extension-spec.md §5.4](../reference/extension-spec.md#54-官方-registry-的信任与完整性)。

### 13.2 工具链（Bench 仓库内）

- `pnpm run pack:ext -- <id>`：构建 → 注入 files → zip → `<id>.meta.json`（sha256/size）——宿主侧工具，仅本地诊断用；
- `sync:ext-repos` 已退役（2026-09-09）：**真相源反转完成**——插件源码唯一真相源 = `plugin-market` 仓库的 `extensions/<id>/`（宿主不保存这些源码），Bench 基座不再包含官方 `extensions/`。开发插件 = 在 plugin-market 仓库内改源码 → 本地 pack 装入 APPDATA 或走市场；正式发布 = conventional commit → Release Please PR（需维护者合入）→ tag/release workflow → registry bot PR（需检查通过后合入）。

### 13.3 发布流程（plugin-market）

1. 在 plugin-market 仓库内开发插件源码（PR 合入 main，过 quality gate；Bench 不再有 `sync:ext-repos`）；
2. 用 conventional commit 更新该插件 `manifest.json` 的 version（`fix(photo-triage): ...` 等，且改动触及 `extensions/<id>/`）→ Release Please 自动开 release PR（bump 版本 + CHANGELOG）；检查通过后由维护者合入；
3. 合并后 Release Please 自动打 `<pluginId>-v<version>` tag 并创建 GitHub Release → release.yml 接力（gate → pack → provenance → 上传 zip）；
4. registry.json 由 release.yml 以 bot PR 写回（等 quality gate 绿色后由维护者合入）→ Bench 市场立即可见。

### 13.4 卡点（需用户手动）

- ~~创建组织与两个仓库~~（已完成：`kindred-plugin-market` org 下 `plugin-market`、`command-market`、`bench-extension-template` 与 `bench-quality-cli` 均已上线）；
- ~~CI 拉取私有 Bench~~（Bench 已 public：宿主 checkout 匿名进行，`BENCH_REPO_TOKEN` 已从全部工作流移除，P12）；
- **SSH**：本机 22 端口被网络拦截，已在 `~/.ssh/config` 配 GitHub over 443（保留勿删）。
