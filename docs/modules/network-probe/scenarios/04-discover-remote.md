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

## S-DIS-03 · NAT 映射 + NTP 偏移

### 背景

排查 P2P/通话问题时需要查看公网映射是否随 STUN 目标变化；同时怀疑系统时间不准导致 TLS 异常。

### 步骤

1. 「NAT 映射对比」跑 STUN（多服务器）
2. 「NTP 时间」看 offset；超出阈值告警
3. 确认本模块**不**擅自修改系统时钟

### 期望

- 映射一致 / 变化 / 样本不足有产品文案；UDP 阻断要诚实；不把 Binding 结果说成完整 NAT 类型
- NTP 多源中位数并显示成功源数；与「公网出口」面板职责不混（出口≠NAT）

### 档位

Post-MVP-Adv

---

## S-DIS-04 · 多地对比远程网络测量

### 背景

本机解析正常，但怀疑区域污染，或要从目标所在地区检查连通性；用 Globalping 对比 DNS、ping 或 HTTP。

### 前置

- Post-C；可匿名额度或已配置 token
- `listProbeNodes` 含 local + 若干 `remote-proxy`

### 步骤

1. 选择 DNS、ping 或 HTTP；输入域名/IP，HTTP 输入完整 HTTP(S) URL
2. 勾选 1–3 个区域；每个区域最多使用 1 个探点，显示额度说明
3. DNS 并列比较本机与远端 A 记录；ping 显示 RTT/丢包；HTTP 使用 HEAD 并显示响应码/总耗时
4. 可展开 token 设置保存可选 Globalping token；状态只显示已配置，不回读秘密
5. 额度限制时读取响应头并显示剩余/重置时间及配置 token、减少区域或稍后重试的建议

### 期望

- 同一 `(tool,target)` 的结果按探点并列展示；单探点失败保留其他成功结果
- 远端失败不阻断整表
- 命令日志标注 `globalping <type>`，HTTP 查询串不得进入日志
- API 处理中展示部分结果；超过 50 秒显示超时并保留已有结果
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
3. 健康检查显示 agent 可用后，对同一目标执行 DNS / ping / HTTP，结果按 `nodeId` 与 Globalping 区分
4. 负向：尝试让 agent 执行非白名单/任意 shell → 被拒

### 期望

- 桌面端协议为 HTTPS JSON + HMAC-SHA256；WSS 未实现。Keychain 密钥存储、health check、DNS/ping/HTTP 客户端执行、429 映射、重定向关闭、响应大小限制和 `nodeId` 独立结果已实现
- 端点不得嵌入 userinfo、query 或 fragment；agent token 通过独立密码输入框录入并存入系统钥匙串
- Bench 未附带服务端；接入兼容服务并验证 HMAC 时效 / nonce 重放防护、服务端并发限速、真实 429 与三种测量后，本场景才算端到端完成
- 禁止明文；禁止局域网自动扩散发现 agent
- 客户端拒绝云元数据与 link-local 字面目标；服务端必须防 DNS rebinding，并在 DNS 解析后检查所有地址，避免回环/私网/元数据目标

### 档位

Post-MVP-C
