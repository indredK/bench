# Updater Roadmap

更新策略、远端文本和发布产物以 [2.0.0 发布门禁](../../roadmap/2.0.0-release-readiness.md#12-f07updater签名与供应链)为准。当前 OS 签名模式见 [D-010](../../DECISIONS.md#d-010--当前发布默认使用-ad-hoc-macos-与-unsigned-windows-包)。

## 发布阻断

- [ ] 使用 Tauri updater 私钥生成 macOS arm64/x64 与 Windows x64 的 updater bundle、`.sig` 和 `latest.json`，验证签名与 SHA-256 清单；OS 包按当前 unsigned 模式附明确提示。
- [ ] 自动化覆盖损坏/缺平台 `latest.json`、错误签名、404、离线、代理、磁盘满和重启失败。

## 延期验证

- [ ] 从 1.23.0 真机验证安装、应用内更新、取消、重启、卸载和回滚。
- [ ] 取得证书后切换 `BENCH_OS_SIGNING_MODE=signed`，验证 Apple notarization/staple 和 Windows Authenticode；不与 updater minisign 混为一项。
