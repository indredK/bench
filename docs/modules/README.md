# 模块文档

与 `src/features/<id>/` 对齐。每个模块目录自包含 **功能 + 设计 + 迭代**；全局发布节奏见 [../roadmap/release-themes.md](../roadmap/release-themes.md)。目录约定见 [coding-standards.md §11](../coding-standards.md#11-文档)。

| 模块 | 功能 | 设计 | 迭代 |
|------|:----:|:----:|:----:|
| [account-manager](./account-manager/) | ✅ | ✅ | ✅ |
| [system-settings](./system-settings/) | ✅ | ✅ | ✅ |
| [port-manager](./port-manager/) | ✅ | ✅ | ✅ |
| [quick-launch](./quick-launch/) | — | — | ✅ |
| [app-manager](./app-manager/) | — | — | ✅ |
| [dev-toolbox](./dev-toolbox/) | — | — | ✅ |
| [clean-space](./clean-space/) | — | ✅ | — |
| [dev-cleaner](./dev-cleaner/) | — | — | ✅ |
| [env-detector](./env-detector/) | — | — | ✅ |
| [token-calculator](./token-calculator/) | — | — | ✅ |
| [terminology](./terminology/) | — | — | ✅ |
| [hardware](./hardware/) | — | — | ✅ |
| [updater](./updater/) | ✅ | — | ✅ |

新增模块时：在此目录创建同名文件夹，至少放入 `roadmap.md` 与 `README.md`；推荐每个模块补齐 `features.md`（产品视角功能说明）与 `design.md`（技术设计）。

**Bug 台账**：出现第一条已知 bug 时，参考 [AI-WORKFLOWS.md](../AI-WORKFLOWS.md) 的 `/fix` 工作流约定建立 `docs/modules/<id>/bugs.md`。无 open bug 的模块可省略。

---

## 功能注册与刷新机制

以下文件不属于单一 feature，而是 features 层的元数据/基础设施：

| 文件 | 职责 |
|------|------|
| `src/features/types.ts` | `AppFeature` 接口定义（id / path / labelKey / icon / render / desktopOnly / platforms） |
| `src/features/registry.tsx` | 11 个 feature 的描述符注册表，`App.tsx` 通过 `appFeatures.map` 渲染 `<Route>` |
| `src/features/refresh.ts` | 功能刷新机制：`registerFeatureRefresh(id, handler)` 注册 + `requestFeatureRefresh(id)` 触发 |
| `src/features/FeatureFallback.tsx` | lazy 加载共享 fallback 组件（Loader2Icon 旋转） |

### 注册新功能

1. 在 `src/features/<id>/` 下创建 `feature.tsx`，导出 `AppFeature` 描述符
2. 在 `src/features/registry.tsx` 中 import 并加入 `appFeatures` 数组
3. 在 `docs/modules/` 下创建对应文档目录
4. 在 `src/i18n/locales/{zh,en}.json` 中补 `nav.<id>` 与功能内文案

### 刷新机制

功能页挂载时通过 `registerFeatureRefresh` 注册刷新回调，其他模块（如托盘菜单、全局快捷键）可通过 `requestFeatureRefresh(id)` 触发刷新，无需直接耦合 store。
