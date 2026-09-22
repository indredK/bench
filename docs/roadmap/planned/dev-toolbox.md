# 开发工具箱（Dev Toolbox）规划功能

> 本文件记录 dev-toolbox 模块**未实现 / 待验证**的功能规划，与 `../product-specs/dev-toolbox.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。

## 待实现

- [ ] **拆分 `devtools/`、`diagnostics/`、`info/` 子模块**：当前三块内联渲染函数都写在 `page.tsx`（约 400 行），需拆为独立目录/文件，避免继续膨胀。
- [ ] **JSON Schema 可选校验**：JSON 格式化工具旁增加 Schema 校验能力。
- [ ] **为 Tab 编排和关键工具补行为测试**：目前仅控制器单测（`__tests__/useDevToolboxController.test.tsx`：Tab 切换、info 懒加载只执行一次、JSON 工具接线），需补页面级 Tab 编排与各工具行为测试。

## 待验证

- [ ] `get_local_ip` / `get_wifi_info` 在 macOS 真机上的输出：CoreWLAN 已真机返回信号 `-60 dBm` 与信道 `157`，未返回 SSID 且没有权限弹窗；SSID 正向结果仍需在系统允许读取的已连接 Wi‑Fi 环境验证。
- [ ] 浏览器运行时进入本页：各工具 IPC 失败 toast 提示的可用性（是否应像 env-detector 一样加运行时门禁，待定）。

## 远期

- [ ] 全局路线图（`docs/roadmap/ROADMAP.md`）未给 dev-toolbox 单独 R 编号段；相关收容/迁移决策记录于模块 README（Clean Space、Network Probe 已迁出）。
- [ ] 工具能力扩充方向（如文件哈希、端口连通性检测 `port_check` 已存在后端命令但未见本页 UI 接入）。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：生成产品说明文档与规划文档（对齐 photo-triage 模板）。
- 2026-10-22：Wi‑Fi 读取迁移到 CoreWLAN，移除 macOS 15.4+ 已不可用的 `airport` 子进程路径，并由 network-probe 与 dev-toolbox 共用 helper；真机确认无权限弹窗，信号与信道可读、SSID 未返回。基础页现会在 SSID 缺失时显示 dBm，QA bundle 真机复验通过；SSID 正向路径待系统允许读取的环境验证。
