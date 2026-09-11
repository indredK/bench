# Bench + 开源组合：指纹覆盖矩阵分析

> **评估对象**：Bench 当前架构 + Camoufox / BrowserForge / uTLS / curl-impersonate / CDP 注入组合方案
>
> **评估日期**：2026-09-12
>
> **前提**：Bench 存在两条浏览器轨道——① 内置 WKWebView（macOS Safari 引擎，登录窗口）；② 外部 Chromium（Chrome/Edge/Brave，CDP 托管会话）。以下分析分轨道评估。

---

## 目录

1. [Bench 现有能力基线](#1-bench-现有能力基线)
2. [组合方案架构](#2-组合方案架构)
3. [逐向量覆盖矩阵](#3-逐向量覆盖矩阵)
4. [不可覆盖的维度](#4-不可覆盖的维度)
5. [覆盖差距根因分析](#5-覆盖差距根因分析)
6. [推荐实施路径](#6-推荐实施路径)

---

## 1. Bench 现有能力基线

### 1.1 已具备的能力

| 能力                      | 实现位置                             | 机制                                    | 覆盖范围                                                   |
| ------------------------- | ------------------------------------ | --------------------------------------- | ---------------------------------------------------------- |
| 每账号独立 Profile        | `browser_session/profile.rs`         | `--user-data-dir` 隔离                  | Cookie / localStorage / IndexedDB / Cache / Service Worker |
| WKWebView Data Store 隔离 | `webview.rs`                         | `data_store_identifier`                 | Cookie / Storage（登录窗口侧）                             |
| 会话加密存储 (S1)         | `session_arbitration` + 加密 store   | AES 加密 + 仲裁写入                     | 会话数据隔离                                               |
| CDP Cookie 注入/采集      | `cdp.rs`                             | `Network.setCookie` / `getAllCookies`   | Cookie 读写（含 HttpOnly）                                 |
| CDP Storage 恢复          | `cdp.rs`                             | `Page.addScriptToEvaluateOnNewDocument` | localStorage / IndexedDB 恢复                              |
| UA 覆写（同引擎）         | `cdp.rs`                             | `Emulation.setUserAgentOverride`        | 仅 Chromium→Chromium 同引擎场景                            |
| Per-station 代理          | `network_proxy.rs`                   | `WebviewWindowBuilder::proxy_url`       | **仅 WKWebView 窗口**，Chromium 实例未接代理               |
| 扩展桥通道                | `browser_ext/` + `browser_bridge.rs` | loopback HTTP + bench-companion 扩展    | Cookie/Storage 读写用户日常浏览器                          |
| 登录态指纹                | `fingerprint.rs`                     | Cookie 特征 + Storage 键名              | 登录态判定（非反追踪）                                     |

### 1.2 明确缺失的能力

| 缺失项                             | 影响                         |
| ---------------------------------- | ---------------------------- |
| Canvas/WebGL/AudioContext 噪声注入 | 渲染层指纹完全暴露           |
| 字体列表控制                       | OS 字体集直接暴露            |
| TLS 指纹匹配                       | JA3/JA4 暴露真实客户端       |
| HTTP/2 指纹匹配                    | HTTP/2 帧参数暴露            |
| TCP 协议栈参数控制                 | TTL 等暴露真实 OS            |
| WebRTC IP 泄露防护                 | 真实 IP 可能暴露             |
| DNS 泄露防护                       | DNS 可能走本地解析器         |
| 硬件参数伪装（CPU/GPU/屏幕/内存）  | 真实硬件信息暴露             |
| 时区/语言与代理 IP 匹配            | 时区可能与 IP 不匹配         |
| 行为模拟                           | 鼠标/键盘/滚动模式暴露自动化 |
| Chromium 启动代理注入              | 托管浏览器流量不走代理       |
| 指纹一致性校验引擎                 | 各参数可能互相矛盾           |

---

## 2. 组合方案架构

### 2.1 双轨改造方案

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Bench 多身份指纹架构                              │
│                                                                         │
│  ┌─────────────────────── 轨道 A：WKWebView 登录窗口 ─────────────────┐  │
│  │                                                                  │  │
│  │  BrowserForge ──→ 生成指纹 Profile JSON                           │  │
│  │       │                                                          │  │
│  │       ├──→ UA / 时区 / 语言 ──→ WKWebView 配置                    │  │
│  │       ├──→ 代理 URL ──→ WebviewWindowBuilder::proxy_url           │  │
│  │       └──→ Canvas/WebGL 噪声 ──→ JS init script 注入              │  │
│  │           (JS 层，能被检测但覆盖基础场景)                           │  │
│  │                                                                  │  │
│  │  ❌ 无法覆盖：TLS/JA3、HTTP/2、TCP 栈、WebRTC（WKWebView 限制）    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────── 轨道 B：CDP 托管 Chromium ──────────────────┐  │
│  │                                                                  │  │
│  │  BrowserForge ──→ 生成完整指纹 Profile JSON                       │  │
│  │       │                                                          │  │
│  │       ├──→ UA / 时区 / 语言 / 屏幕 ──→ CDP Emulation + 启动参数    │  │
│  │       ├──→ Canvas/WebGL/Audio 噪声 ──→ CDP addScriptToEvaluate    │  │
│  │       ├──→ 字体列表 ──→ CDP font 策略 + JS 拦截                    │  │
│  │       ├──→ 硬件参数 ──→ JS Navigator 属性覆写                      │  │
│  │       ├──→ WebRTC ──→ Chrome 启动参数强制代理                     │  │
│  │       ├──→ 代理 ──→ --proxy-server 启动参数                        │  │
│  │       └──→ TLS/HTTP2 ──→ ❌ 无法覆盖（Chromium 内置 TLS 栈）       │  │
│  │                                                                  │  │
│  │  ❌ 无法覆盖：TLS/JA3、HTTP/2 帧、TCP 栈（需内核补丁）               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────────── 轨道 C：Rust 后端 HTTP ────────────────────┐  │
│  │                                                                  │  │
│  │  uTLS (Rust FFI) / curl-impersonate (子进程)                      │  │
│  │       └──→ TLS/JA3 + HTTP/2 指纹匹配                              │  │
│  │           (仅后端直发 HTTP 请求，不经过浏览器渲染)                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 各工具的接入点

| 工具                                       | 接入点                           | 覆盖轨道    | 作用                                                  |
| ------------------------------------------ | -------------------------------- | ----------- | ----------------------------------------------------- |
| **BrowserForge**                           | Rust 后端调用，生成 JSON profile | A + B       | 指纹参数生成 + 硬件一致性校验                         |
| **CDP `addScriptToEvaluateOnNewDocument`** | 已有 `cdp.rs` 扩展               | B           | Canvas/WebGL/Audio/Navigator/Font JS 层覆写           |
| **CDP `Emulation.*`**                      | 已有 `cdp.rs` 扩展               | B           | UA / 时区 / 语言 / 屏幕 / Viewport 覆写               |
| **Chrome 启动参数**                        | `profile.rs spawn_browser` 扩展  | B           | `--proxy-server` / WebRTC 禁用 / `--disable-features` |
| **uTLS**                                   | Rust 后端 FFI 或子进程           | C（仅后端） | TLS ClientHello 模拟                                  |
| **curl-impersonate**                       | Rust 后端子进程调用              | C（仅后端） | TLS + HTTP/2 完整模拟                                 |
| **Camoufox**                               | ❌ 无法直接集成                  | —           | 基于Firefox C++补丁，与Bench架构不兼容                |

---

## 3. 逐向量覆盖矩阵

### 3.1 网络层

| 向量                         | Bench 现状                      | +组合后覆盖 | 覆盖轨道                                                              | 方案                                                                                                                                                                | 残余风险 |
| ---------------------------- | ------------------------------- | ----------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **公网 IP**                  | WKWebView 走代理；Chromium 不走 | ✅ A+B      | A: `proxy_url`；B: `--proxy-server` 启动参数                          | 代理类型未校验（可能用数据中心 IP）                                                                                                                                 |
| **IP 类型（住宅/数据中心）** | ❌ 无校验                       | ⚠️ 部分     | 需接入 IP 信誉 API 校验                                               | 需用户自备住宅代理池                                                                                                                                                |
| **IP 地理位置**              | ❌ 不检测                       | ⚠️ 部分     | 需接入 GeoIP API → 自动匹配时区/语言                                  | 用户可能配错                                                                                                                                                        |
| **TLS JA3/JA4**              | ❌ 完全暴露                     | ❌ 不可覆盖 | —                                                                     | **Chromium 内置 BoringSSL，无法从外部修改 ClientHello**。CDP 不暴露 TLS 层控制。uTLS/curl-impersonate 仅能用于 Rust 后端直发请求，不能影响浏览器渲染引擎的 TLS 握手 |
| **HTTP/2 指纹**              | ❌ 完全暴露                     | ❌ 不可覆盖 | —                                                                     | 同上。HTTP/2 SETTINGS 帧由 Chromium 网络栈生成，CDP 无法修改                                                                                                        |
| **TCP 协议栈（TTL 等）**     | ❌ 完全暴露                     | ❌ 不可覆盖 | —                                                                     | TCP 参数由 OS 内核生成，应用层无法修改                                                                                                                              |
| **WebRTC IP 泄露**           | ❌ 未防护                       | ✅ B        | Chromium: `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` | WKWebView 侧无法控制（Apple 限制）                                                                                                                                  |
| **DNS 泄露**                 | ❌ 未防护                       | ⚠️ 部分     | Chromium: `--proxy-server` + `--host-resolver-rules`                  | WKWebView 侧无法控制 DNS 路由                                                                                                                                       |

**网络层覆盖统计**：9 项中 4 项可覆盖、2 项部分覆盖、**3 项不可覆盖**（TLS/HTTP2/TCP 是硬伤）

### 3.2 浏览器渲染层

| 向量               | Bench 现状 | +组合后覆盖 | 覆盖轨道                                                                                                      | 方案                                                                 | 残余风险 |
| ------------------ | ---------- | ----------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| **Canvas 指纹**    | ❌         | ✅ B / ⚠️ A | B: CDP `addScriptToEvaluate` 注入 `getContext('2d').getImageData` 拦截 + 一致性噪声；A: WKWebView init script | JS 层拦截可被属性描述符检测发现；不如 C++ 层拦截隐蔽                 |
| **WebGL 指纹**     | ❌         | ✅ B / ⚠️ A | B: CDP 注入覆写 `getParameter` / `getExtension` / `getExtension('WEBGL_debug_renderer_info')`；A: init script | 同上                                                                 |
| **AudioContext**   | ❌         | ✅ B / ⚠️ A | B: CDP 注入 `AudioContext.prototype.createOscillator` 等拦截                                                  | 同上                                                                 |
| **字体枚举**       | ❌         | ⚠️ 部分     | JS 层拦截 `document.fonts` / Canvas 文字测量；Chrome `--font-render-hinting` 参数                             | 无法完全阻止 side-channel 字体检测（测量渲染宽度的攻击 JS 拦截不住） |
| **CSS / 媒体查询** | ❌         | ⚠️ 部分     | CDP `Emulation.setEmulatedMedia` 控制部分媒体特征                                                             | 无法覆盖所有 CSS 特性检测                                            |

**渲染层覆盖统计**：5 项中 3 项可覆盖（B 轨道完整）、2 项部分覆盖。**关键限制：JS 层拦截不如 C++ 层隐蔽，高级检测（如 CreepJS）可发现拦截痕迹**。

### 3.3 硬件与操作系统层

| 向量                    | Bench 现状 | +组合后覆盖 | 覆盖轨道                                            | 方案                                        | 残余风险 |
| ----------------------- | ---------- | ----------- | --------------------------------------------------- | ------------------------------------------- | -------- |
| **屏幕分辨率/色深/DPR** | ❌         | ✅ B        | CDP `Emulation.setDeviceMetricsOverride`            | WKWebView 侧无法控制                        |
| **CPU 核心数**          | ❌         | ✅ B        | JS 覆写 `navigator.hardwareConcurrency`             | 属性描述符可被检测                          |
| **设备内存**            | ❌         | ✅ B        | JS 覆写 `navigator.deviceMemory`                    | 同上                                        |
| **GPU 型号（WebGL）**   | ❌         | ✅ B        | JS 覆写 WebGL 参数 + BrowserForge 生成真实 GPU 配置 | 需维护 GPU 型号数据库                       |
| **媒体设备 ID**         | ❌         | ⚠️ 部分     | JS 覆写 `navigator.mediaDevices.enumerateDevices`   | 设备 ID 格式需真实                          |
| **传感器**              | ❌         | ❌          | —                                                   | macOS 桌面无传感器，移动端不可控            |
| **机器 GUID / UUID**    | ❌         | ❌          | —                                                   | OS 级标识符，浏览器沙箱内不可访问也不可修改 |
| **磁盘序列号**          | ❌         | ❌          | —                                                   | 同上                                        |
| **MAC 地址**            | ❌         | ❌          | —                                                   | 同上                                        |
| **TPM 签名密钥**        | ❌         | ❌          | —                                                   | 硬件绑定，不可伪造                          |
| **BIOS UUID**           | ❌         | ❌          | —                                                   | 同上                                        |

**硬件层覆盖统计**：11 项中 4 项可覆盖、1 项部分覆盖、**6 项不可覆盖**（OS 级标识符）。但注意：这 6 项在浏览器沙箱内**通常不可被网站读取**，仅原生应用/移动端 App 可访问。对于 Bench 的场景（浏览器会话），这些不是直接暴露面。

### 3.4 浏览器元数据层

| 向量                          | Bench 现状    | +组合后覆盖 | 覆盖轨道                                                                                    | 方案                                    | 残余风险 |
| ----------------------------- | ------------- | ----------- | ------------------------------------------------------------------------------------------- | --------------------------------------- | -------- |
| **User-Agent**                | ⚠️ 同引擎覆写 | ✅ A+B      | A: WKWebView init script；B: CDP `Emulation.setUserAgentOverride` + `--user-agent` 启动参数 | 需与 BrowserForge 生成的 profile 一致   |
| **Accept-Language**           | ❌            | ✅ B / ⚠️ A | B: CDP `setUserAgentOverride.acceptLanguage`；A: init script                                | 需与代理 IP 地理位置匹配                |
| **时区**                      | ❌            | ✅ B        | B: CDP `Emulation.setTimezoneOverride` + Chrome `--timezone`                                | WKWebView 无法控制时区                  |
| **navigator.platform**        | ❌            | ✅ B        | JS 覆写                                                                                     | 需与 UA 一致                            |
| **navigator.languages**       | ❌            | ✅ B        | JS 覆写                                                                                     | 需与 Accept-Language 一致               |
| **navigator.plugins**         | ❌            | ✅ B        | JS 覆写（模拟 3-7 个插件）                                                                  | 插件列表需与浏览器版本匹配              |
| **navigator.webdriver**       | ❌            | ✅ B        | JS 覆写为 false + Chrome `--disable-blink-features=AutomationControlled`                    | CDP 连接本身可能留下痕迹                |
| **Sec-CH-UA**                 | ❌            | ✅ B        | CDP `setUserAgentOverride.userAgentMetadata`                                                | 需与 Chrome 版本一致                    |
| **window.chrome**             | ❌            | ✅ B        | JS 注入 `window.chrome` 对象                                                                | 需与 Chrome 版本匹配                    |
| **HTTP 头部顺序**             | ❌            | ❌          | —                                                                                           | Chromium 控制，CDP 无法修改头部排列顺序 |
| **JS 引擎特性（错误堆栈等）** | ❌            | ❌          | —                                                                                           | 引擎级特征，不可修改                    |
| **对象属性行为**              | ❌            | ❌          | —                                                                                           | `delete navigator.xxx` 的行为由引擎决定 |

**元数据层覆盖统计**：12 项中 8 项可覆盖、**4 项不可覆盖**（头部顺序、JS 引擎特性、对象属性行为）。这 4 项的残余风险较低——它们主要用于交叉验证而非独立识别。

### 3.5 持久化追踪

| 向量                         | Bench 现状 | +组合后覆盖 | 覆盖轨道                                    | 方案       | 残余风险 |
| ---------------------------- | ---------- | ----------- | ------------------------------------------- | ---------- | -------- |
| **Cookie / Session 隔离**    | ✅ 已实现  | ✅ A+B      | 已有：每账号独立 profile + data store       | —          |
| **localStorage / IndexedDB** | ✅ 已实现  | ✅ A+B      | 已有：独立 profile 隔离                     | —          |
| **ETag 缓存追踪**            | ❌         | ✅ A+B      | 每身份独立 profile → 独立缓存               | —          |
| **HSTS Super Cookie**        | ❌         | ⚠️ 部分     | 独立 profile 部分隔离，但 HSTS 可跨 profile | 需额外清理 |
| **window.name**              | ❌         | ✅ B        | JS init script 清空                         | —          |
| **Favicon 缓存**             | ❌         | ✅ A+B      | 独立 profile → 独立缓存                     | —          |

**持久化层覆盖统计**：6 项中 5 项可覆盖、1 项部分覆盖。Bench 的 per-account profile 隔离天然覆盖了大部分持久化追踪。

### 3.6 行为生物特征

| 向量             | Bench 现状 | +组合后覆盖 | 覆盖轨道                                           | 方案                     | 残余风险 |
| ---------------- | ---------- | ----------- | -------------------------------------------------- | ------------------------ | -------- |
| **鼠标移动轨迹** | ❌         | ⚠️ 部分     | B: CDP `Input.dispatchMouseEvent` + 贝塞尔曲线生成 | 合成轨迹可被训练模型区分 |
| **点击时序**     | ❌         | ⚠️ 部分     | 随机延迟 300-2000ms                                | 过于规律仍可被检测       |
| **滚动模式**     | ❌         | ⚠️ 部分     | CDP `Input.dispatchMouseWheelEvent` 模拟阅读       | —                        |
| **键盘输入节奏** | ❌         | ⚠️ 部分     | CDP `Input.dispatchKeyEvent` + 人类节奏分布        | —                        |
| **页面停留时间** | ❌         | ✅ B        | 导航间随机停留                                     | —                        |

**行为层覆盖统计**：5 项中 1 项可覆盖、4 项部分覆盖。行为模拟是"尽力而为"——训练有素的检测模型仍可区分合成行为。

### 3.7 跨层一致性

| 一致性检查            | Bench 现状 | +组合后覆盖 | 方案                                 |
| --------------------- | ---------- | ----------- | ------------------------------------ |
| OS ↔ UA ↔ platform    | ❌         | ✅          | BrowserForge 生成自洽 profile        |
| OS ↔ 字体列表         | ❌         | ✅          | 按 OS 模板筛选字体                   |
| OS ↔ Canvas 渲染引擎  | ❌         | ⚠️          | JS 拦截可模拟，但 C++ 层更可靠       |
| OS ↔ TCP TTL          | ❌         | ❌          | TCP 参数不可控                       |
| GPU ↔ Canvas/WebGL    | ❌         | ✅          | BrowserForge 生成匹配的 GPU+渲染参数 |
| IP 地理 ↔ 时区 ↔ 语言 | ❌         | ✅          | GeoIP API → 自动匹配时区/语言        |
| UA ↔ TLS/JA3          | ❌         | ❌          | TLS 不可控                           |
| UA ↔ HTTP/2 帧        | ❌         | ❌          | HTTP/2 不可控                        |
| UA ↔ window.chrome    | ❌         | ✅          | JS 注入匹配                          |

**一致性覆盖统计**：9 项中 6 项可覆盖、**3 项不可覆盖**（TCP TTL、TLS/JA3、HTTP/2）。这 3 项的不可覆盖意味着：**如果目标网站使用 Cloudflare 等 CDN 级检测，UA 声称 Chrome 但 JA3 不匹配 Chrome → 高风险标记**。

---

## 4. 不可覆盖的维度

### 4.1 硬限制（架构层面无法突破）

| #   | 不可覆盖维度                               | 根因                                                                                                                                             | 影响范围           | 风险等级                                  |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ----------------------------------------- |
| 1   | **TLS JA3/JA4 指纹**                       | Chromium 内置 BoringSSL TLS 栈，CDP 不暴露 TLS 层控制。uTLS/curl-impersonate 只能用于独立 HTTP 客户端，不能注入到已运行的浏览器进程的 TLS 握手中 | 所有浏览器流量     | 🔴 极高（Cloudflare 等 CDN 首选检测点）   |
| 2   | **HTTP/2 SETTINGS 帧指纹**                 | 同上，HTTP/2 帧由 Chromium 网络栈生成                                                                                                            | 所有 HTTPS 流量    | 🔴 高                                     |
| 3   | **TCP 协议栈参数（TTL/窗口大小）**         | OS 内核生成，应用层不可修改                                                                                                                      | 所有 TCP 连接      | 🟡 中（p0f 被动检测，不如 TLS 常用）      |
| 4   | **HTTP 头部顺序**                          | Chromium 控制 HTTP 头排列，CDP 无法修改                                                                                                          | 所有 HTTP 请求     | 🟡 中                                     |
| 5   | **JS 引擎特性差异**                        | V8 引擎内部行为（错误堆栈格式、GC 时序、JIT 行为），不可从 JS 层修改                                                                             | 所有 JS 执行       | 🟢 低（主要用于交叉验证）                 |
| 6   | **对象属性行为**                           | `delete navigator.xxx` / `navigator.xxx = value` 的行为由引擎决定                                                                                | Navigator 属性操作 | 🟢 低                                     |
| 7   | **OS 级标识符（GUID/MAC/磁盘序列号/TPM）** | 硬件/OS 级，浏览器沙箱外                                                                                                                         | 仅原生应用可读     | 🟢 低（浏览器场景下网站无法读取）         |
| 8   | **WKWebView 侧的 TLS/WebRTC/DNS 控制**     | Apple WKWebView API 不暴露这些控制                                                                                                               | 仅登录窗口轨道     | 🟡 中（取决于目标网站是否在登录阶段检测） |

### 4.2 软限制（可通过工程量覆盖但有残余风险）

| #   | 维度                        | 当前覆盖                | 残余风险                                                           | 提升路径                              |
| --- | --------------------------- | ----------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| 1   | **Canvas/WebGL/Audio 噪声** | JS 层拦截               | 属性描述符可被检测（`Object.getOwnPropertyDescriptor` 可发现覆写） | 需要 Chromium 内核补丁（C++ 层拦截）  |
| 2   | **字体枚举**                | JS 层拦截               | Side-channel 测量渲染宽度不受 JS 拦截影响                          | 需要 Chromium 字体策略补丁            |
| 3   | **行为模拟**                | CDP Input 事件合成      | 训练模型可区分合成轨迹                                             | 需要更高级的行为生成模型              |
| 4   | **Chromium 代理注入**       | 需新增 `--proxy-server` | 代理认证信息在 `--proxy-server` 中可见                             | 需要 `--proxy-pac-url` 或扩展代理认证 |
| 5   | **IP 信誉校验**             | 需接入第三方 API        | 用户可能使用数据中心 IP                                            | 需要 IP 信誉评分集成                  |

---

## 5. 覆盖差距根因分析

### 5.1 核心矛盾：CDP 的能力边界

```
Chromium 架构层级：

  ┌─────────────────────────────────────────────────────────────┐
  │  应用层（CDP 可控制）                                        │
  │  ├── Emulation（UA / 时区 / 屏幕 / 媒体）         ✅ 可覆盖   │
  │  ├── Page.addScriptToEvaluateOnNewDocument        ✅ 可覆盖   │
  │  ├── Network.setCookie / getAllCookies            ✅ 可覆盖   │
  │  ├── Input.dispatchMouseEvent / KeyEvent          ✅ 可覆盖   │
  │  └── Runtime.evaluate                             ✅ 可覆盖   │
  ├─────────────────────────────────────────────────────────────┤
  │  渲染层（JS 可拦截但可被检测）                                 │
  │  ├── Canvas.prototype.getImageData               ⚠️ JS 层    │
  │  ├── WebGLRenderingContext.prototype.getParameter ⚠️ JS 层   │
  │  ├── AudioContext.prototype.createOscillator     ⚠️ JS 层    │
  │  └── navigator.* 属性                            ⚠️ JS 层    │
  ├─────────────────────────────────────────────────────────────┤
  │  网络栈层（CDP 无法控制，需内核补丁）                          │
  │  ├── TLS ClientHello（BoringSSL）                ❌ 不可覆盖 │
  │  ├── HTTP/2 SETTINGS 帧                          ❌ 不可覆盖 │
  │  ├── HTTP 头部排列顺序                            ❌ 不可覆盖 │
  │  └── TCP 参数（OS 内核）                          ❌ 不可覆盖 │
  ├─────────────────────────────────────────────────────────────┤
  │  引擎层（不可修改）                                           │
  │  ├── V8 错误堆栈格式                              ❌ 不可覆盖 │
  │  ├── V8 GC 行为                                  ❌ 不可覆盖 │
  │  └── Blink 渲染管线内部行为                       ❌ 不可覆盖 │
  └─────────────────────────────────────────────────────────────┘
```

**结论**：CDP 能控制应用层，JS 能拦截渲染层（但有检测风险），但**网络栈层和引擎层必须修改 Chromium 源码**才能覆盖。

### 5.2 Camoufox 为什么能覆盖更多

Camoufox 修改了 Firefox 的 **C++ 源码**，在 `nsJSUtils`、`CanvasRenderingContext2D`、`WebGLContext` 等 C++ 实现层直接拦截返回值。这种方式：

- JS 检测不到属性描述符被修改（因为修改在 C++ 层，JS 看到的 `Object.getOwnPropertyDescriptor` 返回正常）
- 时序一致性更好（C++ 层拦截无额外 JS 执行开销）
- 但**仍然无法覆盖 TLS/HTTP2/TCP**——因为这些由 Firefox 的 NSS/Necko 网络栈控制，Camoufox 未修改网络栈

### 5.3 真正覆盖 TLS 的方案

只有两种方式能覆盖 TLS/HTTP2 指纹：

1. **修改 Chromium/Firefox 源码并编译自定义浏览器**（如 Camoufox 修改 Firefox C++ 层 + curl-impersonate 修改 curl 网络栈）
2. **使用本地 TLS 代理中间件**（如 mitmproxy + uTLS）：浏览器 → localhost 代理 → uTLS 重写 ClientHello → 目标服务器。但这引入了新的问题：本地代理的 TLS 证书需要被浏览器信任，且代理本身的行为可能被检测。

---

## 6. 推荐实施路径

### 6.1 Bench 组合方案覆盖率总表

| 层级     | 总向量数 | 可覆盖 | 部分覆盖 | 不可覆盖 | 覆盖率  |
| -------- | -------- | ------ | -------- | -------- | ------- |
| 网络层   | 9        | 4      | 2        | 3        | 56%     |
| 渲染层   | 5        | 3      | 2        | 0        | 80%     |
| 硬件层   | 11       | 4      | 1        | 6        | 41%     |
| 元数据层 | 12       | 8      | 0        | 4        | 67%     |
| 持久化层 | 6        | 5      | 1        | 0        | 92%     |
| 行为层   | 5        | 1      | 4        | 0        | 30%     |
| 一致性   | 9        | 6      | 0        | 3        | 67%     |
| **合计** | **57**   | **31** | **10**   | **16**   | **63%** |

> 注：硬件层的 6 项"不可覆盖"在浏览器场景下实际不会被网站读取，有效覆盖率更高。

### 6.2 按优先级排序的实施路径

#### P0：已有基础，快速集成（1-2 周）

| 步骤                                                              | 覆盖向量              | 工作量                  |
| ----------------------------------------------------------------- | --------------------- | ----------------------- |
| Chromium 启动参数注入 `--proxy-server`                            | 代理 IP               | 小（改 `profile.rs`）   |
| Chromium 启动参数 `--force-webrtc-ip-handling-policy`             | WebRTC 泄露           | 小                      |
| Chromium 启动参数 `--disable-blink-features=AutomationControlled` | navigator.webdriver   | 小                      |
| CDP `Emulation.setUserAgentOverride` 扩展 + Sec-CH-UA             | UA / 平台             | 中（已有基础）          |
| CDP `Emulation.setTimezoneOverride`                               | 时区                  | 小                      |
| BrowserForge 集成生成指纹 JSON                                    | 指纹参数生成 + 一致性 | 中（Rust FFI 或子进程） |
| GeoIP API → 自动匹配时区/语言                                     | IP-时区一致性         | 小                      |

#### P1：JS 层注入（2-4 周）

| 步骤                                                  | 覆盖向量       | 工作量 | 残余风险            |
| ----------------------------------------------------- | -------------- | ------ | ------------------- |
| Canvas `getImageData` 拦截 + 一致性噪声               | Canvas 指纹    | 中     | 属性描述符可被检测  |
| WebGL `getParameter` / `getExtension` 拦截            | WebGL 指纹     | 中     | 同上                |
| AudioContext 拦截 + 噪声                              | Audio 指纹     | 中     | 同上                |
| `navigator.hardwareConcurrency` / `deviceMemory` 覆写 | 硬件参数       | 小     | 同上                |
| `navigator.plugins` / `mimeTypes` 覆写                | 插件列表       | 小     | 同上                |
| `navigator.mediaDevices.enumerateDevices` 覆写        | 媒体设备 ID    | 小     | 同上                |
| 字体列表 JS 拦截                                      | 字体枚举       | 中     | Side-channel 不可防 |
| 行为模拟（CDP Input + 贝塞尔曲线）                    | 鼠标/键盘/滚动 | 大     | 合成行为可被区分    |

#### P2：网络栈层（需深度改造，1-3 月）

| 步骤                 | 覆盖向量    | 工作量 | 方案                             |
| -------------------- | ----------- | ------ | -------------------------------- |
| 本地 uTLS 代理中间件 | TLS JA3/JA4 | 极大   | Rust 实现 mitmproxy 式 TLS 重写  |
| HTTP/2 帧重写        | HTTP/2 指纹 | 极大   | 代理中间件层重写                 |
| DNS over HTTPS 强制  | DNS 泄露    | 中     | Chromium `--host-resolver-rules` |

#### P3：内核级改造（长期，可选）

| 步骤                                         | 覆盖向量   | 工作量 | 方案                                         |
| -------------------------------------------- | ---------- | ------ | -------------------------------------------- |
| Chromium C++ 补丁（Canvas/WebGL C++ 层拦截） | 渲染层升级 | 极大   | Fork Chromium，参考 Camoufox 的 C++ 拦截方式 |
| 自定义 TLS 栈                                | TLS/HTTP2  | 极大   | Fork Chromium BoringSSL，注入 uTLS 逻辑      |

### 6.3 最终覆盖预估

| 实施阶段                   | 覆盖率 | 能过的检测                                                |
| -------------------------- | ------ | --------------------------------------------------------- |
| **P0 完成**                | ~45%   | 基础网站（非 CDN 保护的）                                 |
| **P0 + P1 完成**           | ~75%   | 中等网站（BrowserLeaks / AmIUnique）                      |
| **P0 + P1 + P2 完成**      | ~90%   | 高级网站（Cloudflare 基础检测）                           |
| **P0 + P1 + P2 + P3 完成** | ~97%   | 企业级检测（DataDome / Akamai Bot Manager）               |
| **理论上限**               | ~97%   | TPM + OS 级标识符在浏览器场景下不可读，剩余 3% 为行为模型 |

---

## 7. 结论

### 7.1 核心发现

1. **Bench 的 per-account profile 隔离天然覆盖了持久化层（92%）**，这是已有架构的最大优势。

2. **CDP + JS 注入组合可覆盖渲染层和元数据层的大部分向量（67-80%）**，但 JS 层拦截的隐蔽性不如 C++ 层。

3. **网络栈层（TLS/HTTP2/TCP）是不可逾越的硬限制**——CDP 和 JS 都无法触及。这是 Bench 与 Camoufox 等内核级方案的根本差距。要突破此限制，要么 fork Chromium 源码（工作量极大），要么引入本地 TLS 代理中间件（架构复杂度高）。

4. **OS 级标识符虽不可覆盖，但在浏览器场景下网站无法读取**，实际风险极低。

5. **行为模拟只能"尽力而为"**——训练有素的检测模型仍可区分合成行为，但大多数网站不部署此级检测。

### 7.2 与 Camoufox 的关键差距

| 维度                    | Bench + CDP + JS    | Camoufox (C++ 层)            | 差距原因                       |
| ----------------------- | ------------------- | ---------------------------- | ------------------------------ |
| Canvas/WebGL 拦截隐蔽性 | JS 层可被检测       | C++ 层不可检测               | Camoufox 修改 Firefox 源码     |
| TLS 指纹                | ❌ 不可覆盖         | ❌ 不可覆盖                  | 两者都未修改网络栈             |
| HTTP/2 指纹             | ❌ 不可覆盖         | ❌ 不可覆盖                  | 同上                           |
| 一致性校验              | 需自建              | BrowserForge 内置            | Camoufox 深度集成 BrowserForge |
| 引擎覆盖                | Chromium (V8/Blink) | Firefox (SpiderMonkey/Gecko) | 不同引擎有不同检测特征         |

**关键认知**：即使 Camoufox 也不能覆盖 TLS/HTTP2/TCP。真正的"万能"方案不存在——**网络栈层是所有非内核补丁方案的共同盲区**。

---

> **文档版本**：v1.0 | **最后更新**：2026-09-12
