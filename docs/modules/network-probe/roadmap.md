# Network Probe — 实施路线

> 未完成项（Wave 0/2/3/5 剩余 + Wave 6 远期）已汇总至 [planned/network-probe.md](../../roadmap/planned/network-probe.md)。
> 已完成功能（模块 1.0 / MVP A+B + Post-MVP 主路径）与能力细节见 [product-specs/network-probe.md](../../reference/product-specs/network-probe.md) 与 [design.md](./design.md)。

**当前状态**：模块 1.0 / MVP A+B 已闭环（D-016，2026-07-22）；Post-MVP 测速·多节点·安全·发现主路径已交付；Globalping DNS/ping/HTTP + 可选钥匙串 token 已完成 C2-2；C2-3 桌面客户端与本机 QA 已实现，兼容服务端及端到端安全验证仍待；Nmap 服务/OS 指纹已完成 macOS 真机验收；特权 helper 仍待。Windows traceroute 能力矩阵回归按用户安排延期至本轮总目标完成后。

**硬性红线**（不实现 · 法律/合规约束，详见 design.md §12.3.2）：主动攻击能力——ARP 欺骗**攻击** / MITM 流量**注入** / **DoS** / 密码**爆破**，违法绝不构建；仅提供对应检测/防御版本（`detectArpSpoofing` / `checkSsl.mitmSuspected` / 暴露面评估）。

**验证命令**：`pnpm run lint:fe` + `pnpm run test:critical` + `cargo clippy -- -D warnings`。
