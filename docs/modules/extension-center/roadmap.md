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

## P2b（photo-triage 完整迁移）✅ 2026-09-08

- [x] `src/features/photo-triage/` 20 文件迁出为 `extensions/photo-triage/src/`（feature.tsx 宿主描述符删除，不作迁移）
- [x] 插件独立 vite 构建体系（`extensions:build`；`base: "./"` 相对路径；alias `@`→宿主 src / `@extension`→插件 src；Tailwind 4 走宿根 postcss）
- [x] 插件自带 i18n 资源（`locales/{zh,en}.json` = photoTriage 154 keys + common 38 keys，独立 i18next 实例，语言随 WebView locale）
- [x] 主包移除 photo-triage 静态注册（registry.tsx / vitest exclude / docs/modules 对齐 15↔15）
- [x] `BENCH_POC_EXT=<extension-id>` 支持自动打开指定插件（实测 `ext-photo-triage` 窗口打开、应用稳定）

## P3+

- [ ] market 分发：canonical registry + minisign 签名校验（复用 `updater/keys/`）
- [ ] `engines.bench` 兼容门控参与加载
- [ ] 插件能力矩阵（supported/degraded/unsupported/missing_pack）
- [ ] 卸载（删除产物目录）与安装向导
