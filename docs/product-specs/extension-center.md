# Extension Center（插件中心）产品说明

> 本文件是 extension-center 模块的**完备产品规格**。一切功能改动、优化、bug 修复都必须同步更新本文件。
> 自包含、可移植：复制到任何项目或交给任何 AI，可据此完整复刻本模块功能。
> **当前进度**：P2 骨架已落地，P4 完整化为待实现（见下方状态标记与 [../planned/extension-center.md](../planned/extension-center.md)）。

## 1. 定位

- **宿主前端的一部分**（插件中心本身**不是**插件），入口：路由 `/extension-center`，侧边栏注册，全平台显示。
- 用途：浏览、安装、启用/禁用、卸载、更新 extension（插件），并查看其权限与诊断信息。
- 核心保证：
  - 插件是**不受信任的前端代码**，只能调用 manifest 声明且宿主能力面允许的命令；
  - 任何校验失败都**阻止加载或阻止开窗**，不改变已安装版本（fail-closed）；
  - 卸载、吊销等破坏性操作一律二次确认；
  - 越权与验签失败全部进入审计日志。

## 2. 界面与功能

### 2.1 已安装（P2 ✅）

| 区块     | 内容                                                      | 状态 |
| -------- | --------------------------------------------------------- | ---- |
| 顶部     | 标题、副标题、刷新按钮（加载中禁用）                      | ✅   |
| 列表表格 | 名称（展示名 + id）、版本、分发形态、状态、操作           | ✅   |
| 状态徽章 | 启用（绿）/ 禁用（琥珀）；不兼容（红，来自 `compatible`） | ✅   |
| 分发徽章 | bundled / market                                          | ✅   |
| 行操作   | 打开（禁用时不可点）、启用/禁用、卸载（红字）             | ✅   |
| 卸载确认 | `DestructiveConfirmDialog`，含插件名占位符                | ✅   |

### 2.2 市场（P4 ⬜）

| 区块     | 内容                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| 目录浏览 | 从后端 canonical registry 拉取，**renderer 不提供 URL**；展示展示名、描述、发布者、最新版本                     |
| 安装向导 | 浏览 → 下载 → 权限披露 → 验签 → 解压 → 启用（步骤与失败提示见 [../extension-spec.md](../extension-spec.md) §6） |
| 权限披露 | 安装前展示该插件申请的 `acl.commands` 的**人类可读描述**，而非裸命令名                                          |
| 更新提示 | registry 版本比对；`engines` 不满足时给出升级引导；`yanked` 版本提示                                            |

### 2.3 详情与诊断（P4 ⬜）

| 区块     | 内容                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| 详情页   | 版本、发布者、能力矩阵、申请的宿主命令清单、`engines` 约束、签名状态                                            |
| 诊断面板 | 查看插件运行日志（替代裸 JSON 文件），按 kind 过滤（window-error / unhandled-rejection / console.error / boot） |
| 吊销警示 | 命中 registry `revoked` 时显著警示并强制禁用                                                                    |

## 3. 快捷键

无（本模块不定义全局快捷键）。

## 4. 交互细节

| 场景      | 行为                                                          |
| --------- | ------------------------------------------------------------- |
| 加载态    | 首次加载且无数据时显示骨架区块；刷新按钮禁用                  |
| 空态      | 「暂无插件」+ 引导文案                                        |
| 失败态    | 红色区块展示 `[错误码] 消息` **与**重试按钮（不只显示"失败"） |
| 行级 busy | 操作中的行按钮全部禁用（`busyIds`），防重入                   |
| 打开      | 仅启用状态可点；点击后宿主开独立 `ext-<id>` 窗口，已开则聚焦  |
| 启用/禁用 | 切换 `.disabled` 标记；禁用时关闭已开窗口                     |
| 卸载      | 二次确认（DestructiveConfirmDialog）→ 关窗 → 删产物目录       |
| 不兼容    | `engines` 不满足时列表标记 incompatible 且禁止打开            |
| 长文本    | 插件名、id 允许截断但不遮挡操作按钮                           |

## 5. 异常处理

| 错误码           | 提示                                      | 降级/重试                                               |
| ---------------- | ----------------------------------------- | ------------------------------------------------------- |
| `NOT_FOUND`      | 插件产物缺失                              | 提示重新同步/安装                                       |
| `INVALID_INPUT`  | 清单不合法 / 版本回退                     | 阻止操作，保留原状态                                    |
| `UNSUPPORTED`    | engines 不满足 / schema 版本不支持        | 标记 incompatible，引导升级宿主                         |
| `FORBIDDEN_PATH` | ACL 越权 / 验签失败 / 内容篡改 / 解压越界 | **阻止加载**，提示具体原因，记审计                      |
| `IO`             | 卸载或写标记失败                          | 提示重试；Windows 文件占用需给出可读提示（P6 实测补充） |

失败一律**不改变已安装版本**；安装流程中途失败必须清理临时目录。

## 6. 技术实现要点

- 前端：`src/features/extension-center/`（page + hooks/controller + store），zustand selector + `parseCommandError` / `translateError` + 重入保护。
- 后端：`src-tauri/src/extension_host/`（manifest / acl / assets / signature / commands / url / mod）。
- 契约：`ext_list_installed` / `ext_open` / `ext_set_enabled` / `ext_uninstall`，三张表双写（`src/lib/tauri/contracts.ts`）。
- 插件产物：`extensions/<id>/`（仓库）→ `scripts/plugins/sync-extensions.mjs` → `$APPDATA/extensions/<id>/`（运行时）。
- 安全：deny-by-default 命令网关 + manifest fail-closed + 逐文件 hash 校验 + minisign 验签（[../extension-spec.md](../extension-spec.md)）。

## 7. 数据模型

```ts
interface ExtensionSummary {
  id: string
  version: string
  displayZh: string
  displayEn: string
  distribution: "bundled" | "market"
  enabled: boolean
  compatible: boolean // engines 是否满足宿主版本
}
```

宿主侧 manifest 结构见 [../extension-spec.md](../extension-spec.md) §3。

## 8. 边界与限制

- 插件中心自身**不是插件**，随主包发布，不参与插件生命周期。
- 平台：全平台，但插件子系统在 Windows 完成双平台复验前（P6）不随正式版发布。
- 安全红线：renderer 不得提交最终下载地址或可执行路径；插件不得调用能力面外的命令。
- 不做：marketplace 级恶意代码动态沙箱检测、评分/评论（成本与规模不匹配，见 roadmap「成本原则」）。
