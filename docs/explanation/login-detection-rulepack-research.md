# 登录判定规则包（Rulepack）插件化分发调研

> **状态**：调研完成，待拍板（2026-09-10）
> **关联**：[login-state-detection-research.md](login-state-detection-research.md)（同日前置调研：S1 服务端探针为唯一高置信判据，P1 建议落地 `loginCheck`）、[extension-spec.md](../reference/extension-spec.md)、[extension-center/roadmap.md](../modules/extension-center/roadmap.md)、D-023 / D-024
> **触发问题**：账号管理「是否登录」的判定逻辑能否插件化——GitHub 专门仓库维护规则，Bench 自带内置规则 + 按域名从仓库匹配拉取，用规则驱动登录态判定。

---

## 1. 结论（TL;DR）

**可行，且高度推荐。** 这正是同日前置调研中 P1 建议（站点级 `loginCheck`）的「规则来源」缺口的标准答案：P1 回答了「判定逻辑该是什么」，本方案回答了「每个站点的规则从哪来」。核心判断有五条：

1. **形态必须是「声明式规则包」（rulepack = 纯 JSON 数据），不是可执行插件。** 规则被 Rust 宿主解释执行，远程仓库永远不能下发代码逻辑。不建议套用现有 extension 产物格式（zip + 逐文件 hash + ACL + 开窗语义对纯数据过重），但**校验原则与签名库全部复用**（schemaVersion / minisign / 版本单调性 / expiresAt / yanked）。
2. **分发必须「全量同步 + 本地匹配」，禁止逐域名实时远程查询。** 按域名向 GitHub 发查询会泄露用户站点列表（隐私红线），且网络延迟会拖慢每次探测。registry 本来就是全量 index，天然契合。
3. **`loginCheck.url` 必须强制与站点同可注册域 + 强制 GET + 不跟随跨域重定向。** 这是安全生命线：loginCheck 会携带账号 cookie 发请求，若无同域约束，规则仓库投毒 = session 外泄通道。同域约束后，投毒最多等价于「站点自己的 API 被探测」，攻击面收敛。
4. **判定引擎留在宿主、随版本发布；规则包只发「站点先验配置」。** 证据分层不变（HTTP 401/403 强证据 > 指纹否定短路 > 文本兜底），规则包不接管证据优先级，只填充「该站点用哪个端点、哪些指示器」。
5. **中国大陆直连 GitHub raw 不稳定**，需 jsDelivr / GitHub Pages 双源 + env 覆盖 + 本地缓存兜底——这与 D-024 已定的 canonical registry 托管策略（静态 JSON + Git / GitHub Pages / jsDelivr，不自建服务端）完全一致。

---

## 2. 问题定义与现状

### 2.1 现行判定逻辑（代码事实）

登录态判定是**分层证据管线**，不是单点逻辑：

| 层            | 位置                                                                                      | 现状                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 探测策略      | `detection.rs` `classify_auth` → `ProbeStrategy`（HttpOnly/HttpFirst/Hybrid/WebviewOnly） | 由 AuthProfile 分类引擎决定，硬编码                                                                  |
| L0a HTTP 预检 | `probe.rs`                                                                                | 指纹全缺失 → 确定性未登录；401/403 → 服务端强证据短路                                                |
| L0b 指纹预检  | `probe.rs:476-488`                                                                        | **弱肯定越权未修**（present → 直接 Ready，trae.cn 误判根因，见前置调研 §6 P0）                       |
| 文本分类      | `detection_legacy.rs`                                                                     | `LoginDetectionConfig`：PresetLogout（中文「退出登录」needle 硬编码）/ PresetLogin / Custom 三模式   |
| 规则本体      | `types.rs:390-424` `LoginDetectionRule`                                                   | 仅「单条文本 + Present/Absent」包含匹配，挂在 `RelayStation.login_detection`，**用户逐站点手动配置** |

关键缺口：**规则表达能力弱 + 规则来源只有「用户手配」一条路**。前置调研已实锤文本/DOM 启发是反面教材（SPA 同构无区分度），真正的高置信判据是 S1 服务端权威探针（`loginCheck: {url, method, expect}`）——但每个站点一个端点 + 判定规则，让用户逐个手配不现实。**规则仓库解决的就是这个冷启动问题。**

### 2.2 可复用基建盘点（复用度高的原因）

| 基建                                                            | 位置                                            | 对规则包的复用方式                                         |
| --------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| canonical registry（静态 JSON + Git / GitHub Pages / jsDelivr） | `extension_host/registry.rs`，P4 已闭环         | 分发模式照搬；`BENCH_EXT_REGISTRY_URL` 的 env 覆盖惯例延续 |
| minisign 签名（canonical 文本 + trusted comment）               | `extension_host/signature.rs`                   | 规则文件逐文件签名，库函数直接调用                         |
| 版本单调性 / expiresAt 防 freeze / yanked / 吊销                | `extension_host/manifest.rs` + `market.rs`      | 校验原则对齐，逻辑模式照搬                                 |
| reqwest (rustls)                                                | `probe.rs` / `market.rs` 已在用                 | 规则拉取零新依赖                                           |
| bundled 双部署                                                  | `extensions:sync` 脚本                          | 内置规则随版本发布的发布通道                               |
| 可注册域匹配                                                    | `types.rs:281-298`（Exact / RegistrableDomain） | 域名 → 规则条目的匹配键现成                                |

---

## 3. 方案总体设计

### 3.1 规则包形态与 schema 草案（v1）

```jsonc
// rules/index.json —— 目录（对齐 registry.json 语义）
{
  "schemaVersion": 1,
  "updatedAt": "2026-09-10T00:00:00Z",
  "expiresAt": "2026-10-10T00:00:00Z",        // 防 freeze attack，对齐 extension-spec
  "rules": [
    { "id": "trae.cn", "version": "1.2.0", "path": "rules/trae.cn.json",
      "sha256": "…", "size": 812, "signature": "…", "yanked": false }
  ]
}

// rules/trae.cn.json —— 单站点规则（声明式，无任何可执行内容）
{
  "schemaVersion": 1,
  "id": "trae.cn",
  "version": "1.2.0",
  "match": { "registrableDomain": "trae.cn", "hosts": ["www.trae.cn", "api.trae.cn"] },
  "detection": {
    "loginCheck": {                                        // S1 服务端权威探针（前置调研 §4 结论）
      "url": "https://api.trae.cn/cloudide/api/v3/trae/CheckLogin",
      "method": "GET",                                     // 强制 GET（schema 校验拒绝其他方法）
      "expect": { "kind": "jsonBool", "path": "Result.IsLogin" }   // kind: status(401/302) | jsonBool | bodyContains
    },
    "fallback": {                                          // 文本兜底（弱证据，仅当 loginCheck 不可用）
      "loggedIn":  [{ "kind": "text", "value": "退出登录" },
                     { "kind": "selector", "value": "[data-testid=\"logout\"]" }],
      "loggedOut": [{ "kind": "text", "value": "登录", "presence": "present" }]
    },
    "strategyHint": "httpFirst"                            // 可选先验，宿主可采纳可忽略
  },
  "notes": { "zh": "…", "en": "…" }
}
```

`kind` 白名单：`text` / `selector` / `cookie` / `storageKey` / `jsonBool` / `status` / `bodyContains`。**fail-closed**：schemaVersion 不匹配、未知 kind、未知字段、非 GET 的 loginCheck、跨域 loginCheck → 整条规则拒绝加载并记审计。

### 3.2 分发架构与匹配流程

```
GitHub 仓库（bench-login-rules）
├── rules/index.json          ← 目录：版本、hash、签名、yanked
└── rules/<registrable-domain>.json
        │
        │ 全量拉取（jsDelivr / GitHub Pages 双源，env 可覆盖基址）
        ▼
本地缓存 $APPDATA/login-rules/     ──  minisign 验签 + hash 校验 + 版本单调
        │
        │ 本地按可注册域匹配（复用 StationUrlMatchConfidence 逻辑）
        ▼
判定管线取用：规则包 loginCheck → HTTP 探针阶段优先打它
              规则包 fallback 文本 → Custom 模式替代手配
              （用户手配规则永远优先于规则包）
```

更新调度：启动后 + 每 24h 后台拉一次 index（失败静默沿用缓存，不阻塞探测）；版本对比单调升级；`yanked`/吊销即时生效。

### 3.3 优先级融合（谁说了算）

| 优先级 |                               来源                                | 说明                                     |
| ------ | :---------------------------------------------------------------: | ---------------------------------------- |
| 1      | 用户手配（`station.login_detection` / 未来 `station.loginCheck`） | 用户显式配置永远最高，UI 标注「自定义」  |
| 2      |         规则包条目（远程版本 > 内置版本，按 semver 取新）         | UI 标注「社区规则 vX.Y.Z」，可按站点禁用 |
| 3      |                        内置 bundled 规则集                        | 随版本发布，离线/首次启动兜底            |
| 4      |               现行预设（PresetLogout 中文 needle）                | 规则包时代的兜底的兜底                   |

**证据分层不动**：loginCheck 是强判据；指纹仅保留否定短路；文本类（含规则包 fallback）一律弱证据。规则包提供的是「站点先验配置」，不改写 `probe.rs` 的证据优先级。

---

## 4. 关键决策与权衡

### 4.1 rulepack 独立管线 vs 套用 extension 产物体系

| 维度     | A. 独立轻量管线（推荐）             | B. 套用 extension manifest（kind: rulepack）                |
| -------- | ----------------------------------- | ----------------------------------------------------------- |
| 产物语义 | 数据文件，无 UI、无开窗、无 ACL     | 需改造 extension 语义（extension = 运行时前端 bundle）      |
| 安全面   | 拒加载即终点，无代码执行            | zip 解压 + 逐文件 hash + ACL 全是冗余开销                   |
| 分发成本 | 直接 JSON + 逐文件签名，拉取即用    | 每次规则微调都要打 zip 包                                   |
| 规格改动 | 新增一份规则包规格（短）            | 需动 extension-spec（冻结的 schema v2），牵连 P3.1 安全地基 |
| 复用     | 签名 / 校验原则 / registry 模式照搬 | 全套复用但大量空转                                          |

**判断：A。** 规则包与 extension 是两类物种（数据 vs 代码），强行合体只会把两套东西都搞复杂。但 schemaVersion / fail-closed / minisign / 版本单调 / expiresAt / yanked / 审计这七条校验纪律必须 1:1 对齐 extension-spec 成熟做法——**复用的是「纪律」，不是「容器」**。

### 4.2 分发通道对比

| 通道                                  | 可达性（大陆） | 时效             | 成本                | 结论       |
| ------------------------------------- | -------------- | ---------------- | ------------------- | ---------- |
| raw.githubusercontent.com             | ❌ 不稳定      | 实时             | 零                  | 仅作备用源 |
| GitHub Pages                          | ⚠️ 一般        | push 即发        | 零                  | 备用源     |
| jsDelivr（cdn.jsdelivr.net/gh/…@tag） | ✅ 好          | tag 缓存可 purge | 零                  | **主源**   |
| 自建服务端                            | —              | —                | 违反 D-024 成本原则 | 不做       |

双源顺序探测（jsDelivr → GitHub Pages → raw）+ env 覆盖（对齐 `BENCH_EXT_REGISTRY_URL` 惯例，如 `BENCH_RULES_REGISTRY_URL`）。

### 4.3 全量同步 vs 按域名查询

| 方案                        | 隐私                               | 延迟           | 实现                                          |
| --------------------------- | ---------------------------------- | -------------- | --------------------------------------------- |
| 全量同步 + 本地匹配（推荐） | ✅ 只暴露「用了 Bench」这一事实    | 探测零网络开销 | 拉 index + 命中的单站点文件（按需懒加载亦可） |
| 逐域名远程查询              | ❌ 泄露用户站点列表；GitHub 可画像 | 每次探测 +RTT  | 不做                                          |

规则文件是 KB 级 JSON，全量 index 即便覆盖 500 站点也在百 KB 量级，带宽成本可忽略。

---

## 5. 风险与对策

| #   | 风险                                       | 等级  | 对策                                                                                                                                                                                                |
| --- | ------------------------------------------ | :---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **规则仓库投毒 → loginCheck 外泄 session** | 🔴 高 | 同可注册域强约束（schema + 加载时双重校验）+ 强制 GET + `redirect: none`（probe 已有）+ minisign 签名 + PR 人工审核 + 吊销通道。同域约束后投毒收益趋零：请求只会发往站点自己的域，cookie 本来就会发 |
| R2  | 站点改版 → 规则失效误判                    | 🟡 中 | 规则置信度标注 + 判定 `uncertain` 时回落旧管线提示手动确认 + 版本快速迭代 + 审计日志记录「判定使用了哪条规则哪个版本」，误判可归因                                                                  |
| R3  | 规则冲突（同可注册域多子域）               | 🟢 低 | 匹配 specificity 排序：Exact host > RegistrableDomain；同分取版本高者；审计记录命中路径                                                                                                             |
| R4  | GitHub 全域不可达（离线/企业内网）         | 🟡 中 | 本地缓存永不清空；bundled 内置集兜底；env 可指向内网镜像；拉取失败静默不阻塞                                                                                                                        |
| R5  | 用户隐私（站点列表进 Git 历史）            | 🟢 低 | 用户手配规则**永不**上传；规则仓库只含站点通用规则                                                                                                                                                  |
| R6  | 规则数量膨胀后 index 拉取变慢              | 🟢 低 | 单文件按需懒加载（index 只拉一次，命中才取站点文件）；百 KB 量级短期无压力                                                                                                                          |
| R7  | 与 D-017 信任边界冲突                      | 🟢 低 | 对齐不冲突：下载源/版本/hash/签名由宿主决定，renderer 只展示与选择，不提交地址（同 D-007）                                                                                                          |

---

## 6. 分阶段路线图（衔接既有 roadmap）

| 阶段   | 内容                                                                                                                                          | 前置 | 量级 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- |
| **R1** | 修复 L0b 弱肯定越权（前置调研 §6 P0，一行语义改动）                                                                                           | 无   | 极小 |
| **R2** | 判定引擎声明式化：`LoginDetectionRule` v2（多条件 kind 白名单）+ `station.loginCheck` 落地（前置调研 §6 P1，trae.cn 手配即达 3/3）            | R1   | 中   |
| **R3** | 规则包加载器：bundled 内置集（首批 5–10 高频站点）+ 可注册域匹配 + 优先级融合 + UI 规则来源标注（自定义/社区 vNNN/内置）                      | R2   | 中   |
| **R4** | GitHub 规则仓库上线：index schema + minisign 签名流水线（复用 updater 密钥链 + GitHub Secrets）+ 拉取/验签/缓存/24h 调度/吊销 + jsDelivr 双源 | R3   | 中   |
| **R5** | 贡献生态：规则模板 + CI 校验（schema lint + 匿名基线实测）+ PR 审核流程文档                                                                   | R4   | 小   |

> R1/R2 独立有价值（不建仓库也能修误判 + 手配高置信探针），R4 之前全部纯本地，无外部依赖。**建议 R1 → R2 先行启动**，与规则仓库建设解耦。

---

## 7. 待拍板问题

1. **仓库归属**：规则仓库放个人账号还是独立 org（extension registry 已定 kindred-plugin-market org，规则仓库建议同 org，如 `kindred-login-rules`）？
2. **首版内置站点清单**：bundled 首批覆盖哪些站点（建议从你真实在用的站点选起，每个都过一遍匿名基线差集验证）？
3. **fallback 文本规则的存废**：前置调研已实锤文本启发是弱证据，规则包是否仍收录 fallback 文本（收录 = 兜底体验，不收录 = 强制走 loginCheck，误判更少但覆盖站点变少）？建议：**收录但必须在 loginCheck 缺失时才启用**。
4. **`strategyHint` 是否需要**：规则包干预探测策略会增大调面，v1 可只做 loginCheck + fallback，策略仍全由宿主 authProfile 决定。
