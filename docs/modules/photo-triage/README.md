# Photo Triage 文档

代码：`src/features/photo-triage/` · `src-tauri/src/photo_triage/`

Photo Triage（照片筛选）是 Bench 2.0 序列之外的**旁路独立模块 1.0**（对齐 Network Probe 的 D-016 先例），macOS-only。功能为在爱思助手等导出的相册目录中快速「留 / 删」筛选：图/视频按同名配对，稳定 ID 标记持久化，删除一律进系统废纸篓可恢复，可批量移动到任意目标文件夹。

迁移自 `/Users/apple/KnowledgeBase/photo-triage/`（Python 独立桌面应用）：后端逻辑全部转写为 Rust（`sips` / `ffmpeg` / `qlmanage` 系统工具经 `std::process::Command` 调用），`triage.html` 单文件 UI 转写为 React + zustand + Tailwind。稳定 ID（`md5(相对路径去扩展名)[:12]`）与 manifest 结构与原版逐字节一致：**已有 Python 版扫描结果可直接复用，用户已做的留/删标记不丢失**。

| 文档                                     | 说明                                             |
| ---------------------------------------- | ------------------------------------------------ |
| [migration-plan.md](./migration-plan.md) | 迁移依据：IPC 契约、权限模型、实施阶段、验收清单 |
| [roadmap.md](./roadmap.md)               | 未完成项                                         |

## 交互模型

1. **欢迎页**：选择照片目录（`tauri-plugin-dialog`，用户主动选择即视为授权，对齐 L2 文件选择授权），后台扫描（事件推进度，可取消）；最近 8 个相册可「继续上次进度」直接续接。
2. **筛选界面**：左侧缩略图条（react-virtual 虚拟滚动 + 按需代理生成），右侧大图/视频预览；K/D 标记留删、U 撤销、R 从废纸篓恢复、方向键导航、0 跳下一个未处理、F 循环筛选、G 分组（含分组索引条）、L 实况切换、⌘A 全选、数字键 1-9 快速移动到待选文件夹、拖动缩略图/大图到文件夹卡片成对移动。
3. **操作闭环**：标记为「删」的条目批量移入废纸篓（二次确认）；「重置缓存」核对失效条目；「清理空文件夹」仅删相册内完全为空的目录。

## 关键设计

- **预览按需生成**：图片代理 `sips`（原生支持 HEIC→JPEG，最长边 1600），视频 4 秒片段 `ffmpeg`（可选依赖，无则降级静态封面），封面无 ffmpeg 时回退 `qlmanage`。生成带 inflight 去重与并发闸门（图片 6 / 视频 2），写 `.part` 临时文件后原子改名。
- **asset 协议**：代理缓存与源目录经 `app.asset_protocol_scope()` 运行时放通，前端 `convertFileSrc` 加载，零序列化开销。
- **防误删红线**：删除一律走废纸篓（`~/.Trash`，同名冲突 `_N` 后缀），恢复为后悔药并自动标记「留」；批量删除强制二次确认并展示文件路径。
- **数据目录**：`$APPDATA/photo-triage/build-<md5(src)[:10]>`，每相册独立构建目录，跨会话增量复用代理与清单。
