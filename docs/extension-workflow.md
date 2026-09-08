# Extension 开发仓库组织与工作流

> **日期**：2026-09-08 ｜ **状态**：**已采纳**（[D-024](./DECISIONS.md#d-024--extension-仓库组织与-photo-triage-试点拆法)，四项决策经用户确认）
> **定位**：本文档是插件化的**架构边界 + 工作流唯一文档**（原 `plugin-architecture.md` 的 B-lite 设计已被 D-023 的 B′ 路线取代，其中仍有效的内容已并入本文 §7）。**执行顺序与状态唯一清单见 [modules/extension-center/roadmap.md](./modules/extension-center/roadmap.md)**。
> **背景**：P1 已证实 B′ 方案（宿主 + 可下载前端 bundle）。本文件定案「插件在哪个仓库开发、怎么开发、怎么发布」，并以 photo-triage 纳入插件为首个试点场景。

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

**结论**：契约（manifest schema / `bench_host` 能力面 / ACL）在 P2–P4 还会频繁演进，**此阶段跨仓库同步的成本远大于收益**；而第三方生态不存在，不存在准入问题。

---

## 3. 决策建议：两阶段，不设插件集合仓库

### 阶段一（P2–P4，契约演进期）：主仓库 `extensions/` 目录

```
tauri-app/
├── extensions/                    ← 新增：官方插件源码（进 git，不含构建产物）
│   ├── photo-triage/
│   │   ├── manifest.json          # id/version/entry/acl/distribution
│   │   ├── index.html
│   │   ├── assets/…               # 构建产物（dev 模式直接被宿主加载）
│   │   └── src/                   # TS 源码（vite 构建，可选）
│   └── <下一个插件>/
├── scripts/plugins/               # 构建打包脚本（复用）
└── src-tauri/src/extension_host/  # 宿主（P1 已落地）
```

- 开发体验：**在主仓库照常开发**，`pnpm run dev` 时宿主直接从仓库 `extensions/` 目录加载（dev 时把该目录注册为插件根，或构建脚本同步到 `$APPDATA/extensions/`），改完重启即生效；
- 与「2.0 = 绝大部分功能插件化」的衔接：官方插件以 **bundled（捆绑）** 形态随主包发布——用户升级 Bench 即获得，不产生「功能真空」；未来任一插件可切换为 **market（市场下载）** 形态，manifest 只改 `distribution` 字段；
- 主包瘦身：侧边栏不再静态注册 photo-triage，改为「插件中心 → 已安装（bundled）」点亮入口。

### 阶段二（开放第三方后）：模板仓库 + 独立仓库

- 提供 `bench-extension-template` 模板仓库（脚手架 + 本地 dev + 打包 + 签名校验的完整示例）；
- 第三方在自有仓库开发 → 构建产物 + manifest 提交 PR 到 canonical registry 仓库（照搬 Obsidian 社区插件 PR 审核模式）→ minisign 签名 → 上架插件中心。

**「插件集合仓库」不设**：官方插件住主仓库已覆盖其诉求，集合仓库只增加一个治理单元；第三方走独立仓库 + registry，也不需要它。

---

## 4. photo-triage 具体怎么拆（回答「如何继续开发」）

现状实测：前端 21 个 ts/tsx；Rust 9 文件 / 2350 行 / **15 条 IPC 命令**（`trash_ops.rs` 870 行，含进程树回收）。

### 拆法：Rust 能力面留核心，UI + 编排出插件

| 部分                                              | 去向                                                                                                                      | 理由                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rust 侧 15 条命令（扫描 / trash / 移动 / 空目录） | **留在核心**，改造为「宿主能力」：登记进 `bench_host` 能力面 + ACL 注册表（`photo.scan` / `photo.trash` / `photo.move`…） | ① TCC 权限、进程树回收、持久化 schema 是**宿主级系统能力**，天然属于核心；② B′ 插件形态是前端 bundle，**Rust 逻辑不随插件走**；③ 能力面是共享的——将来其他插件可复用 photo 能力 |
| 前端 21 文件（UI + 编排）                         | **迁出为插件** `extensions/photo-triage/`                                                                                 | 界面、筛选交互、批量操作编排——这些是「插件」的部分，可独立迭代/卸载                                                                                                            |

**对开发节奏的影响：接近零。**

- photo-triage 的迁移路径决策（Python→Rust 重写 vs Rust 调用 Python / sidecar）**不受影响**——那是核心能力面的实现细节。若最终选 sidecar，manifest `delivery: "sidecar"` 正好复用 D-017 pack 模型；
- 日常开发照旧在主仓库：改前端 → `pnpm run dev` → 插件窗口即时生效；改 Rust → 照常走 `cargo` 链路；
- 唯一的新增工作是 P2 的一次性改造：15 条命令加入 ACL 注册表 + photo-triage 前端从 `src/features/` 迁到 `extensions/photo-triage/`（IPC 契约不变，契约测试天然护航）。

---

## 5. 发布与版本（P2 落地）

- 插件版本由 `manifest.version` 独立管理，与宿主版本解耦；
- `manifest.engines.bench` 声明兼容矩阵（宿主升级后旧插件被拒绝或降级提示）；
- `distribution: "bundled" | "market"`：bundled 产物随主包构建产出并捆绑；market 产物走 registry 下载 + minisign 校验（P2 接入 `updater/keys/`）；
- 试点期（P2–P3）本地构建本地装，签名门禁在其后启用。

---

## 6. 决策记录（2026-09-08 用户确认 · 已回写 [D-024](./DECISIONS.md#d-024--extension-仓库组织与-photo-triage-试点拆法)）

| #   | 问题                                                                                                   | 结论    |
| --- | ------------------------------------------------------------------------------------------------------ | ------- |
| 1   | 两阶段组织（试点期主仓库 `extensions/`，生态期模板仓库 + 独立仓库 + registry PR）                      | ✅ 采纳 |
| 2   | photo-triage 拆法（Rust 15 条命令留核心转宿主能力 + ACL；前端 21 文件迁出 `extensions/photo-triage/`） | ✅ 采纳 |
| 3   | bundled / market 双分发（bundled 保证 2.0 过渡期功能不真空）                                           | ✅ 采纳 |
| 4   | 首个迁移试点用 photo-triage（替换 token-calculator）                                                   | ✅ 采纳 |

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
- **IPC 契约双写铁律不削弱**（[ARCHITECTURE.md §2](./ARCHITECTURE.md#2--ai-编码规则--禁止模式) 第 7 条）：插件经命令白名单网关，反而收窄了 renderer 信任边界。
- **i18n**：`labelKey` / manifest `display` 仍须落 locale；插件自带 namespace。
- **renderer 信任边界**：下载 URL / 版本 / hash / 签名材料**只由后端 canonical 配置决定**，renderer 不得提交最终下载地址或可执行路径（D-007）。

### 7.3 明确的非目标

- 不运行时热载核心 Rust crate / npm 包进主程序（D-017 红线）。
- 不改变编程语言：宿主仍是 Rust + WebView；插件是前端 bundle。
- **WASM 仅作为未来的「附属形态」**：若将来需要纯计算/规则引擎类插件，可作为 bundle 内的本地 wasm 模块存在，**不作为独立交付形态、不引入 wasmtime 到宿主**（规避 Windows CI 与 MSVC 编译风险）。
- 不自建 registry 服务端、不引入 TUF、不做 marketplace 级动态恶意代码沙箱（成本与规模不匹配，见 roadmap「成本原则」）。

### 7.4 技术铁律

实施时的硬性约束（含踩坑来源）统一维护在 [modules/extension-center/roadmap.md](./modules/extension-center/roadmap.md) 的「附录 A　已固化的技术铁律」，**动手前必读**。
