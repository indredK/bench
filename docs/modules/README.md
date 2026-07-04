# 模块文档

与 `src/features/<id>/` 对齐。每个模块目录自包含 **功能 + 设计 + 迭代 + Bug**；全局发布节奏见 [../roadmap/release-themes.md](../roadmap/release-themes.md)。目录约定见 [coding-standards.md §11](../coding-standards.md#11-文档)。

| 模块 | 功能 | 设计 | 迭代 | Bug |
|------|:----:|:----:|:----:|:---:|
| [account-manager](./account-manager/) | ✅ | ✅ | ✅ | — |
| [system-settings](./system-settings/) | ✅ | ✅ | ✅ | ✅ |
| [port-manager](./port-manager/) | ✅ | ✅ | ✅ | ✅ |
| [quick-launch](./quick-launch/) | — | — | ✅ | ✅ |
| [app-manager](./app-manager/) | — | — | ✅ | ✅ |
| [dev-toolbox](./dev-toolbox/) | — | — | ✅ | ✅ |
| [dev-cleaner](./dev-cleaner/) | — | — | ✅ | ✅ |
| [env-detector](./env-detector/) | — | — | ✅ | ✅ |
| [token-calculator](./token-calculator/) | — | — | ✅ | ✅ |
| [terminology](./terminology/) | — | — | ✅ | ✅ |
| [hardware](./hardware/) | — | — | ✅ | ✅ |
| [updater](./updater/) | ✅ | — | ✅ | — |

新增模块时：在此目录创建同名文件夹，至少放入 `roadmap.md` 与 `README.md`；推荐每个模块补齐 `features.md`（产品视角功能说明）与 `design.md`（技术设计）。
