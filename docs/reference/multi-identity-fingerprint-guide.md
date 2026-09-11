# 多身份私有环境构建指南：全维度指纹隔离与变量控制

> **目标**：构建可批量生产的完全私有环境，使互联网上的每个身份在所有机器看来都是不同的设备/用户。
>
> **核心原则**：不是"每一项都随机"，而是"每个身份一套完整、自洽、与 IP 地理位置匹配的指纹"。单点伪装比不伪装更显眼——检测系统专门做交叉矛盾检测。

---

## 目录

1. [追踪向量全景表](#1-追踪向量全景表)
2. [网络层指纹](#2-网络层指纹)
3. [浏览器渲染层指纹](#3-浏览器渲染层指纹高熵核心)
4. [硬件与操作系统层指纹](#4-硬件与操作系统层指纹)
5. [浏览器元数据层](#5-浏览器元数据层)
6. [持久化追踪](#6-持久化追踪)
7. [行为生物特征](#7-行为生物特征)
8. [跨层一致性矩阵](#8-跨层一致性矩阵关键)
9. [批量生产：变量随机化策略](#9-批量生产变量随机化策略)
10. [验证工具清单](#10-验证工具清单)
11. [常见致命错误](#11-常见致命错误)

---

## 1. 追踪向量全景表

| 层级         | 向量数  | 识别力 | 模拟难度 | 说明                                   |
| ------------ | ------- | ------ | -------- | -------------------------------------- |
| 网络协议层   | 8+      | 极高   | 高       | IP / TLS / HTTP/2 / TCP / DNS / WebRTC |
| 浏览器渲染层 | 6+      | 极高   | 极高     | Canvas / WebGL / Audio / Fonts         |
| 硬件层       | 10+     | 高     | 极高     | GPU / CPU / 屏幕 / 媒体设备            |
| 浏览器元数据 | 15+     | 中高   | 中       | UA / 时区 / 语言 / 插件 / 屏幕         |
| 操作系统层   | 8+      | 高     | 极高     | 机器码 / MAC / 磁盘序列号 / BIOS UUID  |
| 持久化追踪   | 10+     | 中     | 中       | Evercookie / HSTS / ETag / Cache       |
| 行为特征     | 5+      | 中高   | 高       | 鼠标轨迹 / 键盘节奏 / 滚动模式         |
| **合计**     | **60+** | —      | —        | 检测系统综合评分，通常取 40-60 个信号  |

> **关键认知**：单个向量不致命，识别力来源于**组合**。屏幕分辨率对应几百万人，但"此分辨率 + 这套字体 + 此 Canvas 哈希 + 此时区"叠加后能对上的人可能只剩你一个。研究表明 85-99% 的用户可被指纹唯一识别。

---

## 2. 网络层指纹

### 2.1 IP 地址

| 数据点      | 说明                              | 随机化策略                                            |
| ----------- | --------------------------------- | ----------------------------------------------------- |
| 公网 IP     | 地理定位、ASN 运营商归属          | 每身份绑定独立住宅代理（residential proxy），禁止共用 |
| IP 类型     | 数据中心 IP vs 住宅 IP vs 移动 IP | 必须使用住宅或移动代理，数据中心 IP 是高危标记        |
| IP 地理位置 | 国家/城市/经纬度                  | 必须与浏览器时区、语言、Accept-Language 头完全匹配    |
| ASN 归属    | 运营商信息                        | 不同身份使用不同 ASN 的代理出口                       |
| IPv4/IPv6   | 协议栈类型                        | 保持一致，不要一个身份 IPv4 另一个 IPv6               |

### 2.2 TLS 指纹（JA3 / JA4）

| 数据点       | 说明                                                       | 随机化策略                                                               |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| JA3 指纹     | TLS ClientHello 的 MD5 哈希（加密套件+扩展+曲线+EC点格式） | 必须匹配目标浏览器真实指纹，使用 uTLS / curl-impersonate                 |
| JA4 指纹     | 2023 年新版，支持 TLS+HTTP+TCP+UDP 多协议                  | 需同时匹配 JA4_H（HTTP 客户端指纹）                                      |
| JA4S         | 服务端响应指纹                                             | 不需要控制（服务端决定）                                                 |
| JA4H         | HTTP 客户端指纹（方法+头部+Cookie 格式）                   | 必须与 UA 声称的浏览器一致                                               |
| 加密套件列表 | 支持的密码套件组合                                         | 不同浏览器版本有不同的套件列表，不能自行拼凑                             |
| 扩展顺序     | TLS 扩展的排列顺序                                         | Chrome 2023 起随机化扩展顺序以对抗 JA3；必须使用与目标版本完全一致的行为 |
| ALPN         | 应用层协议协商（h2, http/1.1）                             | 必须与浏览器默认行为一致                                                 |
| SNI          | 服务器名称指示                                             | 正常发送，不能隐藏（隐藏本身是异常信号）                                 |

> **关键**：TLS 指纹在握手阶段就已完成计算，**先于任何 HTTP 请求或 JavaScript 执行**。Cloudflare 等在 TLS 握手时就已经完成机器人评分。浏览器扩展无法修改 TLS 指纹。

### 2.3 HTTP/2 指纹

| 数据点          | 说明                                                      | 随机化策略                         |
| --------------- | --------------------------------------------------------- | ---------------------------------- |
| SETTINGS 帧参数 | HEADER_TABLE_SIZE, ENABLE_PUSH, MAX_CONCURRENT_STREAMS 等 | 必须匹配目标浏览器的 HTTP/2 实现   |
| 伪头部顺序      | :method, :authority, :scheme, :path 的排列                | Chrome/Firefox/Safari 各有固定顺序 |
| 窗口大小        | 连接级和流级流控窗口                                      | 不同浏览器有不同默认值             |
| 优先级树        | HTTP/2 流优先级结构                                       | 必须匹配目标浏览器行为             |

> **交叉检测**：Chrome 的 JA4 但 Go 的 HTTP/2 帧排序 = 高度可疑。检测系统专门做 TLS 与 HTTP/2 的一致性校验。

### 2.4 TCP/IP 协议栈指纹

| 数据点            | 说明                                   | 随机化策略                   |
| ----------------- | -------------------------------------- | ---------------------------- |
| 初始 TTL          | Linux: 64, Windows: 128, macOS: 64     | 必须与 UA 声称的操作系统匹配 |
| TCP 窗口大小      | 默认窗口大小因 OS 而异                 | 同上                         |
| TCP 选项顺序      | MSS, SACK, Window Scale, Timestamps 等 | 同上                         |
| IP ID 序列        | IP 标识符生成模式                      | 同上                         |
| Don't Fragment 位 | DF 位设置行为                          | 同上                         |
| MSS               | 最大分段大小                           | 同上                         |

> **工具**：p0f 可被动检测操作系统，即使通过 VPN 也能识别——因为 TCP 参数来源于源操作系统内核，VPN 不改变这些值。

### 2.5 WebRTC 泄露

| 数据点             | 说明                              | 随机化策略                                     |
| ------------------ | --------------------------------- | ---------------------------------------------- |
| 本地 IP（内网）    | ICE 收集的 host candidate         | 禁用 WebRTC 或强制仅使用代理 IP 作为 candidate |
| 公网 IP（真实）    | STUN 服务器返回的 srflx candidate | **最致命泄露**：代理在此完全无效               |
| ICE candidate 类型 | host / srflx / relay              | 应仅出现 relay（代理中继）类型                 |

> **致命性**：WebRTC 是"代理白挂"的头号原因。即使用户 IP 显示为代理地址，WebRTC 可能直接暴露真实 IP。

### 2.6 DNS 指纹

| 数据点        | 说明                      | 随机化策略                          |
| ------------- | ------------------------- | ----------------------------------- |
| DNS 服务器 IP | 解析请求发往的 DNS 服务器 | 应与代理 IP 地理位置匹配的 DNS      |
| DNS 解析路径  | 递归解析的中间节点        | 避免使用与身份地理不一致的 DNS 节点 |
| DNS 缓存时序  | 缓存命中/未命中的时间差   | 可用于判断用户是否之前访问过某域名  |

---

## 3. 浏览器渲染层指纹（高熵核心）

> 这是区分设备的关键层，模拟难度极大——因为需要复刻硬件物理层面的固有偏差。

### 3.1 Canvas 指纹

| 数据点       | 说明                                               | 随机化策略                                               |
| ------------ | -------------------------------------------------- | -------------------------------------------------------- |
| 渲染输出哈希 | HTML5 Canvas 绘制文字/图形的像素级结果             | 注入**一致性噪声**（per-profile 固定，非 per-call 随机） |
| 抗锯齿算法   | OS 级渲染引擎（DirectWrite/CoreText/FreeType）差异 | 必须与声称的 OS 一致                                     |
| 子像素渲染   | 字体子像素渲染方式                                 | 同上                                                     |
| 字体渲染引擎 | 操作系统决定的字体渲染管线                         | 同上                                                     |
| GPU 光栅化   | 硬件加速渲染路径的像素差异                         | 同上                                                     |

> **致命错误**：per-call 随机噪声比固定指纹更可疑——同一会话内多次绘制结果不同 = 高风险标记。每个身份的 Canvas 噪声必须在**整个生命周期内保持一致**。

### 3.2 WebGL 指纹

| 数据点           | 说明                                                                       | 随机化策略                   |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------- |
| GPU 厂商字符串   | `UNMASKED_VENDOR_WEBGL`（如 "Google Inc." / "Intel" / "NVIDIA"）           | 替换为与目标硬件配置匹配的值 |
| GPU 渲染器字符串 | `UNMASKED_RENDERER_WEBGL`（如 "ANGLE (Intel, Intel(R) UHD Graphics 630)"） | 必须使用真实存在的 GPU 型号  |
| 支持的扩展列表   | WebGL 扩展集合                                                             | 与 GPU 型号匹配              |
| 最大纹理大小     | `MAX_TEXTURE_SIZE`                                                         | 与 GPU 型号匹配              |
| 最大视口尺寸     | `MAX_VIEWPORT_DIMS`                                                        | 同上                         |
| 着色器精度格式   | 顶点/片元着色器的精度范围                                                  | 同上                         |
| 3D 渲染输出      | 实际渲染 3D 场景的像素差异                                                 | 注入一致性噪声               |

> **数据库匹配**：GPU 厂商+型号+驱动版本+OS 的组合必须是一个现实中真实存在的组合。不能出现"NVIDIA RTX 4090 + macOS"这种不存在的搭配。

### 3.3 AudioContext 指纹

| 数据点       | 说明                                                          | 随机化策略               |
| ------------ | ------------------------------------------------------------- | ------------------------ |
| 音频处理输出 | OscillatorNode → DynamicsCompressor → AnalyserNode 的浮点输出 | 注入微小的音频缓冲区噪声 |
| 采样率       | 音频采样率（如 44100, 48000 Hz）                              | 与目标声卡/驱动一致      |
| 输出延迟     | 音频处理管道延迟                                              | 同上                     |
| 音频编解码器 | 硬件音频编解码器信息                                          | 同上                     |

> 2020 年研究表明 AudioContext 指纹可识别 90%+ 的测试设备。

### 3.4 字体枚举

| 数据点           | 说明                                   | 随机化策略                                              |
| ---------------- | -------------------------------------- | ------------------------------------------------------- |
| 系统安装字体列表 | 通过 JS 侧信道（测量文本宽度差异）检测 | 按伪装的 OS 过滤字体列表                                |
| 字体渲染度量     | 字母边界框差异                         | 与 OS 字体渲染引擎一致                                  |
| 默认字体集       | Windows 默认字体 vs macOS 默认字体     | macOS 不能出现 Windows 独有字体（如 Calibri），反之亦然 |
| 额外安装字体     | 设计师电脑 vs 普通电脑差异巨大         | 控制字体数量在合理范围内                                |

> **交叉验证**：UA 声称是 macOS 但字体列表出现 Calibri（Windows 独有）= 高风险标记。

### 3.5 CSS / 媒体查询指纹

| 数据点        | 说明                                                | 随机化策略         |
| ------------- | --------------------------------------------------- | ------------------ |
| CSS 特性检测  | 浏览器支持的 CSS 属性差异                           | 与浏览器版本一致   |
| 媒体查询结果  | `prefers-color-scheme`, `prefers-reduced-motion` 等 | 设置合理的用户偏好 |
| pointer 类型  | `pointer: fine` (鼠标) / `coarse` (触摸)            | 与设备类型一致     |
| 暗色/亮色模式 | 系统主题设置                                        | 在合理范围内变化   |

---

## 4. 硬件与操作系统层指纹

### 4.1 屏幕与显示

| 数据点       | 说明                                     | 随机化策略                                                |
| ------------ | ---------------------------------------- | --------------------------------------------------------- |
| 屏幕分辨率   | `screen.width` × `screen.height`         | 从常见分辨率池中选择（1920x1080, 2560x1440, 1366x768 等） |
| 可用屏幕区域 | 去除任务栏后的可用区域                   | 与 OS 类型一致（Windows 底部任务栏 vs macOS Dock）        |
| 色彩深度     | `screen.colorDepth`（24, 30, 48）        | 大多数用户为 24                                           |
| 设备像素比   | `devicePixelRatio`（1, 1.25, 1.5, 2, 3） | 与屏幕类型匹配（Retina=2, 普通=1）                        |
| 多显示器配置 | `screen.availWidth` vs `screen.width`    | 可选模拟多显示器，但要保持合理                            |
| 刷新率       | 显示器刷新率（60, 120, 144 Hz）          | 部分高级检测会读取                                        |
| HDR 支持     | `color-gamut: rec2020` 等                | 近年新增的检测点                                          |
| 缩放比例     | Windows 显示缩放（100%, 125%, 150%）     | 与分辨率和屏幕尺寸匹配                                    |

### 4.2 CPU 与内存

| 数据点          | 说明                                                     | 随机化策略                        |
| --------------- | -------------------------------------------------------- | --------------------------------- |
| 逻辑 CPU 核心数 | `navigator.hardwareConcurrency`                          | 从常见值池选择（4, 6, 8, 12, 16） |
| 设备内存        | `navigator.deviceMemory`（GB，离散值: 0.25/0.5/1/2/4/8） | 与设备档次匹配                    |
| CPU 架构        | UA 中的架构标识（x86, ARM, 等）                          | 与声称的设备一致                  |
| CPU 指令集      | SSE, AVX, NEON 等支持情况                                | 侧信道可检测，难于伪造            |

> **VM 检测**：虚拟机 CPU 核心数通常为偶数且固定，VMware 虚拟机在此处露出马脚。

### 4.3 媒体设备

| 数据点     | 说明                                        | 随机化策略                  |
| ---------- | ------------------------------------------- | --------------------------- |
| 摄像头列表 | `navigator.mediaDevices.enumerateDevices()` | 为每个身份生成不同的设备 ID |
| 麦克风列表 | 同上                                        | 同上                        |
| 扬声器列表 | 同上                                        | 同上                        |
| 设备标签   | "FaceTime HD Camera", "Built-in Microphone" | 与声称的 OS 一致            |

### 4.4 传感器

| 数据点       | 说明                                                   | 随机化策略         |
| ------------ | ------------------------------------------------------ | ------------------ |
| 加速度计     | 运动传感器校准偏移（设备唯一）                         | 移动设备需模拟     |
| 陀螺仪       | 同上                                                   | 同上               |
| 电池状态 API | 电量百分比、充放电时间（已被多数浏览器移除但仍需关注） | 旧浏览器环境需处理 |

### 4.5 操作系统级标识符

> 以下标识符在浏览器中通常被沙箱限制，但**原生应用、浏览器扩展、移动端 App** 可以读取。

| 数据点          | Windows                                            | macOS                                                  | Linux                                           |
| --------------- | -------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| 机器 GUID       | `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid` | `ioreg -d2 -c IOPlatformExpertDevice` (IOPlatformUUID) | `/etc/machine-id` 或 `/var/lib/dbus/machine-id` |
| 磁盘序列号      | Volume Serial Number                               | `diskutil info`                                        | `blkid` / `/sys/class/block/*/serial`           |
| BIOS UUID       | WMI `Win32_ComputerSystemProduct.UUID`             | `ioreg` IOPlatformUUID                                 | DMI 表                                          |
| MAC 地址        | `ipconfig /all`                                    | `ifconfig`                                             | `ip link`                                       |
| TPM 签名密钥    | 硬件绑定，**不可伪造**                             | T2/M 芯片安全启动                                      | TPM 模块                                        |
| 主板序列号      | WMI                                                | `system_profiler`                                      | DMI                                             |
| Windows 产品 ID | 注册表                                             | —                                                      | —                                               |

> **TPM 签名密钥**是硬件级绑定，**理论上不可伪造**。这是最硬的设备标识符。

### 4.6 GPU 信息

| 数据点      | 说明                      | 随机化策略                |
| ----------- | ------------------------- | ------------------------- |
| GPU 型号    | 通过 WebGL 暴露           | 使用真实存在的 GPU 型号库 |
| 驱动版本    | 影响渲染输出              | 与 GPU 型号+OS 匹配       |
| 显存大小    | 部分 API 可推断           | 与 GPU 型号匹配           |
| 多 GPU 配置 | 笔记本双显卡（核显+独显） | 高级检测点                |

---

## 5. 浏览器元数据层

### 5.1 HTTP 头部

| 数据点             | 说明                        | 随机化策略                                     |
| ------------------ | --------------------------- | ---------------------------------------------- |
| User-Agent         | 浏览器名称+版本+OS+架构     | 必须是真实存在的 UA 字符串，版本要"新但不过新" |
| Accept-Language    | 语言偏好列表                | 必须与浏览器语言、时区、IP 地理位置匹配        |
| Accept             | 支持的 MIME 类型            | 与浏览器版本一致                               |
| Accept-Encoding    | 支持的压缩算法              | 与浏览器一致                                   |
| DNT (Do Not Track) | 是否请求不被追踪            | 设置为浏览器默认值（多数已废弃此头）           |
| Sec-CH-UA          | Client Hints（Chrome 特有） | 与 Chrome 版本一致                             |
| Sec-CH-UA-Platform | 操作系统提示                | 与 UA 一致                                     |
| Sec-CH-UA-Mobile   | 是否移动设备                | 与设备类型一致                                 |
| Sec-Fetch-*        | Fetch 元数据头              | 与浏览器版本一致                               |
| 头部顺序           | 各头的排列顺序              | 不同浏览器有不同顺序，JA4H 会检测              |

### 5.2 Navigator 对象

| 数据点                          | 说明                                          | 随机化策略                         |
| ------------------------------- | --------------------------------------------- | ---------------------------------- |
| `navigator.platform`            | 操作系统平台（Win32, MacIntel, Linux x86_64） | 与 UA 一致                         |
| `navigator.language`            | 浏览器语言                                    | 与 Accept-Language 一致            |
| `navigator.languages`           | 语言偏好数组                                  | 同上                               |
| `navigator.hardwareConcurrency` | CPU 核心数                                    | 从常见值池选择                     |
| `navigator.deviceMemory`        | 设备内存                                      | 从离散值池选择                     |
| `navigator.maxTouchPoints`      | 触摸点数量                                    | 桌面=0，移动/触摸屏=5-10           |
| `navigator.cookieEnabled`       | Cookie 是否启用                               | true                               |
| `navigator.webdriver`           | 是否被 WebDriver 控制                         | **必须为 false/undefined**         |
| `navigator.plugins`             | 插件列表                                      | 模拟真实浏览器的插件列表（3-7 个） |
| `navigator.mimeTypes`           | 支持的 MIME 类型                              | 与插件列表一致                     |
| `navigator.doNotTrack`          | DNT 设置                                      | 与浏览器默认一致                   |
| `navigator.connection`          | 网络连接信息（effectiveType, downlink, rtt）  | 与 IP 类型和网络环境匹配           |
| `navigator.userAgentData`       | User-Agent Client Hints（Chrome）             | 与 Sec-CH-UA 一致                  |
| `navigator.permissions`         | Permissions API 查询结果                      | 与浏览器版本一致                   |
| `navigator.storage`             | Storage 估算                                  | 返回合理的存储配额                 |
| `navigator.mediaCapabilities`   | 媒体编解码能力                                | 与 GPU/OS 一致                     |

### 5.3 时区与区域

| 数据点                                             | 说明                             | 随机化策略                                          |
| -------------------------------------------------- | -------------------------------- | --------------------------------------------------- |
| `Intl.DateTimeFormat().resolvedOptions().timeZone` | IANA 时区标识                    | 必须与 IP 地理位置匹配                              |
| 时区偏移                                           | `new Date().getTimezoneOffset()` | 同上                                                |
| `Intl` 区域设置                                    | 日期/数字/货币格式化             | 与语言和地区匹配                                    |
| 系统时钟精度                                       | `performance.now()` 精度         | 不同浏览器有不同精度（Chrome=0.005ms, Firefox=1ms） |

### 5.4 浏览器特性检测

| 数据点                    | 说明                             | 随机化策略                                            |
| ------------------------- | -------------------------------- | ----------------------------------------------------- |
| `window.chrome` 对象      | Chrome 特有对象                  | Chrome 必须存在，其他浏览器不应有                     |
| `window.chrome.runtime`   | 扩展运行时                       | 存在但不含扩展                                        |
| `window.opera`            | Opera 特有                       | 仅 Opera 有                                           |
| `window.safari`           | Safari 特有                      | 仅 Safari 有                                          |
| `Notification.permission` | 通知权限状态                     | 默认值                                                |
| `navigator.onLine`        | 在线状态                         | true                                                  |
| 浏览器内部对象            | `Reflect.ownKeys(window)` 的差异 | 与浏览器版本一致                                      |
| 错误堆栈格式              | 不同 JS 引擎的错误堆栈格式       | V8(Chrome) vs SpiderMonkey(Firefox) vs JSCore(Safari) |
| 对象属性删除行为          | `delete navigator.xxx` 的结果    | 不同浏览器有不同行为                                  |
| 对象属性重分配行为        | `navigator.xxx = value` 的结果   | 同上                                                  |

### 5.5 存储与会话

| 数据点                          | 说明                         | 随机化策略       |
| ------------------------------- | ---------------------------- | ---------------- |
| Cookie                          | HTTP Cookie + Session Cookie | 每身份完全隔离   |
| localStorage                    | 持久化存储                   | 每身份完全隔离   |
| sessionStorage                  | 会话级存储                   | 每身份完全隔离   |
| IndexedDB                       | 结构化大容量存储             | 每身份完全隔离   |
| Cache API / Service Worker      | 跨会话持久化                 | 每身份完全隔离   |
| WebSQL（已废弃）                | 旧版 SQL 存储                | 旧环境需处理     |
| SharedWorker / BroadcastChannel | 跨标签页通信                 | 确保不跨身份泄露 |

---

## 6. 持久化追踪

### 6.1 Evercookie（超级 Cookie）

| 存储位置          | 说明                                   | 清理策略         |
| ----------------- | -------------------------------------- | ---------------- |
| HTTP Cookie       | 标准 Cookie                            | 每身份隔离       |
| Flash LSO         | Flash 本地共享对象（已废弃但仍需关注） | 清除             |
| Silverlight 存储  | 类似 Flash（已废弃）                   | 清除             |
| localStorage      | 已列入 5.5                             | 隔离             |
| sessionStorage    | 已列入 5.5                             | 隔离             |
| IndexedDB         | 已列入 5.5                             | 隔离             |
| HTTP ETag         | 基于缓存的追踪                         | 每身份独立缓存   |
| HSTS Super Cookie | 通过子域编码比特位                     | 控制子域访问     |
| `window.name`     | 跨域持久化属性                         | 每导航清空       |
| Favicon Cache     | 网站图标缓存                           | 每身份独立缓存   |
| CSS 访问历史      | `:visited` 选择器泄露浏览历史          | 现代浏览器已限制 |

> Evercookie 将标识符存储在 10+ 个位置，如果用户清除了其中几处，仍能从其他位置恢复。跨浏览器传播也是可能的。

### 6.2 Cookie 同步

| 机制                          | 说明                                    | 防护策略                            |
| ----------------------------- | --------------------------------------- | ----------------------------------- |
| Cookie 同步（Cookie Syncing） | A 网站通过重定向将 Cookie 发送给 B 网站 | 隐藏真实身份需阻断同步链路          |
| Pixel tracking                | 1x1 透明图片追踪                        | 拦截已知追踪像素                    |
| Cookie 匹配                   | 广告网络间交换用户 ID                   | 不同身份不能有共享的广告网络 Cookie |

---

## 7. 行为生物特征

| 数据点       | 说明                                                         | 随机化策略                            |
| ------------ | ------------------------------------------------------------ | ------------------------------------- |
| 鼠标移动轨迹 | 路径曲率（贝塞尔曲线 vs 直线）、速度变化、微移动（自然手抖） | 使用 ghost-cursor 等库生成真实轨迹    |
| 点击时序     | 页面加载到首次交互时间、mousedown→mouseup 时间               | 添加 300-2000ms 随机延迟              |
| 点击坐标     | 过于居中 = 机器人                                            | 在目标元素范围内随机偏移              |
| 滚动模式     | 滚动到 100% 的匀速滚动 = 机器人                              | 模拟阅读：30%→停顿 2-8s→60%→停顿→更多 |
| 键盘输入节奏 | 按键间隔的时间分布                                           | 添加符合人类分布的随机延迟            |
| 页面停留时间 | 过短/过一致的停留时间                                        | 合理范围内随机化                      |
| 导航路径     | 直接访问深层页面 = 可疑                                      | 模拟自然的浏览路径（搜索→列表→详情）  |

> **行为一致性**：同一身份的行为模式应在多次会话中保持一定的统计一致性（人类用户有其习惯），但不同身份之间应有差异。

---

## 8. 跨层一致性矩阵（关键）

> **这是整个方案最核心的部分**。检测系统不是检查单个向量，而是检查所有向量之间是否自洽。

### 8.1 OS → 浏览器层一致性

| 检查项          | 一致性要求                                                                       |
| --------------- | -------------------------------------------------------------------------------- |
| UA 中的 OS      | ↔ `navigator.platform` ↔ `navigator.userAgentData.platform` ↔ Sec-CH-UA-Platform |
| OS 字体列表     | ↔ UA 声称的 OS（Windows 不能有 San Francisco，macOS 不能有 Calibri）             |
| OS 时区         | ↔ IP 地理位置 ↔ `Intl` 时区                                                      |
| TCP TTL         | ↔ UA 中的 OS（Windows=128, Linux/macOS=64）                                      |
| Canvas 渲染引擎 | ↔ OS（DirectWrite=Windows, CoreText=macOS, FreeType=Linux）                      |
| 浏览器特有对象  | ↔ UA 中的浏览器（`window.chrome` 仅 Chrome 有）                                  |
| 错误堆栈格式    | ↔ JS 引擎（V8/SpiderMonkey/JSCore）                                              |

### 8.2 硬件 → 渲染层一致性

| 检查项            | 一致性要求                                |
| ----------------- | ----------------------------------------- |
| GPU 型号（WebGL） | ↔ Canvas 渲染特征 ↔ 屏幕 DPI/分辨率档次   |
| CPU 核心数        | ↔ 设备性能档次（8 核不太可能配 2GB 内存） |
| 屏幕分辨率        | ↔ 设备类型（笔记本不太可能 4K+144Hz）     |
| 设备内存          | ↔ CPU 核心数 ↔ GPU 型号（整体配置自洽）   |

### 8.3 网络 → 地理层一致性

| 检查项          | 一致性要求                                             |
| --------------- | ------------------------------------------------------ |
| IP 地理位置国家 | ↔ 时区 ↔ 浏览器语言 ↔ Accept-Language                  |
| IP ASN 运营商   | ↔ 网络连接类型（`navigator.connection.effectiveType`） |
| WebRTC 本地 IP  | ↔ 网络段应与代理 IP 地理位置合理                       |
| DNS 解析延迟    | ↔ 与 IP 到 DNS 服务器的物理距离合理                    |

### 8.4 TLS → HTTP → 浏览器层一致性

| 检查项          | 一致性要求             |
| --------------- | ---------------------- |
| JA3/JA4 指纹    | ↔ UA 声称的浏览器+版本 |
| HTTP/2 SETTINGS | ↔ UA 声称的浏览器      |
| HTTP 头部顺序   | ↔ UA 声称的浏览器      |
| Sec-CH-UA 值    | ↔ UA 字符串            |
| 伪头部顺序      | ↔ 浏览器类型           |

### 8.5 时间 → 行为一致性

| 检查项       | 一致性要求                                          |
| ------------ | --------------------------------------------------- |
| 时区时间     | ↔ IP 地理位置（UTC+8 的 IP 不能报 UTC-5 的时间）    |
| 活跃时段     | ↔ IP 地理位置的本地时间（凌晨 3 点大量活动 = 可疑） |
| API 调用时间 | ↔ 真实浏览器应有自然的调用延迟（过快 = 自动化）     |

---

## 9. 批量生产：变量随机化策略

### 9.1 变量分类

| 变量类型                    | 特征                 | 随机化方式               |
| --------------------------- | -------------------- | ------------------------ |
| **固定变量**（per-profile） | 在身份生命周期内不变 | 创建时随机生成，永久绑定 |
| **会话变量**                | 每次会话可能变化     | 在合理范围内随机         |
| **请求变量**                | 每次请求变化         | 细粒度随机               |
| **禁止随机化变量**          | 随机化本身是异常信号 | 保持固定/真实值          |

### 9.2 固定变量（创建时生成，永久绑定）

```
每个身份生成时确定以下参数，写入配置文件，不再变更：

1. 操作系统模板（从预设池选择）
   - Windows 11 Pro / macOS 14 Sonoma / Ubuntu 22.04

2. 浏览器版本（从预设池选择）
   - Chrome 127 / Firefox 129 / Safari 17.5

3. 硬件配置模板（OS+GPU+CPU+RAM 组合必须自洽）
   - Windows + NVIDIA RTX 3060 + Intel i7-12700 + 32GB
   - macOS + Apple M2 Pro + 16GB
   - Windows + Intel UHD 630 + AMD Ryzen 5 + 16GB

4. 屏幕配置
   - 分辨率 + 色彩深度 + DPR（从与硬件模板匹配的池中选择）

5. Canvas/WebGL 噪声种子
   - 生成确定性噪声参数，在整个 profile 生命周期内一致

6. AudioContext 噪声种子
   - 同上

7. 字体列表
   - 基于选择的 OS 模板，添加/移除少量额外字体以增加差异性

8. 时区 + 语言
   - 基于分配的代理 IP 地理位置确定

9. 媒体设备 ID
   - 生成虚拟的摄像头/麦克风/扬声器设备 ID 列表

10. 浏览器插件列表
    - 从该浏览器版本的常见插件池中随机选择 3-7 个
```

### 9.3 会话变量（每次会话合理变化）

```
每次启动浏览器会话时随机变化：

1. 窗口尺寸（在屏幕分辨率范围内合理变化）
2. viewport 尺寸（与窗口尺寸+浏览器 chrome 尺寸匹配）
3. 行为参数种子（鼠标移动模式、延迟分布参数）
4. Cookie/Storage 初始状态（如果非首次会话，保留上次状态）
```

### 9.4 禁止随机化的变量

```
以下变量如果随机化，本身就会成为异常信号：

1. navigator.webdriver — 必须始终为 false/undefined
2. 同一会话内的 Canvas 输出 — 必须一致
3. 同一会话内的 WebGL 输出 — 必须一致
4. 同一会话内的 AudioContext 输出 — 必须一致
5. TLS 指纹 — 必须与浏览器版本精确匹配，不能随机
6. HTTP/2 帧参数 — 同上
7. TCP 参数 — 同上
8. DNT — 设为浏览器默认值，不要手动设
9. 禁用 JavaScript — 这本身就是极端异常信号
10. 安装过多隐私扩展 — CanvasBlocker 等本身是检测目标
```

### 9.5 硬件配置模板示例

```
# template_win11_mid.json
{
  "os": "Windows 11 Pro 23H2",
  "browser": "Chrome 127.0.6533.99",
  "cpu": {
    "model": "Intel Core i7-12700H",
    "cores_logical": 20,
    "cores_physical": 14
  },
  "gpu": {
    "vendor": "Google Inc. (Intel)",
    "renderer": "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, Intel Corporation 31.0.101.5762)"
  },
  "memory_gb": 16,
  "screen": {
    "resolution": [1920, 1080],
    "color_depth": 24,
    "device_pixel_ratio": 1.0,
    "scaling": 100
  },
  "fonts": [
    "Arial", "Arial Black", "Arial Narrow", "Bahnschrift", "Calibri",
    "Cambria", "Cambria Math", "Candara", "Comic Sans MS", "Consolas",
    "Constantia", "Corbel", "Courier New", "Ebrima", "Franklin Gothic Medium",
    "Gabriola", "Gadugi", "Georgia", "Impact", "Ink Free", "Javanese Text",
    "Leelawadee UI", "Lucida Console", "Lucida Sans Unicode", "MS Gothic",
    "MS PGothic", "MS Sans Serif", "MS Serif", "MS UI Gothic", "MV Boli",
    "Malgun Gothic", "Microsoft Himalaya", "Microsoft JhengHei",
    "Microsoft New Tai Lue", "Microsoft PhagsPa", "Microsoft Sans Serif",
    "Microsoft Tai Le", "Microsoft YaHei", "Microsoft Yi Baiti", "MingLiU-ExtB",
    "Mongolian Baiti", "Myanmar Text", "Nirmala UI", "Palatino Linotype",
    "Segoe Print", "Segoe Script", "Segoe UI", "Segoe UI Emoji",
    "Segoe UI Historic", "Segoe UI Symbol", "SimSun", "Sitka", "Sylfaen",
    "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana", "Webdings",
    "Wingdings", "Yu Gothic"
  ],
  "webgl_extensions": [
    "ANGLE_instanced_arrays", "EXT_blend_minmax", "EXT_color_buffer_half_float",
    "EXT_disjoint_timer_query", "EXT_float_blend", "EXT_frag_depth",
    "EXT_shader_texture_lod", "EXT_texture_compression_bptc",
    "EXT_texture_compression_rgtc", "EXT_texture_filter_anisotropic",
    "EXT_sRGB", "OES_element_index_uint", "OES_fbo_render_mipmap",
    "OES_standard_derivatives", "OES_texture_float",
    "OES_texture_float_linear", "OES_texture_half_float",
    "OES_texture_half_float_linear", "OES_vertex_array_object",
    "WEBGL_color_buffer_float", "WEBGL_compressed_texture_s3tc",
    "WEBGL_compressed_texture_s3tc_srgb", "WEBGL_debug_renderer_info",
    "WEBGL_debug_shaders", "WEBGL_depth_texture", "WEBGL_draw_buffers",
    "WEBGL_lose_context", "WEBGL_multi_draw"
  ],
  "plugins": [
    {"name": "PDF Viewer", "filename": "internal-pdf-viewer"},
    {"name": "Chrome PDF Viewer", "filename": "internal-pdf-viewer"},
    {"name": "Chromium PDF Viewer", "filename": "internal-pdf-viewer"},
    {"name": "Microsoft Edge PDF Viewer", "filename": "internal-pdf-viewer"},
    {"name": "WebKit built-in PDF", "filename": "internal-pdf-viewer"}
  ]
}
```

### 9.6 批量生成流程

```
1. 从硬件模板池中选择一个模板（确保与代理 IP 地理区域合理）
   ↓
2. 根据代理 IP 地理位置确定时区、语言、Accept-Language
   ↓
3. 基于模板生成确定性噪声种子（Canvas/WebGL/Audio）
   ↓
4. 生成虚拟媒体设备 ID 列表
   ↓
5. 从字体池中根据 OS 模板筛选字体，移除/添加 2-3 个以增加差异性
   ↓
6. 配置 TLS 指纹匹配目标浏览器版本
   ↓
7. 配置 HTTP/2 参数匹配目标浏览器版本
   ↓
8. 配置 TCP 参数匹配目标 OS
   ↓
9. 禁用/配置 WebRTC 为仅使用代理 IP
   ↓
10. 配置 DNS 为与代理 IP 地理位置匹配的 DNS 服务器
    ↓
11. 写入 profile 配置文件，分配唯一 ID
    ↓
12. 运行验证（见第 10 节）
```

---

## 10. 验证工具清单

| 工具                                            | 检测范围                                 | 用途                 |
| ----------------------------------------------- | ---------------------------------------- | -------------------- |
| **BrowserLeaks** (browserleaks.com)             | WebRTC, TLS, Canvas, WebGL, Fonts, JS 等 | 全面检测，技术导向   |
| **CreepJS** (abrahamjuliot.github.io/creepjs)   | 最详尽的指纹检测，含交叉矛盾检测         | 检测伪装的一致性     |
| **AmIUnique** (amiunique.org)                   | 指纹唯一性评分                           | 评估指纹的辨识度     |
| **Cover Your Tracks** (coveryourtracks.eff.org) | 隐私暴露评分                             | 快速评估             |
| **ToDetect** (todetect.com)                     | IP, WebRTC, Canvas, WebGL, 字体, 插件    | 可视化报告，风险高亮 |
| **FingerprintJS Demo** (fingerprint.com/demo)   | 商业级指纹检测                           | 对标行业标准         |
| **BrowserScan** (browserscan.net)               | 综合检测                                 | 中文友好             |
| **Whoer** (whoer.net)                           | 匿名度评分                               | 快速检查代理+指纹    |
| **p0f**                                         | TCP/IP 栈指纹                            | 验证 OS 层伪装       |
| **ssldev/curl-impersonate**                     | TLS 指纹验证                             | 验证 JA3/JA4 匹配    |

> **验证流程**：每个新身份创建后，**必须**在至少 3 个检测工具上跑一遍，确认无泄露、无矛盾。重点关注：Canvas 是否有噪声、WebGL 是否反映伪装硬件、WebRTC 是否泄露 IP、各参数之间是否一致。

---

## 11. 常见致命错误

| #   | 错误                                | 后果                                        | 正确做法                                |
| --- | ----------------------------------- | ------------------------------------------- | --------------------------------------- |
| 1   | 只改 UA，不改 Canvas/WebGL/字体     | UA 说 macOS，渲染特征是 Windows             | 所有向量必须同步修改                    |
| 2   | Canvas 噪声 per-call 随机           | 同一会话内 Canvas 输出不一致 = 高风险       | 噪声 per-profile 固定                   |
| 3   | 时区与 IP 不匹配                    | IP 在上海，时区是纽约                       | 时区必须与代理 IP 地理位置一致          |
| 4   | WebRTC 未禁用/未配置                | 代理白挂，真实 IP 泄露                      | 强制仅使用代理 IP 作为 ICE candidate    |
| 5   | 使用数据中心 IP                     | IP 类型本身就是标记                         | 使用住宅或移动代理                      |
| 6   | 多身份共用同一代理 IP               | IP 相同 = 关联判定成立                      | 每身份绑定独立代理                      |
| 7   | 禁用 JavaScript 防指纹              | "禁用 JS 的浏览器"本身是极端异常            | 保持 JS 启用，通过 API 层注入修改       |
| 8   | 安装隐私扩展（如 CanvasBlocker）    | 扩展本身改变指纹特征，且可被检测            | 使用浏览器内核级修改，不装扩展          |
| 9   | 虚拟机 GPU 渲染（Mesa/LLVMpipe）    | VM 渲染输出有特征性差异                     | 使用 GPU 直通或精准注入真实 GPU 输出    |
| 10  | TLS 指纹与 UA 不匹配                | UA 说 Chrome，JA3 是 Python requests        | 使用 uTLS/curl-impersonate 匹配浏览器   |
| 11  | HTTP/2 帧顺序与浏览器不匹配         | TLS 匹配但 HTTP/2 是 Go 标准库              | 完整复刻目标浏览器的网络栈行为          |
| 12  | GPU 型号与 OS 不匹配                | "NVIDIA RTX 4090 + macOS" 不存在            | 使用真实存在的硬件组合库                |
| 13  | CPU 核心数暗示虚拟机                | VMware 通常偶数固定核心                     | 选择合理的物理机 CPU 配置               |
| 14  | 浏览器版本过旧                      | "Chrome 80" 在 2025 年是异常                | 保持浏览器版本在主流版本 ±2 个版本内    |
| 15  | 行为过于一致                        | 每次点击都在页面加载后恰好 1000ms           | 使用符合人类分布的随机延迟              |
| 16  | `navigator.webdriver = true`        | 头号检测点，所有反爬系统必查                | 必须 patch 为 false/undefined           |
| 17  | `window.chrome` 缺失（Chrome 环境） | Chrome 必须有此对象                         | 确保 Chrome 环境的 `window.chrome` 完整 |
| 18  | 插件列表为空                        | `navigator.plugins.length === 0` = headless | 模拟 3-7 个真实插件                     |
| 19  | 多身份同时在线、时区相同            | 时间戳完全同步 = 同一台机器                 | 不同身份的时间戳应有微小偏移            |
| 20  | DNS 泄露到本地 DNS                  | 代理只代理 HTTP，DNS 直连                   | 使用 DNS over HTTPS 或通过代理隧道      |

---

## 附录 A：变量控制完整清单

### A.1 必须隔离（每身份独立）

- [ ] 代理 IP（住宅/移动）
- [ ] Cookie / Session
- [ ] localStorage / sessionStorage / IndexedDB
- [ ] Cache / Service Worker
- [ ] Canvas 噪声种子
- [ ] WebGL 参数（GPU 型号/扩展/精度）
- [ ] AudioContext 噪声种子
- [ ] User-Agent 字符串
- [ ] 浏览器语言 / Accept-Language
- [ ] 时区
- [ ] 屏幕分辨率 / 色彩深度 / DPR
- [ ] CPU 核心数 / 设备内存
- [ ] 字体列表
- [ ] 插件列表
- [ ] 媒体设备 ID
- [ ] TLS 指纹（JA3/JA4）
- [ ] HTTP/2 参数
- [ ] TCP 参数（TTL/窗口大小）
- [ ] DNS 服务器
- [ ] WebRTC 配置
- [ ] window.name
- [ ] Favicon 缓存
- [ ] ETag 缓存

### A.2 必须自洽（跨层一致）

- [ ] OS ↔ UA ↔ platform ↔ Sec-CH-UA-Platform
- [ ] OS ↔ 字体列表
- [ ] OS ↔ Canvas 渲染引擎
- [ ] OS ↔ TCP TTL
- [ ] GPU ↔ Canvas/WebGL 输出
- [ ] GPU ↔ 屏幕配置
- [ ] CPU ↔ 内存 ↔ GPU（整体配置自洽）
- [ ] IP 地理位置位置 ↔ 时区 ↔ 语言
- [ ] 浏览器版本 ↔ TLS 指纹 ↔ HTTP/2 参数
- [ ] UA ↔ window.chrome / window.safari 等特有对象
- [ ] UA ↔ JS 引擎特性（错误堆栈格式等）
- [ ] UA ↔ navigator.plugins
- [ ] 代理类型 ↔ navigator.connection.effectiveType
- [ ] DNS 服务器 ↔ IP 地理位置

### A.3 禁止随机化（固定值）

- [ ] navigator.webdriver = false/undefined
- [ ] 同一会话 Canvas/WebGL/Audio 输出
- [ ] TLS 加密套件列表（匹配浏览器版本）
- [ ] HTTP/2 SETTINGS 帧（匹配浏览器版本）
- [ ] TCP 参数（匹配 OS）
- [ ] DNT 值（使用浏览器默认）
- [ ] JavaScript 状态（必须启用）

---

## 附录 B：参考技术栈

| 组件              | 推荐方案                                   | 说明                       |
| ----------------- | ------------------------------------------ | -------------------------- |
| 反检测浏览器内核  | Chromium 修改版 / Playwright + stealth     | 在内核层面拦截 API 调用    |
| TLS 指纹匹配      | uTLS (Go) / curl-impersonate               | 精确复刻浏览器 ClientHello |
| HTTP/2 指纹匹配   | curl-impersonate / Chrome net stack        | 复刻浏览器 HTTP/2 帧       |
| 代理类型          | 住宅代理（Luminati/Brightdata/SmartProxy） | 避免数据中心 IP            |
| DNS               | DNS over HTTPS (DoH)                       | 避免 DNS 泄露              |
| WebRTC 控制       | 浏览器配置禁用 / ICE 强制代理              | 阻断真实 IP 泄露           |
| Canvas/WebGL 注入 | 内核级 API 拦截                            | 不能用扩展实现             |
| 行为模拟          | ghost-cursor / playwright-stealth          | 真实鼠标轨迹和行为         |
| 配置管理          | Profile as Code（版本控制的配置文件）      | 可复现、可批量生成         |
| 验证              | CreepJS + BrowserLeaks + AmIUnique         | 三重验证                   |

---

> **文档版本**：v1.0 | **最后更新**：2026-09-12
>
> **声明**：本文档仅供隐私研究、安全测试和多账号管理环境构建的技术参考。追踪与反追踪是持续的攻防博弈，检测算法不断演进，本文档的向量清单需要定期更新。
