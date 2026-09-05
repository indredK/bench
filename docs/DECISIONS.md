# Bench 决策日志

本文件只记录仍影响当前实现的方向性取舍；“做什么”以 [ROADMAP.md](./ROADMAP.md) 为准，当前风险以 [audit-report.md](./audit-report.md) 为准。已推翻和已完成历史由 Git 保留。

## D-021 · Rust target 目录外迁 + sccache + 暂停 Windows CI

- **日期**：2026-09-05
- **状态**：采纳
- **背景**：`src-tauri/target/` 累计到 **42 GB**（debug 38G、release 917M、aarch64-apple-darwin 增量 2.3G、x86_64-pc-windows-{gnu,msvc} 273M、rust-analyzer/flycheck 1.8G），远超项目本体（`node_modules` 541M、`dist` 2.4M）。根因：① Tauri 生态依赖图重（`tauri` + `objc2` + `webview2-com` + `reqwest` + `quick-xml` + `keyring` + `trippy-core` …），debug 不开 LTO；② 本机同时跑 macOS + 两个 Windows target 的交叉编译，本地无法交叉编译 Windows（见 `AGENTS.md` 跨平台 cfg 铁律）；③ 无 `sccache`，每次 `cargo clean` 都是全量重编。
- **决策**：
  1. **Rust 构建产物迁出项目，相对路径 + 同级目录**：`src-tauri/.cargo/config.toml` 设 `build.target-dir = "../../tauri-app-target"`，路径相对 config 文件解析，实际落点为 `<github>/tauri-app-target`，与 `tauri-app/` 同级。理由：① 与项目一对一绑定，命名上不会跟其他项目（`bettertolive` / `uniapp` 等）的产物串；② 相对路径使项目可被整体移动或重命名（仓库从 `tauri-app/` 改名为 `bench-app/` 也无需改配置）；③ 仓库目录从此只放源码，Time Machine / 备份 / 体积探测都不再背 `target/`。`.gitignore` 中 `src-tauri/target/` 保留为防御性兜底。
  2. **统一启用 `sccache`**：在同文件 `build.rustc-wrapper = "/opt/homebrew/bin/sccache"`，dev/CI 共享编译缓存；本地干净 rebuild 缩到分钟级。CI 侧不显式配 wrapper（`Swatinem/rust-cache@v2` 已等价覆盖），本机与 CI 各自独立缓存。
  3. **rust-analyzer 复用同一 target dir**：`rust-analyzer.cargo.targetDir = true`，cargo 与 rust-analyzer 共享 build artifacts，rust-analyzer 不会再产出独立的二级 `target/rust-analyzer/` 子树。
  4. **暂停 Windows CI**：`verify` job 的 `matrix.os` 移除 `windows-latest`，`release-build` 矩阵移除 `x86_64-pc-windows-msvc`，同步删除 `Import Windows Authenticode certificate`、`Verify Windows Authenticode signatures`、`Collect Windows bundle and updater artifacts` 三个死步骤以及 Windows-only 的 release 签名分支。**`check:be-cfg` 继续在 macOS runner 跑**，cfg 卫生门禁不退化。Release 通知文本保留对 Windows Authenticode 的提示，因为它是给终端用户看的，跟 CI 跑不跑 Windows 不耦合。
- **理由**：本机 macOS 端无 MSVC 头无法真正交叉编译到 Windows（既有的 `ring` / `webview2-com` 限制），本地跑 Windows target 只是产生死目录；CI 跑 Windows 暂时与 2.0 发布节奏不对齐。`target-dir` 外迁一劳永逸地解决项目目录膨胀，sccache 解决反复 `cargo clean` 的开发成本。`sccache` + 外置 target-dir 是 macOS Tauri 项目的标准组合，没有项目结构耦合。
- **影响**：
  - 任何 Rust 工作流（`pnpm tauri dev` / `cargo build` / `pnpm run check:be-cfg` / rust-analyzer）都会自动写到 `tauri-app-target/`，不会在 `src-tauri/target/` 落新文件。
  - 新增 `src-tauri/.cargo/audit.toml` 不受影响（不同 config 域）。
  - 重新启用 Windows CI 时，按 `ci-build.yml` 中保留的注释恢复矩阵条目与三个被删步骤即可，diff 在 git history 里。
  - 旧 `src-tauri/target/` 已移入废纸篓（mavis-trash），可从 Finder 回收站恢复或清空。
- **相关**：[src-tauri/.cargo/config.toml](../src-tauri/.cargo/config.toml) · [.github/workflows/ci-build.yml](../.github/workflows/ci-build.yml) · [.vscode/settings.json](../.vscode/settings.json) · [AGENTS.md 跨平台 cfg 铁律](../AGENTS.md) · [D-018](#d-018--智能体工具文件不进版本库)

## D-020 · Photo Triage 作为 2.0 旁路独立模块（对齐 D-016 先例）

- **日期**：2026-09-03
- **状态**：采纳
- **背景**：用户将 `/Users/apple/KnowledgeBase/photo-triage/`（Python 独立桌面应用，照片「留/删」筛选）迁移进 Bench。该功能在 R00 冻结 2.0 范围之后提出，不列于 [ROADMAP.md](./ROADMAP.md) R00–R10 执行序列。
- **决策**：
  1. **不进入 2.0（R00–R10）执行序列**；Photo Triage 作为 **2.0 并行旁路的独立模块 1.0**（对齐 D-016 Network Probe 先例）实现，macOS-only，不得改动 2.0 版本号/发布门禁；与 2.0 争用人力时优先 2.0。
  2. **迁移一致性为硬约束**：稳定 ID（`md5(相对路径去扩展名)[:12]`）与 manifest 结构与 Python 版逐字节一致，已有 Python 扫描结果直接复用、留/删标记不丢失；manifest 不得为加字段破坏该承诺（因此清单文件不引入 schema_version，改用大小上限 + 原子写治理）。
  3. **删除亚线**：删除一律进系统废纸篓可恢复；批量删除强制二次确认；清理空文件夹仅在相册目录内且仅限空目录。
  4. **子进程红线**：sips/ffmpeg/qlmanage 一律带超时与输出上限（复用 `subprocess.rs`），损坏媒体不得拖死并发闸门。
  5. **数据目录**：`$APPDATA/photo-triage/build-<md5(src)[:10]>`，每相册独立构建目录；代理缓存与 manifest 原子写；asset 协议仅运行时放通（构建目录 + 用户自选源目录），不依赖静态宽桶 scope。
- **理由**：照片筛选是独立工具场景，绑定 2.0 门禁会拖延发布且引入与系统管理工具不同的安全面；旁路模块化与 D-016 同一先例，风险可控且可随主包发布。
- **影响**：photo-triage 代码随 2.0 一起进安装包，但其强制级规范（IPC unwrap、i18n、spawn_blocking、子进程超时）等同 2.0 红线执行；文档注册遵循 coding-standards §11（README/roadmap/migration-plan 已入 `docs/modules/photo-triage/`）。
- **相关**：[photo-triage README](./modules/photo-triage/README.md) · [photo-triage roadmap](./modules/photo-triage/roadmap.md) · [D-016](#d-016--network-probe-独立一级模块与分期设计)

## D-019 · 启动路径零 TCC 触发与自启动 LaunchAgent 化

- **日期**：2026-09-03
- **状态**：采纳
- **背景**：用户反馈三个启动问题：① 开机自启动直接进托盘（Accessory），不驻留程序坞；② 每次重启请求系统权限；③ 启动即卡顿（疑似自动扫描软件）。根因是 `detect_launched_at_login` 在启动 setup 主线程同步运行 `osascript`（System Events）探测进程可见性 —— 该调用既触发 Automation（TCC）授权弹窗（ad-hoc 签名下授权随构建失效，弹窗反复出现），又在弹窗挂起时阻塞整个启动，且采样窗口期无可见窗口导致误判；托盘菜单初始化也在启动时经同一机制查询自启动状态。
- **决策**：
  1. **启动关键路径禁止调用可能触发 TCC 授权弹窗的子进程**（osascript/System Events 等）。启动来源探测统一为启动参数 `--hidden`（`login_items::detect_launched_at_login`），与 Windows 注册表 Run 值的既有约定对齐。
  2. **macOS 自启动改用 LaunchAgent plist**（`~/Library/LaunchAgents/com.bench.app.plist`，`RunAtLoad` + `ProgramArguments [当前可执行文件, --hidden]`），读写全部为文件操作，零授权成本；放弃 System Events 登录项机制。Windows 注册表 Run 机制不变。`set_autostart` 切换时尽力清理旧版 System Events 登录项（仅在用户显式切换开关时可能触发一次授权弹窗，启动路径不经过此处）。
  3. **登录项启动行为 = 静默驻留程序坞**：`--hidden` 启动时不显示主窗口、保持 `Regular` 激活策略（Dock 图标在场），不切 `Accessory`；点击 Dock 图标经 `RunEvent::Reopen` 唤出主窗口。托盘图标照常提供快捷入口。关闭窗口收起到托盘的既有行为（Accessory）不变。
  4. **应用清单扫描一律用户触发**：默认落地页 quick-launch 不再进入即自动全量扫描。扫描完成后快照原子持久化到 `config_dir/bench/app-manager/inventory.json`（超限剥离图标），启动后进入页面时仅恢复上次快照（新命令 `get_cached_app_inventory`），是否重新扫描由用户决定；快照 revision 经 `fetch_max` 保持会话内单调。
  5. **单实例保护扩展到 macOS**：`tauri-plugin-single-instance` 全桌面注册，防止 LaunchAgent 与手动启动并存出双实例。
- **理由**：TCC 授权与启动延迟是启动体验的一等公民；基于进程可见性的 osascript 探测既有授权成本又有竞态误判，无法修复只能移除。`--hidden` 参数由应用自身控制，判定确定性 100%。自启动驻留程序坞 + 按需扫描符合 macOS 应用惯例。
- **影响**：
  - 新增代码不得在 `lib.rs` setup / 启动关键路径引入 osascript、System Events 或其他 TCC 触发调用（见 ARCHITECTURE §2 第 12 条）。
  - 旧版本已启用自启动的用户（System Events 登录项）：更新后首次开机仍会按旧机制隐藏启动（无 `--hidden`，会显示主窗口）；在设置中关闭再开启一次即可迁移到新机制。
  - 新机制的自启动条目在系统设置中显示于「允许在后台」而非「打开时打开」；应用内开关是主控制入口。
- **相关**：[system-settings roadmap](./modules/system-settings/roadmap.md) · [quick-launch roadmap](./modules/quick-launch/roadmap.md) · [ARCHITECTURE §2](./ARCHITECTURE.md#2--ai-编码规则--禁止模式)

## D-018 · 智能体工具文件不进版本库

- **日期**：2026-08-04
- **状态**：采纳
- **决策**：
  1. **各 AI 工具的私有目录与会话产物一律不进版本库**：`.codebuddy/`、`.claude/`、`.trae/`、`.workbuddy/`、`.mimocode/`、`.tmp-skills/`、`.od-skills/`、`.opencode/`、`.agent_context/`、`.multica/`、`.qoder/`、`.github/copilot-instructions.md`，以及根目录会话产物（`purrfect-sauteeing-pudding.md`、`description.md`、`reply.md` 等）统一由 `.gitignore` 忽略；本地可存在，远端不得有。
  2. **唯二的权威 AI 规则文件在库内**：`AGENTS.md`（逻辑入口）与 `.cursorrules`（最高优先级）。二者保留在版本库，供所有工具与新人读取；其余工具入口文件只作个人本机可选配置。
  3. **误提交的处理方式**：发现已跟踪的忽略类文件时用 `git rm --cached` 移除并补 `.gitignore` 规则，保留本地文件；不做历史改写，除非用户明确要求。
- **理由**：智能体目录与个人会话数据属于本机工作环境，提交进远端会污染仓库、泄漏个人工作痕迹，也让新克隆者背上无意义的文件；规则入口只需保留跨工具通用的两份文件。
- **影响**：新增 AI 工具接入时不得把工具私有目录提交进库；`AGENTS.md` 头部描述与该决策保持一致；CI/pre-commit 不为此设额外门禁，`.gitignore` 为唯一防线。
- **相关**：[AGENTS.md](../AGENTS.md) · [.gitignore](../.gitignore)

## D-017 · Network Probe 可选能力包（可插拔高级组件）

- **日期**：2026-07-22
- **状态**：采纳（设计约束；随 Post-MVP-Adv/C 实现，不进 MVP 主包）
- **决策**：
  1. **主包必含、不可做成下载项**：MVP A+B 急救与基础探测（体检、DNS/TCP/ping、站点延迟、上不了网、免特权修复、`trippy-core` traceroute 等轻量/常用能力）编译进主应用；打开即用，禁止「先下载库才能急救」。
  2. **高级/不常用/重特权能力走可选能力包（Capability Pack）**：SYN/ARP 深度扫描、诊断级抓包、正式特权 helper、以及未来同类重组件。用户首次点击对应 L2 时，若包未安装 → 提示用途、体积、签名来源 → 同意后由**后端**下载到 App Support（或等价受控目录）并校验 → 再启用功能；支持卸载。
  3. **可插拔的是 sidecar / 外部工具 / 远程能力，不是运行时再下 Rust crate**：crate 仅编译期进入主包或进入预先构建的 sidecar；禁止「运行时 cargo/npm 拉依赖」。三类供给：
     - **探测本机已有工具**（如已安装的 `nmap`）→ 启用 fallback，不强制下载；
     - **按需下载的签名 sidecar**（如 `net-probe-adv`）；
     - **远程能力**（Globalping / agent / librespeed 源）— 本机零重库。
  4. **安全与更新对齐 D-010 / app-manager 更新模型**：下载 URL、版本、hash、签名材料只由后端 canonical manifest 决定；renderer 不得提交最终下载地址或可执行路径。ad-hoc/未公证发布时必须标明 Gatekeeper 限制，**不得宣称**可选包已获系统信任。
  5. **能力矩阵驱动 UI**：`getNetworkProbeCapabilities()`（或等价）对每项 tool 返回 `supported | degraded | unsupported | missing_pack`；`missing_pack` 触发安装向导，安装后刷新矩阵。下完包仍缺特权时继续走提权/降级，不伪装成功。
  6. **范围边界**：可选包不得扩大硬红线（仍禁止攻击能力）；不得绕过 IPC 契约与 `cancelScan` 幂等；主包与可选包共享同一 `nodeId` / session / 错误模型。
- **理由**：主包保持轻量与急救可用性；重库与内核/BPF 能力按需安装，降低默认攻击面与体积，同时保留专业探测深度。
- **影响**：Post-MVP 实现 Adv/C 前须先落地 pack manifest、安装/卸载 IPC、校验与能力矩阵；AI 不得把 MVP 工具改成「点击下载」；不得实现运行时动态链 crate。
- **相关**：[network-probe design §9.7](./modules/network-probe/design.md) · [design-security](./modules/network-probe/design-security.md) · [roadmap](./modules/network-probe/roadmap.md) · [D-016](#d-016--network-probe-独立一级模块与分期设计) · [D-010](#d-010--默认使用-ad-hoc-macos-与-unsigned-windows-包)

## D-016 · Network Probe 独立一级模块与分期设计

- **日期**：2026-07-22
- **状态**：采纳（**MVP 实现已授权**；2026-07-22 用户指令「现在开始 1.0」；**2026-07-22 用户授权 Post Wave 0–5**，Vision Wave 6 另排）
- **决策**：
  1. 新增独立一级 feature `network-probe`（不复用 `dev-toolbox` 子 Tab 作为最终形态）；占位页可先注册以满足文档↔代码对齐。
  2. **不进入 2.0（R00–R10）执行序列**；Network Probe 作为 **2.0 并行旁路的独立 MVP（模块 1.0）** 实现，不得改动 2.0 版本号/发布门禁；与 2.0 争用人力时优先 2.0。
  3. 实现时**首版交付 = MVP A+B**：Local L0–L3 体检（检查项清单与 DNS/IP 对照写死）、站点延迟看板、Advisor、免特权修复、traceroute/MTR、「上不了网」高频诊断，以及基础鉴别工具（本机摘要、默认路由只读、TCP connect、自定义 URL 探测、hosts 快检、防火墙只读、打开系统网络设置）。**2026-07-22：MVP A+B 功能闭环已落地**（见模块 roadmap）；**Post-MVP Wave 0–5（Polish / D-017 packs / 测速·多节点 / 安全 / 发现 / 产品化）已授权开工**；Vision P5–P7 另排。
  4. 带宽测速（librespeed）、Globalping remote、自有 agent、SYN/ARP/抓包/特权 helper、Vision P5–P7 等**必须保留完整设计**；Wave 0–5 实现归属 Post-MVP，Vision 不绑本轮。
  5. 平台：macOS 主路径；Windows 按能力矩阵降级；Linux 不支持（D-014）。
  6. 高危网络修复开放但须**三次确认** + 后端复核；硬红线为不实现主动攻击能力（仅检测/防御）。
  7. 与 `system-settings`/`dev-toolbox` 的 ping 最终共用 `net_probe` 实现；与 `port-manager` 划清「本机占用/Kill」vs「外部探测/指纹」边界。
- **理由**：用户需要急救箱级诊断而非单次 ping；范围若不分期会吞噬 2.0 与安全边界；设计先行可避免实现期范围失控。用户已明确授权开始模块 1.0。
- **影响**：允许按模块 roadmap 进入 `/feature` 实现 MVP；改设计须同步 `docs/modules/network-probe/*`；方向变更回写本条目；仍禁止把 Post-MVP 能力塞进首刀。
- **相关**：[network-probe design](./modules/network-probe/design.md) · [L1 基础](./modules/network-probe/design-basic.md) · [测试](./modules/network-probe/design-test.md) · [安全](./modules/network-probe/design-security.md) · [发现](./modules/network-probe/design-discover.md) · [roadmap](./modules/network-probe/roadmap.md) · [D-017](#d-017--network-probe-可选能力包可插拔高级组件) · [D-014](#d-014--linux-不进入支持矩阵与-cicd)

## D-015 · Command Center 作为可持久化的命令卡片库

- **日期**：2026-07-19
- **状态**：采纳
- **决策**：新增顶层 feature `command-center`，把常用命令/脚本以卡片形式持久化存储并可一键执行。卡片支持四种动作类型：`shell`（普通执行）、`shellAdmin`（经 osascript 提权执行）、`copy`（仅复制到剪贴板，作为速查库）、`open`（打开路径/URL）。卡片数据由 Rust 后端经 `persistence.rs` 原子写入 `dirs::config_dir()/bench/command-center/cards.json`，前端不直接持久化。执行经 `subprocess.rs` 捕获 stdout/stderr 并带超时；提权与删除卡片走 `DestructiveConfirmDialog` 二次确认，执行前明确展示完整命令。
- **理由**：把"记不住、需重复运行、参数长、需提权"的运维/开发命令固化为可复用资产，让 Bench 从工具集合演进为可存储操作的入口；后端持有持久化与执行边界，renderer 只做展示与选择，避免任意命令绕过契约。
- **影响**：新增命令必须同步 `contracts.ts` 与 `commands.rs`；卡片执行不得在组件里直接 `invoke`；跨平台差异由后端 `#[cfg]` 兜底（macOS/Windows 已支持，Linux 返回 `UNSUPPORTED`；Windows 提权进程脱离进程树，无输出且不可终止）。破坏性/提权动作必须二次确认并展示原文命令。
- **相关**：[编码规范 §7 Rust后端](./coding-standards.md) · [ARCHITECTURE §2](./ARCHITECTURE.md)

## D-014 · Linux 不进入支持矩阵与 CI/CD

- **日期**：2026-07-14
- **状态**：采纳
- **决策**：Bench 只支持 macOS 14+ 与 Windows 11。所有 GitHub Actions runner、Tauri 构建目标、安装包、updater manifest 和发布聚合作业只覆盖这两个平台；通用自动化作业使用 macOS runner，不使用 Linux 作为廉价执行环境。
- **理由**：CI 平台应与正式支持范围一致，避免 Linux 编译通过被误解为产品承诺，也避免后续 AI 持续维护不验收的平台分支。
- **影响**：`.github/workflows/` 由 `pnpm run check:ci-platforms` fail-closed；不得新增 Linux runner、容器、包格式或发布说明。依赖锁文件中的平台可选包属于上游元数据，不代表支持范围。
- **相关**：[2.0 最终路线图](./ROADMAP.md) · [CI workflow](../.github/workflows/ci-build.yml) · [编码规范 §9](./coding-standards.md#9-测试与门禁)

## D-013 · ROADMAP 是 2.0 唯一执行真理源

- **日期**：2026-07-14
- **状态**：采纳
- **背景**：功能门禁、UX 门禁、发布主题和模块审计重复维护相同任务，状态已经漂移，能力较弱的 AI 无法稳定判断执行顺序。
- **决策**：删除平行发布文档；`ROADMAP.md` 用 R00-R10 维护跨模块依赖、命令、证据、停止条件和人工批准边界。模块 `roadmap.md` 只保留未完成项，`design.md` 只保留长期约束，README 只做入口。
- **理由**：一个任务只能有一个进度 owner。固定输入/输出和停止条件可以减少 AI 自行推断、漏掉真机证据或提前切版本。
- **影响**：不得新增第二份 2.0 总路线图；更新跨模块发布顺序时只改 `ROADMAP.md`，并同步受影响模块 roadmap。
- **相关**：[2.0 最终路线图](./ROADMAP.md) · [文档规范](./coding-standards.md#11-文档)

## D-012 · Account Manager 使用有界同源浏览器状态与逐能力发布

- **日期**：2026-07-14
- **状态**：采纳
- **决策**：Session 只捕获 Station 精确 origin；Web Storage 和 IndexedDB 分别加密并设置 database/store/record/体积/timeout 上限，恢复前验证 origin 与 schema，不兼容值 fail-closed。平台能力由后端 DTO 返回 `supported/partial/unsupported/failed`；未完成真机验收时保持 `partial`。Windows WebView proxy 继续 `unsupported`，桌面登录失败不得回退共享系统浏览器。
- **理由**：限制资源与 origin 可防止跨站污染和内存耗尽；逐能力状态将“已实现”和“已验证”分离。
- **影响**：只有模块 roadmap 对应平台用例全部通过并补行为测试后，单项才能提升为 `supported`。
- **相关**：[Account Manager design](./modules/account-manager/design.md) · [真机验收](./modules/account-manager/roadmap.md#真机验收步骤)

## D-011 · 2.0 保留既有 bundle identifier

- **日期**：2026-07-14
- **状态**：采纳
- **决策**：2.0 继续使用 `com.bench.app`，接受 Tauri 关于 `.app` 后缀的警告。未来改名必须单独设计 Keychain、数据目录、updater 和卸载/重装迁移，并从 1.23.0 真机升级验证。
- **理由**：identifier 是持久化命名空间；兼容既有用户优先于消除构建警告。
- **影响**：后续 AI 不得直接修改 identifier。
- **相关**：[2.0 最终路线图](./ROADMAP.md) · [Dev/Prod 共存](./dev-prod-coexistence.md)

## D-010 · 默认使用 ad-hoc macOS 与 unsigned Windows 包

- **日期**：2026-07-14
- **状态**：采纳
- **决策**：`BENCH_OS_SIGNING_MODE` 默认 `unsigned`：macOS 使用 ad-hoc 签名，Windows 生成 unsigned MSI/NSIS；Release 必须附 `OS-SIGNING-NOTICE.txt` 和 `SHA256SUMS`。Tauri updater 私钥、`.sig`、三目标 manifest 和签名验证继续 fail-closed。取得证书后再切到 `signed`，不改发布脚本主流程。
- **理由**：没有证书时无法制造 OS 信任；明确提示和 updater 独立签名可以保证产物可追溯与应用内更新完整性。
- **影响**：Gatekeeper/Unknown Publisher 提示是已知限制。正式 notarization、Authenticode 和对应信任验收延期，不得伪装为已完成。
- **相关**：[CI workflow](../.github/workflows/ci-build.yml) · [Updater roadmap](./modules/updater/roadmap.md) · [R05](./ROADMAP.md#r05-updater供应链与-rc-流水线)

## D-007 · Account Manager 使用单写者状态与后端授权票据

- **日期**：2026-07-13
- **状态**：采纳
- **决策**：Session 只保留 canonical `SessionRecord`；mutation 由带 revision 和原子持久化的 coordinator 串行提交。外部登录由后端签发并原子消费短期一次性 ticket，callback、候选账号和 credential origin 固化在 ticket 中。
- **理由**：单一真理源消除并发覆盖；后端票据把 renderer 限制为展示/选择层，防止参数替换和重放。
- **影响**：禁止恢复旧双写或接受 renderer 提交最终可信 URL。
- **相关**：[Account Manager design](./modules/account-manager/design.md)

## D-006 · 文档只保留当前真理源与未完成事项

- **日期**：2026-07-13
- **状态**：采纳
- **决策**：roadmap 只保留当前约束、未完成项和验收条件；长期架构/安全边界进入 design 或规范；已完成历史由 Git 保留；无独有信息的专题文档直接删除，不留跳转空壳。
- **理由**：减少多个真理源和过期描述，让能力较弱的 AI 直接找到修改入口和验收条件。
- **影响**：新增文档前必须证明存在独有、长期有效的信息；README 不复制功能清单。
- **相关**：[文档索引](./README.md) · [编码规范 §11](./coding-standards.md#11-文档)

## D-005 · 应用清单单一真理源与跨平台能力状态

- **日期**：2026-07-13
- **状态**：采纳
- **决策**：App Manager inventory 是应用清单唯一真理源，输出带 revision 的不可变 snapshot；Quick Launch 只消费 snapshot。启动、定位、升级、卸载 IPC 只接受稳定 ID；平台路径、AUMID、package ID、URL 和校验材料由后端 canonical state 解析。能力使用 `supported/partial/unsupported/failed`；模糊匹配只用于建议，破坏性动作要求 exact evidence。
- **理由**：共享任务唯一 owner 可避免并发覆盖；窄 IPC 建立 renderer 信任边界；显式状态防止失败被伪装为空结果成功。
- **影响**：禁止 Quick Launch 新建扫描流程，禁止 renderer 提交最终执行路径或更新 URL。
- **相关**：[App Manager design](./modules/app-manager/design.md) · [Quick Launch design](./modules/quick-launch/design.md)

## D-004 · AGENTS.md 是逻辑入口，冲突时停止问人

- **日期**：2026-07-06
- **状态**：采纳
- **决策**：所有 AI 工具入口导向 `AGENTS.md`；裁决优先级为 `.cursorrules > AGENTS.md > docs/*.md`。文档未覆盖、规则冲突、危险操作或不理解既有模式时必须停止并询问用户。
- **理由**：工具的物理入口无法统一，但逻辑入口和防呆行为可以统一；猜错的代价高于多问一次。
- **相关**：[AGENTS.md](../AGENTS.md) · [.cursorrules](../.cursorrules) · [AI workflows](./AI-WORKFLOWS.md)
