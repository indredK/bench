# Extension Host P1 概念验证 · 执行报告

> **日期**：2026-09-08 ｜ **阶段**：P1（见 [plugin-market-assessment.md §9](./plugin-market-assessment.md)）｜ **决策**：D-023
> **P1 目标**：验证 Tauri v2 能否在运行时把 `$APPDATA/extensions` 下的前端 bundle 当作**同源本地页面**渲染，并保持 IPC 可用——这是 B′ 方案（宿主 + 可下载前端 bundle）成立与否的前提。

---

## 一、结论

> ## ✅ P1 通过（2026-09-08 实测）
>
> 五项自检全部证实，`poc-verify-result.json` 已由**插件页经 `invoke` 回写落盘**——这既是第 5 项自检的铁证，也同时验证了「插件 ↔ 宿主 IPC 通信」全链路。B′ 方案核心前提成立，可进入 P2。

| #   | 自检项                                | 结果 | 实测值                                          |
| --- | ------------------------------------- | ---- | ----------------------------------------------- |
| 1   | 同源加载（`assetKey.origin`）         | ✅   | `tauri://localhost/ext/bench-poc/index.html`    |
| 2   | IPC 注入（`tauriInternals.injected`） | ✅   | `function`（`__TAURI_INTERNALS__.invoke` 存在） |
| 3   | ESM 相对导入（`esmRelativeImport`）   | ✅   | `imported ./chunk.js -> 1.0.0`                  |
| 4   | DOM 渲染（`domRender`）               | ✅   | `mounted into #root`                            |
| 5   | invoke 回写（`invokeCommand`）        | ✅   | **结果文件存在且内容完整**（由 `invoke` 写入）  |

> 第 5 项不在文件的 `checks` 数组里是预期行为：payload 在 invoke 调用时序列化，此刻第 5 项尚未入列；而**文件本身的存在**正是 invoke 成功的证明。

自动化层同样全绿：

| 验证层       | 内容                                                                  | 结果    |
| ------------ | --------------------------------------------------------------------- | ------- |
| Rust 编译    | `cargo check`                                                         | ✅ 通过 |
| Rust lint    | `cargo clippy -- -D warnings`                                         | ✅ 通过 |
| Rust 单测    | `cargo test extension_host`（路径映射 + 目录穿越防护 7 项）           | ✅ 7/7  |
| cfg 卫生     | `pnpm run check:be-cfg`（349 文件，双平台死代码扫描）                 | ✅ 通过 |
| 前端门禁     | `pnpm run lint:fe`（i18n 3066 keys / docs 380 links / CI 平台 / tsc） | ✅ 通过 |
| IPC 契约     | `contracts.test.ts`（命令名 / 参数 / DTO / 事件 5 项断言）            | ✅ 5/5  |
| 格式         | prettier（本次全部改动文件）                                          | ✅ 通过 |
| **GUI 实测** | **`BENCH_POC_EXT=1 pnpm run dev` → POC 窗口弹出 + 5 项自检回写**      | ✅ 通过 |

> 环境备注：本机在 WorkBuddy 沙箱内 vitest worker 默认无法启动（forks/threads 均超时），需 `--pool=vmThreads --testTimeout=120000` 运行；contracts 测试中的 3 个全量源码扫描用例在本机文件 IO 下需 ~20s（正常机器 <5s）；`cargo check` 需 `CARGO_TARGET_DIR=/tmp/...`（沙箱阻止对工作区外 `tauri-app-target` 的 rename/unlink）。均为环境现象，非代码问题。

---

## 二、P1 实施内容

### 2.1 核心机制：`ExtensionAssets`（新增 `src-tauri/src/extension_host/`）

比评估报告原方案更优的实现路径——**不使用 `asset://` 顶层窗口，而是替换 Tauri 的 asset provider**：

- `Context::set_assets()`（Tauri v2 公开 API）把内置 `EmbeddedAssets` 包装进 `ExtensionAssets`；
- 资源解析顺序：**插件目录（`$APPDATA/extensions/<id>/…`，URL 前缀 `ext/`）→ 内置资源**；
- 插件目录缺失时静默回退，主程序前端不受任何影响。

**为什么比 `asset://` 顶层窗口好**（查证 Tauri 2.11.5 源码与官方文档后的结论）：

1. **IPC 天然可用**：插件页与主前端同源（`tauri://localhost`），`__TAURI_INTERNALS__` 正常注入；
2. **CSP 零改动**：`script-src 'self'` 天然覆盖插件脚本，无需放宽 CSP、无需 `dangerousDisableAssetCspModification`（后者会关闭 Tauri 的 nonce/hash 自动保护，是明确的安全倒退）；
3. **无平台 URL 差异**：`asset://`（macOS/Linux）与 `http://asset.localhost`（Windows）的差异不复存在；
4. **同类先例**：`tauri-plugin-hotswap` 已验证「替换 asset provider + 启动时 swap」路线可生产使用。

### 2.2 安全边界（P1 已含）

- **目录穿越防护**：`resolve()` 拒绝 `..`、绝对路径、Windows 盘符（`C:\`）/ UNC（`\\`）形式——盘符判断用跨平台字符串实现，不用 `Component::Prefix`（该枚举变体仅 Windows 存在，直接匹配会破坏 macOS 编译）；
- **窗口权限最小化**：新增 `capabilities/extension.json`，`windows: ["ext-bench-poc"]` 仅授予 `core:default`。插件窗口与主窗口权限隔离（Tauri capability 按 **window label** 划界，官方文档明文）；
- **关键风险发现**（写入 P2 待办）：Tauri 默认对 `invoke_handler` 注册的**自定命令全窗口放行**——P2 必须实现「插件来源命令白名单网关」，不能依赖 capability 隔离。

### 2.3 POC 插件产物（`scripts/plugins/make-poc-extension.mjs`）

模拟真实插件 zip 解压后的结构写入 `$APPDATA/extensions/bench-poc/`：

```
manifest.json
index.html
assets/style.css    ← 验证 CSS 加载（CSP style-src）
assets/main.js      ← ESM 入口，执行 5 项自检
assets/chunk.js     ← 被 main.js 相对导入，验证多文件 chunk
```

自检 5 项（每项对应 B′ 方案一个关键假设）：

| 自检项                    | 验证假设                                                 |
| ------------------------- | -------------------------------------------------------- |
| `assetKey.origin`         | 插件页确实从 `tauri://localhost/ext/...` 同源加载        |
| `tauriInternals.injected` | IPC 注入存在（`__TAURI_INTERNALS__`）                    |
| `esmRelativeImport`       | 相对 ESM 导入可用（决定 React bundle 的 chunk 能否加载） |
| `domRender`               | DOM 渲染成功（决定插件能否提供完整 UI）                  |
| `invokeCommand`           | 插件能 `invoke` 宿主命令并回写数据（`ext_poc_report`）   |

### 2.4 宿主侧命令（P1 临时，已按契约铁律双写）

- `ext_poc_open` → 打开 POC 插件窗口（`WebviewUrl::App("ext/bench-poc/index.html")`）；
- `ext_poc_report` → 接收插件页自检结果，落盘 `$APPDATA/poc-verify-result.json`。

已同步：`contracts.ts` 三张表（命令定义 / camelCase 分组 / 参数名）+ `commands.rs` 注册宏。`contracts.test.ts` 5/5 通过即证明双写一致。

### 2.5 触发方式（零 UI 侵入）

环境变量 `BENCH_POC_EXT=1`：`lib.rs` 的 `setup` 中检测到即自动打开 POC 窗口。不设置时零行为差异，不进任何生产路径。

---

## 三、工程过程记录（踩坑与修复）

| 问题                                   | 处置                                                                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#[cfg]` 属性绑定被打断                | 初版把 slot 定义插在了 `#[cfg(...)]` 与 `let builder` 之间，导致 cfg 错误作用于新变量，且 single-instance 分支在 macOS debug 下错误参与编译（`handle_second_instance` 不存在）。已修正并加注释警告后来者 |
| clippy `needless_borrow`               | `&app.handle()` 多取一层引用（`handle()` 已返回 `&AppHandle`），改为直接传                                                                                                                               |
| WorkBuddy 沙箱阻止 cargo rename/unlink | `tauri-app-target`（D-021 外迁目录）在工作区外，`cargo check` 的增量清理被沙箱拦截。临时用 `CARGO_TARGET_DIR=/tmp/bench-p1-cargo-target` 完成验证；**本机直接在终端跑不受影响**                          |
| vitest worker 启动超时                 | 本环境需 `--pool=vmThreads --testTimeout=120000`；`contracts.test.ts` 的 3 个全量扫描用例本机耗时 ~20s                                                                                                   |

---

## 四、✅ GUI 实测记录（2026-09-08 完成）

```bash
BENCH_POC_EXT=1 pnpm run dev
```

终端日志确认：

```
Finished `dev` profile [unoptimized + debuginfo] target(s) in 25.52s
     Running /tmp/bench-p1-cargo-target/debug/bench
[extension_host] POC window opened: ext-bench-poc
```

`$APPDATA/poc-verify-result.json` 由插件页经 `invoke("ext_poc_report")` 写入，4 项自检 PASS 如 §一表格；第 5 项（invoke 回写）由文件本身证明。

### 实测中发现并修复的关键坑（重要经验）

**dev 模式下 `WebviewUrl::App` 不走 asset provider。** 首次实测只弹出了主窗口、无 POC 窗口内容。查证 Tauri 源码（`Manager::get_app_url`，`tauri-2.11.5/src/manager/mod.rs:353`）：

> `#[cfg(dev)]` 时 `get_app_url` 优先返回 `config.build.devUrl`（`http://localhost:1420`），`WebviewUrl::App(path)` 会 `join` 到它——**dev 下 App URL 永远指向 vite dev server，到不了 `tauri://localhost` 的 asset provider**；只有生产构建（`frontendDist` → `tauri://localhost`）才走 asset provider。

**修复**：`ext_poc_open` 改用 `WebviewUrl::CustomProtocol(Url::parse("tauri://localhost/ext/…"))`——显式指定协议，dev / prod 行为一致。修复后 POC 窗口正常加载插件页并完成全部自检。

> 对 P2 的启示：`ExtensionAssets` 的 URL 契约必须统一用 `tauri://localhost/ext/…` 显式形式；封装工具函数时禁止使用 `WebviewUrl::App`。

---

## 五、本次全部变更清单（未提交 git，等明示 commit）

**新增**

| 文件                                                    | 用途                                                    |
| ------------------------------------------------------- | ------------------------------------------------------- |
| `src-tauri/src/extension_host/{mod,assets,commands}.rs` | 扩展宿主 P1 spike（asset provider + POC 命令 + 7 单测） |
| `src-tauri/capabilities/extension.json`                 | 插件窗口最小权限                                        |
| `scripts/plugins/make-poc-extension.mjs`                | POC 插件产物生成器                                      |
| `docs/plugin-market-assessment.{md,html}`               | 可行性评估报告 + 决策看板                               |
| `docs/plugin-architecture.md`（本批本地变更新增）       | B-lite 设计（已加 D-023 路线更新注记）                  |

**修改**

| 文件                                | 内容                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `docs/DECISIONS.md`                 | 新增 **D-023**（2.0 = 插件化生态；R00–R10 降级为台账）                           |
| `docs/ROADMAP.md` / `GAP-TO-2.0.md` | 顶部降级公告；37 项差距转为技术债台账（A5 / A3-1 / A3-6 在插件分发启用前须复评） |
| `docs/README.md`                    | 注册两份新文档进索引                                                             |
| `src-tauri/src/lib.rs`              | `mod extension_host` + slot 管理 + `set_assets` 包装 + setup 挂钩                |
| `src-tauri/src/commands.rs`         | 注册 `ext_poc_open` / `ext_poc_report`（现 **255** 条）                          |
| `src/lib/tauri/contracts.ts`        | 三张表双写新命令                                                                 |
| `package.json`                      | 新增 `poc:extension` 脚本                                                        |

---

## 六、下一步（P2）

1. **manifest schema 定稿**（含签名与 `engines` 兼容声明）+ canonical registry；
2. **插件来源命令白名单网关**（Rust 侧按 manifest.acl 校验，覆盖「自定命令默认全窗口放行」的缺口——实测确认插件窗口可调用任意已注册命令）；
3. minisign 签名链接入插件分发（复用 `updater/keys/`）；
4. 用 **Vite 构建一个真 React 插件**（含 JSX/路由/样式），验证真实 bundle 场景（P1 的 ESM/chunk 机制已证实，React 只是其上的增量）；
5. `extension_host` 从 spike 转正：封装 `tauri://localhost/ext/…` URL 工具（禁用 `WebviewUrl::App`）、生命周期（安装/启用/卸载）、i18n、文档三件套。
