# 开发工具箱（Dev Toolbox）规划功能

> 本文件记录 dev-toolbox 模块**未实现 / 待验证**的功能规划，与 `../product-specs/dev-toolbox.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。

## 待实现

- 暂无（纯前端、可本地闭环项已全部交付）。

## 待验证

- [ ] `get_local_ip` / `get_wifi_info` 在 macOS 真机上的输出（en0 不存在、未连接 WiFi 时的空值/错误表现）。
- [ ] 浏览器运行时进入本页：各工具 IPC 失败 toast 提示的可用性（是否应像 env-detector 一样加运行时门禁，待定）。

## 远期

- [ ] 全局路线图（`docs/roadmap/ROADMAP.md`）未给 dev-toolbox 单独 R 编号段；相关收容/迁移决策记录于模块 README（Clean Space、Network Probe 已迁出）。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：生成产品说明文档与规划文档（对齐 photo-triage 模板）。
- 2026-09-22：开发工具 Tab 新增正则测试器（原生 RegExp；非法模式内联报错、零长度匹配防死循环、匹配/输入上界）。
- 2026-09-22：网络诊断接入 `port_check` 端口连通性检测（复用既有后端命令，仅补前端 UI）。
- 2026-09-22：控制器测试补齐各工具接线行为（base64/hash/uuid/timestamp/ping/port-check），planned#11 的「各工具行为测试」部分关闭。
- 2026-09-22：把 page.tsx 的三个内联渲染函数拆到 `components/{devtools,diagnostics,info}-panel.tsx`（共享同一 controller 实例，行为不变），planned#9「拆分文件」关闭。
- 2026-09-22：新增 `__tests__/dev-toolbox-panels.test.tsx` 渲染用例，验证拆分后各面板分节标题/控件齐全（含端口检测按钮），planned#11 关闭。
- 2026-09-23：JSON 格式化工具旁新增 **JSON Schema 校验**（`services/json-schema.ts`，零依赖自研 Draft-07 核心子集：type/enum/const/数值/字符串/数组/对象/组合器/if-then-else/布尔 schema/本地 $ref）。本机离线装不了 ajv，故自研并配 13 项单测；可靠性护栏照 design §2——schema/数据解析失败返回结构化错误不抛异常，**不支持的关键字记入 unsupported 并标注「尽力校验」而非静默放过**，递归深度/步数/错误数设上界防钉死。即时纯计算、无 IPC 变更。→ planned「JSON Schema 可选校验」关闭。
- 2026-09-27：正则测试改在可终止 Web Worker 执行，超过 1 秒自动终止并提供中英文状态提示；限制表达式/文本/替换内容的长度并在发送 Worker 前校验，修复短输入即可触发的灾难性回溯阻塞 UI 问题。修正恰好 1,000 条匹配时的误截断，补边界与 Worker 超时/重入保护测试，并在 macOS 真机复测。
