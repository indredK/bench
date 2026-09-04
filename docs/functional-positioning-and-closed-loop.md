# Bench 功能定位与闭环

> 产品**定位**（长期有效）与**闭环结论**（静态梳理）见本文档；各模块功能细节以 `docs/product-specs/<模块>.md` 为准，规划见 `docs/planned/<模块>.md`。
> 状态：定位快照（2026-08-04），闭环结论已与代码核对。

## 一、功能定位

### 1.1 一句话定位

**Bench 是 macOS 优先的桌面工作台（desktop workbench），把「应用启动与管理、隔离账号管理、系统设置控制」三个高频系统操作场景收敛到一个本地、离线、可信任的桌面应用里。**

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

面向同时需要「系统操作效率」与「多账号隔离」的桌面重度用户：

1. **开发者 / 运维**：快速启动应用、管理开发工具、执行命令、诊断网络、清理磁盘、查硬件与术语。
2. **多账号运营者**：同一站点维护多个隔离登录态，Cookie/Session/存储互不串号。
3. **macOS 系统调优用户**：受控界面调整 Dock、Finder、截图、键盘、网络、默认浏览器等。

### 1.4 核心价值主张

三条主线 + 一组工具：

| 主线       | 核心价值                                                   | 对应模块                                                                       |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 启动与管理 | 快速启动 + 管理已装应用，共享同一份清单避免漂移            | Quick Launch、App Manager                                                      |
| 账号隔离   | 多隔离登录态、加密持久化、Session 恢复、外部登录代理       | Account Manager                                                                |
| 系统控制   | 受控、可回滚地调整 macOS 系统设置                          | System Settings                                                                |
| 工具集     | 命令卡片、网络急救、磁盘清理、硬件对比、术语库、开发工具箱 | Command Center、Network Probe、Clean Space、Hardware、Terminology、Dev Toolbox |

### 1.5 定位边界（产品不是什么）

- 不是系统设置应用的复制品（只做受控子集）。

- 不是 Web / 移动应用（依赖 Tauri 能力）。

- 不是云同步 / AI Agent / 播放器 / 白噪音（不进入 2.0，见 ROADMAP 发布契约）。

- 不是 Linux 工具（D-014）。

- 不是攻击工具（Network Probe 硬红线：仅检测/防御）。

### 1.6 定位一致性小结

- **一致**：三条主线与「桌面工作台」定位自洽，工具集服务于同一批重度用户。

- **张力点**：同时承载「系统管理」与「开发者工具」两类心智；Dev Toolbox 聚合 6 个子工具偏「杂货铺」。属可观察点，非断点。

## 二、功能闭环（摘要）

**整体自洽**：启动 → 侧边栏导航 → 各功能模块 → 价值达成，主链路完整、无致命断点。各模块闭环细节（入口/流程/状态/断点）见 `docs/product-specs/` 对应文件。

**已解决断点**（2026-08-04）：Network Probe ComingSoon「规划中」标注、`dev-cleaner` 死入口清理、`port-manager` 根路径冲突——均已修复；System Settings Gatekeeper 只读为有意设计（有 `gatekeeperReadonly` 说明）。

**观察点**：Dev Toolbox 聚合度与产品双轨心智，按用户反馈迭代。

## 三、结论

- **定位**：macOS 优先桌面工作台，三条主线 + 工具集，边界明确、自洽。

- **闭环**：主链路完整，无「可见不可用 / 死路由」残留。

- **建议**：历史 3 处断点已全部修复；仅剩「观察」项（Dev Toolbox 聚合度）。
