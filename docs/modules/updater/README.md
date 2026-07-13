# Updater 文档

代码：`src/features/updater/`，UI 入口为 `src/components/common/UpdateDialog.tsx`。

状态流：`idle -> checking -> available -> downloading -> installing -> readyToRestart`，任一步可进入 `error`。`store.ts` 只存状态，`useUpdaterController` 负责编排，`error-classifier.ts` 负责错误分类。

未完成项见 [roadmap.md](./roadmap.md)。
