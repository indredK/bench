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
4. 空结果时切换中英文，确认只显示与 `emptyReason` 对应的本地化原因，不显示后端英文原文
5. 尝试超大 CIDR（如 `/8`）应被拒绝或强确认

### 期望

- 默认私网；速率硬顶；可取消
- 空结果文案按 `emptyReason` 区分权限/客户端隔离/真静网；双语 UI 不直接展示后端 `message`
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

1. 输入目标域名并运行 DNS 对比
2. 并排查看本机、Globalping 世界 / 美国 / 欧洲探点的答案
3. 额度用尽时出现可理解错误（非空成功）
4. 让单个 Globalping API 请求悬挂，确认单请求超时后本机结果仍保留
5. 让 Globalping 快速返回 `in-progress`，确认远端总轮询在 20 秒截止且不会再多睡一个轮询间隔
6. 请求期间点击「取消」，确认本机停止等待并保留已收到的答案
7. 输入保留域名 `bench-qa-no-such-host.invalid`，确认没有 DNS 答案的探点显示无答案状态，不显示成功

### 期望

- 结果按 local 和每个 Globalping 探点分别展示
- 摘要显示探点结果行数（包括失败行）；DNS 答案数量只指各行实际返回的记录，不用它解释行数
- 远端失败不阻断整表
- 本机 DNS 最多等待 5 秒；单个 Globalping API 请求最多等待 8 秒，整个测量最多轮询 20 秒，每次状态请求间隔至少 700 ms
- 任何非 `in-progress` 状态均按终态处理；超时以失败探点显示，不能把未完成测量伪装成成功
- 只有状态为 `finished` 且至少返回一条 DNS 答案的探点才显示成功；已完成但无答案时显示本地化「无 DNS 答案」，测量失败 / 离线状态显示测量失败
- 本机 DNS 请求失败与 5 秒超时分别显示本机错误说明；Globalping 请求失败与 20 秒总超时显示远端错误说明，不得混淆探点归属
- 「取消」停止本机请求与轮询；已提交的 Globalping 测量可能继续运行，界面须说明这一点
- 配额、超时、请求失败和探点无答案使用本地化状态；原始诊断细节默认折叠
- 命令日志标注 `via globalping`
- **不**要求本机 Adv pack（远程零重库）

### 档位

Post-MVP-C

---

## S-DIS-05 · 添加自有 agent 节点

### 背景

团队在机房放了自有 probe agent，想从笔记本确认其安全连接与在线状态。

### 步骤

1. 手动添加 HTTPS/WSS agent endpoint
2. `listProbeNodes` 出现 `remote-agent`
3. 列表显示 agent 的 TLS 健康检查状态
4. 负向：HTTP 明文、URL 凭据、查询参数和片段被拒
5. `rejectAgentAction('shell')` 拒绝任意 shell 动作

### 期望

- HTTPS/WSS；HMAC 或 mTLS；限速 429 映射 `AppError`
- 禁止明文；禁止局域网自动扩散发现 agent
- SSRF：拒云元数据等危险目标

当前注册健康检查契约：HTTPS `GET /v1/health` 返回 2xx；WSS 在 `/v1/health` 完成 TLS WebSocket 升级并响应 Ping/Pong。两种传输都使用系统证书根，HTTPS 不跟随重定向；单端点最多等待 5 秒，列表刷新最多并发 8 个检查。凭证鉴权、429 语义和远程探测执行仍待 C2-3。

当前 UI 明示 agent 仅检查可达性；remote-agent 不参与 DNS / Ping / HTTP 探测，也不宣称相关能力。远程探测执行和凭证鉴权未完成前，不把 agent 显示为可用于远端对比的结果节点。

### 档位

Post-MVP-C
