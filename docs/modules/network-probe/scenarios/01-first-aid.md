# 场景 01 · 急救箱（基础视角 · MVP）

> 父索引：[scenarios.md](../scenarios.md) · 设计：[design-basic.md](../design-basic.md)

---

## S-FA-01 · 家里突然上不了网（急救主路径）

### 背景

普通用户，家庭 Wi‑Fi，浏览器与 IM 均打不开；不确定是路由器、运营商还是本机配置问题。

### 前置

- macOS；Bench 已授权或可提示「本地网络」权限
- `nodeId=local`；未装任何 Adv pack

### 步骤

1. 打开 Network Probe → L1「基础视角」→ L2「概览」
2. 查看本机摘要（接口 / IP / 网关 / DNS / Wi‑Fi）
3. 进入「一键体检」，等待 L0→L3 流式完成
4. 打开「扫描意见」，按建议优先处理
5. 若意见指向专项，进入「上不了网」跑全部子页
6. 需要时点「打开系统网络设置」对照
7. 在「站点延迟」看几个常用站是否全红

### 期望

- 概览数据来自 `getLocalNetworkSummary` / `getDefaultRoute`，失败项诚实 `partial`/`unsupported`
- 体检覆盖 design §5.4.1 **全部 key**（不可探测则 `skip` + 原因）
- 含合成项 `diff.dns_vs_ip`
- Advisor 只给可操作建议；规则 ID 稳定
- 命令日志可见 `startHealthScan` 与各 `commandHint`
- **不**弹出能力包下载（MVP 主包，D-017）

### 映射

| 项   | 值                                                                                           |
| ---- | -------------------------------------------------------------------------------------------- |
| L2   | overview, tree, opinion, offline, sites                                                      |
| IPC  | `getLocalNetworkSummary`, `startHealthScan`, `openSystemNetworkSettings`, `startSitesProbe`… |
| 设计 | design-basic §3–5；design §5.4                                                               |

### 档位

MVP-A/B

---

## S-FA-02 · DNS 坏了但公网 IP 通

### 背景

能 ping 通 `1.1.1.1`，但域名打不开；怀疑 DNS 或 hosts。

### 前置

同 S-FA-01；可人为把系统 DNS 指到无效地址或改 hosts 指 `127.0.0.1`（测试机）。

### 步骤

1. 跑「一键体检」
2. 展开 `reach.gateway` / `reach.public_ip` / `reach.public_name` / `diff.dns_vs_ip` / `dns.*` / `hosts.override`
3. 看「扫描意见」是否指向 DNS/hosts
4. 「一键修复」→ `flushDns`（单次确认）或 `switchDns`（≥两步，展示将写入的 DNS）
5. 可选：打开系统网络设置核对

### 期望

- 对照表结论方向符合 design §5.4.2（网关✓ 公共IP✓ 域名✗ → DNS/hosts）
- `checkHostsOverrides` 列出异常行；**不**自动改 hosts
- `switchDns` 服务名/参数由后端白名单复核；前端伪造「已确认」无效
- 修复后可重跑体检，意见收敛

### 映射

IPC：`startHealthScan`, `checkHostsOverrides`, `flushDns`, `switchDns`
档位：MVP

---

## S-FA-03 · 咖啡店 Captive Portal

### 背景

连上店内 Wi‑Fi 后，只有门户页能开，其它站点超时。

### 步骤

1. 「上不了网」→ 子页「Captive」或「全部」
2. 查看是否检出门户 URL / 拦截
3. 按建议打开门户（系统浏览器）完成登录后重测

### 期望

- `detectCaptivePortal` 多源检测；302 到门户时 `captive=true` + URL
- 与 `reach.captive` 体检 key 语义一致，不双套结论
- 无特权即可完成

### 映射

档位：MVP-B

---

## S-FA-04 · 站点延迟看板 + 自定义站

### 背景

开发者想常看国内/国际常用站与私有 registry 延迟。

### 步骤

1. L2「站点延迟」→ 跑预设区域包（global / cn-friendly / dev）
2. 添加自定义 URL 或 host
3. 观察火花线；停掉进行中的采样

### 期望

- ICMP + HTTP 双通道；ICMP 失败时 HTTP 兜底且标明 degraded
- 流式 `site-sample`；`cancelScan` 幂等
- 自定义目标校验拒绝危险 scheme / shell 元字符

### 映射

IPC：`startSitesProbe`, `probeTarget`（自定义可复用）
档位：MVP-A

---

## S-FA-05 · 导出健康报告

### 背景

用户想把本次体检结果发给同事或留档。

### 步骤

1. 完成至少一次体检
2. L2「报告」→ 导出 JSON 与 Markdown
3. 确认导出前提示可能含公网 IP / SSID / hosts

### 期望

- 报告含检查项 key、状态、Advisor 建议 ID、时间戳
- 不含 Cookie/密码；敏感字段有提示
- 与后端 `advisor_rules` 语义一致

### 映射

档位：MVP-A
