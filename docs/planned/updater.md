# Updater（更新器）规划功能

> 本文件记录 updater 模块**未实现 / 待验证**的功能规划，与 `../product-specs/updater.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。
> 更新策略、错误矩阵与发布产物以全局路线图 [R05](../ROADMAP.md#r05-updater供应链与-rc-流水线) 为准；当前 OS 签名模式见 [D-010](../DECISIONS.md#d-010--默认使用-ad-hoc-macos-与-unsigned-windows-包)。

## 发布阻断（待实现）

- [ ] 使用 Tauri updater 私钥生成 macOS arm64/x64 与 Windows x64 的 updater bundle、`.sig` 和 `latest.json`，验证签名与 SHA-256 清单；OS 包按当前 unsigned 模式附明确提示。
- [ ] 为 CI workflow 增加不会创建/更新 GitHub Release 的 RC dry-run 入口；只有正式 tag 且 R10 获批才允许发布副作用。

## 延期验证（真机）

- [ ] 从 1.23.0 真机验证安装、应用内更新、取消、重启、卸载和回滚。
- [ ] 取得证书后切换 `BENCH_OS_SIGNING_MODE=signed`，验证 Apple notarization/staple 与 Windows Authenticode；不与 updater minisign 混为一项。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：生成产品说明与规划功能文档（依据 `src/features/updater/`、`src/components/common/UpdateDialog.tsx`、`src-tauri/src/app_updater/`、`docs/modules/updater/` 与 ROADMAP R05）。
