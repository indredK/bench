# Bench 插件市场架构设计（B-lite：Tauri 宿主 + WASM/sidecar/远程）

> ## ⚠️ 路线更新（2026-09-08 · [D-023](./DECISIONS.md#d-023--20-目标变更为插件化生态r00r10-全部降级)）
>
> **主路线已调整为 B′（宿主 + 可下载前端 bundle + 独立 WebView + IPC 命令白名单）**，见
> [plugin-market-assessment.md §8](./plugin-market-assessment.md)。
>
> 调整原因：本文 §4.3 的核心前提「运行时不能热载整屏 renderer 页面」经查证**不成立**
> —— `register_uri_scheme_protocol` / asset 协议均可加载运行时下载的前端页面。
> 前提纠正后，对 Bench（工具箱，模块 90% 工作量是 UI）而言，uTools 式前端 bundle 范式
> 优于 Zed/Lapce 式纯 WASM 逻辑范式。
>
> **本文保留价值**：① WASM 作为**附属形态**（纯计算/规则引擎）的设计仍然是 B′ 的一部分；
> ② sidecar / 远程能力、manifest + ACL + 签名、能力矩阵等契约设计可继续复用；
> ③ D-017 红线与约束章节仍然有效。
>
> **已被取代的部分**：§2.1 的「WASM Runtime 作为主要宿主」、§4.3 的「renderer 整屏页不成立」、
> §5 的「为什么是 B-lite 不是纯 B」结论。它们不再作为主路线依据。

> **路线确认：B-lite（Tauri 当宿主，插件以 WASM 模块 + sidecar + 远程能力三种形态交付，配 manifest + ACL 分发 + 插件中心 UI；不改编程语言）。**
> 本文件是插件化改造的**长期架构 / 契约 / 修改入口**唯一设计真理源。方向性取舍见 [DECISIONS.md](./DECISIONS.md) 的 D-022。执行序列见文末 B0–B5。
> **状态**：设计阶段，未进入实现。不改动 2.0 版本号/发布门禁（参照 D-016 / D-020 旁路先例，且 [ROADMAP.md](./ROADMAP.md) 为 2.0 唯一执行真理源，本程序不进入 R00–R10）。

---

## 0. 目标与非目标

**目标**

- 把「新增/移除一个能力要在 3 处手写装配」收敛为「能力自带契约、外壳只消费契约」。
- 提供**插件中心**交互：浏览 → 安装 → 启用/禁用 → 卸载，能力可「自由下载」（在能力/逻辑/后端能力层面）。
- 统一三种插件交付形态（WASM / sidecar / 远程）的**宿主运行时**与**分发契约**（manifest + ACL + 签名）。
- 让 `dev-toolbox` 这类「宿主聚合子功能」从硬编码特例泛化为通用 host/child 模型。
- 重/可选能力（env-detector 动态扫描、net-probe-adv）通过 D-017 pack（即 sidecar 形态）交付，与结构插件**正交**解耦。

**非目标（明确边界）**

- 不运行时热载核心 Rust crate / npm 包进主程序（违反 [D-017](./DECISIONS.md#d-017--network-probe-可选能力包可插拔高级组件) 红线：禁止运行时 cargo/npm 拉依赖；且破坏单二进制 + minisign）。
- 不改变编程语言：Tauri 核心仍是 Rust + WebView；WASM guest 可用任意能编译到 WASM 的语言编写，宿主 runtime 仍是 Rust。
- **运行时不能热载全新的 renderer 整屏页面**：WebView 静态打包，插件可贡献的 UI 限于预置 UI 壳 + 插件中心控制，或沙箱远程视图（详见 §4.3）。
- 不引入独立 CI/构建流水线或通用沙箱 OS 运行时（B 路线，未来 RFC，不阻塞本次）。
- 不削弱 IPC 契约双写铁律（[ARCHITECTURE.md §2](./ARCHITECTURE.md#2--ai-编码规则--禁止模式) 第 7 条）；插件经 `bench_host` 窄接口，反而收窄 renderer 信任边界。

---

## 1. 现状量化（评估依据，仓库实读 2026-09-08）

| 维度         | 现状                                                                                                                           | 痛点                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| 前端 feature | 16 模块 / 14 注册进侧边栏；`src/features/registry.tsx` 静态 `appFeatures[]` 手动 import，数组顺序 = 侧边栏顺序                 | 加能力改 1 文件；顺序/聚合靠特例 |
| 后端命令     | 169 条 IPC 全手写进 `src-tauri/src/commands.rs::app_invoke_handler!` 宏                                                        | 加命令改 1 文件；无插件→命令归属 |
| 后端 state   | `src-tauri/src/lib.rs` 11 处 `.manage(state)` + 3 处 `init_state` 手动启动初始化（错误兜底 + `record_startup_issue` 各写一遍） | 启动初始化逻辑重复且易遗漏       |
| 构建         | Vite 仅 vendor 分包；feature 间无独立 chunk；懒加载靠各 `feature.tsx` 内联 `lazy()`                                            | 无统一分包/贡献点策略            |
| 聚合         | `dev-toolbox` 硬编码 `tabs[]` + `TOOLBOX_FEATURE_IDS`                                                                          | 复合 feature 是特例，不可复用    |

**既有可复用拼图**

- **D-017 Capability Pack**：重/可选能力按需下载 sidecar + 能力矩阵 `supported/degraded/unsupported/missing_pack`。即本设计的 **sidecar 交付形态**。
- **dev-toolbox**：宿主聚合子功能（port-manager / env-detector / token-calculator）的雏形；可泛化为通用 host。
- **`AppFeature` 描述符**：已具备 `id` / `path` / `labelKey` / `icon` / `render` / `platforms` 雏形，是插件 `parent` / `order` / `lazyPage` 模型的自然起点。
- **network-probe 远程能力**：Globalping/librespeed 式远端调用，本机零重库，即本设计的 **远程交付形态**原型。

---

## 2. 插件宿主架构（Plugin Host）

宿主是内嵌在 Tauri 后端（Rust）的一组运行时组件。它不是「运行时再编译核心」，而是「在既有 Rust 进程内加载受控的外部能力单元」。

### 2.1 宿主运行时三件套

| 组件                                       | 职责                                                         | 承载插件形态   | 安全边界                                                                |
| ------------------------------------------ | ------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------- |
| **WASM Runtime**（wasmer / wasmtime 内嵌） | 加载并执行 WASM guest 模块；注入受控导入函数（host imports） | WASM 模块      | 沙箱：guest 只能调用宿主显式导出的导入；默认 deny-all，ACL 决定可调用集 |
| **Sidecar Supervisor**                     | 拉起/终止/监控外部子进程；stdin/stdout IPC 协议              | sidecar 二进制 | 走 D-017 pack 校验；renderer 不持有路径/URL                             |
| **Remote Proxy**                           | 转发远端能力调用（HTTP/gRPC），本机零重库                    | 远程能力       | canonical endpoint 由后端 manifest 决定；超时/配额/降级                 |

三者通过统一的 **`bench_host` 接口**对插件暴露后端能力（只读状态、受控动作、持久化、IPC 转发），插件不得以任何方式直达核心 Rust 命令或绕过 IPC 契约。

### 2.2 宿主 API 面契约（`bench_host`）

`bench_host` 是插件访问后端服务的**唯一窄通道**，分两类：

- **WASM guest 导入（imports）**：guest 模块声明 `bench_host_*` 导入函数（如 `bench_host_read_state`、`bench_host_invoke_capability`、`bench_host_log`），由宿主在实例化时注入实现；导入集由插件 ACL 静态约束。
- **sidecar / 远程协议**：子进程或远端通过同一语义的 JSON/二进制封套调用 `bench_host`，宿主校验来源与 ACL 后执行。

导出面须**显式枚举、编译期可测**：新增一个 host 能力 = 在 `bench_host` 接口登记一项，并同步契约文档；禁止插件凭字符串动态反射调用任意内部函数。

### 2.3 插件生命周期与持久化

- 安装：host 从 canonical registry 取 manifest → 校验签名 → 下载产物（仅 sidecar/远程需要）→ 落到受控目录（App Support / 等价），登记进 `plugin_registry.json`（id/version/enabled/install_path）。
- 启用/禁用：`plugin_registry.json` 切换 `enabled`；禁用即不实例化 WASM / 不拉起 sidecar / 不暴露远程入口。
- 卸载：停止运行时实例 → 删除产物与登记项 → 刷新能力矩阵；卸载不影响核心命令。
- 核心命令（app_manager/account_manager/…）始终编译期链接、不受插件启停影响，保证单二进制与 minisign 完整性。

---

## 3. 插件 manifest 与 ACL

### 3.1 Manifest 结构

每个插件携带一份签名 manifest（JSON），关键字段：

```jsonc
{
  "id": "net-probe-adv",
  "version": "1.4.0",
  "display": { "zh": "高级探测包", "en": "Advanced Probe Pack" },
  "delivery": "sidecar", // "wasm" | "sidecar" | "remote"
  "entry": {
    // 按 delivery 不同
    "sidecar": { "bin": "net-probe-adv", "protocol": "jsonrpc" },
    "wasm": { "module": "net_probe_adv.wasm", "guest": "net_probe_adv" },
    "remote": { "capability": "globalping", "endpointRef": "globalping" },
  },
  "capabilities": ["traceroute", "packet_capture"], // 对齐后端能力矩阵
  "acl": {
    // 请求的宿主权限边界
    "host_imports": ["bench_host_invoke_capability", "bench_host_log"],
    "fs": ["app_support:net-probe-adv"],
    "network": ["globalping-api"],
    "privilege": ["packet_capture"],
  },
  "signature": "minisign:...", // canonical registry 签名，renderer 不持有
}
```

### 3.2 ACL 注册表与权限边界

- 宿主内置 **ACL 注册表**（一份 Rust 枚举 + 文档），列出所有可被插件请求的 host 能力（导入函数、文件系统作用域、网络端点、特权动作）。
- **deny-by-default**：manifest 未声明的 ACL 一律拒绝；宿主在实例化/启用时静态比对 manifest.acl 与注册表，越权项直接拒绝并记入审计。
- 特权动作（如 packet_capture）除 ACL 外仍走 D-017 的提权/降级与 `missing_pack` 安装向导。

### 3.3 签名与完整性

- 插件产物与 manifest 由 **canonical registry** 用 minisign 签名；宿主校验签名后才安装/启用。
- 下载 URL / 版本 / hash / 签名材料**只由后端 canonical manifest 决定**；renderer 不得提交最终下载地址或可执行路径（对齐 D-017 第 4 条与 D-007 信任边界）。
- ad-hoc/未公证发布时，插件中心须标明 Gatekeeper 限制，不得宣称插件已获系统信任。

---

## 4. 插件中心与交互模型

### 4.1 交互流程（回答「软件怎么用」）

1. 用户打开**插件中心**（预置页面，随主包发布）。
2. 中心从后端 canonical registry 拉取目录（renderer 不自选 URL），按能力矩阵显示各插件的可插拔状态。
3. 用户点「安装」某能力（如「高级 traceroute 包」= sidecar；「规则引擎」= WASM；「全球延迟」= 远程）。
4. 宿主经后端 manifest 下载产物（仅 sidecar/远程需要二进制）→ minisign 校验 → 登记 → 刷新能力矩阵。
5. 插件在中心的「已安装」区显示控制（启用/禁用/卸载）；若其带预置 UI 壳，对应导航/入口点亮。
6. 能力经 `bench_host` 暴露给其它模块或插件中心内的控制面板消费。

### 4.2 插件仓库组织（回答「是否各有一个 git 仓库」）

- **不强求**每插件独立 repo；registry 才是事实源。推荐做法：每个插件在自有仓库开发 → 发布 **manifest + 产物（wasm / sidecar 二进制）** 到 registry；宿主只认 registry，不关心仓库结构。
- 这意味着「自由下载能力」由 **registry 驱动**，而非「主程序运行时克隆任意 git 仓库」；既满足用户诉求，又守住 D-017（不运行时拉依赖源码）。

### 4.3 renderer 动态页面边界（诚实约束）

- Tauri 的 WebView 是**静态打包**，运行时不能热载新的 renderer 整屏页面（即纯 B 路线的核心障碍）。
- 因此插件可贡献的 **UI** 受限于两类：
  - **预置 UI 壳**：主包内已编译好的容器（如 dev-toolbox 的 tab 槽位、插件中心的卡片），插件只填充数据/控制，不新增整屏页面；
  - **沙箱远程视图**：插件中心以受限 `<webview>` 或受控 iframe 加载远程 URL（仅 remote 形态且 ACL 显式授权）。
- 结论：用户「自由下载能力」在**能力/逻辑/后端能力/控制面板**层面完全成立；在**全新 UI 整屏页**层面不成立——这是 B-lite 相对纯 B 的明确取舍，需在插件中心文案中如实告知。

---

## 5. Tauri 插件形态可行性矩阵（回答「为什么是 B-lite 不是纯 B」）

| 形态                             | Tauri 可行性       | 说明                                                     |
| -------------------------------- | ------------------ | -------------------------------------------------------- |
| 前端 JS 插件（运行时新增整屏页） | ❌ 原生不支持      | WebView 静态打包；B-lite 用预置壳/远程视图替代           |
| 核心 Rust 命令热载               | ❌ 命中 D-017 红线 | 破坏单二进制 + minisign；核心命令保持编译期链接          |
| **WASM 模块**                    | ✅ 自建国宿主      | 内嵌 wasmer/wasmtime，guest 经 `bench_host` 导入沙箱运行 |
| **sidecar**                      | ✅ D-017 模型      | 外部子进程 + 校验，既有拼图                              |
| **远程能力**                     | ✅ 既有原型        | network-probe 远程调用，本机零重库                       |
| 运行时 cargo/npm 拉依赖          | ❌ 红线禁止        | D-017 第 3 条；pack 走 sidecar 例外                      |

天然适合「真·运行时插件市场」的环境对照（供参考，非本项目选项）：Electron（Node `require`）、JVM（`URLClassLoader`）、.NET（`Assembly.Load`）、Web/PWA（ES Module 动态 `import()`）。Tauri 需自建国宿主，故取 B-lite。

---

## 6. 分阶段路线（B0–B5）

| 阶段   | 内容                                                                                                                                            | 风险 | 验证                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------ |
| **B0** | 本设计 doc + DECISIONS D-022；ROADMAP 不纳入（2.0 旁路，D-013）                                                                                 | 低   | `pnpm run check:docs`                            |
| **B1** | 契约先行：`bench_host` 接口 + ACL 注册表 + manifest schema + 签名校验骨架（不接 runtime）                                                       | 中   | `lint:fe` + Rust 单元（契约解析）                |
| **B2** | WASM runtime spike：内嵌 wasmer/wasmtime，跑通 1 个 pilot guest（建议 token-calculator 逻辑外移为 WASM），定义导入面 + 沙箱 deny-all + 安全论证 | 高   | `check:be-cfg` + `clippy -D warnings` + 安全评审 |
| **B3** | sidecar supervisor + remote proxy 复用 D-017：env-detector 动态扫描 / net-probe-adv 经 manifest 驱动交付                                        | 中   | pack IPC + 能力矩阵测试                          |
| **B4** | 插件中心 UI：目录/安装/启用禁用/卸载/能力矩阵；canonical registry 拉取                                                                          | 中   | `test:critical` + 插件中心行为测试               |
| **B5** | dev-toolbox host 泛化（删硬编码 tabs / `TOOLBOX_FEATURE_IDS`）+ 迁移 1–2 个插件走完整路径；registry 作者约定 + 每插件仓库文档                   | 中   | 各模块 lint/test + `verify`                      |

> 纯 B 路线（运行时热载核心命令/整屏 renderer 页）作为未来 RFC，不在 B0–B5；WASM 沙箱安全模型（B2）是整条路线的闸门前置。

---

## 7. 约束与风险

- **不改编程语言**：核心 Rust + WebView；WASM guest 可任意 WASM 语言；宿主 runtime 仍 Rust。
- **D-017 红线**：禁止运行时 cargo/npm 拉依赖；插件经 wasm/sidecar/remote 三类交付，renderer 不提交 URL/路径。
- **单二进制 + minisign**：核心命令编译期链接；插件是数据/sidecar，不进核心二进制完整性边界。
- **WASM 沙箱安全**：导入面显式枚举 + deny-all + ACL；B2 前须完成安全论证，否则不得上 runtime。
- **双平台 CI + `clippy -D warnings`**：宿主 runtime 与宏/特质不得引入跨平台死代码；改 Rust 必跑 `check:be-cfg`。
- **D-013 / D-006**：方向取舍回写 DECISIONS；ROADMAP 为 2.0 唯一真理源，插件化不入 R00–R10。
- **IPC 契约双写铁律不削弱**：`bench_host` 窄接口强化 TS↔Rust 同步。
- **i18n**：`labelKey` / manifest `display` 仍须落 locale；插件可引入 namespace。
- **renderer 整屏页限制**：如实写入插件中心文案，不夸大「自由下载」范围（§4.3）。

---

## 8. 修改检查表（每个插件迁移）

- [ ] manifest：写 `id/version/delivery/entry/capabilities/acl/signature`，送 canonical registry 签名。
- [ ] 形态：选定 wasm / sidecar / remote 之一；sidecar 复用 D-017 校验链。
- [ ] 宿主接入：WASM 在 `bench_host` 注册导入；sidecar 走 Supervisor 协议；远程走 Remote Proxy 封套。
- [ ] ACL：manifest.acl 与 ACL 注册表逐条比对，越权项拒绝。
- [ ] 前端：如带 UI，用预置壳或远程视图，不新增整屏页；插件中心登记控制卡片。
- [ ] i18n：`labelKey` / `display` 落 locale 与 manifest。
- [ ] 测试：能力矩阵（supported/degraded/unsupported/missing_pack）、ACL 拒绝、安装/启用/卸载、签名校验失败。
- [ ] 验证：`lint:fe` + `test:critical`（前端）；`check:be-cfg` + `clippy -D warnings`（后端宿主）。
- [ ] 文档：模块 `design.md` / `roadmap.md` 更新；本设计 doc 引用更新；D-022 回写若方向变更。
