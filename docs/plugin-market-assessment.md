# Bench 2.0 插件化目标 · 可行性评估报告

> **评估日期**：2026-09-08 ｜ **评估对象**：本地未提交变更 `docs/plugin-architecture.md`（新增，202 行）+ `docs/DECISIONS.md` D-022（新增）
> **评估性质**：可行性 / 可靠性 / 行业对标。**不含实现动作**，结论供方向决策使用。
> **方法**：仓库实读核验（非采信文档自述）+ 三路并行网络调研（Tauri 官方机制 / Rust+WASM 插件案例 / 插件市场型应用范式）。
> **状态**：**未注册进 `docs/README.md` 索引**（等待方向决策后再回写，避免留下僵尸文档）。

---

## 0. 结论摘要

**一句话：技术方案大体可行，但建立在一个已被推翻的技术前提上；真正的风险不在技术，而在"这个产品是否真的需要插件市场"这一未回答的问题。**

| 维度                                    | 结论                                                            | 置信度                    |
| --------------------------------------- | --------------------------------------------------------------- | ------------------------- |
| 设计文档自述数据的准确性                | 3 项属实，**1 项实质偏差**（IPC 命令数 169 → 实际 253）         | 高（实读核验）            |
| 核心技术论断「renderer 不能热载整屏页」 | ❌ **不成立**（项目自身已开启 `protocol-asset`，路径铺了一半）  | 高（官方文档 + 社区实证） |
| WASM 宿主路线技术可行性                 | ✅ 可行，有 Lapce/Zed/dprint/Extism 先例                        | 高                        |
| WASM 宿主路线工程可靠性                 | ⚠️ **中低**（Windows CI 已暂停 D-021，wasmtime 无法跨平台验证） | 高                        |
| 插件市场产品可行性                      | ⚠️ **未回答**——文档通篇未说明"谁来写插件、为何要写"             | 高                        |
| 2.0 目标变更的连锁影响                  | ⚠️ 与 `GAP-TO-2.0.md` 37 项未关闭差距存在定位冲突               | 高                        |

**三条最重要的建议**：

1. **不要急着上 WASM runtime。** 当前设计把"不能热载 UI"当作核心约束，而这个约束是错的。纠正后，方案的性价比排序发生反转——**前端 bundle 插件（uTools 范式）明显优于 WASM 逻辑插件（Zed/Lapce 范式）**，因为 Bench 的 16 个模块 90% 的工作量是 UI，不是逻辑。
2. **先回答产品问题再做架构。** 若痛点是"我自己加模块要改 3 处"，正解是**约定式注册 + 代码生成**（1–2 天）；若痛点是"建立第三方生态"，才是插件市场（数月 + 持续运营）。这两件事的成本差两个数量级，文档把它们混为一谈了。
3. **术语必须改名。** Tauri 官方 "plugin" 专指**编译期 Cargo crate**，与本文档的"运行时插件"语义冲突。继续混用会导致 AI 与协作者持续误解，建议改用 `extension` / `addon` / `能力包`。

---

## 1. 本地变更核验：文档自述 vs 仓库实测

核验方式：直接读仓库，不采信文档自述。

| 文档 §1 声称                                    | 仓库实测                                                                                                                           | 判定              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 16 个 feature 模块                              | `src/features/` 21 项 − 5 个非模块文件（`registry.tsx`/`types.ts`/`refresh.ts`/`FeatureFallback.tsx`/`registry.test.tsx`）= **16** | ✅ 属实           |
| **169 条 IPC 命令**                             | `src-tauri/src/commands.rs` 宏内 **`$crate::` 条目 253 条**（去重后 253，无重复、无非命令行）                                      | ❌ **低估 49.7%** |
| `lib.rs` 11 处 `.manage`                        | **11 处**                                                                                                                          | ✅ 属实           |
| `registry.tsx` 静态 `appFeatures[]` 手动 import | ✅ 13 处静态 import + 手写数组，顺序即侧边栏顺序                                                                                   | ✅ 属实           |
| dev-toolbox 硬编码 `tabs[]`                     | 结构存在（`src/features/dev-toolbox/`），但**未在 `page.tsx` 顶层 grep 到 `TOOLBOX_FEATURE_IDS`**，需二次确认具体位置              | ⚠️ 待核实         |
| 「后端无 wasm 依赖」                            | `Cargo.toml` / `package.json` grep wasm/wasmer/wasmtime/extism **零命中**                                                          | ✅ 属实           |

**附加发现（文档未提及，但直接影响方案）**：

- **项目已是 Tauri v2**（`tauri = "2"`，`@tauri-apps/api ^2.11.1`），前端 **React 19.2**。文档未标注版本基线。
- **`protocol-asset` feature 已在 `Cargo.toml` 启用**，`tauri.conf.json` 已 `security.assetProtocol.enable: true`。
- 但 **`assetProtocol.scope: []` 为空** —— 能力已开、作用域未配。
- **Windows CI 处于暂停状态（D-021）**：`ci-build.yml` 中 Windows matrix 与产物收集步骤均已注释停用，仅 macOS runner 运行。

### 数据偏差的影响

169 → 253 不是笔误级别的偏差。它意味着**迁移工作量被低估约 50%**。文档 §6 的 B0–B5 阶段划分建立在这个基数上，B5「迁移 1–2 个插件走完整路径」的实际规模应按 253 条命令重估。若目标是"绝大部分功能插件化"，则**253 条命令中绝大多数都要重新定义宿主边界与 ACL**——这是本方案最大的隐性工程量。

---

## 2. 技术论断事实核查（本次评估最关键部分）

### 2.1 ❌ 论断「运行时不能热载全新的 renderer 整屏页面」——不成立

**文档原文**（§4.3、§5、D-022 第 7 条）：

> Tauri 的 WebView 是静态打包，运行时不能热载新的 renderer 页面……**不能**自由下载到一个全新整屏页面。这恰是 B-lite 相对纯 B 的取舍。

**核查结论：该论断不准确。**

| 证据                                                                                                                                                                                                                                                                                | 来源                                                                                                                     | 可信度        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Tauri v2 `register_uri_scheme_protocol`：handler 是 Rust 闭包，**可从磁盘任意路径（含 app data dir）读取 HTML/JS/CSS 并作为 HTTP Response 返回**，WebView 经 `myapp://...` 加载。协议需在 webview 创建时注册（构建期），但 handler 内读取的是**运行时文件**——"注册期静态、内容动态" | Tauri 源码 / [deepwiki 4.4 custom protocol handlers](https://deepwiki.com/tauri-apps/tauri/4.4-custom-protocol-handlers) | 官方 · 高     |
| `asset` protocol：配置 `app.security.assetProtocol{enable:true, scope:["$APPDATA/**"]}` 即可让 WebView 访问运行时下载到数据目录的前端 bundle                                                                                                                                        | [Tauri v2 配置参考](https://v2.tauri.app/reference/config/)                                                              | 官方 · 高     |
| 社区实证 `keathmilligan/tauri-dynamic`：运行时从磁盘加载插件 UI（`manifest.json` + `main.js`），用 dynamic import + blob URL 实现热重载，**无需重启**                                                                                                                               | [git.tdem.in/keathmilligan/tauri-dynamic](https://git.tdem.in/keathmilligan/tauri-dynamic)                               | 社区项目 · 中 |
| **本项目自身**：`Cargo.toml` 已启用 `protocol-asset`，`tauri.conf.json` 已 `enable: true`                                                                                                                                                                                           | 仓库实读                                                                                                                 | 高            |

**为什么这条重要**：整个 B-lite 路线的**核心取舍依据**（"放弃纯 B 是因为 Tauri 不能热载 UI"）建立在一个错误前提上。前提一旦纠正，**方案空间重新打开**——用户最初想要的"从市场下载一个能力，下载完就有完整 UI"在 Tauri v2 下是可以做到的。

**正确表述应为**：

> WebView 的**默认入口**在构建期打包进二进制，但宿主可通过自定义协议或 asset 协议**在运行时加载磁盘上的任意前端页面**。真正的约束不是"能不能"，而是**安全模型**——运行时加载外部代码意味着信任边界扩大，需要 CSP、协议作用域、命令白名单三道闸门。

**本项目落地的两个具体阻塞点**（若采纳此路线）：

1. `assetProtocol.scope` 需从 `[]` 改为 `["$APPDATA/**"]`（当前能力开着但作用域为空，等于不可用）。
2. **CSP 必须放行**：当前 `script-src 'self'` 与 `style-src 'self' 'unsafe-inline'` **均未包含 `asset: http://asset.localhost`**（只有 `img-src`/`media-src` 放行了）。动态加载的插件 JS/CSS 会被 CSP 直接拦截。这是一个已存在的、可精确指出的坑。

### 2.2 ⚠️ 论断「插件经 sidecar 交付」——机制选错

**Tauri sidecar 的硬限制**：二进制必须在 `tauri.conf.json` 的 `externalBin` **构建期声明**，按 `-$TARGET_TRIPLE` 命名，打包时硬编码进 bundle（macOS 还需签名）。**构建期未声明的二进制无法用 sidecar API 运行。**

- 来源：[Tauri v2 Sidecar 文档](https://v2.tauri.app/develop/sidecar/)

**影响**：文档 §2.1 的 "Sidecar Supervisor — 拉起/终止/监控外部子进程" 若指运行时下载的二进制，**实现时会撞墙**。正确路径是走 **shell plugin 的 `Command`（按绝对路径执行）而非 `sidecar()`**，并配置 `shell:allow-execute` ACL 与参数 validator。文档未区分这两者，属于设计阶段的机制误用。

### 2.3 ⚠️ 术语冲突：「plugin」在 Tauri 语境下是编译期概念

Tauri v2 官方文档定义：plugin "is composed of a Cargo crate and an optional NPM package"，通过 `.plugin(tauri_plugin_x::init())` 在**构建期**注册、"compiled into the application at build time"。

- 来源：[Tauri v2 Plugins 文档](https://v2.tauri.app/develop/plugins/)
- 补充：`AppHandle::plugin()` 可在运行时注册，但注册对象是**已编译进二进制的 crate**，不是外部加载单元（[plugins-workspace#2425](https://github.com/tauri-apps/plugins-workspace/issues/2425)）。

**结论**：项目已有 `tauri-plugin-dialog/-shell/-store` 等**编译期插件**，再引入"运行时 plugin"会造成持续的概念混淆（对 AI 尤其危险——本项目的 `.cursorrules` 第 9 条明令"不要自行推断技术栈或库"）。**建议采用独立术语**：`extension` / `addon` / `能力包`。

### 2.4 ✅ 论断「WASM 模块宿主可行」——成立

| 证据                                                                                                         | 来源                                                               |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Zenn 教程：Tauri 中集成 wasmtime，运行时扫描 `app_data_dir/plugins/*.wasm` 并用 `Module::from_file` 加载执行 | [zenn.dev/laiso](https://zenn.dev/laiso/articles/41317813d41b3a3e) |
| 社区对比 libloading（崩溃拖垮主进程）vs WASM（沙箱隔离、单文件跨平台分发）                                   | [tsight.io](https://tsight.io/articles/20440444?lang=zh)           |

技术可行，但见 §3 的工程可靠性风险。

---

## 3. 工程可靠性评估

### 3.1 🔴 头号风险：Windows CI 已暂停，而 wasmtime 恰恰最需要跨平台验证

项目铁律（`coding-standards.md` §7.4.1）明确：**macOS 无法交叉编译 Windows 目标**（`ring` 等 C 依赖需 MSVC 头），"本机编译通过"不能替代双平台验证，必须靠 `check:be-cfg` 静态守卫预先捕获。

而现实是：

- Windows CI **已因 D-021 暂停**，Windows matrix 与产物收集步骤全部注释停用。
- 引入 `wasmtime` = 引入 cranelift 等重型 C/C++ 依赖链，**Windows MSVC 下是其最脆弱的编译场景**。
- 结果：一个**在 CI 上完全无法验证的 Windows 目标**。这与项目刚建立的双平台质量门禁方向直接冲突。

**这是 B-lite 路线最被低估的风险。** `check:be-cfg` 是正则静态守卫，它能查 `#[cfg]` 卫生，但**查不出 wasmtime 在 MSVC 下的链接失败**。

### 3.2 其他工程风险

| 风险       | 说明                                                                                                                                                           | 等级           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 二进制体积 | wasmtime 含 cranelift JIT，增量在数 MB ~ 十几 MB 量级（社区经验，未实测）                                                                                      | 中             |
| 迁移基数   | 253 条命令（非 169）需重定宿主边界与 ACL，隐性工程量巨大                                                                                                       | 高             |
| 现状技术债 | `GAP-TO-2.0.md` 仍有 37 项未关闭差距（含 5 项 P0），插件化是**在债务之上的新建筑**                                                                             | 高             |
| 现有基建   | `persistence.rs`、minisign 签名链、IPC 契约双写、能力矩阵均为可复用资产，但文档中 plugin 侧**未引用 minisign 已有密钥链**（`updater/keys/`），反而重新设计签名 | 中（设计冗余） |

---

## 4. 行业调研 A：同技术栈（Rust + WASM）的插件系统

> 调研方式：网络检索，来源附于各条。

### 4.1 案例速览

| 项目       | 宿主 | 插件形态                            | runtime         | 宿主 API 模型                                                                                                                             | 分发与安全                                                                          | 插件能否贡献 UI                                    | 生态规模                         |
| ---------- | ---- | ----------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------- |
| **Zed**    | Rust | WASM（`wasm32-wasip2` + `.tar.gz`） | **wasmtime**    | **WIT + wit_bindgen** 类型化契约；`extension.toml` 声明 `ProcessExec` 等 capability，由 `CapabilityGranter` 校验                          | 官方 registry（zed.dev）+ `schema_version` 兼容门控                                 | ❌ 不能（仅 LSP/DAP/主题/snippets/slash commands） | 数百，高活跃                     |
| **Lapce**  | Rust | WASM/WASI（`.wasm` + `volt.toml`）  | **wasmtime**    | **PSP**（自定义 JSON-RPC），`WasiCtxBuilder` 受限 FS/stdio                                                                                | 社区 registry，**未见完整签名/ACL**                                                 | ❌ 仅主题/LSP/DAP                                  | 小，市场成熟度远低 VS Code       |
| **dprint** | Rust | 独立 `.wasm`                        | wasmer/wasmtime | **共享线性内存字节交换协议**（Schema v4）：导入 `host_write_buffer`/`host_format`                                                         | HTTPS URL / npm 分发；**WASM 默认无 checksum**（`--checksum` 可钉固），进程插件强制 | ❌ 纯函数 formatter                                | 数十，成熟稳定                   |
| **Extism** | 任意 | WASM + 多语言 PDK                   | 内嵌            | `extism:host/user` 命名空间 host functions（`config_get`/`var_*`/`http_request`/`log_*`）；**加载期能力门控**，`allowed_hosts` + var 限额 | XTP Platform 做插件市场                                                             | ❌ 框架层不提供                                    | 通用框架，14+ host SDK / 10+ PDK |
| **Spin**   | Rust | WASM Component                      | **wasmtime**    | **WASI 0.2 + Component Model + WIT**；`spin.toml` 声明依赖与 `allowed_outbound_hosts`                                                     | Fermyon registry                                                                    | ❌ serverless                                      | 成熟                             |

### 4.2 关键洞察

**洞察 1：Rust + WASM 的技术选型高度趋同。** wasmtime 是事实标准（Zed / Lapce / Spin 一致选择），WIT/Component Model 是契约层的现代答案。若坚持 WASM 路线，**不应自研 ABI**——Extism 或 WIT 二者选一即可，能省掉多语言 SDK 与 ABI 设计的全部成本。

**洞察 2（决定性）：所有纯 WASM 逻辑插件系统，都没有出现繁荣的第三方生态。** Zed、Lapce、dprint 的插件**一律不能贡献 UI**，其插件数量在数十至数百量级，与 VS Code（5 万+）、uTools（3000+）差两个数量级。这不是巧合——**编辑器的插件主要贡献语言能力，UI 需求天然弱；而 Bench 的 16 个模块 90% 的工作是 UI**。

**洞察 3：wasmtime 嵌入的工程基线是必做项，不可跳过。**

- 每进程**一个 Engine**、每 wasm blob **一个 Module（复用）**、每进程**一个 Linker**（启动期填充 host functions）
- 多实例用 `instantiate_pre`（一次类型/导入检查）
- 隔离：每次调用新建 `Store` = 无状态；同 Store = 持久线性内存（Lapce 曾在此踩坑）
- 资源：`StoreLimitsBuilder` 限内存（如 64MB）、`consume_fuel` 限 CPU 防死循环、`WasiCtxBuilder` 最小授权

---

## 5. 行业调研 B：插件市场型桌面应用的成熟范式

### 5.1 案例速览

| 案例         | 宿主技术栈 | 插件形态                                                      | API/通信模型                                                   | UI 呈现                                        | 分发/审核/签名                                                            | 沙箱                          | 生态规模                  |
| ------------ | ---------- | ------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------- | ------------------------- |
| **uTools**   | Electron   | `plugin.json` + `index.html` + 可选 `preload.js`(CommonJS)    | preload 释放沙箱，`window.utools.*` 暴露系统 API               | ✅ **整屏自由渲染**，框架不限                  | 自有市场 + 人工审批 + UPX 包 + 明文审查                                   | ❌ 无（preload 能力极强）     | **3000+**（1600+ 已上架） |
| **Rubick**   | Electron   | 同 uTools（API 对齐 90%+）                                    | 同 uTools                                                      | ✅ 整屏                                        | **npm 源**分发 + 内网私有源 + WebDAV 同步                                 | ❌ 无                         | 迁移 uTools 生态          |
| **VS Code**  | Electron   | `package.json`（`contributes`/`activationEvents`）+ Node 模块 | **独立 extension host 进程** + RPC，扩展不直接访问 DOM         | **声明式贡献点**（命令/菜单/视图/配置…）       | Marketplace **签名** + 恶意扫描 + 发布者验证；1.97 起第三方扩展需确认信任 | ✅ 进程级                     | **5 万+**                 |
| **Raycast**  | 原生 macOS | TypeScript/React npm 包                                       | **隔离 v8 worker 线程** + RPC                                  | 受控组件（List/Form/Detail），**不能任意 DOM** | Store 审核 + CI schema 校验                                               | ✅ 线程级                     | 数千                      |
| **Figma**    | Web        | `manifest.json` + sandbox JS + **iframe UI**                  | 主线程沙箱 + postMessage                                       | iframe 模态                                    | 商店 + `networkAccess.allowedDomains` CSP 白名单                          | ✅ iframe                     | 数千                      |
| **Obsidian** | Electron   | TS 编译的 `main.js` + `manifest.json`                         | `Plugin` 类 API（`addRibbonIcon`/`addCommand`/`registerView`） | 受控注入贡献点                                 | GitHub PR + 机器人校验 + 人工审核                                         | ❌ **默认全信任**             | 数千                      |
| **SiYuan**   | TS + Go    | `manifest.json` + `index.js`，前端 eval                       | Plugin API                                                     | 受控注入                                       | Bazaar 集市 + 代码审查                                                    | ❌ 无（官方明示"可为所欲为"） | 数百~千                   |

### 5.2 横向规律（三条）

**规律 1：成功的插件市场，插件一定能贡献 UI。** 要么整屏自由渲染（uTools / Rubick / VS Code webview），要么声明式注入宿主壳（Obsidian / VS Code contribution points / Raycast 受控组件）。**没有任何一个繁荣生态是"插件只贡献纯逻辑"的。**

**规律 2：形态与产品性质强相关。**

- 工具箱 / 效率平台（uTools、Rubick、Raycast、Alfred）→ **前端插件 + 整屏或受控 UI**
- 编辑器（VS Code、Zed、Lapce）→ 进程或 WASM + 贡献点 / 语言能力
- 笔记（Obsidian、SiYuan）→ JS 插件 + 受控 UI 注入

**Bench 属于第一类（工具箱）**，因此 uTools / Rubick 范式才是同构参照，而非 Zed / Lapce。

**规律 3：无沙箱是行业普遍妥协，但都有代价。** uTools、Obsidian、SiYuan 全信任模式跑出了生态，也付出了安全代价（研究指 VS Code 52,880 个扩展中 5.6% 有可疑行为）。Figma 从纯 iframe → JS 解释器 WASM → 主线程沙箱 + iframe UI，两次返工才定型，**说明插件沙箱是反复试错的领域，不宜在架构阶段一次性赌定**。

### 5.3 Figma 的教训特别值得注意

Figma 官方复盘：最初试纯 iframe（异步/拷贝 scene 太慢）→ 试 JS 解释器编译成 WASM（慢、难调试）→ 最终**主线程沙箱跑逻辑 + iframe 跑 UI**。

> 这与当前 B-lite 的"WASM 跑逻辑 + 预置壳渲染 UI"高度同构，而 Figma 明确否掉了这个组合。值得作为反面参考。

---

## 6. 产品可行性：一个必须回答但尚未回答的问题

文档 §0「目标与非目标」写得非常完整——唯独**没有回答"谁来写插件，以及他们为什么要写"**。

### 6.1 两个被混为一谈的目标

| 目标 A：降低自己的装配成本                                                                                               | 目标 B：建立第三方插件生态                                      |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 痛点：加一个能力要改 `registry.tsx` + `commands.rs` + `lib.rs` 三处                                                      | 痛点：外部开发者能为其扩展能力                                  |
| 正解：**约定式注册 + 代码生成**（`inventory`/`linkme` crate 自动收集、`import.meta.glob` 自动装配、宏生成 handler 列表） | 正解：manifest + 沙箱 + 签名 + registry + SDK + 文档 + 审核流程 |
| **成本：1–2 天**                                                                                                         | **成本：数月 + 持续运营**                                       |
| 无安全风险                                                                                                               | 需要完整信任模型                                                |
| 无生态依赖                                                                                                               | 生态冷启动是最大不确定性                                        |

**文档 §0 的第一条目标原文**：

> 把「新增/移除一个能力要在 3 处手写装配」收敛为「能力自带契约、外壳只消费契约」。

这是**目标 A 的表述**，但整份文档给出的是**目标 B 的方案**。这两者成本差两个数量级。

### 6.2 冷静的观察

- Bench 的 16 个模块（端口管理、环境检测、清理、系统设置、账号管理、网络探测…）**高度个人化、强系统耦合**，多数涉及 macOS/Windows 专有 API 与权限。
- 这类能力的**第三方作者池极窄**：它需要同时懂 Rust、Tauri、双平台系统 API，还要有该具体场景的需求。
- 对照 uTools：其 3000+ 插件生态建立在**前端开发者零门槛**（写 HTML/JS 即可）之上。Bench 若要求插件作者写 Rust/WASM，生态冷启动难度量级不同。

**建议**：在投入架构之前，先写下"第一个第三方插件作者是谁、他要写什么"。若答案是"主要我自己"，则应走目标 A 的轻量方案。

---

## 7. 2.0 目标变更的连锁影响

用户已明确 "2.0 原目标需变更"。当前状态下有三个必须显式处理的冲突：

1. **`ROADMAP.md` 是 2.0 唯一执行真理源（D-013）**，而 D-022 声明插件化"不进 R00–R10 门禁，作为旁路"。**若 2.0 的新目标就是插件化，"旁路"定位自相矛盾**——需要重写 ROADMAP，而不是在旁边挂一个旁路程序。
2. **`GAP-TO-2.0.md` 尚有 37 项未关闭差距**（A1–A5 代码差距，含 A1-1/A1-2/A1-3/A2-1/A2-2/A3-1/A3-2/A4-1/A4-2/A4-3 共 10 项 P0；D1–D7 真机验收；E1–E3 文档治理）。切换目标意味着这些要么废弃、要么降级，**需要明确决策，否则留下大量僵尸任务**。
3. **真机验收（D 类）尚未完成**。在没有真机证据的情况下叠加一个大型架构改造，风险是叠加而非对冲。

> 建议：把"2.0 目标变更"本身作为一条 DECISIONS 条目（如 D-023）显式记录，并同步处置 `GAP-TO-2.0.md` 的存废。

---

## 8. 建议方案：B′（宿主 + 可下载前端 bundle）

基于 §2.1 的纠错与 §5 的范式对标，提出替代方案。**核心变化：把插件主体从 WASM 逻辑换回前端 bundle。**

| 维度       | B-lite（原设计）                           | **B′（建议）**                                                                                       |
| ---------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 插件主体   | WASM 模块 / sidecar / 远程                 | **前端 bundle（React/任意框架）+ 可选 WASM 附属**                                                    |
| UI 能力    | ❌ 预置壳或远程视图                        | ✅ **独立 WebView 整屏渲染**（经 asset 协议 / 自定义协议）                                           |
| Rust 宿主  | 内嵌 wasmtime（**引入 Windows 编译风险**） | **不引入 WASM runtime**，复用既有 IPC 体系                                                           |
| 宿主 API   | `bench_host` WASM 导入面（自研 ABI）       | **IPC 命令白名单网关**（复用现有 `parseCommandError` / 契约双写体系）                                |
| 隔离       | WASM 沙箱                                  | **独立 WebView 进程 + manifest.acl 命令白名单**                                                      |
| 签名       | 新设计                                     | **复用项目已有 minisign 密钥链**（`updater/`）                                                       |
| 贡献点     | 未定义                                     | **声明式 contribution points**（菜单项/侧边栏入口/命令/设置项），抄 VS Code / Obsidian               |
| 冷启动门槛 | 插件作者需 Rust/WASM                       | **前端开发者零门槛**（对标 uTools 成功要素）                                                         |
| 落地阻塞点 | wasmtime × Windows MSVC                    | `assetProtocol.scope: []` → `["$APPDATA/**"]`；CSP `script-src` 需加 `asset: http://asset.localhost` |

**B′ 的四个优势**：

1. **复用既有资产**：minisign 密钥链、IPC 契约体系、能力矩阵、持久化基建全部可直接复用，无需重建。
2. **规避最大风险**：不引入 wasmtime，绕开"Windows CI 已暂停 + 无法交叉编译"这一死结。
3. **契合产品性质**：Bench 是工具箱，模块价值在 UI；uTools 已验证该范式可跑出 3000+ 生态。
4. **门槛最低**：潜在插件作者写 React 即可，与宿主前端技术栈一致。

**B′ 的风险与对策**：

| 风险                             | 对策                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 运行时加载外部 JS = 信任边界扩大 | 三道闸门：① `assetProtocol.scope` 限定 `$APPDATA/plugins/**`；② CSP 精确放行；③ Rust 侧按 manifest.acl 做**命令白名单网关**，插件只能调用白名单内的命令 |
| 插件崩溃影响宿主                 | 独立 WebView（进程级隔离），宿主监控 + 自动停用                                                                                                         |
| 前端 API 演进破坏插件            | 抄 VS Code：**版本化 API + `engines` 兼容声明**，宿主拒绝不兼容插件                                                                                     |
| 安全模型一次性赌定（Figma 教训） | 先做**受限版**（仅白名单命令 + 独立 WebView），预留收紧空间，不做不可逆的宽授权                                                                         |

---

## 9. 修订后的分阶段路线

| 阶段                        | 内容                                                                                                           | 风险 | 退出条件             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ---- | -------------------- |
| **P0 · 产品定案**           | 回答 §6 的问题：目标 A 还是目标 B？写下第一个第三方插件作者画像。若选 A → 走 §9.1 轻量路径，本文档其余阶段作废 | —    | 决策记录进 DECISIONS |
| **P1 · 概念验证（1–2 天）** | 不改架构：仅验证 asset 协议 + CSP 放开后能否加载 `$APPDATA` 下的一个 React bundle。**这一步决定 B′ 是否成立**  | 低   | 跑通 demo 或证伪     |
| **P2 · 契约先行**           | manifest schema（`plugin.json`）+ contribution points 枚举 + ACL 命令白名单 + minisign 校验骨架                | 中   | 契约测试通过         |
| **P3 · 单插件闭环**         | 选 **1 个低风险模块**（建议 `token-calculator`）走完整路径：打包 → 安装 → 隔离渲染 → 白名单调用 → 卸载         | 中   | 端到端可用           |
| **P4 · 插件中心 UI**        | 目录/安装/启用禁用/卸载 + 能力矩阵                                                                             | 中   | `test:critical` 通过 |
| **P5 · 泛化与迁移**         | `dev-toolbox` host 泛化；按 253 条命令的实际基数分批迁移剩余模块                                               | 高   | 每批 `verify` 全绿   |
| **P6 · Windows 复验**       | **恢复 Windows CI（撤销 D-021 的暂停部分）**，验证插件子系统双平台可用                                         | 高   | Windows runner 全绿  |

> **P6 是硬前置**：任何插件化方案在 Windows CI 恢复前上线，都等于发布一个单平台未经验证的能力。

### 9.1 若选目标 A 的轻量路径（推荐先评估）

不引入任何运行时插件机制，仅消除"3 处手写装配"：

- 后端：用 `inventory` / `linkme` crate 或过程宏**自动收集命令**，替换 `commands.rs` 的 253 行手写列表
- 前端：`import.meta.glob` 自动装配 `appFeatures`，删除手写数组
- state：`lib.rs` 的 11 处 `.manage` 收敛为一次注册循环

**成本 1–2 天，零运行时风险，立即可验证。** 建议先做这个，再判断是否真的需要市场。

---

## 10. 决策待办

| #   | 待决问题                                                 | 影响                                |
| --- | -------------------------------------------------------- | ----------------------------------- |
| 1   | **目标 A（自装配提效）还是目标 B（第三方生态）？**       | 决定后续全部工作，成本差两个数量级  |
| 2   | 是否接受用 `extension`/`能力包` 替代 `plugin` 术语？     | 避免与 Tauri 编译期 plugin 持续混淆 |
| 3   | `GAP-TO-2.0.md` 的 37 项差距如何处置（废弃/降级/并行）？ | 2.0 目标变更的必要配套              |
| 4   | 是否恢复 Windows CI？                                    | 插件化的硬前置（P6）                |
| 5   | 是否先做 P1 概念验证（1–2 天）再定架构？                 | 用最小成本证伪/证实 B′ 的前提       |

---

## 附录：信息来源

**Tauri 官方机制**

- [Tauri v2 · Plugins](https://v2.tauri.app/develop/plugins/) — plugin 为编译期 Cargo crate
- [Tauri v2 · Config Reference](https://v2.tauri.app/reference/config/) — assetProtocol scope
- [Tauri v2 · Sidecar](https://v2.tauri.app/develop/sidecar/) — externalBin 构建期声明
- [Tauri · Custom Protocol Handlers](https://deepwiki.com/tauri-apps/tauri/4.4-custom-protocol-handlers)
- [plugins-workspace#2425](https://github.com/tauri-apps/plugins-workspace/issues/2425) — 运行时 plugin 注册语义
- [keathmilligan/tauri-dynamic](https://git.tdem.in/keathmilligan/tauri-dynamic) — 运行时加载插件 UI 实证
- [Zenn · Tauri + wasmtime](https://zenn.dev/laiso/articles/41317813d41b3a3e)

**Rust + WASM 插件系统**

- [Zed · Developing Extensions](https://zed.dev/docs/extensions/developing-extensions.html) ｜ [Zed Extensions System](https://deepwiki.com/zed-industries/zed/13-extensions-system)
- [Lapce Plugin Architecture](https://deepwiki.com/lapce/lapce/2.3-plugin-architecture)
- [dprint · WASM Plugin Development](https://github.com/dprint/dprint/blob/main/docs/wasm-plugin-development.md) ｜ [dprint Config](https://dprint.dev/config)
- [Extism](https://github.com/extism/extism) ｜ [Extism PDK](<https://deepwiki.com/extism/extism/3-plugin-development-kit-(pdk)>)
- [Spin v2.1](https://www.fermyon.com/blog/spin-v21) ｜ [wasmtime Embedding Best Practices](https://docs.wasmtime.dev/api/wasmtime)

**插件市场型应用**

- [uTools 开发者文档](https://www.u-tools.cn/docs/developer/docs.html) ｜ [uTools preload](https://u-tools.cn/docs/developer/information/preload.html)
- [Rubick](https://github.com/WillJun/rubick) ｜ [少数派评测](https://sspai.com/post/84177)
- [VS Code Extension Runtime Security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security) ｜ [Contribution Points](https://code.visualstudio.com/docs/extensionapi/extension-points)
- [Figma · How Plugins Run](https://developers.figma.com/docs/plugins/how-plugins-run/) ｜ [How we built the Figma plugin system](https://www.figma.com/blog/how-we-built-the-figma-plugin-system/)
- [Obsidian Manifest](https://docs.obsidian.md/Reference/Manifest) ｜ [SiYuan Plugin System](https://deepwiki.com/siyuan-note/siyuan/7-plugin-and-extension-system)
- [arXiv 2411.07479](https://arxiv.org/html/2411.07479v1) — VS Code 扩展安全实证研究
