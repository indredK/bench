# 场景 02 · 主动测试（测试 Tab）

> 父索引：[scenarios.md](../scenarios.md) · 设计：[design-test.md](../design-test.md)

---

## S-TT-01 · 开发者验证 `api.example.com:443`

### 背景

联调时怀疑对方服务挂了或本机解析/代理有问题，需要对**单一目标**做一组手工探测。

### 前置

- MVP 主包；`nodeId=local`
- 目标可替换为真实可达域名（文档示例勿打生产未授权资产）

### 步骤

1. L1「测试」→「DNS」：查 A/AAAA（可选对比 1.1.1.1）
2. 「Ping」：对解析出的 IP 与域名各跑若干包，看 RTT/丢包
3. 「TCP 连通」：`api.example.com:443`，确认 ok/timeout/refused
4. 「自定义目标」：输入 `https://api.example.com/health`，看状态码/TTFB/证书过期摘要
5. 切到「基础视角」再切回「测试」，确认上次结果仍在（导航记忆）

### 期望

- 各工具结果分槽互不覆盖
- TCP 四态清晰；timeout 遵守硬顶
- HTTPS 轻量 TLS 摘要可见；完整 MITM 链分析不在本场景强求（属安全 Tab）
- hover 显示真实 IPC 名与参数

### 映射

| L2     | IPC           |
| ------ | ------------- |
| dns    | `dnsLookup`   |
| ping   | `pingHost`    |
| tcp    | `tcpConnect`  |
| custom | `probeTarget` |

档位：MVP

---

## S-TT-02 · Traceroute / MTR 看路径

### 背景

访问某站慢或间歇失败，想看跳点与丢包。

### 步骤

1. 「Traceroute」输入目标 → 开始
2. 观察 hop 表流式增长；可中途停止
3. 无特权时观察 UI 文案（若当前环境无特权）

### 期望

- 引擎为 `trippy-core`（主包，**不**触发 D-017 下载墙）
- 每 hop 有 ttl/地址/RTT/loss%；可选 ASN 可空
- 无能力时 `degraded`/`unsupported`，**禁止空表假装成功**
- `cancelScan` 后不再追加 hop

### 映射

IPC：`startTraceroute` · event `network-probe://hop`
档位：MVP-B

---

## S-TT-03 · 测试入口测 MTU / 公网出口（双入口）

### 背景

用户已在「上不了网」看过 MTU，又想从测试 Tab 单独复测；或反过来。

### 步骤

1. 「测试」→「MTU」对固定目标探测
2. 「公网出口」查看 IP/ASN
3. 面包屑/提示跳到「基础视角 → 上不了网」对应子页（或反向）
4. 确认两边打开的是**同一面板实现**，不是两套状态机

### 期望

- `probePathMtu` / `getPublicIpInfo` 单实现双入口
- 导航记忆：`offlineSub` 与测试 L2 可分别记住
- 代理/VPN 开启时出口 IP 与预期不符应可对照「上不了网 · 代理/VPN」

### 映射

档位：MVP-B

---

## S-TT-04 · 带宽测速（librespeed）

### 背景

Post-MVP：用户想测下行/上行，不使用 Ookla 专有客户端。

### 前置

- 能力档 Post-C；已配置允许的测速源（公共或自建）

### 步骤

1. 「带宽测速」选择源 → 开始
2. 观察进度 event；可取消
3. 源不可用时看降级提示

### 期望

- 协议为 librespeed；**无** Ookla 二进制
- 并发/间隔硬顶；失败冷却
- Globalping **不能**替代本场景（API 无测速）

### 映射

IPC：`startSpeedTest`, `listSpeedSources`
档位：Post-MVP-C

> 与「测试官网」卡片上的 **有界 HTTP 下载吞吐** 不同：后者估站点体验快慢；本场景测对 LibreSpeed 源的 ISP 上下行带宽。
