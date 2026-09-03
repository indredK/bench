# Photo Triage Roadmap

迁移基线见 [migration-plan.md](./migration-plan.md)，已完成历史由 Git 保留。

## 已完成

- [x] P0：目录骨架 + feature 注册 + i18n（zh/en 双语）+ `Info.plist` TCC usage description
- [x] P1：`scan.rs` + `types.rs` + `state.rs`；scan / open / list_recent / scan_status 命令
- [x] P2：`preview.rs` + `ffmpeg.rs`；asset 协议放通；ensure_proxy / capabilities
- [x] P3：前端 React 化（WelcomePicker / TriageToolbar / ThumbnailStrip / GroupIndexBar / PreviewStage / ConfirmSheet）
- [x] P4：操作闭环（trash / restore / move / reveal / prune / empty_dirs / export）
- [x] P5：文档（本 README + roadmap）

## 待验证（真机）

- [ ] macOS 真机：HEIC + MOV 真实相册扫描配对（Live Photo 识别为 `live`）与稳定 ID 交叉比对
- [ ] 缩略图按需生成并发与去重在滚动场景下无重复生成、无卡顿
- [ ] 无 ffmpeg 环境下视频静态封面降级不报错
- [ ] 删除进废纸篓后可在原位置恢复；移出相册的条目 ID 稳定、标记随 id 迁移
- [ ] `tauri-plugin-dialog` 选目录路径与 TCC 授权文案（`Info.plist`）在真机弹窗中生效

## 远期

- [ ] `photo_triage_export` 前端入口：留选文件复制/zip 导出按钮（命令已实现，UI 待接）
- [ ] 视频 4 秒片段 Range 请求实测；`media-src` 播放异常时回退「静态封面 + 系统播放器打开」
- [ ] 缩略图数据目录容量管理（代理缓存上限/清理策略）
