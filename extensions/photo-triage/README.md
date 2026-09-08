# photo-triage · Bench Extension（bundled）

photo-triage 的插件化形态（[D-024](../../docs/DECISIONS.md)）。宿主经
`tauri://localhost/ext/photo-triage/…` 加载本目录产物，UI 在独立 WebView 渲染；
15 条 `photo_triage_*` Rust 命令**留在核心**，经 [ACL 网关](../../src-tauri/src/extension_host/acl.rs)
授权本插件调用（见 `manifest.json` 的 `acl.commands`）。

## 当前状态（P2 骨架）

- ✅ manifest schema v1 + ACL 声明
- ✅ 独立 bundle 加载（同源、IPC 可用）
- ✅ 能力面调用（`photo_triage_capabilities` / `photo_triage_scan_status`）
- ✅ 网关自检（调用注册表外命令被拒绝）
- ✅ **P2b（2026-09-08）**：完整 UI 迁移完成——`src/` 承载原 20 个文件（page/components/hooks/lib/services/store），独立 vite 构建产出 `assets/`（`pnpm run extensions:build`）；自带 i18n（`locales/{zh,en}.json`，photoTriage + common 命名空间）；主包侧边栏已移除静态注册，入口只剩插件中心。
- ⏳ P3：宿主语言偏好注入（当前跟随 WebView locale）、minisign 签名、market 分发。

## 目录

```
manifest.json    # schema v1，distribution: bundled
index.html       # 入口
assets/          # 构建产物（P2 手写骨架；P2b 换成 vite 产物）
src/             # （P2b）插件 TS 源码
```

## 开发

```bash
pnpm run extensions:sync   # 同步产物到 $APPDATA/extensions/
pnpm run dev               # 宿主启动后，插件中心或 ext_open 打开本插件
```
