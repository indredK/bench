# 场景 03 · 安全探测（安全 Tab · Post-MVP-Adv）

> 父索引：[scenarios.md](../scenarios.md) · 设计：[design-security.md](../design-security.md) · [D-017](../../../explanation/decisions.md)

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

## S-SEC-03 · 扫描自有 NAS 端口（含 Nmap 可选降级）

### 背景

用户只扫自家局域网 NAS（已授权），想看开放端口；本机未安装 Nmap。

### 前置

- 授权声明已确认
- capabilities：`portScan = degraded`；`externalTools.nmap = not_found`

### 步骤

1. 「端口扫描」输入 NAS 的 RFC1918 地址与端口范围
2. 直接以主包 TCP connect 扫描；无需安装能力包，结果明确标注降级模式
3. 如需服务/OS 指纹，用户必须主动勾选并再次确认；Nmap 缺失时仍完成基础扫描并说明指纹不可用
4. 另一台安装 Nmap 的 Mac 优先使用 SYN；若 RAW 权限不足则回退 TCP connect；用户可中途取消

### 期望

- 公网目标、超过 64 个唯一端口或指纹探测需二次确认；前后端拒绝非法端口输入，表达式最多 4096 字节且最多 256 个去重端口；后端拒绝 CIDR/多目标
- 指纹默认关闭；Nmap 服务名/产品/版本/OS 估计均注明来源，风险标签仅对开放端口显示且不代表漏洞
- 结果无 Kill/进程树（边界：port-manager）
- Nmap 超时、输出截断或 XML 解析失败时降级至内置扫描；取消复用同一会话 ID

### 映射

当前端口扫描复用系统 Nmap CLI，不下载或捆绑 Nmap；`adv-scanner` sidecar 尚未接入端口扫描。
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

1. 「DNSSEC / DoH」查询域名 → 得 secure/bogus/insecure/unknown；测 DoH/DoT 可达
2. 「WHOIS」查同一域名（优先 RDAP）

### 期望

- 短命令可 sync；超时与截断
- WHOIS 遵守速率；失败 `partial` + 截断原文
- 不要求可选包（轻量可主包）；若产品拆包须在 capabilities 标明

### 档位

Post-MVP-Adv
