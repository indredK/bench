# 场景 05 · 横切护栏（UX / 特权 / 红线）

> 父索引：[scenarios.md](../scenarios.md) · 设计：[design.md](../design.md) §3 / §9 / §13 / §14 · D-017

---

## S-X-01 · L1/L2 导航记忆与结果保留

### 背景

用户在「基础 · 体检」与「测试 · Ping」间来回对比。

### 步骤

1. 基础视角选 L2「一键体检」并跑完
2. 切到测试 → Ping 并跑完
3. 回到基础视角 → 应仍停在「一键体检」，结果仍在
4. 进入「上不了网 · MTU」后切走再回来 → `offlineSub` 仍为 MTU
5. 离开整个 feature 再进入 → 恢复上次 `l1Id`（若采用 session 记忆）

### 期望

- 符合 design §3.1 导航记忆表
- 切换导航**不**清空各面板最近结果（除非用户清除或新跑覆盖）
- L2 从树中移除后回退到该 L1 第一个合法项

### 档位

MVP

---

## S-X-02 · 命令透明（hover + 日志）

### 背景

开发者想确认按钮实际调用的 IPC。

### 步骤

1. hover「开始体检」/「Ping」等按钮 → 看 Tooltip
2. 执行后打开命令日志 → 见 command/event 序列
3. 展开某个体检项 → 见 `commandHint`；合成项标明非独立 IPC

### 期望

- 显示契约名（不翻译标识符）；参数脱敏
- 降级路径写明 `// degraded: …`
- 无 token/密钥进日志

### 档位

MVP（design §3.5）

---

## S-X-03 · 高危重置网络栈三次确认

### 背景

用户尝试「一键修复 → 重置网络栈」。

### 步骤

1. 打开修复面板 → 选择 `resetNetworkStack`
2. 走完三步：影响说明 → 参数/后果 → 勾选或确认词
3. 在第 2 步取消；再次进入须从头
4. 完成执行后后端复核；重复执行幂等

对照：

- `flushDns`：单次确认即可
- `switchDns` / `renewDhcp`：≥两步

### 期望

- 三步状态机，而非三个无关联 Alert
- 前端「confirmed=true」不能绕过后端校验
- 成功/失败均有结构化反馈

### 档位

MVP

---

## S-X-04 · 无特权 / 本地网络权限降级

### 背景

标准用户、未授「本地网络」、无 admin。

### 步骤

1. `getNetworkProbeCapabilities()` 记录 privilege 与各 tool 状态
2. Ping 局域网主机、Traceroute、（若有）SYN/ARP
3. 观察 UI 灰显与文案；引导系统设置隐私项

### 期望

- 矩阵驱动，禁止硬编码全绿
- traceroute 无特权不假装成功
- Ping 失败时提示本地网络权限可能性（不误报为「网络已断」唯一结论）
- HTTP/TCP/DNS 等免特权路径仍可用

### 档位

MVP（Post 能力同理标 `U`/`D`/`missing_pack`）

---

## S-X-05 · 可选能力包安装与卸载（D-017）

### 背景

用户安装后又想卸载 `pcap-diag`，保持主包轻量。

### 步骤

1. 触发缺包功能 → 安装向导
2. 校验失败（故意坏 hash 的测试通道或 mock）→ 安装失败且不执行二进制
3. 安装成功 → 功能可用
4. 「管理组件」卸载 → capabilities 回到 `missing_pack`
5. 确认 MVP 工具（体检/Ping）**从不**走安装墙

### 期望

- `installCapabilityPack(packId)` 无 URL 参数
- Gatekeeper/ad-hoc 提示符合 D-010
- 与 app-manager 更新安全同级：canonical manifest

### 档位

Post-MVP-Adv

---

## S-X-06 · 硬红线负向：不出现攻击能力

### 背景

安全评审 / 合规检查。

### 步骤

1. 遍历安全/发现全部 L2 与菜单
2. 搜索设置、命令面板、隐藏路由
3. 代码/契约审计：无攻击类 command 名

### 期望（必须不存在）

- ARP 投毒 / 欺骗攻击
- MITM 注入 / SSL strip
- DoS / 洪水
- 密码爆破

允许存在：检测版（`detectArpSpoofing`、`checkSsl` 等）。

### 档位

全程（design §12.3.2）

---

## S-X-07 · 与 port-manager / diagnostics 边界

### 背景

同一主机既要看「本机谁占用了 8080」，又要看「局域网 NAS 的 22 是否开」。

### 步骤

1. 在 **port-manager**：扫本机端口，见 PID，可 Kill（二次确认）
2. 在 **network-probe**：对 NAS `:22` 做 TCP/端口存活；确认无 Kill
3. 从旧 diagnostics / system-settings ping 入口进入：应跳转或薄封装到 `net_probe`，非第二套算法

### 期望

- 占用/Kill ≠ 外部存活探测
- 禁止长期双份 ping 实现（design §13）

### 档位

MVP（边界在实现期强制）
