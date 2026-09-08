# photo-triage Roadmap

> bundled 插件（源码 `extensions/photo-triage/`）。宿主能力面 = 15 条 `photo_triage_*` 命令（已登记 ACL）。

## 已完成

- [x] P2b：完整 UI 迁出为独立插件 bundle（独立 vite 构建 + 自带 i18n）
- [x] P3.1：manifest schema v2 + files 完整性清单（sync 部署时注入）
- [x] P5 前置：插件构建泛化（`extensions:build` 循环全部插件）

## 未完成项（Backlog）

- [ ] Rust 侧 Python 预览生成 → Rust 重写 / sidecar（D-017 pack 模型候选，随 P4.5 SDK 评估）
- [ ] 插件私有数据目录接入（扫描进度等运行时状态迁往 `$APPDATA/extension-data/photo-triage/`）
