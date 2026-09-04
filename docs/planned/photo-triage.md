# Photo Triage（照片筛选）规划功能

> 本文件记录 photo-triage 模块**未实现 / 待验证**的功能规划，与 `../product-specs/photo-triage.md` 同结构。
> 实现一项即从本文件移除，并同步到产品说明；规划新增功能先写到这里再开发。

## 待验证（真机）

- [ ] macOS 真机：HEIC + MOV 真实相册扫描配对（Live Photo 识别为 `live`）与稳定 ID 交叉比对。

- [ ] 缩略图按需生成并发 / 去重在滚动场景下无重复生成、无卡顿。

- [ ] 无 ffmpeg 环境下视频静态封面降级不报错。

- [ ] 删除进废纸篓后可在原位置恢复；移出相册条目 ID 稳定、标记随 id 迁移。

- [ ] `tauri-plugin-dialog` 选目录路径与 TCC 授权文案（`Info.plist`）在真机弹窗中生效。

## 远期

- [ ] **导出留选文件入口**：`photo_triage_export` 命令已实现（复制/zip），前端按钮未接（原 py 版有导出 selection.json 与文件导出两条路径）。

- [ ] **视频 4 秒片段 Range 请求实测**：`media-src` 播放异常时回退「静态封面 + 系统播放器打开」。

- [ ] **代理缓存容量管理**：缩略图数据目录上限 / 清理策略。

## 变更记录

> 每轮功能改动先在此追加一行，再在实施后同步进产品说明。

- 2026-09-03：实现 分组按钮显示分组数；分组索引条 hover tooltip / 当前分组高亮 / 0:N 进度数字；大图预览填满；拖拽 ghost 跟随图 + 放置二次确认；全选 toggle；缩略图 8 并发闸门；toast 玻璃主题背景修复；拖拽虚线聚焦反馈。

- 2026-09-03：产品说明文档完善——补齐 缩略图栏宽度拖拽（Splitter）多列自适应、分组索引条水平刻度完整交互、缩略图卡片状态、加载调度防疯狂等遗漏细节。

- 2026-09-04：修复 Windows CI 编译——sips/qlmanage 相关常量与导入（`SIPS_TIMEOUT`/`QLMANAGE_TIMEOUT`/`IMG_MAX_EDGE`）加 `#[cfg(target_os="macos")]`，`let mut made` 按平台区分可变性（Windows clippy 5 个 unused/dead-code 告警）。
