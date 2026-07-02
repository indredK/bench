# 云端同步功能设计文档

> 版本: v1.4 | 日期: 2026-07-02 | 状态: **低优先级 / 可选 backlog**（架构与 Worker 参考实现可写；**默认 build 不内置公共 endpoint**）  
> 关联代码：`export_relay_data` / `import_relay_data` · `src-tauri/src/account_manager/crypto.rs`

## 1. 一句话定义

**端到端加密的账号数据云同步——多设备间安全迁移站点/账号元数据与加密密码，服务端零知识；Session 登录态同步为后续阶段。**

**托管定案（MVP）**：Cloudflare Workers + R2 作为**参考实现**；API 基址由**用户自行部署后填入应用设置**（BYO），**不在开源仓库中写死维护者 URL**（**不买域名、不备案**仍适用于自托管场景）。

### 1.1 开源仓库与托管边界（必读）

Bench 是**开源项目**。按本文档部署 Worker 后，**任何 fork 用户都可以**在自己的 Cloudflare 账号上运行同一套 `workers/bench-sync/`。这与「维护者为所有下载者提供公共云同步服务」是两件不同的事。

#### 谁能用这份文档？

| 角色 | 能做什么 |
|------|----------|
| 普通用户 | 在 Account Manager **设置里填写自己的 API 基址**（或留空 → 仅用本地 Import/Export） |
| 开发者 / fork 维护者 | 按 §7.6 自 deploy Worker + R2，把 `https://bench-sync.<subdomain>.workers.dev/v1` 配进自己的客户端 |
| 上游维护者 | 可提供 Worker **模板与部署文档**；**不应**在默认 release 里硬编码指向维护者 R2 的常量 |

#### 为何不在 OSS 默认内置公共 endpoint？

| 顾虑 | 说明 |
|------|------|
| **成本与滥用** | 所有未改配置的用户若指向同一 Worker，请求与 R2 存储由维护者买单；Sync ID 可被扫描、匿名 CRUD 触发限流或配额耗尽（DoS / 资源滥用） |
| **元数据隐私** | Payload 端到端加密，但**运营商仍可见** Sync ID、blob 大小、时间戳、源 IP、Workers 访问日志；用户可能误以为「零知识 = 运营商什么都看不到」 |
| **信任集中** | 默认 URL 写进代码 = implicit 信任维护者基础设施；与开源「用户自控数据面」不一致 |
| **Fork 误用** | Fork 若保留上游常量，密文会存进**原作者** R2；Sync ID 与用量 metadata 暴露给非预期第三方 |
| **攻击面** | 公共 endpoint 可被针对性探测（404/403 时序、429 限流行为）；keyProof 有 rate limit 但**非零成本** |

#### 写常量进仓库的具体风险

若在 `src-tauri/.../cloud_sync.rs` 或前端提交：

```rust
const CLOUD_SYNC_API_BASE: &str = "https://bench-sync.<maintainer-subdomain>.workers.dev/v1";
```

则：**每次上游 release 都会把全部用户的云同步流量默认导向该实例**——即便 payload 加密，仍构成托管责任、账单与合规边界。此类常量**不应进入开源默认分支**。

#### 推荐模型（v1.4 定案）

| 模式 | OSS 默认 | 说明 |
|------|----------|------|
| **BYO 自托管** | ✅ | 仓库提供 `workers/bench-sync/` + 部署文档；endpoint 存**用户本地设置**（或开发环境变量） |
| **维护者公共服** | ❌ | 若未来提供，须**单独 opt-in**（显式开关 + 独立说明），且不替代 BYO |
| **本地 Import/Export** | ✅ 已有 | 无第三方、无网络依赖；**已满足迁移**——云同步为可选增强 |

**优先级结论**：在 BYO 设置 UI + endpoint 校验未就绪前，**不将 Phase 1 作为近期必做项**（见 [roadmap.md](./roadmap.md) v1.19）。

### 开工前 30 秒检查

| 状态 | 项 |
|------|-----|
| ✅ 已定 | Worker 架构、API 形状、加密、keyProof、Sync ID 格式、限流、仅 `long` 保留、大陆 fallback、**BYO 非公共 endpoint** |
| ⏳ Phase 1 前置 | 用户可配置 `cloud_sync_endpoint`（§7.3）；空值则隐藏/禁用云同步 UI |
| ⏸ 低优先级 | 完整客户端 + UI 可在 Session/列表优化之后排期 |
| ⏸ Phase 2 | Session 同步、ephemeral TTL、自定义域名、国内节点 |

---

## 2. 问题陈述

### 2.1 当前痛点

| 优先级 | 问题 | 现象 | MVP 能否缓解 |
|--------|------|------|--------------|
| P0 | 多设备不同步 | A 电脑录入的站点/账号，B 电脑需重做 | ✅ 可缓解（元数据 + 密码） |
| P1 | 数据备份缺失 | 重装/丢机后数据全丢 | ⚠️ 需配合「长期保留」策略 + 本地导出 |
| P2 | 迁移成本高 | 手动导出再导入繁琐 | ✅ 可缓解 |

> **产品预期管理**：Account Manager 的差异化是 **Session 恢复**。当前本地 `import_relay_data` **不包含 Session / AuthProfile**（见 §6.3）。MVP 云同步解决的是「账号库迁移」，不是「换机免登录」。

### 2.2 核心安全挑战

1. 服务端不能接触明文
2. 拖库后攻击者离线暴力破解主密码（**真正/crypto 边界**）
3. 知道 Sync ID 的攻击者不能覆盖或删除他人备份
4. Sync ID 被枚举时不能批量探测有效备份

---

## 3. 核心设计原则

### 3.1 零知识架构 (Zero-Knowledge)

- 加密/解密**仅在客户端**（Rust）完成
- 主密码与派生密钥**不上传**
- 服务端只存密文 + KDF 参数 + 元数据（版本、时间戳）

**零知识的边界（必须在文档与 UI 中写清）：**

| 服务端能知道 | 服务端不能知道 |
|--------------|----------------|
| Sync ID、密文大小、上传/拉取时间、IP | 主密码、明文 JSON、密码明文 |
| 客户端提交的 **key proof** 是否匹配（见 §5.4） | Pull 时密码是否正确（Pull 只返回密文） |

因此：**Pull 路径上不存在「服务端根据解密失败计次」**；防离线破解靠 Argon2id + 强主密码，不靠服务端锁定。

### 3.2 多层防御 (Defense in Depth)

| 层级 | 措施 | 防什么 | MVP |
|------|------|--------|-----|
| L1 | AES-256-GCM 加密 payload | 拖库后读明文 | ✅ |
| L2 | Argon2id 派生密钥 | 离线暴力破解主密码 | ✅ |
| L3 | Sync ID 高熵（≥128 bit） | 枚举有效备份 | ✅ |
| L4 | Upload/Delete **key proof** | 仅知 Sync ID 的覆盖/删库 | ✅ |
| L5 | 服务端速率限制（IP / Sync ID） | 在线拖密文、DoS、扫号 | ✅ |
| L6 | 设备绑定 | 新设备拉取需授权 | Phase 2 |
| L7 | 验证码 / 邮箱解锁 | 自动化脚本、账户恢复 | Phase 2 |

---

## 4. 核心概念

### 4.1 双因素模型

```
同步码 (Sync ID) —— 定位云端 blob 的能力标识（Capability URL 级别）
  ├── 生成: 客户端 `generate_sync_id()` — 16 字节 CSPRNG → Crockford Base32（无 I/L/O/U）→ 分组 XXXX-XXXX-XXXX-XXXX（128 bit）
  ├── 校验: Worker 正则 ^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$
  ├── 作用: 定位密文记录，不参与 KDF
  └── 安全: 不应公开张贴；泄露 = 他人可 Pull 密文尝试离线破解

主密码 (Master Password) —— 解密密钥来源
  ├── 用户自定义；MVP 最低 **12 字符**（UI 校验，可更长）
  ├── 作用: Argon2id → 256-bit derived key
  └── 安全: 绝不上传；遗忘 = 数据不可恢复（零知识代价）
```

### 4.2 为什么不用纯 PIN？

6 位 PIN ≈ 10⁶ 组合，离线破解成本过低。若未来支持 PIN，必须：

- 仅作本地 UX 快捷方式，底层仍用强主密码；或
- 单独「低价值、短 TTL」同步类型 + 极强在线限流（不推荐作默认）

---

## 5. 加密方案设计

### 5.1 算法选型

| 组件 | 算法 | 参数 | 说明 |
|------|------|------|------|
| 对称加密 | AES-256-GCM | 256-bit key | 机密性 + 完整性 |
| 密钥派生 | Argon2id | m=64MB, t=3, p=4（可调） | 抗 GPU；低端机可降 m，写入 kdfParams |
| 盐值 | 随机 | 16 bytes | 每份 blob 独立 |
| IV | 随机 | 12 bytes | 每次加密新生成 |

### 5.2 密钥派生与 payload 加密

```
主密码 + salt ──Argon2id──► derived_key (32 bytes)
derived_key ──AES-GCM──► 加密 RelayDataExportFile JSON
```

### 5.3 与现有本地加密的关系（勿写「双重加密更安全」）

本地密码已用 **OS keyring master key** 存为 `EncryptedBlob`（`crypto.rs`）。云同步链路：

```
┌─────────────────────────────────────────────────────────────────┐
│ 上传                                                             │
│  snapshot ──build_export_file(EncryptedFull)──► export JSON      │
│  export JSON ──cloud_encrypt(主密码)──► ciphertext ──► 云端     │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ 拉取                                                             │
│  云端 ciphertext ──cloud_decrypt(主密码)──► export JSON         │
│  export JSON ──import_relay_data──► 新机器 keyring 重加密 secrets │
└─────────────────────────────────────────────────────────────────┘
```

外层加密的意义：**传输与云端存储期**密文不可读；安全性仍取决于主密码强度。

### 5.4 Key Proof（Upload 覆盖 / Delete 必带）

服务端**没有** derived_key，只做 **常量时间字符串比较**：首包 POST 时客户端上传 `keyProof`，Worker 写入 R2；后续 PUT/DELETE 请求体携带 `keyProof`，与已存值比对。

```
key_proof = Base64( HMAC-SHA256(key = derived_key, message = UTF-8(sync_id + "|upload")) )
```

| 操作 | 规则 |
|------|------|
| **POST 创建** | 客户端生成 Sync ID + 密文 + `keyProof`；Sync ID 已存在 → **409** |
| **PUT 覆盖** | body 含完整 §6.1 + `keyProof`；与 R2 内 `keyProof` 不一致 → **403** |
| **DELETE** | body `{ "keyProof" }`；与 R2 内 **同一** `keyProof` 比对 → **403** / 成功删 object |

> 变更类操作（PUT/DELETE）均用 `op=upload` 的 HMAC；Worker 只存一份 `keyProof`。

### 5.5 Rust 实现落点

| 模块 | 职责 |
|------|------|
| `crypto.rs` | `cloud_encrypt` / `cloud_decrypt` / `derive_cloud_key` / `compute_key_proof`（新增依赖 **`argon2` crate**） |
| `cloud_sync.rs`（新建） | Tauri commands：HTTP（**`reqwest`**，项目已有）+ 复用 export/import |
| `commands.rs` | 复用 `build_export_file`；新增 **`import_relay_data_from_json(&str)`**（与文件 import 同逻辑，供拉取解密后调用） |

**AES-GCM 线上格式（定案）**：ciphertext 与 tag **分开字段**（与 §6.1 一致）；Rust 使用现有 `aes-gcm` crate，tag 16 bytes Base64。

---

## 6. 数据结构设计

### 6.1 云端存储结构 (服务端)

```json
{
  "syncId": "X7K2-P9M4-R8T1-W3N6",
  "salt": "base64(16 bytes)",
  "iv": "base64(12 bytes)",
  "ciphertext": "base64(ciphertext only)",
  "tag": "base64(16 bytes gcm tag)",
  "keyProof": "base64(32 bytes hmac)",
  "kdfParams": {
    "algorithm": "argon2id",
    "memoryKb": 65536,
    "iterations": 3,
    "parallelism": 4
  },
  "payloadVersion": 1,
  "retentionPolicy": "long",
  "createdAt": "2026-07-02T00:00:00Z",
  "updatedAt": "2026-07-02T00:00:00Z",
  "lastPullAt": null
}
```

`retentionPolicy` MVP **仅实现 `long`**；`ephemeral` + `expiresAt` 留 Phase 2（见 §10.3）。

**不在服务端存储**：`failedAttempts`（Pull 无法感知密码对错）、主密码、明文。

在线滥用防护见 §8（IP/Sync ID 限流，非密码错误计数）。

### 6.2 明文 payload（客户端解密后）

**复用** `RelayDataExportFile`（`RelayExportMode::EncryptedFull`），不另起 schema：

- `version`, `exportedAt`, `mode`, `stations[]`（含 `RelayAccountExport`）

### 6.3 MVP 同步范围（与代码对齐）

| 数据 | Phase 1 MVP | 说明 |
|------|:-----------:|------|
| 站点 remark / website / login_detection / session_ttl | ✅ | 随 export |
| 账号 username / notes / 扩展字段 | ✅ | 随 export |
| 加密密码 (`encrypted_password`) | ✅ | `EncryptedFull` |
| 账号 status / lastLogin / lastRefreshed | ✅ | 随 export |
| **AuthProfile** | ❌ | 当前 import 置 `None`；Phase 2 扩展 import |
| **Session（cookies / storage）** | ❌ | 体积大、站点相关；Phase 2+ 单独设计 |
| **proxyEnabled / externalApps** | ❌ | import 时重置；Phase 2 |
| 本机 keyring master key | ❌ | 永不离开设备 |

Phase 2 起在 `RelayDataExportFile` 增 `version` 字段与可选 session 块，并更新 import 路径。

---

## 7. 基础设施与部署（Phase 0 已定案）

### 7.1 决策摘要

| 项 | MVP 定案 | 说明 |
|----|----------|------|
| **托管** | Cloudflare Workers + R2 | Serverless，个人可维护 |
| **API 域名** | `https://bench-sync.<subdomain>.workers.dev` | Cloudflare 免费子域，**无需购域名、无需 ICP 备案** |
| **月费** | **$0**（免费档） | 超量后再考虑 Workers Paid $5/月 |
| **目标用户** | 海外 / 能稳定访问 Cloudflare 的网络 | 产品主战场 |
| **中国大陆** | **不保证**；提供本地导入/导出 fallback | 见 §7.4 |
| **身份** | 纯 Sync ID + key proof | 无账号系统、无邮箱（MVP） |
| **Endpoint 归属** | **用户 BYO** | 每人 deploy 自己的 Worker；见 §1.1 |

> `<subdomain>` 为**用户** `wrangler deploy` 后得到的 workers.dev 子域；填入**本地应用设置**，**不提交进 git**（§7.3、§7.6）。

### 7.2 架构

```
Bench 桌面 App (Tauri / Rust HTTP)
        │ HTTPS
        ▼
https://bench-sync.<subdomain>.workers.dev/v1/...
        │
        ├─ Cloudflare Worker  ── 路由、key proof 校验、IP/Sync ID 限流
        │
        └─ Cloudflare R2 bucket  ── 每 Sync ID 一个对象（密文 + 元数据 JSON）
```

**MVP 不用独立数据库**：每条备份 = R2 中一个 object（key = `blobs/{syncId}.json`），内容为 §6.1 结构。限流计数可用 Worker 内置 **Rate Limiting** 或 **KV**（免费档够用）。

### 7.3 客户端配置（BYO endpoint）

云同步 HTTP **仅由 Rust `reqwest` 发起**（Tauri command），不经过 WebView `fetch`，因此 **MVP 无需改 CSP**（`tauri.conf.json` 保持现状即可）。

**Endpoint 来源（优先级从高到低）**：

1. 用户设置：`cloud_sync_endpoint`（存 app 数据目录，如 Account Manager 配置 JSON）
2. 开发调试：环境变量 `BENCH_CLOUD_SYNC_URL`（仅 dev / 自测）

**校验**（实现 Phase 1 时）：

- 必须为 `https://`；拒绝 `http://`、内网 IP、明显非法 host
- 规范化：去掉末尾 `/`，请求时拼 `/v1/blobs...`
- **空字符串** → 云同步入口不可用（UI 隐藏或展示「请先配置同步服务器」+ 链到部署文档）

**禁止**：

```rust
// ❌ 不要进开源默认分支
const CLOUD_SYNC_API_BASE: &str = "https://bench-sync.<anyone>.workers.dev/v1";
```

Fork 维护者若为自己团队服务，应在**私有配置或 fork 专用分支**设置 endpoint，而非改上游默认常量。

### 7.4 网络与地区策略

| 场景 | 行为 |
|------|------|
| 能访问 Cloudflare | 正常使用「上传云端 / 从云端恢复」 |
| 请求超时 / 连接失败（含大陆常见情况） | Toast：**「当前网络无法使用云同步，请使用本地导入/导出」**；不阻塞其他功能 |
| 用户主动选择 | 站点栏底部 **Import / Export** 始终可用 |

**Phase 2 再评估**国内第二端点（多半涉及备案与费用）；MVP 不为大陆单独建站。

### 7.5 免费档容量（粗算）

单用户密文约 **50 KB～2 MB**。Cloudflare 免费档（约 2026 定价）：

| 资源 | 免费额度 | 对 Bench 的意义 |
|------|----------|-----------------|
| R2 存储 | 10 GB/月 | 数千～上万活跃用户量级 |
| R2 Class B 读 | 1000 万次/月 | 足够 |
| Worker 请求 | 10 万次/天 | MVP 足够 |

### 7.6 部署清单（**每位使用者 / fork 维护者**自行执行）

| 步骤 | 动作 |
|------|------|
| 1 | 注册 Cloudflare（免费） |
| 2 | R2 bucket：`bench-cloud-sync`（名称可自定，与 `wrangler.toml` 一致即可） |
| 3 | 仓库目录：**`workers/bench-sync/`**（Wrangler + TypeScript Worker） |
| 4 | `wrangler.toml`：`name = "bench-sync"`，绑定 R2 + KV |
| 5 | `wrangler deploy` → 记录 URL：`https://bench-sync.<your-subdomain>.workers.dev` |
| 6 | 在 Bench **设置**填入 `https://bench-sync.<your-subdomain>.workers.dev/v1`（**勿 commit 到 git**） |
| 7 | Worker 实现 §10；客户端 §11 Phase 1 |

**`<subdomain>` 说明**：Wrangler 输出的 workers.dev 子域，与**部署者 Cloudflare 账号**绑定；不同 fork / 不同用户应有不同 subdomain。

**刻意不做（MVP）**：上游仓库内置公共 endpoint、自购域名、DNS、ICP、Supabase/Postgres、国内云、`ephemeral` TTL Cron。

### 7.7 未来可选：自定义域名

若日后对外正式发布且需要品牌域名（如 `sync.bench.app`），可在 Cloudflare 为**同一 Worker** 绑定 Custom Domain；**非 MVP 阻塞项**。

---

## 8. 在线防护（非密码正确性）

### 8.1 速率限制

| 维度 | 阈值（MVP 定案） | 实现 |
|------|------------------|------|
| 单 IP | 30 req/min | Workers KV `rl:ip:{ip}`，TTL 60s 计数 |
| 单 Sync ID GET | 20 req/hour | Workers KV `rl:sid:{syncId}`，TTL 3600s |
| 全局 | MVP 不设硬顶 | 依赖 CF 平台；超量再评估 Paid 计划 |

Pull **404**：Sync ID 不存在或 R2 miss → **404**，响应体固定 `{"error":"not_found"}`，**延迟 200–400ms 随机 jitter**（防枚举）。

### 8.2 MVP 不做的项

- ❌ 服务端「解密失败计次 / 锁定 Sync ID」（零知识 Pull 无法实现）
- ❌ `HEAD /exists/:syncId`（泄露哪些 Sync ID 有效；若要做需统一延迟 + 高限流，Phase 2 再评估）
- ❌ 客户端上报失败次数作为安全边界（可伪造）

### 8.3 Phase 2 可选增强

- 图形/行为验证码（高频 Pull 后）
- 设备绑定 + 新设备审批
- 邮箱绑定（**恢复 Sync ID**，非恢复主密码）

---

## 9. 同步流程

### 9.1 上传（创建 / 覆盖）

```
用户选择「上传云端备份」
    │
    ▼
设置主密码（两次确认，≥12 字符）
    │
    ▼
build_export_file(snapshot, EncryptedFull) → JSON bytes
    │
    ▼
Argon2id + AES-GCM → ciphertext + tag；计算 keyProof(upload)
    │
    ├─ 首次 ──► generate_sync_id() ──► POST /v1/blobs
    │
    └─ 覆盖 ──► 用户输入已有 Sync ID ──► PUT /v1/blobs/:syncId + keyProof
    │
    ▼
展示 Sync ID + 强提示：与主密码一并妥善保存；遗忘不可找回
```

### 9.2 拉取

```
用户输入 Sync ID + 主密码
    │
    ▼
GET /v1/blobs/:syncId（限流）──404/429──► 提示重试或检查 Sync ID
    │
    ▼
本地 Argon2id + AES-GCM 解密（KDF 参数来自响应 JSON）
    │
    ├─ 成功 ──► import_relay_data_from_json ──► 全量合并进本地（与文件 import 相同语义）+ 成功 toast
    │
    └─ 失败 ──► 仅本地提示「主密码错误或数据损坏」（不上报服务端计次）
```

### 9.3 删除

```
用户输入 Sync ID + 主密码
    │
    ▼
本地计算 keyProof（与上传相同：sync_id + "|upload"）
    │
    ▼
DELETE /v1/blobs/:syncId  body: { "keyProof": "..." }
```

### 9.4 覆盖策略（MVP）

- 上传 = 全量覆盖云端 R2 object（PUT）
- 拉取 = 调用与 **`import_relay_data` 相同逻辑**（站点 remark 冲突时自动加后缀，非 wipe 整库）
- 拉取前 UI **二次确认**：「将合并云端数据到本机，是否继续？」
- 不做增量、不做多端冲突合并（Phase 3）

### 9.5 用户同意（MVP 定案）

首次上传前勾选确认（i18n 一条即可）：

> 账号数据将以端到端加密形式存储在 Cloudflare 基础设施；Bench 无法查看明文。请自行保管同步码与主密码。

无需单独隐私政策页；Phase 2 若公开发布再补完整说明。

---

## 10. Worker API 与 R2 存储

**基址**：`https://bench-sync.<subdomain>.workers.dev/v1`

### 10.1 HTTP 路由

| 路径 | 方法 | 说明 |
|------|------|------|
| `/v1/blobs` | POST | 创建；body = §6.1；`syncId` 冲突 → **409** |
| `/v1/blobs/:syncId` | PUT | 覆盖；`keyProof` 必须匹配 → 否则 **403** |
| `/v1/blobs/:syncId` | GET | 返回 §6.1 JSON；不存在 → **404** + jitter |
| `/v1/blobs/:syncId` | DELETE | body `{ keyProof }`；匹配则删 R2 object |

**错误码**：400 格式错误 · 403 proof 失败 · 404 不存在 · 409 Sync ID 已占用 · 429 限流 · 500 内部错误

请求/响应：`Content-Type: application/json`；Worker 将请求体 `keyProof` 与 R2 内已存值做**常量时间相等比较**（不派生密钥）。

### 10.2 R2 对象布局（替代关系型数据库）

| R2 object key | 内容 |
|---------------|------|
| `blobs/{syncId}.json` | §6.1 完整结构（密文 + 元数据） |

**生命周期（MVP）**：

- 仅 `retentionPolicy: long` → 无自动删除；用户 DELETE 或 Wrangler 手动清理

**Phase 2**：`ephemeral` + `expiresAt` + Cron Trigger 扫 R2 删除过期 object。

**限流**：Workers KV namespace `BENCH_SYNC_RL`（见 §8.1）。

---

## 11. 分阶段实施计划

### Phase 0：基础设施决策 ✅ 已定案

| 决策项 | 定案 |
|--------|------|
| 托管 | **Cloudflare Workers + R2** |
| API 地址 | **`https://bench-sync.<subdomain>.workers.dev/v1`**（不买域名） |
| 月费 | **$0 免费档** |
| 身份 | 纯 Sync ID + key proof |
| 主密码 / Sync ID 遗忘 | 无找回；UI 强提示 + 本地导出 |
| MVP 数据范围 | 见 §6.3 |
| 大陆网络 | 不保证；本地 Import/Export fallback |
| Endpoint | **BYO 用户设置**；OSS 无默认公共 URL（§1.1） |

### Phase 1：MVP（**低优先级** — BYO 就绪后再做）

- [ ] `workers/bench-sync/`：Wrangler 项目 + KV + R2 绑定（§7.6，可作为独立 PR 先合文档+模板）
- [ ] Worker：`/v1/blobs` CRUD + keyProof 比对 + KV 限流
- [ ] `crypto.rs`：`argon2` + cloud encrypt/decrypt + keyProof
- [ ] `commands.rs`：`import_relay_data_from_json`；export 复用 `build_export_file`
- [ ] `cloud_sync.rs`：Tauri commands + `reqwest`；从设置读取 endpoint（§7.3）
- [ ] 设置 UI：`cloud_sync_endpoint` + 链接「如何自托管」；空 endpoint 禁用云同步
- [ ] 前端：上传 / 拉取 / 删除对话框；§9.5 勾选；网络失败 fallback i18n
- [ ] `docs/modules/account-manager/cloud-sync-user-guide.md`（BYO 部署 + 隐私说明）

**建议实现顺序**：Worker 模板 + 部署文档 → curl 自测 → Rust crypto 单测 → endpoint 设置 → Tauri command → 同步 UI。

**不做的默认行为**：release 内置维护者 workers.dev URL。

### Phase 2：体验与安全

- [ ] AuthProfile 纳入 export/import
- [ ] Session 快照同步（单独体积与合规评估）
- [ ] 设备绑定、Sync ID 二维码
- [ ] 可选邮箱（仅 Sync ID 恢复）
- [ ] 版本历史 / 回滚（服务端保留 N 份密文）

### Phase 3：协同

- [ ] 增量同步
- [ ] 多端冲突处理
- [ ] 只读分享（独立 Sync ID + 只读 proof 模型，另文设计）

---

## 12. Phase 2+ 待议（不阻塞 Phase 1）

| 项 | 说明 |
|----|------|
| **维护者可选公共服** | 独立 opt-in、独立 ToS/配额；**非 OSS 默认**（§1.1） |
| Session 同步范围 | IndexedDB / 分区 Cookie 是否全量、体积上限 |
| `ephemeral` 保留策略 | 7/30 天 TTL + Cron |
| 商业配额 | 更大 payload / 更长保留 |
| 自定义域名 | `sync.bench.app` 等 |
| 国内第二端点 | 备案 + 双 API 基址 |

---

## 13. 参考资料

- [Cloudflare Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare R2 定价](https://developers.cloudflare.com/r2/pricing/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)

- [Argon2 PHC](https://github.com/P-H-C/phc-winner-argon2)
- [NIST SP 800-38D (GCM)](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [1Password Security Design](https://1password.com/security/)
- [Bitwarden Security](https://bitwarden.com/help/security/)
- 本仓库：`session-manager-tech-design.md` · `export_relay_data` / `import_relay_data` 实现
