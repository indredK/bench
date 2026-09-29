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

## S-SEC-03 · 扫描自有 NAS 端口（无 Nmap 降级）

### 背景

用户只扫自家局域网 NAS（已授权），想看开放端口；本机无 Nmap，也没有可用 sidecar。

### 前置

- 授权声明已确认
- capabilities：`portScan = degraded`；`adv-scanner` 未安装；`externalTools.nmap = not_found`

### 步骤

1. 「端口扫描」输入 NAS 的 RFC1918 地址与最多 256 个端口
2. 点击扫描直接走内置 TCP connect；不要求安装外部工具或能力包
3. 结果标注 `tcp-connect` / `degraded`，列出状态、耗时和已知常见端口提示
4. 可在独立「识别服务」动作中查看 S-SEC-03b 指纹流程；它需要本机 Nmap

### 期望

- 非内网目标或超过 64 个端口需二次确认；后端端口上限为 256
- Nmap 缺失时 `portScan=degraded`；当前未接入端口扫描执行路径的 sidecar 不得被算作 supported，也不等于已提权
- 结果无 Kill/进程树（边界：port-manager）
- 无 Nmap 时命令提示标明 `degraded: tcp connect`；不会隐式安装或提权

### 映射

档位：Post-MVP-Adv

---

## S-SEC-03b · 服务 / OS 指纹（可选分支）

1. `externalTools.nmap=found` 时，端口面板启用独立的「识别服务」；未检测到 Nmap 时禁用并给出本机安装提示，普通 TCP 扫描仍可使用。
2. 输入单个 NAS 主机和 1–64 个 TCP 端口；点击后确认对话框准确显示主机、端口和 OS 估计选择。
3. 默认不勾选 OS 估计。确认后低强度识别服务版本，不运行 NSE/漏洞脚本；用户选择 OS 估计时额外执行 `-O`。
4. 查看服务名、产品/版本、探测置信度和有限风险类别。OS 匹配明确标为估计；权限不足不会提权，也不会丢弃已完成的服务结果。
5. 扫描可取消；最多处理 64 个端口。CIDR、Nmap 地址范围、主机列表由后端拒绝。

### 期望

- 未安装 Nmap 时 capability 为 `fingerprint=unsupported`、`externalTools.nmap=not_found`，不把外部工具误报成缺失能力包。
- 每次指纹探测都经过明确确认；服务探测低强度、OS 估计可选且不自动提权。
- 风险标签只表示服务类别，不宣称存在漏洞；Nmap 非零退出、超时与取消按本地化状态呈现。
- 服务和 OS 结果字段清理并限长，最多展示 3 个 OS 候选。

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
