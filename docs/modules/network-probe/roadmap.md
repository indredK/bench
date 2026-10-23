# Network Probe — 实施路线

> 未完成项（Wave 0/2/3/5 剩余 + Wave 6 远期）已汇总至 [planned/network-probe.md](../../roadmap/planned/network-probe.md)。
> 已完成功能（模块 1.0 / MVP A+B + Post-MVP 主路径）与能力细节见 [product-specs/network-probe.md](../../reference/product-specs/network-probe.md) 与 [design.md](./design.md)。

**当前状态**：模块 1.0 / MVP A+B 已闭环（D-016，2026-07-22）；Post-MVP 测速、多节点 DNS/Ping/HTTP 与 Globalping 可选 token、安全及发现主路径已交付；P0-1 会话竞态已由回归测试复现并修复，macOS 真机确认取消/重跑正常；端口扫描使用可取消 nmap 子进程或可中断 TCP 任务，取消后不再启动第二轮扫描；只有实际检测到 nmap 才将端口扫描标为 supported，nmap 版本探测最多 2 秒，macOS 隔离真机连续两轮取消/重跑及超时降级复验通过；Ping 权限错误现提供本地化原因提示和「隐私与安全性」入口；TCP、DNS、自定义目标失败重试会清除旧结果并标明实际探测目标，macOS 隔离真机验证通过；能力包哈希失败现显示双语错误且不会误刷新为成功，开发用验证入口仅开发构建可见，macOS 隔离真机验证通过；Local Network/TCC 拒绝场景与 Windows 真机回归仍按 [planned roadmap](../../roadmap/planned/network-probe.md) 待验；指纹增强与特权 helper 仍待。

**硬性红线**（不实现 · 法律/合规约束，详见 design.md §12.3.2）：主动攻击能力——ARP 欺骗**攻击** / MITM 流量**注入** / **DoS** / 密码**爆破**，违法绝不构建；仅提供对应检测/防御版本（`detectArpSpoofing` / `checkSsl.mitmSuspected` / 暴露面评估）。

**验证命令**：`pnpm run lint:fe` + `pnpm run test:critical` + `cargo clippy -- -D warnings`。
