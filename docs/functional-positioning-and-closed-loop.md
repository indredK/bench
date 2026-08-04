# Bench 功能定位与功能闭环分析

> 本文档梳理 Bench 当前产品的**功能定位**（产品是什么、目标用户、核心价值）与**功能闭环**（从用户入口到核心价值达成的完整流程是否自洽、是否有断点）。
>
> 依据：`README.md`、`docs/ARCHITECTURE.md`、`docs/ROADMAP.md`、`docs/DECISIONS.md`、`src/features/registry.tsx` 及各 feature 描述符、`src/App.tsx` 入口与导航。
>
> 状态：分析快照（2026-08-04）。功能与代码持续演进，本文档为定位与闭环的静态梳理，不替代模块级 `README.md` / `roadmap.md`。

---

## 一、功能定位

### 1.1 一句话定位

**Bench 是一个以 macOS 为主的桌面工作台（desktop workbench），把「应用启动与管理、隔离账号管理、系统设置控制」三个高频系统操作场景收敛到一个本地、离线、可信任的桌面应用里。**

> 官方表述（README）：_"A macOS-first desktop workbench for launching applications, managing isolated accounts, and controlling system settings."_

### 1.2 产品形态

| 属性     | 值                                                            |
| -------- | ------------------------------------------------------------- |
| 形态     | Tauri v2 桌面应用（非 Web / 非移动）                          |
| 技术栈   | React 19 + TypeScript strict + Vite + Rust                    |
| 窗口     | 1280×800，无边框，自定义标题栏，毛玻璃                        |
| 目标平台 | macOS 14+（arm64/x64）与 Windows 11 x64；**不支持 Linux**     |
| 国际化   | 中/英双语对等（i18next）                                      |
| 分发     | GitHub Releases；macOS ad-hoc 签名、Windows unsigned（D-010） |

### 1.3 目标用户

Bench 面向**同时需要「系统操作效率」与「多账号隔离」的桌面重度用户**，典型画像：

1. **开发者 / 运维**：需要快速启动应用、管理开发工具、执行常用命令、诊断网络、清理磁盘、查询硬件与术语。
2. **多账号运营者**：需要在同一站点维护多个隔离登录态（如多个社交媒体/工作账号），且要求账号间 Cookie、Session、存储互不串号。
3. **macOS 系统调优用户**：希望在一个受控界面里调整 Dock、Finder、截图、键盘、网络、默认浏览器等系统设置，而不深入系统设置面板。

### 1.4 核心价值主张

Bench 的核心价值可归纳为三条主线 + 一组工具：

| 主线           | 核心价值                                                                         | 对应模块                                                                       |
| -------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **启动与管理** | 快速、可靠地启动应用并管理已装应用（扫描/升级/卸载），共享同一份应用清单避免漂移 | Quick Launch、App Manager                                                      |
| **账号隔离**   | 在同一站点维护多个隔离登录态，加密持久化、Session 恢复、外部登录代理             | Account Manager                                                                |
| **系统控制**   | 受控、可回滚地调整 macOS 系统设置                                                | System Settings                                                                |
| **工具集**     | 命令卡片、网络急救、磁盘清理、硬件对比、术语库、开发工具箱                       | Command Center、Network Probe、Clean Space、Hardware、Terminology、Dev Toolbox |

### 1.5 定位边界（产品不是什么）

- **不是系统设置应用的复制品**：System Settings 只做受控子集，不复制整个系统设置面板。
- **不是 Web 应用 / 移动应用**：纯桌面，依赖 Tauri 能力；浏览器环境仅作降级预览。
- **不是云同步 / AI Agent / 播放器 / 白噪音**：这些新品类明确不进入 2.0（ROADMAP 发布契约）。
- **不是 Linux 工具**：Linux 不进入支持矩阵与 CI/CD（D-014）。
- **不是攻击工具**：Network Probe 硬红线为不实现主动攻击能力（仅检测/防御）。

### 1.6 定位一致性小结

- **一致**：三条主线（启动/账号/系统）与「桌面工作台」定位自洽；工具集作为工作台的补充能力，服务于同一批重度用户。
- **张力点**：产品同时承载「系统管理工具」与「开发者工具集」两类心智。侧边栏把 `port-manager` / `env-detector` / `token-calculator` 收进 Dev Toolbox、把 `clean-space` 提升为顶层模块，说明团队已在收敛「工具集」的导航层级，但 Dev Toolbox 内部仍聚合了 6 个子工具，定位上偏「杂货铺」。这是定位清晰度上的一个可观察点，不构成闭环断点。

---

## 二、功能闭环分析

### 2.1 全局入口与导航

**入口链路**：

```
启动 splash → main.tsx（i18n 就绪）→ App.tsx 外壳
  → AnimatedRoutes 默认重定向到第一个可用 feature（quick-launch）
  → 侧边栏 NavigationShell（createNavigationItems + createConfigItems）
```

- 默认落地页：`appFeatures.find(canUseFeature)` → **Quick Launch**（registry 顺序第一）。
- 侧边栏：主模块 + 底部「系统设置」分隔区；`port-manager`/`env-detector`/`token-calculator` 收进 Dev Toolbox，`system-settings` 单独放底部。
- 平台门禁：`canUseFeature` 在**路由层**（`RuntimeFeatureGate`）与**导航层**（`createNavigationItems`）双重生效，被门禁的 feature 在浏览器/不支持平台显示 `DesktopOnly` 占位。

**入口闭环判断**：✅ 自洽。用户从启动到进入任一功能模块的路径清晰，默认落地页有兜底（无可用 feature 时渲染空）。

### 2.2 各功能模块闭环

#### ① Quick Launch（快速启动）

- **入口**：侧边栏 / 默认落地页。
- **流程**：首次进入自动扫描（未扫描时）→ 读取共享 `app-inventory` store → 自动分类到场景 → 网格展示（虚拟化、按需图标）→ 点击启动 / 右键移动场景 / 重置覆盖 / 导出分类。
- **价值达成**：用户快速找到并启动应用。
- **闭环判断**：✅ 自洽。与 App Manager 共享同一份应用清单（`src/shared/app-inventory/`），无重复扫描，避免状态漂移。

#### ② App Manager（应用管理）

- **入口**：侧边栏。
- **流程**：三个 Tab（已安装 / 市场 / 软件更新）→ 扫描 → 列表/网格 → 详情 → 启动/定位/授权/升级/卸载；批量操作；更新检查/应用带进度与阻塞弹窗。
- **价值达成**：管理已装应用与更新。
- **闭环判断**：✅ 自洽。provider 区分 `ok / partial / unsupported / failed`，破坏性操作要求可验证证据，写操作有反馈。

#### ③ Account Manager（账号管理）

- **入口**：侧边栏；另有 `AuthProxyNavigationListener` 在收到 pending 认证事件时**自动导航**到 `/account-manager`。
- **流程**：三栏（站点/账号/详情）→ 增删改站点与账号 → 快速登录 / 外部登录代理（`bench-auth://` Deep Link）→ 详情操作（显示/复制密码、切换代理、刷新、probe 策略）。
- **价值达成**：多账号隔离登录态维护。
- **闭环判断**：✅ 自洽。能力门禁（`isolatedWebview` 不支持时禁用登录）、加密持久化、Session 恢复、外部登录代理均有完整链路。自动导航是闭环的加分项（外部登录完成后自动回到账号页）。

#### ④ System Settings（系统设置）

- **入口**：侧边栏底部「系统设置」。
- **流程**：四个 Tab（外观/安全/系统/高级）→ 开关/选择按钮 → `useSettingAction` 应用 → 读取当前值 → 执行受控 adapter → 重新读取比对。
- **价值达成**：受控调整 macOS 系统设置。
- **闭环判断**：✅ 基本自洽。read-after-write 比对、失败显示 unknown/error 不伪装成功。
- **观察点**：Gatekeeper 模式按钮为只读（`system-settings/page.tsx:615-623`），但下方有 `gatekeeperReadonly` 说明文案，属**有意展示的只读状态**而非无说明的死角，可接受；待能力实现后放开即可。

#### ⑤ Command Center（命令中心）

- **入口**：侧边栏。
- **流程**：卡片 CRUD → 运行（copy/shell/提权/open）→ 提权运行与删除走 `DestructiveConfirmDialog` 二次确认 → 运行详情抽屉 → 导入/导出 JSON。
- **价值达成**：把常用命令固化为可复用资产并一键执行。
- **闭环判断**：✅ 自洽。后端持有持久化与执行边界，破坏性动作二次确认并展示原文命令。

#### ⑥ Network Probe（网络急救）

- **入口**：侧边栏。
- **流程**：L1 导航（基础/站点/测试/安全/发现）→ L2 底部栏 → 各面板探测 → 命令日志侧栏 → 报告；安全面板受 `SecurityAuthGate` 门禁。
- **价值达成**：网络诊断急救。
- **闭环判断**：⚠️ **部分自洽**。MVP A+B 已闭环（D-016）；但未实现的 L2 工具渲染 `ComingSoonPanel` 占位（`page.tsx:676-687, 765-826`）——这是**有意的占位**而非功能断点，但用户会看到「即将推出」面板，属于「可见未完成」的体验缺口，需在 UI 上明确标注为规划中能力。

#### ⑦ Clean Space（存储清理）

- **入口**：侧边栏。
- **流程**：四个 Tab（概览/开发项目/自定义目录/记录）→ 概览分类下钻（`CategoryDetail`，ESC 返回）→ 清理带进度。
- **价值达成**：受控清理磁盘空间。
- **闭环判断**：✅ 自洽。路径白名单、逐项结果、真实释放量。

#### ⑧ Dev Toolbox（开发工具箱）

- **入口**：侧边栏。
- **流程**：6 个 Tab（端口管理/环境检测/Token 计算/开发工具/诊断/信息）聚合三个隐藏 feature + 内联工具。
- **价值达成**：开发辅助工具聚合。
- **闭环判断**：✅ 自洽。作为聚合容器，各子工具独立闭环。

#### ⑨ 其余模块

- **Hardware**（硬件对比）：只读参考，14 个对比 Tab，静态数据。✅ 自洽（纯查询）。
- **Terminology**（术语库）：行业列表 → 分类/子分类筛选 → 虚拟化术语卡片 → 增删改查。✅ 自洽。
- **Token Calculator**（Token 计算）：标准/对比/计算器 + 币种切换。✅ 自洽。

### 2.3 全局能力闭环

| 能力            | 闭环判断 | 说明                                         |
| --------------- | -------- | -------------------------------------------- |
| 更新（Updater） | ✅       | 检查/下载/取消/失败状态区分；minisign 校验   |
| 托盘（Tray）    | ✅       | 显示/防睡眠/开机自启/退出，本地化标签        |
| 菜单事件        | ✅       | about / check_updates / preferences / reload |
| 全局右键菜单    | ✅       | 默认「刷新」项                               |
| 启动问题提示    | ✅       | `StartupIssuesAlert`                         |
| 关闭行为弹窗    | ✅       | 事件触发                                     |
| i18n / 主题     | ✅       | 中英切换、浅/深/系统主题                     |
| 深度链接        | ✅       | `bench-auth://` 外部登录                     |

---

## 三、断点与缺口汇总

### 3.1 功能闭环断点（可见不可用 / 未完成）

| #   | 位置                                      | 断点                                                                    | 性质               | 建议                                                                                                                                                                                                             |
| --- | ----------------------------------------- | ----------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `system-settings/page.tsx:615-623`        | Gatekeeper 模式按钮只读（disabled），但下方有 `gatekeeperReadonly` 说明 | 有意只读（有说明） | 待能力实现后放开；当前可接受                                                                                                                                                                                     |
| 2   | `network-probe/page.tsx:676-687, 765-826` | 未实现 L2 工具渲染 `ComingSoonPanel`                                    | 可见未完成         | 标注为「规划中」，避免误认为已可用 ✅ 已修复（2026-08-04）：`ComingSoonPanel` 标题追加 `networkProbe.badge.planning`「规划中」标注                                                                               |
| 3   | `dev-cleaner/feature.tsx`                 | `devCleanerFeature` 导出但**未注册**，`/dev-cleaner` 不可达             | 死代码/死路由      | 确认是否应删除或接入；`sidebar.devCleaner` i18n key 已孤儿 ✅ 已修复（2026-08-04）：删除未注册的 `feature.tsx` / `page.tsx` 入口与孤儿 i18n key；功能本体以子流程保留在 Clean Space（`DevProjectCleanerTool`）中 |
| 4   | `port-manager/feature.tsx:10`             | `path` 为 `"/"`，与根重定向到 quick-launch 冲突，路由被遮蔽             | 死路由             | 改为独立路径（如 `/port-manager`），避免与根路由冲突 ✅ 已修复（2026-08-04）：`path` 改为 `/port-manager`                                                                                                        |

### 3.2 定位层面的观察点（非断点）

- **Dev Toolbox 聚合 6 个子工具**：定位上偏「杂货铺」，导航层级已收敛但内部仍较杂。建议后续按使用频率/相关性进一步分组或精简。
- **产品心智双轨**：同时承载「系统管理」与「开发者工具」两类心智。当前导航已通过「主模块 + 底部系统设置 + Dev Toolbox 聚合」做了分层，方向正确，可继续观察用户是否混淆。

### 3.3 平台/发布层面的已知限制（非闭环断点，但影响价值达成）

- macOS ad-hoc 签名、Windows unsigned：首次安装需手动信任（D-010）。
- Windows Account Manager 网络代理 `unsupported`，失败不回退共享浏览器（fail-closed）。
- 核心模块（Quick Launch / App Manager / Account Manager / System Settings / Clean Space / Updater）在目标平台仍处「待真机验收」状态（ROADMAP R00-R08）。

---

## 四、结论

### 4.1 功能定位

Bench 定位清晰且自洽：**macOS 优先的桌面工作台，核心价值是「应用启动与管理、隔离账号管理、系统设置控制」三条主线 + 一组开发者工具**。目标用户（开发者/运维、多账号运营者、macOS 调优用户）与核心价值匹配，定位边界明确（非 Web、非移动、非 Linux、非攻击工具、非云同步）。

### 4.2 功能闭环

**整体闭环自洽**：从启动入口 → 侧边栏导航 → 各功能模块 → 价值达成，主链路完整，无致命断点。核心模块（Quick Launch / App Manager / Account Manager / Command Center / Clean Space / Terminology / Token Calculator）均形成「入口 → 操作 → 反馈 → 结果」的完整闭环，且写操作普遍有反馈、破坏性操作有二次确认、平台能力有门禁。

**原 4 处局部断点**（见 §3.1）中 3 处已于 2026-08-04 修复（Network Probe「规划中」标注、`dev-cleaner` 死入口清理、`port-manager` 路径冲突），余下 1 处为有意只读（System Settings Gatekeeper，已有 `gatekeeperReadonly` 说明，可接受）。主链路无「可见不可用 / 死路由」残留。

### 4.3 建议优先级

1. ~~**高**：清理 `port-manager` 根路径冲突~~ ✅ 已修复（2026-08-04）。
2. ~~**中**：Network Probe ComingSoon 面板标注「规划中」状态~~ ✅ 已修复（2026-08-04）。
3. ~~**低**：清理 `dev-cleaner` 未注册的死代码与孤儿 i18n key~~ ✅ 已修复（2026-08-04）。
4. **观察**：Dev Toolbox 聚合度与产品双轨心智，后续按用户反馈迭代。
