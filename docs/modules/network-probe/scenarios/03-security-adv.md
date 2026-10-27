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

## S-SEC-03 · 扫描自有 NAS 端口（基础 TCP 降级 / 可选 Nmap）

### 背景

用户只扫自家局域网 NAS（已授权），想看开放端口；本机无 nmap、未装 `adv-scanner`。

### 前置

- 授权声明已确认
- 本机无 nmap 时 `portScan = degraded`，基础 TCP connect 始终可用
- 只有检测到本机 nmap 时 `portScan = supported`；已登记能力包但未接入执行器不能提升为 `supported`

### 步骤

1. 「端口扫描」输入 NAS 的 RFC1918 地址与端口范围
2. 超过 64 个端口时先确认范围；用户授权后开始扫描
3. 无 nmap 时直接以 TCP connect 扫描并显示 `degraded` 提示
4. 检测到本机 nmap 时尝试 `-sS`，不具备权限则回退到 nmap `-sT`，不可用或异常再回退内置 TCP connect
5. 任一执行路径都可取消；取消后清空开放端口统计并显示本地化终态

### 期望

- 大范围/公网目标需二次确认；后端端口数量、并发和超时有硬上限
- 本机 nmap 是可选 fallback；Bench 不捆绑或下载它
- `adv-scanner` 当前只有未发布制品的 marker，不改变扫描能力；正式 sidecar 接入前不能给扫描状态升档
- 结果无 Kill/进程树（边界：port-manager）
- 命令日志只记录脱敏目标与扫描终态，不得把 `serviceHint` 当作版本指纹

### 映射

依赖：本机 nmap 可选；`adv-scanner` sidecar 待发布和接入后另行验收
档位：Post-MVP-Adv

---

## S-SEC-04 · 包级诊断看 RST / 重传

### 背景

怀疑链路质量差或中途重置连接。

### 前置

- 当前能力标记为 `degraded`：只尝试本机 `tcpdump` 的计数模式，不会声称运行完整 libpcap sidecar
- 本机没有 `tcpdump` 或权限不足时，显示可操作的失败状态；不会先要求安装只有 marker 的 pack

### 步骤

1. 「包级诊断」开始短时捕获
2. 查看重传/乱序/RST **计数**
3. 采样过程中点击「取消」，确认 tcpdump 子进程被终止并迅速返回已取消状态
4. 确认默认不落盘；若开启落盘则选路径且有体积上限

### 期望

- 默认统计模式；info 日志无完整 payload
- 默认 5 秒或 200 包采样上限先到即结束；窗口内没有包时成功显示 0 包，不将静默网络报成超时失败
- 取消会终止当前 tcpdump 进程，不需等待采样时长或超时；界面显示本地化取消状态
- `tcpdump` 缺失 / 无权限 → 明确失败，不伪装为成功；`pcap-diag` 只有在 sidecar 实际接入执行器后才允许把能力升为 `supported`
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
