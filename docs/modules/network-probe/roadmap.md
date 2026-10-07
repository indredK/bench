# Network Probe — 实施路线

> 未完成项（Wave 0/2/3/5 剩余 + Wave 6 远期）已汇总至 [planned/network-probe.md](../../roadmap/planned/network-probe.md)。
> 已完成功能（模块 1.0 / MVP A+B + Post-MVP 主路径）与能力细节见 [product-specs/network-probe.md](../../reference/product-specs/network-probe.md) 与 [design.md](./design.md)。

**当前状态**：模块 1.0 / MVP A+B 已闭环（D-016，2026-07-22）；Post-MVP 测速·多节点·安全·发现主路径已交付；Globalping DNS 多节点、远端 Ping/HTTP 与可选系统凭证库令牌已接通，探测原点只在已实现的 Ping/HTTP 面板启用；DNSSEC 使用 Hickory/Cloudflare DoT 本机验证，Cloudflare DoH AD 仅作为远端信号且不支持自定义 resolver；agent 注册表已增加跨进程互斥与 1 MiB 有界持久化，HTTPS/WSS 健康检查与可达状态刷新已接通；P0-1 状态一致性扫尾进行中，已修复探测原点、概览、端口扫描、污染检测、自定义目标、TCP、Ping 与 Sites/Official 面板的状态反馈/隐私提示。Health 检查项名称和摘要已本地化，原始 detail 与 commandHint 默认折叠；TCP/Ping/Sites/Official 失败状态已本地化、原始诊断默认折叠，相关失败尝试写入时间戳命令日志；官网与区域站点结果流隔离，趋势线按目标归档；TCP 端口严格限制为 1–65535 整数，本地 Ping 次数限制为 1–20、Globalping 为 1–16 整数。本机 Ping 实时结果表与取消已实现；Health/Sites/Official/Traceroute/Speed/Ports/PCAP/ARP 的取消中状态已统一，Traceroute 无特权 UDP 回退也已修正并在 macOS 真机验证；这些面板其他空态/失败态/重入问题仍待审查。自有 agent 凭证鉴权与远程执行、指纹增强和特权 helper 仍待。

**硬性红线**（不实现 · 法律/合规约束，详见 design.md §12.3.2）：主动攻击能力——ARP 欺骗**攻击** / MITM 流量**注入** / **DoS** / 密码**爆破**，违法绝不构建；仅提供对应检测/防御版本（`detectArpSpoofing` / `checkSsl.mitmSuspected` / 暴露面评估）。

**验证命令**：`pnpm run lint:fe` + `pnpm run test:critical` + `cargo clippy -- -D warnings`。
