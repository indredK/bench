# 场景 04 · 发现与多节点（发现 Tab · Post-MVP）

> 父索引：[scenarios.md](../scenarios.md) · 设计：[design-discover.md](../design-discover.md)

---

## S-DIS-01 · 看看局域网有谁

### 背景

家庭用户想看当前 Wi‑Fi 下有哪些设备；可能未装 `adv-scanner`。

### 前置

- 授权声明（若与安全 Tab 共用策略则已确认）
- 默认 CIDR = 当前接口前缀（如 `/24`）

### 步骤

1. L1「发现」→「ARP 发现」→ 开始
2. 若 `missing_pack`：安装或接受 ICMP/ping 降级扫
3. 观察主机表（IP/MAC/可选 rDNS）
4. 尝试超大 CIDR（如 `/8`）应被拒绝或强确认

### 期望

- 默认私网；速率硬顶；可取消
- 空结果文案区分：权限/客户端隔离/真静网
- **无** ARP 攻击/投毒入口
- 本地网络权限未开时有设置引导

### 档位

Post-MVP-Adv

---

## S-DIS-02 · 浏览 mDNS / SSDP 服务

### 背景

想找打印机、NAS、智能设备的发现服务。

### 步骤

1. 「局域网服务」开始浏览
2. 查看 mDNS 服务类型/端口/TXT；SSDP 设备名与 LOCATION
3. 确认 UI **不能**一键调用 UPnP 端口映射等写操作

### 期望

- 只读发现；超时与 UUID 去重
- 长列表可虚拟化（Polish 可延后，但接口不卡死）

### 档位

Post-MVP-Adv

---

## S-DIS-03 · NAT 类型 + NTP 偏移

### 背景

排查 P2P/通话问题时需要 NAT 类型；同时怀疑系统时间不准导致 TLS 异常。

### 步骤

1. 「NAT 类型」跑 STUN（多服务器）
2. 「NTP 时间」看 offset；超出阈值告警
3. 确认本模块**不**擅自修改系统时钟

### 期望

- NAT 分类有产品文案；UDP 阻断要诚实
- NTP 多源中位数；与「公网出口」面板职责不混（出口≠NAT）

### 档位

Post-MVP-Adv

---

## S-DIS-04 · 多地对比同一域名 DNS

### 背景

本机解析正常，但怀疑区域污染；用 Globalping 多探点对比。

### 前置

- Post-C；可匿名额度或已配置 token
- `listProbeNodes` 含 local + 若干 `remote-proxy`

### 步骤

1. 「多节点对比」选 tool=DNS、目标域名、勾选本机 + 2 个远端
2. 并排查看答案差异
3. 额度用尽时出现可理解错误（非空成功）

### 期望

- 同一 `(tool,target)` 写入 `store.byNode`
- 远端失败不阻断整表
- 命令日志标注 `via globalping`
- **不**要求本机 Adv pack（远程零重库）

### 档位

Post-MVP-C

---

## S-DIS-05 · 添加自有 agent 节点

### 背景

团队在机房放了自有 probe agent，想从笔记本对比机房视角。

### 步骤

1. 手动添加 agent endpoint + 凭证（进 Keychain/安全存储）
2. `listProbeNodes` 出现 `remote-agent`
3. 用 ping/http 跑同一目标
4. 负向：尝试让 agent 执行非白名单/任意 shell → 被拒

### 期望

- HTTPS/WSS；HMAC 或 mTLS；限速 429 映射 `AppError`
- 禁止明文；禁止局域网自动扩散发现 agent
- SSRF：拒云元数据等危险目标

### 档位

Post-MVP-C
