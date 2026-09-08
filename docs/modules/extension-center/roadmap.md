# Extension Center Roadmap

> 执行真理源回归 [ROADMAP.md](../../ROADMAP.md)（P 阶段，见 D-023/D-024）。

## P2（当前）

- [x] manifest schema v1（fail-closed 校验 + 单测）
- [x] ACL 注册表 + `ext-` 窗口 IPC 网关（deny-by-default + 单测）
- [x] extension URL 工具（显式 `tauri://localhost/ext/…`）
- [x] `ext_list_installed` / `ext_open` / `ext_set_enabled` 契约双写
- [x] 插件中心最小 UI（列表 / 打开 / 启用禁用 / 空态 / 错误重试）
- [x] photo-triage bundled 骨架（manifest + 最小 UI + 同步脚本）
- [ ] GUI 实测：插件中心列表 + photo-triage 窗口 + 网关拒绝演示（待真机）

## P2b（photo-triage 完整迁移）

- [ ] `src/features/photo-triage/` 21 文件迁出为 `extensions/photo-triage/src/`
- [ ] 插件独立 vite 构建体系（i18n 文案随插件打包）
- [ ] 主包侧边栏移除 photo-triage 静态注册，改由插件中心点亮

## P3+

- [ ] market 分发：canonical registry + minisign 签名校验（复用 `updater/keys/`）
- [ ] `engines.bench` 兼容门控参与加载
- [ ] 插件能力矩阵（supported/degraded/unsupported/missing_pack）
- [ ] 卸载（删除产物目录）与安装向导
