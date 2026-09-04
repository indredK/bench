# Photo Triage（照片筛选）

> **完备功能规格** → [product-specs/photo-triage.md](../../product-specs/photo-triage.md)
> **规划功能** → [planned/photo-triage.md](../../planned/photo-triage.md)

代码：`src/features/photo-triage/` · `src-tauri/src/photo_triage/`

定位：macOS-only 独立旁路模块，在爱思助手等导出的相册目录中快速「留 / 删」筛选；图/视频同名配对（Live Photo 识别 `live`）、删除进系统废纸篓可恢复、可批量移动；稳定 ID（`md5(相对路径去扩展名)[:12]`）与 manifest 与 Python 原版逐字节一致。

| 文档                                     | 说明                                   |
| ---------------------------------------- | -------------------------------------- |
| [migration-plan.md](./migration-plan.md) | 迁移依据：IPC 契约、权限模型、实施阶段 |
