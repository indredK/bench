# Updater（更新器）

> **完备功能规格** → [product-specs/updater.md](../../product-specs/updater.md)
> **规划功能** → [planned/updater.md](../../planned/updater.md)

代码：`src/features/updater/`，UI 入口为 `src/components/common/UpdateDialog.tsx`。

定位：检查并安装 Bench 自身更新（Tauri updater + GitHub Releases `latest.json`）；状态机 `idle -> checking -> available -> downloading -> installing -> readyToRestart`，任一步可进 `error`，错误分类可重试，取消 / 失败保留已下载产物。`store.ts` 只存状态，`useUpdaterController` 负责编排，`error-classifier.ts` 负责错误分类。
