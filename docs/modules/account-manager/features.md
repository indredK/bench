# Account Manager 功能说明

> 视角：产品 / 用户能力。技术实现见 [design.md](./design.md)；迭代规划见 [roadmap.md](./roadmap.md)。

## 1. 一句话定义

**一个 Web 会话管理器——管理和恢复你在任何网站上的登录态，永久的和一次性的。**

bench 不仅替你保存账号密码，更替你保存「登录后那一瞬间的浏览器状态」：cookie、token、CSRF、localStorage——这样下次打开 bench，账号已经登录好了。

## 2. 解决的问题

| 痛点 | bench 的解法 |
|------|-------------|
| 退出 bench 后登录态丢失，重启要重新登录 | Session 持久化 + 启动恢复 |
| 多账号同站切换需反复登录登出 | 账号隔离，每个账号独立 session |
| 临时网站也要建站、填密码、走完整流程 | Ephemeral 账号 2 步登录 |
| 不同网站的认证机制千差万别（cookie / JWT / SSO / 反爬） | AuthProfile 自动检测 + 分层探针 |
| 外部 App（IDE / CLI）登录要走系统浏览器，每次都要选账号 | bench 充当外部登录代理，按账号隔离 WebView |
| 重装 / 换机后账号库丢失 | IndexedDB 导出 + 未来云同步（backlog） |

## 3. 核心概念

### 3.1 实体模型

```
Account (账号) ────── 独立实体，自带 website URL
  │
  ├── Persistent (持久账户) ─── 属于某个 Station，完整生命周期管理
  │     ├── 密码加密存储
  │     ├── Session 持久化 + 启动恢复
  │     ├── 自动探针刷新
  │     └── 参与 Station 级别互斥管理
  │
  └── Ephemeral (临时账户) ─── 不属于任何 Station，轻量无痕
        ├── 无需创建 Station 即可使用
        ├── Session 不持久化（退出即销毁）
        ├── 不参与启动恢复
        └── 仅需 2 个字段（URL + 用户名）

Station (站点组) ─── 可选的分组标签，聚合同站多账号
  ├── 名称 (remark)
  ├── 网站 URL (website)
  └── 包含 N 个 Persistent Account
```

### 3.2 账号隔离

同一 Station 下的多个账号各自独立保持登录态，互不影响。每个账号拥有独立的 session、cookie 存储、WebView 数据目录，无需用户配置互斥策略。

## 4. 已实现功能

### 4.1 快速登录 — Ephemeral Account

**入口**：主界面顶部或侧边栏"快速登录"按钮。

**表单字段（2 个）**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 网站 URL | input[url] | 是 | 自动补全 `https://`，粘贴即用 |
| 用户名/邮箱 | input[text] | 是 | 用于标识；登录后可从页面提取 |

**流程**：
1. 用户粘贴 URL + 用户名 → 回车
2. 自动创建临时账户 → 打开 WebView 登录窗口
3. 登录完成后自动注入 session 捕获脚本
4. WebView 窗口关闭时：
   - 默认：保留 session 到当前 bench 会话结束
   - 可选：勾选"关闭后销毁"即注销后删除账户

**设计原则**：从 7 步砍到 2 步。不需要 Station，不需要密码，不需要任何额外字段。

### 4.2 持久账号录入 — Persistent Account

**入口**：Station 详情页 → "添加账号"。

**表单字段（4 个）**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 用户名/邮箱 | input[text] | 是 | 登录标识 |
| 密码 | input[password] | 否 | AES-256 加密存储，空则每次手动输入 |
| 备注 | textarea | 否 | 自由文本，承载所有非结构化元数据（手机号、TG、邀请链接等） |
| 标签 | tag-input | 否 | 用于分类过滤 |

**字段简化原则**：原 phone / tgAccount / linkedAccount / inviteLink / loginMethods 等字段已合并入"备注"或自动检测，旧字段后端保留向前兼容。

### 4.3 Session 持久化与恢复

#### 4.3.1 登录捕获

用户完成登录后，bench 自动捕获以下信息：

| 数据 | 捕获方式 | 用途 |
|------|---------|------|
| Cookies（含 HttpOnly） | Tauri v2 cookies API | 恢复登录态 |
| User-Agent | WebView 读取 | 保持指纹一致 |
| localStorage / sessionStorage | JS 注入（按 AuthProfile 决定） | JWT token 类网站 |
| CSRF Token | meta / input / cookie 提取 | 双提交模式 |
| 过期时间估算 | 从 cookie expires 推算 | TTL 清理依据 |

所有数据经 master_key AES-256-GCM 加密后写入本地 store。

#### 4.3.2 启动恢复

bench 启动时自动恢复所有 Persistent 账号的登录态：
1. 从 store 加载所有 Persistent Account
2. 解密 session，验证 cookie 未全部过期
3. 对每个 Ready 状态账户：
   - 创建隐藏 WebView
   - 通过 WKHTTPCookieStore 逐个注入 cookie
   - 发送轻量 HTTP 探针验证有效性
   - 200 OK 且未重定向 → 保持 Ready
   - 302/401 → 标记 LoginRequired

#### 4.3.3 退出持久化

bench 退出前对所有 Ready 状态的 Persistent 账号再次捕获 session 并强制 flush 到磁盘，确保最新登录态不丢失。Ephemeral 账号在退出阶段自动清理。

### 4.4 Session TTL 自动清理

支持为每个 Station 配置 session TTL（生存时间）。到达 TTL 后：
- 自动标记账号为 Expired
- 触发探针重新验证
- 失败则通知用户重新登录

避免长期未访问的 session 长期占用存储与带来安全风险。

### 4.5 AuthProfile 自动检测

每个 Station 在首次登录成功后，bench 自动检测该网站的认证机制，生成一份 AuthProfile：

| 检测维度 | 说明 |
|---------|------|
| Cookie 认证 | 是否使用 session cookie |
| Token 存储 | 存在 cookie / localStorage / sessionStorage / IndexedDB |
| CSRF 保护 | 是否启用、token 来源 |
| 认证类型 | SessionCookie / BearerOAuth / SAML / OIDC / WebSocket |
| 设备指纹 | None / Basic / Strict（IP + UA 校验） |
| 反机器人 | Cloudflare / Turnstile / reCAPTCHA / hCaptcha |
| SSO 提供商 | AzureAD / Okta / Auth0 / Google / Salesforce 等 |
| 探针策略 | HTTPFirst / HTTPOnly / WebViewOnly / Hybrid |

**面向技术用户的面板**：Station 详情页右侧可折叠面板实时展示 AuthProfile，包括检测时间、置信度、各维度检测结果、当前探针策略、HTTP probe 成功率。用户可手动重新检测或临时覆盖探针策略。

### 4.6 分层探针

探针（验证 session 是否仍然有效）按效率从高到低分三层，由 AuthProfile 自动选择策略：

| 级别 | 工具 | 耗时 | 触发条件 |
|------|------|------|---------|
| L1: HTTP Probe | reqwest HTTP 客户端 | <2s | 默认策略，AuthProfile = http_first / http_only |
| L2: WebView Probe | 隐藏 WebView + 多源证据 | <13s | HTTP probe 失败 / AuthProfile = webview_only / 自适应降级 |
| L3: Hybrid Probe | WebView + 重定向链跟踪 | <20s | AuthProfile = hybrid（SSO / OAuth 场景） |

**降级规则**：L1 返回 Uncertain 时自动降级 L2，L2 仍不确定再升级 L3。

### 4.7 多账号互斥管理

支持三种互斥模式（Station 级别配置）：

| 模式 | 行为 |
|------|------|
| Coexisting（默认） | 所有账号同时活跃，互不干扰 |
| Exclusive | 同一时刻仅一个账号活跃，切换时自动登出其他 |
| Rotating | 轮流活跃，非活跃账号标记为 Inactive |

### 4.8 外部登录代理

让 bench 成为外部软件的**登录代理**：当外部软件（IDE / CLI / 浏览器扩展）触发浏览器登录时，跳转到 bench 而不是默认浏览器；bench 用所选账号在**独立隔离的 WebView** 中完成登录，并把外部软件**自己的回调原样转交**回去。

**核心特性**：
- 每个账号的登录态被持久化保存，下次切换账号无需重复输入账号密码或验证码
- bench 永远不解析、不持有、不回传站点 token / cookie
- 支持自定义 scheme（`bench-auth://`）和 loopback 模式（RFC 8252，适配 Trae / GitHub CLI / VS Code）
- 同一站点多账号可独立开启 / 关闭代理能力
- 关闭代理立即吊销所有外部 App 绑定

**唤起协议**：

```
bench-auth://authorize
  ?target=<目标 URL>
  &return=<外部 App 回调 URL>
  &state=<opaque>
  &site=<可选 Station 预选 hint>
```

**Station 匹配规则**：
1. 精确 hostname 匹配
2. eTLD+1 子域匹配（`api.github.com` 命中 `github.com`）
3. 已知 SSO 提供商模糊匹配（Microsoft / Okta / Auth0 / Google / Salesforce）

**账号选择策略**：
- 0 个匹配：提示"无匹配账号"
- 1 个匹配：仍展示确认面板（首次使用某 App 时）
- 多个匹配：弹出账号选择器
- 提供"使用新账号登录"：自动按 host 创建 Station 与账号

### 4.9 Per-Station 代理（网络代理）

每个 Station 可独立配置网络代理（HTTP / SOCKS），bench 在该 Station 下所有 WebView 与 HTTP 探针请求时使用对应代理 URL：
- 代理 URL 构建：支持 `http://`、`https://`、`socks5://` 三种 scheme
- 鉴权：支持用户名 + 密码嵌入 URL（`socks5://user:pass@host:port`）
- 应用范围：WebView 网络请求、HTTP 探针、Session 捕获

适用场景：访问需要走特定代理才能到达的内部站点、跨区域账号分流。

### 4.10 IndexedDB 导出

bench 支持将整个账号库（含 Station / 账号元数据 / 加密密码 / Session 快照）导出为单一加密文件，便于：
- 跨设备迁移（搭配本地导入）
- 定期备份
- 故障恢复

**导出模式**：

| 模式 | 说明 |
|------|------|
| EncryptedFull | 完整导出，使用当前 keychain master key 重新加密；包含密码与 Session |
| Sanitized | 剥离所有密钥与 Session，仅保留元数据，便于分享或排错 |

**注意**：导出文件依赖本机 keyring master key 解密；跨设备迁移需配合未来云同步（BYO 主密码加密，见 design.md"未来规划"）。

### 4.11 安全设计要点

| 层面 | 措施 |
|------|------|
| 密码 | AES-256-GCM 加密，master_key 存于系统 keychain |
| Session | 与密码共用 master_key 加密；仅 Rust 层内存中可见，不暴露给前端 JS |
| 导出 | EncryptedFull 用当前 keychain 重加密；Sanitized 剥离所有密钥 |
| Ephemeral | 密码不存储，session 仅存在于进程内存 |
| 退出 | RunEvent::ExitRequested 强制 flush 到磁盘 |
| 外部代理 | 不回传 token / cookie；外部 App 只收到自己的 callback |

## 5. 用户界面要点

### 5.1 信息架构

```
侧边栏
  ├── 📥 快速登录           ← Ephemeral 入口，始终可见
  ├── ─────────────
  ├── 📁 站点 A              ← Station 列表
  │     ├── 账号 1
  │     ├── 账号 2
  │     └── [+ 添加账号]
  ├── 📁 站点 B
  │     └── 账号 3
  └── [+ 新建站点]
```

### 5.2 Station 详情页

- 账户列表显示 session 状态指示灯（绿=Ready / 黄=LoginRequired / 红=Expired / 灰=Inactive）
- "全部刷新"按钮：对所有账户执行 L1 HTTP probe
- 右侧 AuthProfile 面板：可折叠，展示认证检测结果与探针策略
- 账号卡片：开启外部代理时显示 🔗 图标

### 5.3 快速登录入口

- 始终可见的顶部按钮或侧边栏首项
- 极简面板：URL + 用户名 + "打开登录"按钮
- 支持粘贴即用：检测剪贴板 URL 自动填充
- 历史记录：最近 5 个临时网站 URL 快速复用

### 5.4 AuthProfile 检测结果面板

面向技术用户的可视化展示：

```
┌─────────────────────────────────────┐
│ 🔍 认证检测结果                      │
│ 检测时间: 2026-06-30 10:45           │
│ 置信度: ████████░░ 82%               │
├─────────────────────────────────────┤
│ 📋 Cookie 认证     ✅ 已检测         │
│ 💾 Token 存储      localStorage     │
│ 🛡 CSRF 保护       已启用            │
│ 🔐 认证类型         Bearer OAuth2    │
│ 👆 设备指纹         基本级别          │
│ 🚫 反机器人         未检测            │
│ 🎯 当前探针策略     HTTP First       │
│    HTTP probe 成功率: 97% (28/29)   │
├─────────────────────────────────────┤
│ [🔄 重新检测]  [⚙ 手动切换策略 ▼]    │
└─────────────────────────────────────┘
```

## 6. 数据迁移与回滚

### 6.1 向前兼容

旧 `account-manager-store.json` 自动迁移到新模型：
- 自动填充 `account_type: "persistent"`（默认值）
- `website` 从 Station 继承
- `session` 在下次登录后填充
- 旧字段（phone / tgAccount / linkedAccount / inviteLink / loginMethods）保留在响应中向前兼容

### 6.2 回滚方案

新字段全部带 `#[serde(default)]`，旧版本读取新数据时自动忽略未知字段。降级只需回滚二进制，数据无损。

## 7. 未实现 / 未来规划

以下功能尚未实现，详见 [roadmap.md](./roadmap.md) 与 [design.md](./design.md) 的"未来规划"章节：

- **Session 状态/空态 UX**：TTL、探针结果、代理状态一眼可读
- **大列表虚拟化**：多站点 / 多账号场景性能优化
- **TLS 指纹对抗**：rquest impersonate
- **跨平台 WebView 兼容**：Windows / Linux
- **Canvas/WebGL 指纹隔离**
- **云端同步**：BYO Cloudflare Workers + R2，端到端加密，零知识架构
