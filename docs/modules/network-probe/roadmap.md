# Network Probe — 实施路线

> 未完成项（Wave 0/2/3/5 剩余 + Wave 6 远期）已汇总至 [planned/network-probe.md](../../roadmap/planned/network-probe.md)。
> 已完成功能（模块 1.0 / MVP A+B + Post-MVP 主路径）与能力细节见 [product-specs/network-probe.md](../../reference/product-specs/network-probe.md) 与 [design.md](./design.md)。

**当前状态**：模块 1.0 / MVP A+B 已闭环（D-016，2026-07-22）；Post-MVP 测速·多节点·安全·发现主路径已交付；Globalping DNS / Ping / HTTP HEAD 与本机比较、NAT 多源映射观察与可选 RFC 5780 行为发现、SNTP 多源偏移阈值已交付；自有 agent 远程执行、指纹增强与特权 helper 仍待。

**硬性红线**（不实现 · 法律/合规约束，详见 design.md §12.3.2）：主动攻击能力——ARP 欺骗**攻击** / MITM 流量**注入** / **DoS** / 密码**爆破**，违法绝不构建；仅提供对应检测/防御版本（`detectArpSpoofing` / `checkSsl.mitmSuspected` / 暴露面评估）。

**验证命令**：`pnpm run lint:fe` + `pnpm run test:critical` + `cargo clippy -- -D warnings`。

- 2026-09-27：普通 HTTP(S) 目标探测只展示状态码、TTFB 与轻量 TLS 摘要；不再为无用的响应体读取等待流结束，避免慢流端点拖住探测并无界缓冲内容。站点测速仍使用 ≤1MiB / 5s 的吞吐上限。
- 2026-09-28：C2-2 完成：Globalping DNS / Ping / HTTP HEAD 并行对比、本机结果合并和 macOS 钥匙串 token 管理；修复后端 HTTP target 与 measurementOptions 请求映射，并按测量类型要求的有效结果数据判定节点成功，避免无有效 A 记录的已完成 DNS 查询误报成功。失败摘要已本地化，原始详情默认折叠。修复前真机连续两次复现无效域名误报；修复后真机确认本机与三个 Globalping 探点均显示失败且技术详情默认折叠，DNS 正向查询四节点均返回有效 A 记录，Ping 四节点均收到 3/3 个包，HTTP HEAD 四节点均返回 200。启用 reqwest 内置 system-proxy 后，本机 HTTP 探测遵循 macOS / Windows 系统代理。完整本地验证通过，远程构建待推送后验证。
