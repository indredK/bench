# Extension 契约规格（Extension Spec）

> **定位**：本文是插件（extension）**契约的唯一规格真相源**（Reference 层）。任何 manifest 字段、签名规则、registry 格式、产物格式的改动，都必须先改本文再改代码。
> **执行顺序与状态**：见 [modules/extension-center/roadmap.md](../modules/extension-center/roadmap.md)。
> **架构边界与工作流**：见 [extension-workflow.md](../explanation/extension-workflow.md)。
> **版本**：本文对应 **manifest schema v2**（P3.1 起）。schema v1 的迁移说明见 §3.6。
> **最后更新**：2026-09-08

---

## 1. 范围与术语

| 术语                     | 含义                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **extension / 插件**     | 运行时可安装、可卸载的前端 bundle 能力单元。**不使用 "plugin"** —— Tauri 官方 plugin 指编译期 Cargo crate（见 [D-023](../explanation/decisions.md#d-023--20-目标变更为插件化生态r00r10-全部降级)） |
| **宿主（host）**         | Bench 主程序（Rust + WebView），提供 asset provider、IPC 网关、生命周期管理                                                                                                           |
| **bundled**              | 随主包构建并发布的官方插件                                                                                                                                                            |
| **market**               | 经 canonical registry 分发的插件（官方或第三方）                                                                                                                                      |
| **能力面（capability）** | 宿主暴露给 extension 空间的一组 IPC 命令                                                                                                                                              |
| **canonical 文本**       | 用于签名的确定性序列化字节（§4.1），签名与验签必须逐字节一致                                                                                                                          |

**宿主与插件的信任边界**：插件是**不受信任的前端代码**。它可以调用能力面内的命令，除此之外不得触及宿主内部。下载 URL / 版本 / hash / 签名材料**只由后端配置或 canonical registry 决定**，renderer 不得提交最终下载地址或可执行路径（同 [D-017](../explanation/decisions.md#d-017--network-probe-可选能力包可插拔高级组件) 第 4 条确立的信任边界原则）。

---

## 2. 产物格式

### 2.1 安装后目录（`$APPDATA/extensions/<id>/`）

```
<id>/
├── manifest.json        # 必填，schema v2
├── index.html           # 入口，必须与 manifest.entry.index 一致
├── assets/              # 构建产物（vite build 输出，部署根）
│   ├── index-<hash>.js
│   └── index-<hash>.css
├── locales/             # 可选，插件自带 i18n
│   ├── zh.json
│   └── en.json
└── .disabled            # 存在即表示已禁用（宿主维护，非产物自带）
```

- 目录名必须等于 `manifest.id`。
- `manifest.files` 必须列出**除 `manifest.json` 自身与 `.disabled` 之外**的全部文件；产物中不得存在清单外的文件。`manifest.json` 自身不入清单（文件哈希无法自嵌套，其完整性由「对 canonical 文本的签名」覆盖，见 §4）；`.disabled` 由宿主维护。
- 运行时目录由宿主独占写入；用户不可直接编辑（UI 不提供「编辑插件文件」入口）。

### 2.2 分发包（zip）

- 结构：zip 根即插件根目录（不含顶层文件夹），`manifest.json` 位于根。
- registry 条目同时提供**整包 `sha256` 与 `size`**，下载后先验整包摘要再解压（提前挡掉传输损坏与 zip bomb）。
- 解压安全要求见 §6.3。

---

## 3. manifest schema v2

### 3.1 字段总表

| 字段            | 类型                      | 必填 | 约束                                                                    | 说明                                                                                                                     |
| --------------- | ------------------------- | :--: | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion` | number                    |  ✅  | 必须等于 `2`                                                            | 宿主 fail-closed，不匹配即拒绝加载                                                                                       |
| `id`            | string                    |  ✅  | `^[a-z][a-z0-9-]*$`                                                     | 同时是产物目录名、窗口 label 后缀（`ext-<id>`）                                                                          |
| `version`       | string                    |  ✅  | `X.Y.Z`（三段纯数字）                                                   | 与宿主版本解耦；参与版本单调性检查                                                                                       |
| `display`       | object                    |  ✅  | `en` 必填且非空；`zh` 可选                                              | `zh` 缺失时回退 `en`（降低非中文作者门槛）                                                                               |
| `distribution`  | `"bundled"` \| `"market"` |  ✅  | —                                                                       | `market` 强制验签                                                                                                        |
| `entry`         | object                    |  ✅  | `index` 以 `.html` 结尾、相对路径、不含 `..`、不以 `/` 开头             | 入口 HTML，相对产物根                                                                                                    |
| `files`         | array                     |  ✅  | 至少 1 项；`path` 相对产物根、不含 `..`、不以 `/` 开头；`path` 不得重复 | 逐文件完整性清单（P3.1 起必填，见 §3.4）                                                                                 |
| `acl`           | object                    |  ✅  | `commands` 每项必须在宿主能力面注册表内                                 | 插件申请的命令子集（§7）                                                                                                 |
| `engines`       | object                    |  ✅  | `bench` 为 `*` 或 `>=X.Y.Z`                                             | 宿主兼容约束；非法约束 fail-closed                                                                                       |
| `platforms`     | string\[\]                |  ⬜  | 每项为 `"macos"` \| `"windows"`；不得为空数组                           | 声明可用平台（P5）；**缺省 = 全平台**。宿主在已装列表中过滤掉不含当前平台的插件（能力判定由宿主做，renderer 不自行决定） |
| `expiresAt`     | string \| null            |  ⬜  | ISO 8601 UTC                                                            | **market 推荐**；过期元数据被拒绝（防 freeze attack）                                                                    |
| `signature`     | string \| null            |  ⬜  | minisign 签名                                                           | **market 必填**；bundled 豁免（由主包签名链覆盖）                                                                        |

> 未列出的字段一律拒绝（`deny_unknown_fields`）。字段演进随本规格修订（`platforms` 为 v2 增补，P5）；破坏性字段变更必须走 schemaVersion 升级。

### 3.2 完整示例（market）

```jsonc
{
  "schemaVersion": 2,
  "id": "photo-triage",
  "version": "1.2.0",
  "display": { "en": "Photo Triage", "zh": "照片筛选" },
  "distribution": "market",
  "entry": { "index": "index.html" },
  "files": [
    { "path": "index.html", "sha256": "9f86d081…", "size": 1024 },
    { "path": "assets/index-a1b2c3.js", "sha256": "2c624232…", "size": 469123 },
  ],
  "acl": { "commands": ["photo_triage_scan", "photo_triage_trash"] },
  "engines": { "bench": ">=1.30.0" },
  "expiresAt": "2027-09-08T00:00:00Z",
  "signature": "untrusted comment: minisign public key\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3…",
}
```

### 3.3 files 清单规则

- 覆盖产物根下**除 `manifest.json` 自身与 `.disabled` 外**的全部文件（`manifest.json` 的文件哈希无法自嵌套；其完整性由 §4 的 canonical 文本签名覆盖；`.disabled` 由宿主维护）。
- `sha256` 为小写十六进制 64 字符；`size` 为解压后字节数。
- **空数组视为非法**；重复 `path` 视为非法。
- 校验时必须同时验证「清单内每条 hash 匹配」与「产物中不存在清单外的文件」（对标 Mozilla AMO 的 `manifest.mf` 要求）。

### 3.4 校验顺序（fail-closed，任一步失败即拒绝并记审计）

1. `schemaVersion` 匹配
2. `id` / `version` / `display` / `entry` / `acl` / `engines` 格式与约束
3. `files` 非空、无重复、路径合法
4. `engines.bench` 满足宿主版本
5. `satisfies_engines` 通过后：market 校验 `signature`（§4）；bundled 跳过
6. `expiresAt` 未过期
7. 版本单调性：不高于已安装版本（仅 market 安装/更新路径）
8. 逐文件 hash 校验（开窗前；实现上可在安装时一次 + 开窗时校验 manifest）

### 3.5 最小示例（bundled，官方插件）

```jsonc
{
  "schemaVersion": 2,
  "id": "photo-triage",
  "version": "0.1.0",
  "display": { "en": "Photo Triage", "zh": "照片筛选" },
  "distribution": "bundled",
  "entry": { "index": "index.html" },
  "files": [
    { "path": "index.html", "sha256": "…", "size": 512 },
    { "path": "assets/index-a1b2c3.js", "sha256": "…", "size": 469123 },
  ],
  "acl": { "commands": ["photo_triage_scan", "photo_triage_trash"] },
  "engines": { "bench": ">=1.30.0" },
}
```

### 3.6 v1 → v2 迁移

| 变化                       | 说明                                                            |
| -------------------------- | --------------------------------------------------------------- |
| `files` 由「无」变「必填」 | v1 manifest 无此字段，必须在 P3.1 由打包脚本重新生成            |
| `display.zh` 由必变选      | 回退 `en`                                                       |
| `expiresAt` 新增（可选）   | —                                                               |
| `schemaVersion` 1 → 2      | 宿主同时期只接受一个版本；升级时 bundled 插件与打包脚本必须同步 |

---

## 4. 签名规范

### 4.1 canonical 文本（签名对象）

签名与验签必须使用**逐字节相同**的输入。规则（确定性，无歧义）：

1. 取 manifest 的 JSON 对象；
2. **删除 `signature` 字段**（避免自引用循环）；
3. 所有对象键按**字典序升序**递归排列；
4. 序列化为**紧凑 JSON**（无空格、无换行、无尾随逗号）；
5. 以 **UTF-8** 编码为字节流，不加 BOM、不加尾随换行。

> Rust 侧 `serde_json::Value::Object` 默认为 `BTreeMap`（已按键升序），配合 `to_string` 即可满足；若启用 `preserve_order` feature 必须显式排序。打包脚本侧必须按同一规则序列化。

### 4.2 trusted comment

- **格式：`<id>@<version>`**，宿主校验其必须与 manifest 的 `id`、`version` **完全一致**。
- 作用：把签名绑定到具体插件与版本，**防止降级（rollback）攻击** —— minisign 官方文档明确 trusted comment 可用于写入版本号以阻止降级。
- 未填写或不一致 → 拒绝。

### 4.3 公钥与模式（三态，不做静默回退）

| 模式       | 触发                       | 行为                                                                                                |
| ---------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| `release`  | 默认                       | 使用 env `BENCH_EXT_REGISTRY_PUBKEY`（minisign 公钥文件完整两行文本）；**缺失即报配置错误**，不回退 |
| `dev`      | `BENCH_EXT_DEV_MODE=1`     | 允许本地自签/未签，UI 明示「未验证分发源」                                                          |
| `selfhost` | 用户提供自签 registry 公钥 | 正常验签，UI 标注「第三方 registry」                                                                |

> **禁止回退到 updater 公钥**：updater 私钥一旦泄露即等同于获得插件签发权，属密钥用途混用。私钥本地保管，CI 走 GitHub Secrets（零成本）。

### 4.4 验签流程

```
读取 manifest 原文
  → 解析为对象
  → 构造 canonical 文本（删 signature、键升序、紧凑 JSON、UTF-8）
  → minisign verify(canonical_bytes, signature, allow_legacy=false)
  → 校验 trusted comment == "<id>@<version>"
```

任一步失败 → `FORBIDDEN_PATH` + 审计日志 `verify_fail`。

### 4.5 为什么必须签 `files` 而不只是 manifest

只签 manifest 时，攻击者保留已签 manifest、替换 `assets/*.js` 为任意代码，验签照样通过 —— 等价于**没有包完整性保护**。

行业做法（2026-09-08 联网核验）：

| 生态                | 做法                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Mozilla AMO         | XPI 内逐文件算 digest → `META-INF/manifest.mf` → 对该清单签名（`.sf` + PKCS7 `.rsa`）；要求包内所有文件都被清单列出 |
| Chrome Web Store    | `computed_hashes.json`（4KB 分块 SHA256）+ `verified_contents.json`（JWS 覆盖整棵 hash 树）                         |
| VS Code Marketplace | 发布时对整个包签名，安装时校验包的完整性与来源                                                                      |

本项目取 **Mozilla 层级**（逐文件 SHA256），不取 Chrome 的 4KB 分块 treehash —— 后者是为 GB 级资源增量校验设计，Bench 插件 bundle 在 MB 级，逐文件足够。

---

## 5. canonical registry 格式

### 5.1 形态

**静态 JSON 文件 + Git / GitHub Pages / jsDelivr 托管，不自建服务端**（零服务器成本；Git 天然提供历史与 PR 审核流程）。

先例：Claude Code plugin marketplace（`marketplace.json` + Git）、Obsidian（`community-plugins.json` + GitHub Release）、Rubick（npm 源 + WebDAV）。

静态托管**不降低**验签安全性 —— 前提是 §4 的完整性校验已到位。

### 5.2 目录文件

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "2026-09-08T00:00:00Z",
  "extensions": [
    {
      "id": "photo-triage",
      "display": { "en": "Photo Triage", "zh": "照片筛选" },
      "description": { "en": "…", "zh": "…" },
      "publisher": { "name": "…", "url": "https://…" },
      "versions": [
        {
          "version": "1.2.0",
          "engines": { "bench": ">=1.30.0" },
          "downloadUrl": "https://…/photo-triage-1.2.0.zip",
          "sha256": "…",
          "size": 471859,
          "publishedAt": "2026-09-08T00:00:00Z",
          "yanked": false,
        },
      ],
    },
  ],
  "revoked": [
    { "id": "evil-ext", "versions": "*", "reason": "malicious", "at": "2026-09-08T00:00:00Z" },
  ],
}
```

| 字段                         | 说明                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `versions[].yanked`          | 对齐 npm / crates.io 的下架语义：已安装仍可运行，但不再出现在可安装列表，并提示 |
| `versions[].sha256` / `size` | **整包**摘要与字节数，下载后先验再解压                                          |
| `revoked[].versions`         | `*` 或版本范围（`<1.2.0`）。命中则**强制禁用 + UI 显著警示**，不静默删除        |

### 5.3 吊销语义

- 命中 `revoked` → 宿主**强制禁用**该插件（写 `.disabled`），插件中心显著警示，用户可卸载。
- **不静默删除** —— 能力凭空消失的体验更差，且违背 [D-024](../explanation/decisions.md#d-024--extension-仓库组织与-photo-triage-试点拆法)「bundled 保证功能不真空」的取向。
- 对标 VS Code Marketplace 的 block list（确认恶意后下架并强制卸载已安装实例）。

---

## 6. 安装与校验流程

### 6.1 端到端步骤（market）

1. 插件中心从**后端 canonical 基址**拉取目录（renderer 不提供 URL）
2. 用户选择版本 → 宿主下载 zip 到临时位置
3. 校验整包 `sha256` 与 `size`
4. 解压到**临时目录**（§6.3 安全规则）
5. 读 manifest → 按 §3.4 顺序校验（含逐文件 hash）
6. market：验签 + trusted comment 比对
7. 版本单调性检查（`new > installed`）
8. **全部通过后**原子 rename 到 `$APPDATA/extensions/<id>/`
9. 写审计日志 `install`
10. 刷新插件中心列表

**任一步失败**：清理临时目录，保留已安装版本不变，UI 给出可读错误，记审计日志。

### 6.2 失败分支矩阵

| 失败点                          | 错误码                          | 用户可见提示             | 已安装版本 |
| ------------------------------- | ------------------------------- | ------------------------ | ---------- |
| 整包 sha256 不匹配              | `INVALID_INPUT`                 | 下载文件损坏，请重试     | 不变       |
| manifest 解析/校验失败          | `INVALID_INPUT` / `UNSUPPORTED` | 插件清单不合法           | 不变       |
| ACL 越权                        | `FORBIDDEN_PATH`                | 插件申请了不允许的权限   | 不变       |
| engines 不满足                  | `UNSUPPORTED`                   | 需要 Bench ≥ X.Y.Z       | 不变       |
| 签名无效 / trusted comment 不符 | `FORBIDDEN_PATH`                | 签名校验失败，已阻止安装 | 不变       |
| 版本回退                        | `INVALID_INPUT`                 | 已安装版本更高           | 不变       |
| 逐文件 hash 不匹配 / 清单外文件 | `FORBIDDEN_PATH`                | 插件内容被篡改，已阻止   | 不变       |
| 解压路径越界 / 超配额           | `FORBIDDEN_PATH`                | 插件包结构异常           | 不变       |

### 6.3 解压安全规则（实现前必须锁定）

| 条目     | 规则                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 路径穿越 | 逐 entry 解析 **canonical** 路径，必须以目标目录 canonical 路径 + 分隔符为前缀，否则**整包拒绝**                                                                 |
| 平台差异 | 显式拒绝绝对路径、`..`、Windows 盘符（`C:\`）、UNC（`\\`）。**盘符判断用跨平台字符串，禁用 `Component::Prefix`**（该枚举变体仅 Windows 存在，会破坏 macOS 编译） |
| zip bomb | 限制 entry 数量、单文件解压后大小、总体积；流式解压边写边累计并提前中断                                                                                          |
| symlink  | 拒绝档案内的符号链接 entry                                                                                                                                       |
| 目标目录 | 解压前必须全新或为空                                                                                                                                             |
| 原子性   | 临时目录 → 校验通过 → 原子 rename；失败即清理                                                                                                                    |

---

## 7. 能力面与 ACL

### 7.1 三层权限

```
后端全部命令  ⊇  EXTENSION_ALLOWED_COMMANDS（宿主能力面）  ⊇  manifest.acl.commands（单插件）
```

- **宿主能力面**：`src-tauri/src/extension_host/acl.rs` 的 `EXTENSION_ALLOWED_COMMANDS`，deny-by-default。
- **单插件**：`manifest.acl.commands` 必须是能力面的子集，否则 manifest 校验失败。
- **运行时**：`acl::guarded` 网关拦截 `ext-` 前缀窗口的命令调用，越权即拒绝。

> **为什么不能只靠 capability**：Tauri v2 对 `invoke_handler` 注册的自定命令**默认全窗口放行**，capability 只约束 core/plugin 命令。网关是必需的补充。

### 7.2 新增一条能力面命令的流程

1. 确认该命令对插件场景安全：**无凭据读写、无跨账号、无系统级破坏面**
2. 命令实现已在 `invoke_handler` 注册
3. 加入 `EXTENSION_ALLOWED_COMMANDS`
4. 同步更新宿主能力面文档（`extension-workflow.md §7` 与本文 §7.1）
5. 补单测：命令在 `ext-` 窗口可调用；危险命令（如 `shutdown_now`）不可调用
6. 跑 `pnpm run check:be-cfg` + `clippy -D warnings`

---

## 8. 版本与兼容

| 机制            | 规则                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| `engines.bench` | `*` 或 `>=X.Y.Z`；其余前缀非法（fail-closed）。不满足则禁止打开，列表标记 `compatible: false`           |
| 版本单调性      | market 安装/更新拒绝 `new <= installed`（对齐 `tauri.conf.json bundle.windows.allowDowngrades: false`） |
| `expiresAt`     | 过期元数据被拒绝（防 freeze attack）                                                                    |
| 插件版本        | 由 `manifest.version` 独立管理，与宿主版本解耦                                                          |
| 卸载            | `ext_uninstall`：关窗 → 删除产物目录（仅限合法插件目录）；UI 走 `DestructiveConfirmDialog`              |
| 禁用            | 写 `.disabled` 标记文件；禁用时关闭已开窗口                                                             |

---

## 9. 运行时契约（插件侧可见的接口）

### 9.1 宿主注入

| 通道                        | 内容                                                          | 说明                                                                                                            |
| --------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `window.__BENCH_EXT_LOCALE` | 宿主当前语言（如 `zh` / `en`）                                | 由 `ext_open(locale)` 经 init script 注入。dev/prod 跨 origin 下 `localStorage` 不共享，Rust 注入是唯一可靠通道 |
| IPC `invoke`                | 调用能力面内的命令                                            | 经 `acl::guarded` 网关，越权即拒绝                                                                              |
| 错误捕获脚本                | 捕获 window-error / unhandledrejection / console.error / boot | 宿主在开窗时注入，回传宿主落盘（追加式）                                                                        |

### 9.2 i18n

- 插件自带 `locales/{zh,en}.json`，使用**独立 i18next 实例**（与宿主不共享 store）。
- 语言优先级：宿主注入的 `__BENCH_EXT_LOCALE` → 浏览器 `navigator.language` → `en`。
- manifest `display.en` 必填、`display.zh` 可选，缺失回退 `en`。

### 9.3 插件私有数据（**关键约束**）

> **产物目录是只读的。** §3.4 的完整性校验要求「产物中不存在 `manifest.files` 之外的文件」，因此插件**不得**向 `$APPDATA/extensions/<id>/` 写入任何文件（缓存、配置、状态都会触发篡改判定）。

| 项     | 约定                                                                               |
| ------ | ---------------------------------------------------------------------------------- |
| 数据根 | `$APPDATA/extension-data/<id>/`（由宿主按需创建，经 IPC 命令 `ext_data_dir` 提供） |
| 可见性 | 仅该插件可访问；宿主不解析其内容                                                   |
| 卸载   | **默认保留**数据目录；插件中心提供独立的「清除残留数据」入口（默认不勾，避免误删） |
| 完整性 | 数据目录**不参与** `files` hash 校验                                               |

> `ext_data_dir` 从调用窗口 label（`ext-<id>`）推导插件 id，**不接受调用参数**；
> 非插件窗口调用一律拒绝（P3.1 交付，已登记进 ACL 注册表）。

### 9.4 窗口契约

| 项         | 约定                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| label      | `ext-<id>`（固定前缀，网关据此判定插件窗口）                                                           |
| URL        | 显式 `tauri://localhost/ext/<id>/<entry.index>`，**禁用 `WebviewUrl::App`**（dev 下会 join 到 devUrl） |
| capability | `capabilities/extension.json` 中 `windows: ["ext-*"]`，仅授予 `core:default`                           |
| 权限隔离   | 命令级隔离由 `acl::guarded` 提供，capability 只约束 core/plugin 命令，不能替代网关                     |

---

## 10. 测试与验收清单

### 9.1 安全测试矩阵（P3.1 / P3.3 必须全部覆盖）

| #   | 用例                                 | 期望                           |
| --- | ------------------------------------ | ------------------------------ |
| 1   | 篡改任一产物文件（改 JS 内容）       | 拒绝加载                       |
| 2   | 产物中新增 `files` 未登记的文件      | 拒绝加载                       |
| 3   | `files` 为空数组 / `path` 重复       | manifest 校验失败              |
| 4   | 用旧版本（签名合法）重放             | 拒绝（版本单调性）             |
| 5   | trusted comment 与 id/version 不一致 | 拒绝                           |
| 6   | 签名串篡改                           | 拒绝                           |
| 7   | market 插件缺 `signature`            | 拒绝                           |
| 8   | registry 公钥缺失（release 模式）    | 报配置错误，不回退             |
| 9   | `expiresAt` 已过期                   | 拒绝                           |
| 10  | `engines` 不满足                     | 拒绝，列表标记 incompatible    |
| 11  | `acl.commands` 含能力面外命令        | manifest 校验失败              |
| 12  | `ext-` 窗口调用未登记命令            | 网关拒绝                       |
| 13  | zip entry `../evil.js`               | 整包拒绝                       |
| 14  | zip entry `/abs/path.js`             | 整包拒绝                       |
| 15  | zip entry `C:\Windows\evil.js`       | 整包拒绝                       |
| 16  | zip entry `\\server\share\x.js`      | 整包拒绝                       |
| 17  | zip 内含 symlink entry               | 整包拒绝                       |
| 18  | 解压体积 / entry 数超限              | 中断并拒绝                     |
| 19  | 整包 sha256 不匹配                   | 拒绝（不解压）                 |
| 20  | 安装失败后                           | 临时目录已清理，已安装版本不变 |

### 9.2 常规门禁

```bash
pnpm run check:be-cfg
cargo test --manifest-path src-tauri/Cargo.toml extension_host
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
pnpm run lint:fe
pnpm run test:critical
pnpm run check:docs
```

### 9.3 双平台

macOS 与 Windows runner 必须同时全绿（P3.2 起）。本机 macOS 编译通过**不能替代**双平台验证（[coding-standards.md §7.4.1](../how-to/coding-standards.md)）。
