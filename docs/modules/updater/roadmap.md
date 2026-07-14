# Updater Roadmap

更新策略、远端文本和发布产物以 [2.0.0 发布门禁](../../roadmap/2.0.0-release-readiness.md#12-f07updater签名与供应链)为准。

## 发布阻断

- [ ] 使用正式 Apple/Windows 证书和 Tauri updater 私钥生成 RC，验证 macOS arm64/x64 与 Windows x64 的签名、安装、取消、重启和卸载。
- [ ] 覆盖 1.23.0 -> 2.0.0、损坏/缺平台 `latest.json`、错误签名、404、离线、代理、磁盘满和重启失败。
