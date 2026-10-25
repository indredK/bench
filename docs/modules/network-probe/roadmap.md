# Network Probe — 实施路线

> 未完成项（Wave 0/2/3/5 剩余 + Wave 6 远期）已汇总至 [planned/network-probe.md](../../roadmap/planned/network-probe.md)。
> 已完成功能（模块 1.0 / MVP A+B + Post-MVP 主路径）与能力细节见 [product-specs/network-probe.md](../../reference/product-specs/network-probe.md) 与 [design.md](./design.md)。

**当前状态**：模块 1.0 / MVP A+B 已闭环（D-016，2026-07-22）；Post-MVP 测速、多节点 DNS/Ping/HTTP 与 Globalping 可选 token、安全及发现主路径已交付；P0-1 会话竞态已由回归测试复现并修复，macOS 真机确认取消/重跑正常；端口扫描使用可取消 nmap 子进程或可中断 TCP 任务，取消后不再启动第二轮扫描；只有实际检测到 nmap 才将端口扫描标为 supported，nmap 版本探测最多 2 秒，macOS 隔离真机连续两轮取消/重跑及超时降级复验通过；Ping 权限错误现提供本地化原因提示和「隐私与安全性」入口；TCP、DNS、自定义目标失败重试会清除对应旧结果并标明实际探测目标，macOS 隔离真机验证通过；能力包哈希失败现显示双语错误且不会误刷新为成功，开发用验证入口仅开发构建可见，macOS 隔离真机验证通过；Nmap 轻量服务 / OS 指纹、暴露类别标签与单主机扫描约束已实现，双流超限明确失败，高风险确认框显示实际适用的速率与时长；Nmap 端口阶段 / 内置 TCP 按每目标 50ms 间隔调度，指纹阶段由 Nmap 自身时序控制，macOS loopback 真机已验证服务识别及无原始包权限时的 OS 降级提示；Local Network/TCC 拒绝场景与 Windows 真机回归仍按 [planned roadmap](../../roadmap/planned/network-probe.md) 待验；特权 helper 仍待。

**硬性红线**（不实现 · 法律/合规约束，详见 design.md §12.3.2）：主动攻击能力——ARP 欺骗**攻击** / MITM 流量**注入** / **DoS** / 密码**爆破**，违法绝不构建；仅提供对应检测/防御版本（`detectArpSpoofing` / `checkSsl.mitmSuspected` / 暴露面评估）。

**端口扫描确认补充（2026-10-25）**：高风险目标和大范围确认由 Rust IPC 按真实目标与去重端口数复核，未确认时不创建扫描会话；用户选定本期限定单主机，CIDR / 多目标语法由 IPC 拒绝；loopback 指纹真机验收已完成。

**端口计数 UX（2026-10-25）**：确认框现按后端语法展开并去重后显示实际端口数；重复条目不会触发虚假的大范围确认，非法范围不显示估算时长。回归覆盖重复端口计数、非法范围、65 个重复项和 CIDR 提前路由到本地化拒绝。

**指纹验收与 IPv6 风险提示（2026-10-25）**：隔离 macOS QA 对仅监听 `127.0.0.1:48765` 的临时 HTTP 服务完成单端口 Nmap 轻量指纹扫描，识别 HTTP 服务，权限不足时提示没有可靠 OS 匹配；未运行 NSE，服务退出后确认无遗留 Nmap 进程。审查发现 IPv6 ULA / 链路本地目标在前端被误判为公网，改用 `ipaddr.js` 并新增分类回归；隔离 QA 确认 `fd00::1` 走本地错误路径且不显示风险确认，公网 IPv6 会显示确认并可取消，未发包。

**验证命令**：`pnpm run lint:fe` + `pnpm run test:critical` + `cargo clippy -- -D warnings`。
