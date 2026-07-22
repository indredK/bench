# Network Probe · 默认资源目录（Defaults Catalog）

> **作用**：场景开箱跑通所需的**内置推荐名单**（DNS、公网探测目标、Captive URL、查出口 IP API、站点包等）。
> **不是**可选能力包（D-017 sidecar）；本目录打进主包，用户可覆盖，重置=恢复内置。
> **父文档**：[design.md](./design.md) · 场景映射：[scenarios.md](./scenarios.md)
> **状态**：设计评审用**定稿草案**（2026-07-22）；实现前可按可用性微调，但 **id 稳定后勿随意改名**。

---

## 1. 原则

| 规则         | 说明                                                                   |
| ------------ | ---------------------------------------------------------------------- |
| 主包内置     | MVP 急救依赖的 defaults **禁止**做成下载墙                             |
| 多源故障转移 | 外网 HTTP API / Captive 至少 2+ 源；单源失败不判死                     |
| 短 TTL 缓存  | 公网 IP / ASN 结果缓存（建议 60–300s），避免打爆                       |
| 密钥不进前端 | 若某源需 API key，只放后端安全配置 / Keychain                          |
| 可覆盖       | 用户增删改写入本地 JSON；与内置 merge（用户优先）                      |
| 区域包       | 首次按 UI 语言或设置「网络区域」注入：`global` / `cn-friendly` / `dev` |
| 合规         | 仅探测；公共源遵守 ToS/速率；默认目标偏 RFC1918 友好与知名 anycast     |

### 1.1 落盘形态（实现建议）

```text
# 内置（只读，随 app 发布）
src-tauri/resources/net_probe/defaults/
  catalog.json              # 版本 + 包清单
  dns_presets.json
  reach_targets.json
  captive_probes.json
  public_ip_apis.json
  site_packs/{global,cn-friendly,dev}.json
  mtu_targets.json
  stun_servers.json         # Post
  ntp_servers.json          # Post
  speed_sources.json        # Post-C

# 用户覆盖（可写）
{config_dir}/bench/network-probe/defaults-override.json
```

后端加载：`builtin ← overlay(user)`；提供 `resetNetworkProbeDefaults()` 恢复。

`catalog.json` 含 `schemaVersion`；升级时迁移用户覆盖，不静默丢自定义站点。

---

## 2. 推荐 DNS（`dns_presets`）

> 用于：`switchDns` 快捷选项、DNS 对照、污染检测默认 resolver 列表。
> **不是**自动改系统 DNS；写入须走修复确认流。

| id         | 地址           | 标签（i18n key 另挂） | 区域倾向    | 备注                        |
| ---------- | -------------- | --------------------- | ----------- | --------------------------- |
| `cf-dot1`  | `1.1.1.1`      | Cloudflare            | global      | 亦作 `reach.public_ip` 目标 |
| `cf-dot0`  | `1.0.0.1`      | Cloudflare 备         | global      |                             |
| `google-8` | `8.8.8.8`      | Google                | global      |                             |
| `google-4` | `8.8.4.4`      | Google 备             | global      |                             |
| `quad9`    | `9.9.9.9`      | Quad9                 | global      | 安全向                      |
| `ali-223`  | `223.5.5.5`    | 阿里 DNS              | cn-friendly |                             |
| `ali-224`  | `223.6.6.6`    | 阿里 DNS 备           | cn-friendly |                             |
| `dnspod`   | `119.29.29.29` | DNSPod                | cn-friendly |                             |
| `baidu`    | `180.76.76.76` | 百度 DNS              | cn-friendly |                             |

**对照默认集（污染 / 手工 DNS 一键对比）**

- global 区域：`system` + `cf-dot1` + `google-8`
- cn-friendly：`system` + `ali-223` + `cf-dot1`

IPv6 可选（若栈可用）：`2606:4700:4700::1111`（CF）、`2001:4860:4860::8888`（Google）——能力不足则 skip。

**场景**：S-FA-02、S-TT-01、S-SEC-02、S-X-03（switchDns）。

---

## 3. 连通性探测目标（`reach_targets`）

> 用于体检 L3 与 DNS vs IP 对照（§5.4.1–5.4.2）。

| id                 | 类型    | 目标                   | 期望用途                       |
| ------------------ | ------- | ---------------------- | ------------------------------ |
| `gw`               | gateway | （运行时解析，非写死） | `reach.gateway`                |
| `pub-ip-v4`        | ipv4    | `1.1.1.1`              | `reach.public_ip`（不经 DNS）  |
| `pub-ip-v4-alt`    | ipv4    | `8.8.8.8`              | 主目标失败时备选 ping          |
| `pub-name`         | name    | `cloudflare.com`       | `reach.public_name`（经 DNS）  |
| `pub-name-alt`     | name    | `www.apple.com`        | 备选；偏 macOS 用户环境        |
| `dns-resolve-name` | name    | `cloudflare.com`       | `dns.resolve_name`（与上可同） |

规则：先 `pub-ip-v4`，失败再 `pub-ip-v4-alt`；域名同理。全部失败才标 fail。

**场景**：S-FA-01、S-FA-02。

---

## 4. Captive Portal 探针（`captive_probes`）

> 多源；**任一**源符合「被劫持/非期望响应」且其它源也异常时可判 captive；需区分「真断网」vs「门户」。

| id        | URL                                                 | 期望                           | 平台渊源            |
| --------- | --------------------------------------------------- | ------------------------------ | ------------------- |
| `apple`   | `http://captive.apple.com/hotspot-detect.html`      | 200 + body/title 含 `Success`  | macOS/iOS 主探针    |
| `gstatic` | `http://connectivitycheck.gstatic.com/generate_204` | **204** 空 body                | Android/Chrome 常用 |
| `msft`    | `http://www.msftconnecttest.com/connecttest.txt`    | 200 + `Microsoft Connect Test` | Windows；作第三源   |

实现注意：

- 禁止盲目跟随无限重定向；记录最终 URL 作 portal 提示
- 超时与「无路由」→ 更可能是断网，不要单独标 captive
- 优先 HTTP 探针（门户常只劫持 HTTP）

**场景**：S-FA-03、S-FA-01（offline 全部）。

---

## 5. 公网出口 IP / ASN（`public_ip_apis`）

> 「公网出口」面板与 `reach.public_egress`；**HTTPS only**；多源故障转移。

| id            | URL（示例）                         | 解析             | 备注                        |
| ------------- | ----------------------------------- | ---------------- | --------------------------- |
| `ipify`       | `https://api.ipify.org?format=json` | `{ "ip" }`       | 简单稳定                    |
| `ifconfig-me` | `https://ifconfig.me/ip`            | plain text       | 备选                        |
| `ipinfo`      | `https://ipinfo.io/json`            | ip + org/city 等 | 注意速率；可选 token 走后端 |
| `seeip`       | `https://ip.seeip.org/jsonip`       | `{ "ip" }`       | 备选                        |

ASN（可选第二跳）：

| id           | 方式                          | 备注        |
| ------------ | ----------------------------- | ----------- |
| `cymru-dns`  | Team Cymru DNS/whois 风格查询 | 无 key 优先 |
| `ipinfo-asn` | 若 ipinfo 响应已含 org        | 复用上表    |

策略：按序尝试至成功；全失败 → `unsupported`/`failed` + 结构化错误；缓存 TTL 默认 **120s**。

**场景**：S-FA-01、S-TT-03、S-DIS-04（对照远端时本机出口也可展示）。

---

## 6. 站点延迟区域包（`site_packs`）

> 对应 design §12.5；首次注入，用户可改。

### 6.1 `global`

| id       | host / URL               | 通道                   |
| -------- | ------------------------ | ---------------------- |
| `cf-ip`  | `1.1.1.1`                | ICMP                   |
| `cf-web` | `https://cloudflare.com` | HTTP                   |
| `google` | `https://www.google.com` | HTTP                   |
| `github` | `https://github.com`     | HTTP                   |
| `openai` | `https://api.openai.com` | HTTP（仅测达，不鉴权） |

### 6.2 `cn-friendly`

| id             | host / URL                           | 通道               |
| -------------- | ------------------------------------ | ------------------ |
| `ali-dns`      | `223.5.5.5`                          | ICMP               |
| `baidu`        | `https://www.baidu.com`              | HTTP               |
| `qq`           | `https://www.qq.com`                 | HTTP               |
| `aliyun-probe` | `https://www.aliyun.com`             | HTTP               |
| `cloudflare`   | `1.1.1.1` / `https://cloudflare.com` | 双通道（对照国际） |

> 微信相关 URL 若不稳定，实现期可不进默认包，留作用户自定义。

### 6.3 `dev`

| id        | host / URL                   | 通道         |
| --------- | ---------------------------- | ------------ |
| `npm`     | `https://registry.npmjs.org` | HTTP         |
| `crates`  | `https://crates.io`          | HTTP         |
| `goproxy` | `https://proxy.golang.org`   | HTTP         |
| `ghcr`    | `https://ghcr.io`            | HTTP（可选） |

默认注入：UI=`zh` → `cn-friendly` + `dev`；UI=`en` → `global` + `dev`。用户可多选包。

**场景**：S-FA-04。

---

## 7. MTU 默认目标（`mtu_targets`）

| id   | 目标      | 说明                          |
| ---- | --------- | ----------------------------- |
| `cf` | `1.1.1.1` | 默认 PMTUD 目标               |
| `gw` | 默认网关  | 局域网 MTU 对照（可选第二测） |

**场景**：S-FA-01、S-TT-03。

---

## 8. Post-MVP 默认（预置，不进 MVP 验收）

### 8.1 STUN（`stun_servers`）· S-DIS-03

| id         | server                     |
| ---------- | -------------------------- |
| `google-a` | `stun.l.google.com:19302`  |
| `google-b` | `stun1.l.google.com:19302` |
| `google-c` | `stun2.l.google.com:19302` |

### 8.2 NTP（`ntp_servers`）· S-DIS-03

| id           | server                          |
| ------------ | ------------------------------- |
| `apple`      | `time.apple.com`                |
| `cloudflare` | `time.cloudflare.com`           |
| `google`     | `time.google.com`               |
| `cn-ali`     | `ntp.aliyun.com`（cn 区域优先） |

阈值建议：`warn > 500ms`，`high > 2000ms`（相对中位源）。

### 8.3 测速源（`speed_sources`）· S-TT-04

- 内置 1–2 个**可公开使用**的 librespeed 实例（实现期核实 ToS 后写入；文档不写死易失效域名）
- 鼓励用户添加自建 URL
- 禁止捆绑 Ookla CLI

### 8.4 Globalping

- Base API 官方文档为准；token 可选，存后端安全存储
- 无单独「站点包」；探点由 API 返回

---

## 9. 与场景 / 开放项对照

| Defaults 节      | 主要场景                   | 原开放项        |
| ---------------- | -------------------------- | --------------- |
| §2 DNS           | S-FA-02, S-TT-01, S-SEC-02 | —               |
| §3 reach         | S-FA-01, S-FA-02           | —               |
| §4 Captive       | S-FA-03                    | design §10.1 #4 |
| §5 公网 IP       | S-FA-01, S-TT-03           | design §10.1 #4 |
| §6 站点包        | S-FA-04                    | design §10.1 #1 |
| §7 MTU           | S-TT-03                    | —               |
| §8 STUN/NTP/测速 | S-DIS-03, S-TT-04          | Post            |

---

## 10. 护栏与运营

| 风险                            | 措施                                                                  |
| ------------------------------- | --------------------------------------------------------------------- |
| 公共 API 变更/宕机              | 多源；失败不伪装成功；版本发布可热更新 override（仍走后端校验，可选） |
| 打爆公共源                      | 全局限速；站点探针并发上限；测速冷却                                  |
| 隐私                            | 公网 IP 进报告前提示；日志脱敏                                        |
| 错误把推荐 DNS 写成「官方唯一」 | UI 标明第三方；切换 DNS 有确认                                        |
| 国内网络差异                    | `cn-friendly` 包；国际源失败标 degraded 而非整网判死                  |

---

## 11. 实现检查表

- [ ] 内置 JSON 随 app 发布；`schemaVersion` 可迁移
- [ ] 用户覆盖与重置
- [ ] Captive / 公网 IP 多源 + TTL
- [ ] DNS 预设进 `switchDns` UI 与污染默认 resolver
- [ ] 站点包按语言/区域首次注入
- [ ] i18n：展示名走 locale；**id / host / URL 不翻译**
- [ ] 契约可选：`getNetworkProbeDefaults()` / `resetNetworkProbeDefaults()`
- [ ] 场景 S-FA-01…04 / S-TT-03 不依赖用户手工填 URL 即可演示

---

## 12. 相关

- [design.md §10.1 / §12.5](./design.md)
- [design-basic.md](./design-basic.md) · [design-test.md](./design-test.md)
- [scenarios.md](./scenarios.md)
- [D-017](../../DECISIONS.md)（本目录 ≠ 能力包）
