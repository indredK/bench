# Network Probe — 实施路线

> 未完成项（Wave 0/2/3/5 剩余 + Wave 6 远期）已汇总至 [planned/network-probe.md](../../roadmap/planned/network-probe.md)。
> 已完成功能（模块 1.0 / MVP A+B + Post-MVP 主路径）与能力细节见 [product-specs/network-probe.md](../../reference/product-specs/network-probe.md) 与 [design.md](./design.md)。

**当前状态**：模块 1.0 / MVP A+B 已闭环（D-016，2026-07-22）；Post-MVP 测速·多节点·安全·发现主路径已交付；DoH/DoT 现由 Hickory 0.26.3 提供标准 wire-format 查询、本机 DNSSEC 链校验和 TLS 证书验证；普通 STUN 响应由 webrtc-rs `rtc-stun 0.21.0` 校验，RFC 5780 映射/过滤行为客户端逻辑已接入，但公网服务器与 macOS 应用网络真机验收待完成（见[待验证项](../../roadmap/planned/network-probe.md)）。端口服务/OS 指纹的 Nmap 路径已实现，仍需安装 Nmap 后真机验证；特权 helper 仍待。Windows Traceroute 能力状态/权限路径不一致已记录在 [待验证项](../../roadmap/planned/network-probe.md)，按用户要求等 Windows 环境安排后回归。

**硬性红线**（不实现 · 法律/合规约束，详见 design.md §12.3.2）：主动攻击能力——ARP 欺骗**攻击** / MITM 流量**注入** / **DoS** / 密码**爆破**，违法绝不构建；仅提供对应检测/防御版本（`detectArpSpoofing` / `checkSsl.mitmSuspected` / 暴露面评估）。

**验证命令**：`pnpm run lint:fe` + `pnpm run test:critical` + `cargo clippy -- -D warnings`。
