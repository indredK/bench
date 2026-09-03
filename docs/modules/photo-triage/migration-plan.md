# 照片筛选（Photo Triage）迁移方案

> **状态**：方案待确认，未开工。本文是迁移执行的唯一依据，确认后转为 `README.md` + `roadmap.md`。
> **来源项目**：`/Users/apple/KnowledgeBase/photo-triage/`（Python 独立桌面应用）
> **目标位置**：前端 `src/features/photo-triage/` · 后端 `src-tauri/src/photo_triage/`
> **定位**：Bench 2.0 序列之外的**旁路独立模块 1.0**（对齐 Network Probe 的 D-016 先例），不进 R00–R08 门禁。
> **平台**：**macOS-only**（Windows 隐藏导航，直达路由显示 unsupported）。

---

## 1. 结论：Python 全部转 Rust，不做 sidecar 保留

### 1.1 保留 Python 的代价

| 维度   | 代价                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 打包   | 需内嵌 Python 解释器 + 依赖，macOS 体积 +40MB 起；项目 `signingIdentity: "-"`，Python dylib 在 ad-hoc 签名下存在签名链风险             |
| 工程   | 后端目前 100% Rust，`pnpm verify` = `cargo fmt / clippy / test`。混入 Python 需新增独立 lint/test 链路，而 `.github` CI 无 Python 环境 |
| 运行时 | 现有 `server.py` 起常驻 HTTP server。进 Tauri 后需额外处理端口占用（现实现硬编码 8618–8637 轮询）、生命周期、CSP 放通 `connect-src`    |

### 1.2 重写成本被高估的部分

- **有效后端逻辑约 400 行**，真正的重活（HEIC 解码、视频转码）本来就是 `sips` / `ffmpeg` 子进程，Rust 侧只是 `std::process::Command`——项目已有 `caffeinate`、`osascript`、`sysctl`、`pmset` 同等写法。
- **依赖几乎无需新增**：遍历用 `walkdir`（已有）、稳定 ID 用 `md5`（已有）、JSON 用 `serde_json`（已有）、打包用 `zip`（已有）、并发用 `tokio`（已有）。
- **端点退化即减负**：15 个 HTTP 端点 → 15 个 `#[tauri::command]`，省掉路由解析、mimetype 推断、状态码、错误处理样板。

### 1.3 真实成本集中在前端

`triage.html` 共 1484 行（约 270 行内联 CSS + 约 1200 行原生 JS），需转为 React 组件树 + Tailwind + zustand。**这部分工作量与选 Python 还是 Rust 无关**，属于必付成本。

---

## 2. 已确认决策

| #   | 决策项       | 结论                               | 理由                                                                                                               |
| --- | ------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | 图片加载通道 | **asset 协议**（`convertFileSrc`） | WKWebView 原生解码 HEIC、原生播放 MOV，无序列化开销                                                                |
| 2   | ffmpeg       | **可选依赖 + 降级**                | 本机实测未安装 ffmpeg（`/usr/bin/sips`、`/usr/bin/qlmanage` 均在）。打包 sidecar 有 +80MB 体积与 LGPL/GPL 许可风险 |
| 3   | 平台范围     | **macOS-only**                     | 对齐 Clean Space / Hardware / System Settings；`sips` + `qlmanage` 系统自带，零外部依赖                            |

---

## 3. 现状清单

| 文件                              | 行数 | 职责                                                             | 处置                                           |
| --------------------------------- | ---- | ---------------------------------------------------------------- | ---------------------------------------------- |
| `scan.py`                         | 246  | 目录遍历、图/视频配对、稳定 ID、manifest 落盘                    | 重写为 `scan.rs`                               |
| `server.py`                       | 691  | HTTP handler，11 个端点，按需预览生成、并发闸门、inflight 去重   | 拆为 `commands.rs` + `preview.rs` + `state.rs` |
| `triage.html`                     | 1484 | 单文件 UI（欢迎页 + 筛选界面 + 预览 + 键盘操作）                 | 转为 React 组件树                              |
| `desktop/app.py`                  | 220  | 桌面入口，欢迎页流程、扫描进度、最近相册，4 个 `/api/app/*` 端点 | 逻辑并入前端 + `commands.rs`                   |
| `export.py`                       | 62   | 按留选导出原始文件，可选 zip                                     | 重写为 `export.rs`                             |
| `trash.py`                        | 106  | 移入废纸篓                                                       | 由 `trash` crate 取代，删除                    |
| `.build-venv/`、`dist/`、`build/` | —    | PyInstaller 产物                                                 | 随源项目一并归档，不迁入                       |

**实测环境**：`ffmpeg` 未安装 → 视频 4 秒预览片段在当前机器上实际走 `qlmanage` 静态封面回退。

---

## 4. 目标目录结构

```
src/features/photo-triage/
├── feature.tsx                       # 路由与侧边栏注册（desktopOnly, platforms:["macos"]）
├── page.tsx                          # 页面入口（欢迎页 / 筛选界面切换）
├── store.ts                          # zustand 状态
├── hooks/
│   ├── usePhotoTriageController.ts   # 业务编排
│   └── useKeyboardShortcuts.ts       # 留/删/导航快捷键
├── services/
│   ├── photo-triage.use-cases.ts     # 用例编排
│   └── photo-triage.repository.ts    # invoke 封装 + 双边类型契约
├── lib/
│   ├── pairing.ts                    # 稳定 ID 与配对（纯函数，可单测）
│   └── grouping.ts                   # 文件夹分组索引
├── components/
│   ├── WelcomePicker.tsx             # 选目录 / 继续上次
│   ├── TriageToolbar.tsx             # 筛选栏（全部/待定/留/删/已删）
│   ├── ThumbnailStrip.tsx            # 缩略图条（react-virtual）
│   ├── GroupIndexBar.tsx             # 分组索引条
│   ├── PreviewStage.tsx              # 大图 / 视频预览
│   └── ConfirmSheet.tsx              # 危险操作二次确认（对齐 clean-space）
└── __tests__/
    └── pairing.test.ts

src-tauri/src/photo_triage/
├── mod.rs
├── commands.rs      # 15 个 IPC 命令
├── types.rs         # PhotoItem / Manifest / ScanProgress / Capabilities
├── state.rs         # 扫描状态、取消标志、inflight 去重、并发闸门
├── scan.rs          # 遍历、配对、稳定 ID、manifest 原子落盘
├── preview.rs       # sips / ffmpeg 代理生成，令牌桶并发
├── ffmpeg.rs        # ffmpeg 探测与降级
├── trash_ops.rs     # 移入废纸篓 / 恢复 / 移动 / 清理空目录
└── export.rs        # 导出留选项（zip crate 已有）
```

**数据目录**：`~/Library/Application Support/com.bench.app/photo-triage/build-<md5(src)>/`，沿用现有「每相册独立构建目录」约定，保证跨会话续接与代理增量复用。

---

## 5. IPC 契约（15 个命令）

| Python 端点               | Tauri 命令                               | 说明                                     |
| ------------------------- | ---------------------------------------- | ---------------------------------------- |
| `POST /api/app/scan`      | `photo_triage_scan(src)`                 | 后台扫描，事件推进度                     |
| `GET /api/app/status`     | `photo_triage_scan_status()`             | 轮询兜底，主路径走事件                   |
| `GET /api/app/recent`     | `photo_triage_list_recent()`             | 最近 8 个相册                            |
| `POST /api/app/open`      | `photo_triage_open(src)`                 | 打开已有扫描结果                         |
| `POST /api/folder-dialog` | `photo_triage_pick_folder()`             | 改用 `tauri-plugin-dialog`               |
| —                         | `photo_triage_capabilities()`            | 新增：返回 `{ has_ffmpeg, ffmpeg_path }` |
| `GET /api/proxy-image`    | `photo_triage_ensure_proxy(id, "image")` | 返回本地路径，前端 `convertFileSrc`      |
| `GET /api/proxy-video`    | `photo_triage_ensure_proxy(id, "video")` | 无 ffmpeg 时返回封面路径                 |
| `GET /api/orig`           | `photo_triage_original_path(id)`         |                                          |
| `POST /api/trash`         | `photo_triage_trash(ids)`                | `trash` crate，可恢复                    |
| `POST /api/restore`       | `photo_triage_restore(ids)`              | 从废纸篓放回原位                         |
| `POST /api/move`          | `photo_triage_move(ids, dest)`           |                                          |
| `POST /api/reveal`        | `photo_triage_reveal(id)`                | Finder 中显示                            |
| `POST /api/prune`         | `photo_triage_prune()`                   | 清理清单中已失效条目                     |
| `GET /api/empty-dirs`     | `photo_triage_empty_dirs()`              |                                          |
| `DELETE /api/empty-dirs`  | `photo_triage_delete_empty_dirs(paths)`  |                                          |
| —                         | `photo_triage_export(ids, out, zip)`     | 原为 `export.py` 独立脚本                |

---

## 6. 关键技术点

### 6.1 asset 协议（决策 1）

三处改动：

1. `tauri.conf.json` → `app.security.assetProtocol`：
   ```json
   "assetProtocol": { "enable": true, "scope": ["$APPDATA/**"] }
   ```
2. `tauri.conf.json` → `app.security.csp` 的 `img-src` 与 `media-src` 追加 `asset: http://asset.localhost`。
3. 用户选定相册目录后，Rust 侧运行时放通：
   ```rust
   app.asset_protocol_scope().allow_directory(&src, true)?;
   ```

代理缓存目录位于 `$APPDATA` 下，天然在初始 scope 内；源目录按运行时授权，避免一次性放开整个 `$HOME`。

> 实施时需实测视频的 Range 请求支持情况；若 `media-src` 播放异常，回退为「封面 + 点击调起系统播放器」。

### 6.2 ffmpeg 降级（决策 2）

- 探测顺序：`PATH` → `/opt/homebrew/bin/ffmpeg` → `/usr/local/bin/ffmpeg`。
- 未找到时 `photo_triage_capabilities()` 返回 `has_ffmpeg: false`，前端在视频项上标注「未安装 ffmpeg，仅静态封面」。
- 保留 `qlmanage` 静态封面回退（与现网行为一致）。

### 6.3 macOS-only（决策 3）

- `feature.tsx`：`desktopOnly: true, platforms: ["macos"]`。
- Rust 侧 `#[cfg(target_os = "macos")]` 编译门控，非 macOS 返回 `unsupported`（对齐项目既有约定，**不得伪装为空结果成功**）。
- **不引入 `libheif`**：图片代理一律走 `sips`（系统自带，原生支持 HEIC→JPEG）。

### 6.4 并发与去重（沿用现有语义）

| Python 现状                | Rust 实现                                 |
| -------------------------- | ----------------------------------------- |
| `IMG_GATE = Semaphore(6)`  | `tokio::sync::Semaphore`                  |
| `VID_GATE = Semaphore(2)`  | `tokio::sync::Semaphore`                  |
| `INFLIGHT` 去重字典        | `Mutex<HashMap<(Kind, Id), Arc<Notify>>>` |
| 扫描期 `BUSY["scan"]` 闸门 | `AtomicBool` + 命令入口校验               |
| `write_json_atomic`        | 写 `.tmp` 后 `fs::rename`                 |

长任务进度走 **events + 可取消**（对齐 `net_probe` 既有模式）。

### 6.5 manifest 传输

现状前端一次性 `fetch` 整个 `manifest.json`。IPC 下万级条目 JSON 达数 MB，直接返回会阻塞渲染。

- 主方案：命令返回条目数组 + 前端 `@tanstack/react-virtual`（已有依赖）虚拟滚动。
- 备选：`photo_triage_list_items(offset, limit)` 分页拉取，首屏优先。

### 6.6 稳定 ID 保持不变

`md5(相对路径去扩展名)[:12]`——与 Python 版逐字节一致。已扫描过的相册可直接复用缓存目录与代理，**用户已做的留/删标记不丢失**。

### 6.7 新增依赖

| 依赖          | 用途             | 备注                                                  |
| ------------- | ---------------- | ----------------------------------------------------- |
| `trash = "5"` | 跨平台移入废纸篓 | **唯一必需新增**，取代 `trash.py` 手写 `~/.Trash`     |
| `rayon`       | 并行缩略图       | **不引入**，用 `tokio::sync::Semaphore`（tokio 已有） |

### 6.8 权限模型：三层"权限"，只有一层需要用户点

迁移后是否需要用户授权，取决于走哪条路径。三层必须分开看：

| 层                      | 含义               | Python 版                                  | Tauri v2                                  | 需要用户点吗                 |
| ----------------------- | ------------------ | ------------------------------------------ | ----------------------------------------- | ---------------------------- |
| **L1 应用内能力白名单** | 前端 JS 能调用什么 | `server.py` 里 11 个 `if/elif` 路由，隐式  | `capabilities` + `scope`，显式声明        | **否**（开发者声明）         |
| **L2 文件选择授权**     | 用户挑选目录       | AppleScript `choose folder`（NSOpenPanel） | `tauri-plugin-dialog`（同为 NSOpenPanel） | **否**（用户主动选择即授权） |
| **L3 macOS TCC**        | 静默访问受保护目录 | 需要                                       | 需要                                      | **是**                       |

**Python 版不弹窗的真正原因**（已核实源码）：

1. **主因** — 源目录由 `server.py::_choose_folder()` 经 `osascript` 调 `choose folder` 获得，即系统原生 **NSOpenPanel**。用户主动选择即视为授权，macOS 不下发 TCC 提示，也无需 `Info.plist` 声明。欢迎页首个按钮就是「选择照片目录…」，这条路径贯穿全程。
2. **次因** — 通过 `start.command` / `launch.sh` 启动，进程在终端下运行，继承终端已有的 TCC 授权。
3. **签名不是变量** — 已用 `codesign -dv` 核实：`dist/照片筛选.app` 与 Bench 产物**同为 ad-hoc 签名**（`Signature=adhoc`、`TeamIdentifier=not set`），两者在 TCC 面前地位相同。

**结论**：只要 Tauri 版坚持「用户主动选择目录」这条路径（`WelcomePicker` 走 `tauri-plugin-dialog`），**权限体验与 Python 版一致，零弹窗**。L1 的 capabilities 配置是开发者侧声明，不是用户授权，两者不可混淆。

**但需修复一处既有缺陷**：`src-tauri/Info.plist` 目前**没有任何 TCC usage description 键**。当用户走「继续上次进度」直接打开历史目录（不经对话框）时，会落到 L3，此时弹窗文案缺失——用户看到空白提示，无从判断该不该允许。必须在 P0 补齐：

```xml
<key>NSDesktopFolderUsageDescription</key>
<string>照片筛选需要访问你选择的桌面文件夹以读取照片与视频</string>
<key>NSDocumentsFolderUsageDescription</key>
<string>照片筛选需要访问你选择的文件夹以读取照片与视频</string>
<key>NSDownloadsFolderUsageDescription</key>
<string>照片筛选需要访问你选择的下载文件夹以读取照片与视频</string>
<key>NSRemovableVolumesUsageDescription</key>
<string>照片筛选需要访问你选择的外置磁盘以读取照片与视频</string>
```

**配套要求**：「继续上次进度」打开历史目录时，TCC 拒绝必须返回结构化错误并在前端提示，**不得静默失败**（对齐项目「不得伪装为空结果成功」约定）。

---

## 7. 实施阶段

| 阶段   | 内容                                                                                                                                      | 完成判据                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **P0** | 目录骨架 + feature 注册 + i18n 键（`sidebar.photoTriage`、`photoTriage.*`，en/zh 双语）+ `Info.plist` 补 TCC usage description（见 §6.8） | `pnpm build:fe` 与 `cargo check` 通过，侧边栏出现条目             |
| **P1** | `scan.rs` + `types.rs` + `state.rs`；`photo_triage_scan` / `_open` / `_list_recent` / `_scan_status`                                      | `cargo test` 覆盖配对逻辑与稳定 ID；对真实相册目录扫描出 manifest |
| **P2** | `preview.rs` + `ffmpeg.rs`；asset 协议配置放通；`_ensure_proxy` / `_capabilities`                                                         | 前端能渲染 HEIC 缩略图；无 ffmpeg 时视频显示静态封面              |
| **P3** | 前端 React 化：`WelcomePicker` → `ThumbnailStrip` + `GroupIndexBar` + `PreviewStage`                                                      | 可浏览、可筛选、可键盘操作                                        |
| **P4** | 操作闭环：`_trash` / `_restore` / `_move` / `_reveal` / `_prune` / `_empty_dirs` / `_export`                                              | 删除进系统废纸篓且可恢复；导出文件与源一致                        |
| **P5** | 文档（`README.md` + `roadmap.md`）+ `check:i18n` + `pnpm verify` 全绿                                                                     | 格式化、lint、前后端测试、debug 构建均通过                        |

---

## 8. 风险与红线

| 风险                   | 处置                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| **误删照片**（不可逆） | 一律走系统废纸篓，禁止 `fs::remove_file`；批量删除强制二次确认对话框，显示条目数与释放空间 |
| 源目录只读 / 权限不足  | 命令返回结构化错误，前端提示，不静默失败                                                   |
| 超大相册（万级条目）   | 虚拟滚动 + 分页兜底；扫描进度可取消                                                        |
| asset 协议视频播放异常 | 回退「静态封面 + 系统播放器打开」                                                          |
| 长任务阻塞             | 全部走 `spawn_blocking` / 异步，进度走事件                                                 |
| 与 Python 版行为漂移   | 稳定 ID 与 manifest 结构保持一致，可交叉比对                                               |

**沿用全局停止条件**（`ROADMAP.md`）：数据损坏、错误删除、能力 fail-open —— 任一触发即停止，不得继续下一阶段。

---

## 9. 验收清单

- [ ] 对含 HEIC + MOV 的真实相册目录完成扫描，配对正确（Live Photo 识别为 `live`）
- [ ] 缩略图按需生成，滚动流畅，重复浏览零重复生成
- [ ] 删除项进入废纸篓，可在原位置恢复
- [ ] 导出留选项，文件字节与源一致
- [ ] 无 ffmpeg 环境下功能降级但不报错
- [ ] 已有 Python 版扫描结果可直接复用，标记不丢失
- [ ] `pnpm verify` 全绿（fmt / lint / 前后端测试 / debug 构建）
- [ ] `docs/modules/photo-triage/README.md` + `roadmap.md` 就位

---

## 10. 源项目处置

迁移完成后，`/Users/apple/KnowledgeBase/photo-triage/` 归档至 `03-归档/`，不留双份活跃代码。
