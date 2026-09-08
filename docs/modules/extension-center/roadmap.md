# Extension Center Roadmap

> 执行真理源回归 [ROADMAP.md](../../ROADMAP.md)（P 阶段，见 [D-023](../../DECISIONS.md#d-023--20-目标变更为插件化生态r00r10-全部降级) / [D-024](../../DECISIONS.md#d-024--extension-仓库组织与-photo-triage-试点拆法)）。
> 本文件是插件化（P0–P6）的**执行状态唯一清单**；架构决策见 [extension-workflow.md](../../extension-workflow.md) 与 [plugin-market-assessment.md](../../plugin-market-assessment.md)。
> 最后更新：2026-09-08。

## 进度总览

| 阶段 | 内容                                              | 状态                         |
| ---- | ------------------------------------------------- | ---------------------------- |
| P0   | 产品定案（2.0 = 插件化第三方生态）                | ✅ 完成（D-023）             |
| P1   | 概念验证（asset provider 同源加载 + IPC）         | ✅ 完成（实测 5 项自检通过） |
| P2   | 契约先行 + 插件中心最小版 + photo-triage bundled  | ✅ 完成                      |
| P2b  | photo-triage 完整 UI 迁移（独立 bundle）          | ✅ 完成                      |
| P3   | 分发安全与插件运行时治理                          | 🔶 核心完成，market 链路待做 |
| P4   | 插件中心完整化（安装向导 / 详情 / 诊断面板）      | ⬜ 未开始                    |
| P5   | 泛化与全量迁移（dev-toolbox 泛化 + 其余 15 模块） | ⬜ 未开始                    |
| P6   | Windows 复验（恢复 Windows CI + 双平台实测）      | ⬜ 未开始，**发布硬前置**    |

---

## P0 ✅ 产品定案（2026-09-08）

- [x] 2.0 目标变更为「插件化生态」，R00–R10 降级为技术债台账（D-023）
- [x] 仓库组织两阶段策略 + bundled/market 双分发 + photo-triage 试点（D-024）
- [x] 可行性评估与行业调研沉淀（[plugin-market-assessment.md](../../plugin-market-assessment.md)）

## P1 ✅ 概念验证（2026-09-08）

- [x] `ExtensionAssets` 替换 asset provider（插件目录叠加内置资源，同源加载）
- [x] 实测 5 项自检全通过：同源 URL / IPC 注入 / ESM chunk / DOM 渲染 / invoke 回写
- [x] 证伪并修正 D-022 的「renderer 不能热载整屏页」前提；`WebviewUrl::App` 的 dev 模式坑固化为 URL 工具铁律

## P2 ✅ 契约先行 + 插件中心最小版（2026-09-08）

- [x] manifest schema v1（fail-closed：schemaVersion / id / semver / entry / ACL 子集 / engines 约束校验）
- [x] ACL 注册表 + `ext-` 窗口 IPC 网关（deny-by-default，补上 Tauri 自定命令全窗口放行的缺口）
- [x] `ext_list_installed` / `ext_open` / `ext_set_enabled` / `ext_uninstall` 契约双写
- [x] 插件中心最小 UI（列表 / 打开 / 启用禁用 / 卸载确认 / 空态 / 错误重试）
- [x] bundled 同步脚本（`extensions:sync`，双部署模式 + 保留用户禁用标记）
- [x] 插件错误回传基建（`EXT_ERROR_CAPTURE_SCRIPT`：window-error / unhandledrejection / console.error / boot → 落盘）

## P2b ✅ photo-triage 完整迁移（2026-09-08）

- [x] 20 文件迁出为 `extensions/photo-triage/src/`（feature.tsx 宿主描述符删除，不作迁移）
- [x] 插件独立 vite 构建体系（`extensions:build`；`base: "./"` 相对路径；alias `@`→宿主 src / `@extension`→插件 src；Tailwind 4 走宿根 postcss）
- [x] 插件自带 i18n（`locales/{zh,en}.json` = photoTriage 154 keys + common 38 keys，独立 i18next 实例）
- [x] 主包移除 photo-triage 静态注册（registry.tsx / vitest exclude / docs/modules 对齐）
- [x] 实测：`ext-photo-triage` 窗口经 manifest 校验 + 网关 + CustomProtocol 打开，boot 诊断零错误

## P3 🔶 分发安全与运行时治理（核心完成，2026-09-08）

- [x] `engines.bench` 兼容门控（`*` / `>=X.Y.Z`，非法约束 fail-closed；ext_open 拒绝 + 列表 compatible 标记）
- [x] minisign 签名校验骨架（`signature.rs`：market 强制验签 fail-closed / bundled 豁免；公钥 env `BENCH_EXT_REGISTRY_PUBKEY` → 回退 updater 公钥）
- [x] `manifest.signature` 可选字段
- [x] 宿主语言注入（`ext_open(locale)` → init script `window.__BENCH_EXT_LOCALE` → 插件 i18n 优先读取）
- [x] 卸载（`ext_uninstall`：关窗 + 删产物目录，仅限合法插件目录；UI 走 DestructiveConfirmDialog）
- [ ] **canonical registry 与 market 下载安装链路**（registry 服务端 / 目录拉取 / zip 下载解压 / 安装向导；验签已就绪，缺分发链路）
- [ ] **minisign 真实签名启用**（需 registry 私钥环境签出首批 market 插件）
- [ ] 插件能力矩阵（supported / degraded / unsupported / missing_pack，对齐 D-017 模型）
- [ ] 诊断日志追加式（boot 覆盖先前 error 记录的缺陷）

## P4 ⬜ 插件中心完整化

- [ ] market 插件安装向导（浏览 → 下载 → 验签 → 安装 → 启用）
- [ ] 插件详情页（manifest 能力与 ACL 展示：该插件申请了哪些宿主命令）
- [ ] 版本更新提示（registry 版本比对 + `engines` 升级引导）
- [ ] 诊断面板（插件中心内查看 ext-diagnostic 日志，替代裸 JSON 文件）
- [ ] bundled 产物进正式发布包（tauri build 流水线集成，替代 dev 同步脚本）

## P5 ⬜ 泛化与全量迁移（工作量最大）

- [ ] `dev-toolbox` host 泛化（删 `TOOLBOX_FEATURE_IDS` 与硬编码 tabs）
- [ ] 其余 15 模块分批迁移（按 **253 条命令** 基数登记 ACL 能力面 + UI 迁出，每批全量 `verify`）：
  - 第一批（低风险纯 UI）：terminology → token-calculator
  - 第二批（中等）：clean-space / dev-cleaner / port-manager / env-detector / hardware
  - 第三批（重系统耦合，谨慎）：quick-launch / app-manager / command-center / network-probe / updater / system-settings / account-manager
- [ ] 插件中心呈现迁移后的侧边栏（入口全部由插件点亮，主包只剩壳）
- [ ] 迁移批次验收：每批跑 `pnpm run verify` + 双平台 CI

## P6 ⬜ Windows 复验（发布硬前置）

- [ ] 恢复 Windows CI（撤销 D-021 暂停部分，需先解决其暂停原因）
- [ ] 插件子系统双平台实测：`ext-` 窗口 capability、asset provider、独立 WebView 行为
- [ ] 插件产物 Windows 签名策略确认（与 D-010 ad-hoc/unsigned 约定对齐）
- [ ] 全部门禁双平台绿后，插件化能力才允许随正式版发布

---

## 已知风险与依赖

| 风险 / 依赖              | 影响阶段 | 说明                                         |
| ------------------------ | -------- | -------------------------------------------- |
| registry 私钥不在本机    | P3/P4    | 验签骨架已就绪，签名与 market 上架需私钥环境 |
| Windows CI 暂停（D-021） | P6       | 插件化代码当前仅 macOS 验证；发布前必须恢复  |
| 诊断文件单条覆写         | P3.5     | boot 会覆盖先前 error，改追加式即可          |
| 253 条命令的 ACL 登记量  | P5       | 每批迁移的主要成本；命令名不变，契约测试护航 |
