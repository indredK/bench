# 登录规则包契约规格（Login Rulepack Spec）

> **定位**：本文是「登录判定规则包（rulepack）」**契约的唯一规格真相源**（Reference 层）：仓库结构、registry schema、单站点规则 schema、宿主校验规则、匹配与优先级语义。任何字段改动必须先改本文再改两端实现。
> **背景与可行性**：[login-detection-rulepack-research.md](../explanation/login-detection-rulepack-research.md)（方案调研）· [login-state-detection-research.md](../explanation/login-state-detection-research.md)（S1 服务端探针判据依据）
> **分发模式参照**：command-market（`src-tauri/src/command_center/market.rs`，静态 JSON + GitHub raw）与 extension registry（`src-tauri/src/extension_host/registry.rs`）
> **宿主实现**：`src-tauri/src/account_manager/login_rules.rs` + `probe.rs` / `detection.rs`
> **规则仓库**：<https://github.com/kindred-plugin-market/command-market>（登录规则板块：`rules.json` + `rules/`，与命令市场独立演进）
> **版本**：schema v1 ｜ **最后更新**：2026-09-10

---

## 1. 范围与信任边界

- 规则包是**声明式 JSON 数据**，不含任何可执行内容；判定引擎始终在 Bench 宿主内（随版本发布），远程仓库**永远不能下发逻辑**。
- 拉取、校验、存储全部在 Rust 后端完成；renderer 不参与（对齐 D-007：下载源与校验材料由宿主决定）。
- **同域铁律**：`loginCheck.url` 的 host 必须与规则 `match`（进而是目标站点）同一可注册域，且**method 白名单 GET/POST、不跟随重定向**。loginCheck 携带账号 cookie 发请求——无同域约束时规则仓库投毒 = session 外泄通道；约束后请求只会发往站点自己的域，投毒收益趋零（GET/POST 均为查询型鉴权接口语义，POST 空请求体）。
- 文本/选择器类 fallback 一律**弱证据**：命中仅产生「倾向性判定」，不得覆盖 HTTP 401/403 强证据与指纹否定短路。

## 2. 仓库结构（command-market 登录规则板块）

登录规则承载于 kindred-plugin-market/command-market 仓库的**独立板块**，与命令市场体系（`registry.json` + `commands/`）互不影响、各自独立演进 `schemaVersion`：

```
command-market/
├── registry.json          # 命令市场索引（不变）
├── commands/              # 命令文件（不变）
├── rules.json             # 登录规则索引（§3）
├── rules/
│   ├── <id>.json          # 单站点规则（§4），id = 可注册域
│   └── generic.json       # 通用兜底规则（§4.4），id 固定 "generic"
├── scripts/
│   ├── build-registry.mjs # 命令索引构建（不变）
│   └── build-rules.mjs    # 扫描 rules/ 重算 sha256/size，重写 rules.json
└── .github/workflows/
    └── registry.yml       # push main 自动重算并提交两个索引
```

- `rules/` 文件名必须等于规则 `id`（可注册域，如 `trae.cn.json`；通用规则固定 `generic.json`）。
- 发布流程：新增/修改 `rules/*.json` → `node scripts/build-rules.mjs` → commit & push（CI 会再算一遍兜底）。

## 3. registry.json schema v1

| 字段            | 类型   | 必填 | 约束                             |
| --------------- | ------ | :--: | -------------------------------- |
| `schemaVersion` | number |  ✅  | 宿主支持 `1`，不匹配 fail-closed |
| `updatedAt`     | string |  ⬜  | ISO 8601 UTC                     |
| `rules`         | array  |  ✅  | 可为空数组（空 = 市场暂无规则）  |

`rules[]` 条目：

| 字段          | 类型   | 必填 | 约束                                                        |
| ------------- | ------ | :--: | ----------------------------------------------------------- |
| `id`          | string |  ✅  | 可注册域（eTLD+1，如 `trae.cn`）；与 `rules/<id>.json` 一致 |
| `version`     | string |  ✅  | `X.Y.Z` 三段纯数字                                          |
| `title`       | string |  ✅  | 非空                                                        |
| `description` | string |  ⬜  | —                                                           |
| `file`        | string |  ✅  | 必须为 `rules/<id>.json`（安全相对路径，防穿越）            |
| `sha256`      | string |  ✅  | 小写 hex 64                                                 |
| `size`        | number |  ✅  | 字节数，与实际一致                                          |

## 4. 单站点规则文件 schema v1

```jsonc
{
  "schemaVersion": 1,
  "id": "trae.cn", // = 文件名 = 可注册域
  "version": "1.0.0",
  "match": {
    "registrableDomain": "trae.cn", // 必填；id 必须等于它
    "hosts": ["www.trae.cn", "api.trae.cn"], // 可选；精确 host 额外匹配（specificity 更高）
  },
  "detection": {
    "loginCheck": {
      // 可选；S1 服务端权威探针（强判据）
      "url": "https://api.trae.cn/cloudide/api/v3/trae/CheckLogin",
      "method": "POST", // 白名单 GET | POST（POST 空请求体；实测 trae.cn 仅接受 POST）
      "expect": {
        "kind": "jsonBool", // status | jsonBool | bodyContains
        "path": "Result.IsLogin", // jsonBool：JSON 布尔路径（true=登录）
      },
    },
    "fallback": {
      // 可选；文本/特征弱证据（loginCheck 缺失或不可用时）
      "loggedIn": [{ "kind": "text", "value": "退出登录" }],
      "loggedOut": [{ "kind": "text", "value": "登录", "presence": "present" }],
    },
  },
}
```

### 4.1 `expect` 三种 kind

| kind           | 字段                                        | 判定语义                                                                |
| -------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| `status`       | `loggedIn: number[]`、`loggedOut: number[]` | HTTP 状态码命中集合即判；两侧都不命中 → 不定论（走后续链路）            |
| `jsonBool`     | `path: string`（点分路径）                  | 解析响应 JSON，路径取布尔：`true`=登录、`false`=未登录；取不到 → 不定论 |
| `bodyContains` | `loggedIn: string[]`、`loggedOut: string[]` | 响应体包含指示器即判；都不命中 → 不定论                                 |

### 4.2 `fallback` 条件

| 字段       | 类型   | 约束                                                 |
| ---------- | ------ | ---------------------------------------------------- |
| `kind`     | string | `text`（页面文本包含）/ `selector`（CSS 选择器存在） |
| `value`    | string | 非空；长度 ≤ 200                                     |
| `presence` | string | `present`（默认）/ `absent`；仅对 `text` 生效        |

`fallback` 语义：`loggedOut` 任一条件命中 → `LoginRequired`；否则 `loggedIn` 任一条件命中 → `Ready`（弱）；都不命中 → 不定论。`loggedIn` 与 `loggedOut` 均可为空数组/缺省。

### 4.3 宿主校验清单（fail-closed，任一失败整条规则拒绝并记审计）

1. `schemaVersion == 1`；未知字段拒绝（`deny_unknown_fields`）。
2. 非 generic 规则：`id` 为合法可注册域格式（`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$`），且 `id == match.registrableDomain == 文件名（去 .json）`；generic 特例见 §4.4。
3. `match.hosts` 每项为合法 host，且同属 `registrableDomain`。
4. `loginCheck`：https、host 同可注册域、`method ∈ {GET, POST}`（POST 空请求体）、`expect.kind` 白名单、`status` 集合取值 100–599、`jsonBool.path` 仅 `[A-Za-z0-9_.]`。
5. `fallback`：`kind` 白名单、`value` 非空 ≤200、`presence` 白名单。
6. registry 条目与规则文件：`id`/`version` 一致；sha256 + size 一致。

### 4.4 通用兜底规则（generic）

站点规则按可注册域匹配；**未命中任何站点规则的站点**回落到通用规则，文件固定 `rules/generic.json`：

| 约束                  | 语义                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `id` 固定 `"generic"` | 非域名特例（构建脚本与宿主双侧放行域名校验）                                                          |
| `match` 必须省略      | 全局生效（对任意 host 命中，specificity 最低）                                                        |
| 禁止 `loginCheck`     | 通用规则无法预知各站点同域鉴权接口，强行下发会破坏同域铁律                                            |
| 必须提供 `fallback`   | 仅中英文页面文本弱证据（登录/注册 CTA vs 退出登录入口），`loggedOut` 文本不得是 `loggedIn` 文本的子串 |

## 5. 分发与缓存（宿主）

| 项       | 约束                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------- |
| 默认源   | `https://raw.githubusercontent.com/kindred-plugin-market/command-market/main/rules.json`（零配置） |
| env 覆盖 | `BENCH_LOGIN_RULES_URL`（https registry URL）＞ `BENCH_LOGIN_RULES_DIR`（本地目录，开发调试）      |
| 缓存目录 | `$APPDATA/login-rules/`（`registry.json` + `rules/<id>.json` + `meta.json` 记录 `lastFetched`）    |
| 刷新时机 | 账号管理状态初始化后后台拉取一次；TTL 24h，探测命中过期缓存时后台再拉（**不阻塞当前判定**）        |
| 失败语义 | 拉取/校验失败静默沿用旧缓存或内置规则；网络不可用不产生用户可见错误                                |
| 版本单调 | 同 id 缓存版本 ≥ 远程版本时拒绝回写（防降级）                                                      |

**按需更新（update_login_rules IPC）**：支持 `scope = all | generic | site` 三档——`all` 拉取索引全量、`generic` 仅 `rules/generic.json`、`site` 仅命中当前站点 host 的特殊规则（索引条目 `id` 即可注册域匹配）。每条仍走 sha256/size/schema 校验与版本单调守卫；`BENCH_LOGIN_RULES_DIR` 调试模式无远程源，返回空报告。配套 `get_login_rules_overview` IPC 返回当前生效的 generic/站点规则详情（版本、来源、判定要点）+ 远程索引版本比较（`updatable` 标志，驱动「更新登录逻辑」弹窗按钮可用态；远程检查失败时按钮禁用并提示）。

## 6. 匹配与优先级

匹配键：目标 URL host。`match.hosts` 精确命中 > `registrableDomain` 等于目标 host 的可注册域；generic 规则对任意 host 命中（specificity 最低）。候选按以下优先级取一：

1. **站点特殊规则 > generic 兜底**（无论来源）
2. **精确 host > 可注册域**（speciality 内）
3. **同 id 取版本更高者**（同版本平局取 remote，与候选顺序无关）
4. **远程缓存 > bundled 内置**（同 specificity 跨 id 时）

站点无特殊规则时 `resolve` 返回 generic 规则（fallback 文本弱证据对所有站点生效）。用户手配优先级不变：

1. **用户手配**（`station.login_detection` Custom 模式非空 / `station.loginCheck` 非空）
2. **规则包**（上述候选最优）
3. 现行预设（PresetLogout / PresetLogin 中文 needle）

**证据分层不变**（由宿主管，规则包不改写）：
`loginCheck`（强）→ HTTP 401/403（强）→ 指纹全缺失否定短路（强）→ 规则包 fallback（弱）→ 手配/预设文本（弱）。

## 7. Bundled 内置集

- 位置：`src-tauri/src/account_manager/ruledata/`，每个文件 `include_str!` 进二进制；随版本发布，无 sha256 自校验（仅 schema 校验）。
- 首批：`generic`（中英文文本弱证据全局兜底）、`trae.cn`（loginCheck `Result.IsLogin`，前置调研实测 3/3）、`github.com`（`api.github.com/user` 401/200 实测）、`workbuddy.cn`（loginCheck `/console/accounts` 200/302，`session` cookie 前置，2026-09-11 调研）。
- bundled 与远程同 id 时按 §6 优先级取用（远程版本 > bundled 即覆盖；同版本取 remote）。
