# Bench 决策日志

本文件只记录仍影响当前实现的方向性取舍；“做什么”以 [ROADMAP.md](./ROADMAP.md) 为准，当前风险以 [audit-report.md](./audit-report.md) 为准。已推翻和已完成历史由 Git 保留。

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
- **状态**：采纳（设计冻结；**暂不进入实现**）
- **决策**：
  1. 新增独立一级 feature `network-probe`（不复用 `dev-toolbox` 子 Tab 作为最终形态）；占位页可先注册以满足文档↔代码对齐。
  2. **不进入 2.0（R00–R10）执行序列**；2.0 收尾完成前只允许文档与占位，禁止铺开后端探测实现抢占主线。
  3. 实现时**首版交付 = MVP A+B**：Local L0–L3 体检（检查项清单与 DNS/IP 对照写死）、站点延迟看板、Advisor、免特权修复、traceroute/MTR、「上不了网」高频诊断，以及基础鉴别工具（本机摘要、默认路由只读、TCP connect、自定义 URL 探测、hosts 快检、防火墙只读、打开系统网络设置）。
  4. 带宽测速（librespeed）、Globalping remote、自有 agent、SYN/ARP/抓包/特权 helper、Vision P5–P7 等**必须保留完整设计**，实现归属 Post-MVP / Vision，不绑首版。
  5. 平台：macOS 主路径；Windows 按能力矩阵降级；Linux 不支持（D-014）。
  6. 高危网络修复开放但须**三次确认** + 后端复核；硬红线为不实现主动攻击能力（仅检测/防御）。
  7. 与 `system-settings`/`dev-toolbox` 的 ping 最终共用 `net_probe` 实现；与 `port-manager` 划清「本机占用/Kill」vs「外部探测/指纹」边界。
- **理由**：用户需要急救箱级诊断而非单次 ping；范围若不分期会吞噬 2.0 与安全边界；设计先行可避免实现期范围失控。
- **影响**：AI 不得在未获「开始实现 network-probe」明确指令时进入 /feature 大面积编码；改设计须同步 `docs/modules/network-probe/*`；方向变更回写本条目。
- **相关**：[network-probe design](./modules/network-probe/design.md) · [L1 基础](./modules/network-probe/design-basic.md) · [测试](./modules/network-probe/design-test.md) · [安全](./modules/network-probe/design-security.md) · [发现](./modules/network-probe/design-discover.md) · [roadmap](./modules/network-probe/roadmap.md) · [D-017](#d-017--network-probe-可选能力包可插拔高级组件) · [D-014](#d-014--linux-不进入支持矩阵与-cicd)

## D-015 · Command Center 作为可持久化的命令卡片库

- **日期**：2026-07-19
- **状态**：采纳
- **决策**：新增顶层 feature `command-center`，把常用命令/脚本以卡片形式持久化存储并可一键执行。卡片支持四种动作类型：`shell`（普通执行）、`shellAdmin`（经 osascript 提权执行）、`copy`（仅复制到剪贴板，作为速查库）、`open`（打开路径/URL）。卡片数据由 Rust 后端经 `persistence.rs` 原子写入 `dirs::config_dir()/bench/command-center/cards.json`，前端不直接持久化。执行经 `subprocess.rs` 捕获 stdout/stderr 并带超时；提权与删除卡片走 `DestructiveConfirmDialog` 二次确认，执行前明确展示完整命令。
- **理由**：把"记不住、需重复运行、参数长、需提权"的运维/开发命令固化为可复用资产，让 Bench 从工具集合演进为可存储操作的入口；后端持有持久化与执行边界，renderer 只做展示与选择，避免任意命令绕过契约。
- **影响**：新增命令必须同步 `contracts.ts` 与 `commands.rs`；卡片执行不得在组件里直接 `invoke`；跨平台差异由后端 `#[cfg]` 兜底（当前提权/打开仅 macOS 支持）。破坏性/提权动作必须二次确认并展示原文命令。
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
