# Network Probe — 实施路线

> 未完成项（Wave 0/2/3/5 剩余 + Wave 6 远期）已汇总至 [planned/network-probe.md](../../roadmap/planned/network-probe.md)。
> 已完成功能（模块 1.0 / MVP A+B + Post-MVP 主路径）与能力细节见 [product-specs/network-probe.md](../../reference/product-specs/network-probe.md) 与 [design.md](./design.md)。

**当前状态**：模块 1.0 / MVP A+B 已闭环（D-016，2026-07-22）；Post-MVP 测速·多节点·安全·发现主路径已交付；DNSSEC 使用 Hickory/Cloudflare DoT 本机验证，Cloudflare DoH AD 仅作为远端信号且不支持自定义 resolver；agent 注册表已增加跨进程互斥与 1 MiB 有界持久化，HTTPS/WSS 健康检查与可达状态刷新已接通；探测原点的远端候选在实际执行接入前禁用并明确显示本机执行；P0-1 状态一致性扫尾进行中，已修复探测原点、概览、端口扫描和污染检测的本地化/加载反馈，并将 HTTPS 请求失败从高风险降为警告；凭证鉴权、远程执行、指纹增强与特权 helper 仍待。

**硬性红线**（不实现 · 法律/合规约束，详见 design.md §12.3.2）：主动攻击能力——ARP 欺骗**攻击** / MITM 流量**注入** / **DoS** / 密码**爆破**，违法绝不构建；仅提供对应检测/防御版本（`detectArpSpoofing` / `checkSsl.mitmSuspected` / 暴露面评估）。

**验证命令**：`pnpm run lint:fe` + `pnpm run test:critical` + `cargo clippy -- -D warnings`。
