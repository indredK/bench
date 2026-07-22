# 场景 03 · 安全探测（安全 Tab · Post-MVP-Adv）

> 父索引：[scenarios.md](../scenarios.md) · 设计：[design-security.md](../design-security.md) · [D-017](../../../DECISIONS.md)

---

## S-SEC-01 · 首次进入安全 Tab：授权声明

### 背景

用户第一次点开「安全」，尚未确认仅测自有/已授权资产。

### 步骤

1. 进入 L1「安全」任一 L2
2. 阅读授权声明并确认
3. 再次进入确认不再打断（设置已持久化）
4. 在设置中撤销授权后，高级扫描再次被拦截

### 期望

- 未确认前不可启动 Adv 扫描（端口/抓包等）
- 声明文案 i18n；不硬编码
- 轻量只读（若有）可按产品决定是否放行；深度扫描必须授权

### 档位

Post-MVP-Adv

---

## S-SEC-02 · 怀疑 DNS / hosts / 证书污染

### 背景

公司网络或公共 DNS 下，某域名解析异常或 HTTPS 证书告警。

### 前置

已完成 S-SEC-01 授权。

### 步骤

1. 「污染检测」输入域名 → 跑多 resolver 对比
2. 查看 hosts 异常、证书 MITM/企业中间盒标注
3. 可选：对照「测试 · DNS」手工结果

### 期望

- `detectDnsPollution` / `checkSsl` / hosts 复用基础 `checkHostsOverrides`
- 合法企业代理标「企业中间盒」，避免恐吓式「黑客」
- ARP 欺骗迹象只读；**无**投毒按钮
- 输出 `PollutionFinding[]` 含 severity / evidence / commandHint

### 档位

Post-MVP-Adv

---

## S-SEC-03 · 扫描自有 NAS 端口（含缺包安装）

### 背景

用户只扫自家局域网 NAS（已授权），想看开放端口；本机无 nmap、未装 `adv-scanner`。

### 前置

- 授权声明已确认
- capabilities：`scanPorts = missing_pack`；`externalTools.nmap = not_found`

### 步骤

1. 「端口扫描」输入 NAS 的 RFC1918 地址与端口范围
2. 出现 `PackInstallDialog`：用途/体积/版本/签名/Gatekeeper 提示
3. 同意安装 → 后端按 manifest 下载校验（**前端不传 URL**）
4. 安装后若仍无特权：以 TCP connect 降级跑通，并标注 `degraded`
5. 有特权后可选 SYN 路径；中途取消

### 期望

- 大范围/公网目标需二次确认 + 速率硬顶
- 安装成功刷新 capabilities；安装≠自动 root
- 结果无 Kill/进程树（边界：port-manager）
- 命令日志含 `// missing_pack` → `installCapabilityPack` → `scanPorts`

### 映射

Pack：`adv-scanner`；可选本机 nmap fallback（另测：装 brew nmap 后应可 `found` 并增强）
档位：Post-MVP-Adv

---

## S-SEC-04 · 包级诊断看 RST / 重传

### 背景

怀疑链路质量差或中途重置连接。

### 前置

- 可能 `pcap-diag` 为 `missing_pack` → 先走安装流（同 S-SEC-03）
- 可能需特权

### 步骤

1. 「包级诊断」开始短时捕获
2. 查看重传/乱序/RST **计数**
3. 确认默认不落盘；若开启落盘则选路径且有体积上限

### 期望

- 默认统计模式；info 日志无完整 payload
- 无包/无特权 → `missing_pack`/`unsupported`，不伪装
- BPF 过滤白名单；禁止无过滤长时间抓全盘

### 档位

Post-MVP-Adv

---

## S-SEC-05 · DNSSEC / DoH 与 WHOIS

### 背景

检查域名 DNSSEC 状态，并查注册信息。

### 步骤

1. 「DNSSEC / DoH」查询域名 → 得 secure/bogus/insecure；测 DoH/DoT 可达
2. 「WHOIS」查同一域名（优先 RDAP）

### 期望

- 短命令可 sync；超时与截断
- WHOIS 遵守速率；失败 `partial` + 截断原文
- 不要求可选包（轻量可主包）；若产品拆包须在 capabilities 标明

### 档位

Post-MVP-Adv
