# Env Detector（环境检测）

> **完备功能规格** → [product-specs/env-detector.md](../../product-specs/env-detector.md)
> **规划功能** → [planned/env-detector.md](../../planned/env-detector.md)

代码：`src/features/env-detector/` · `src-tauri/src/env_detector/`

定位：扫描本机 PATH 及常用安装目录，盘点已安装的开发工具（版本/路径/大小/安装时间/状态），辅助判断开发环境就绪度；作为「开发工具箱」的环境检测 Tab，桌面专用。

全局顺序：[2.0 最终路线图](../../ROADMAP.md)
