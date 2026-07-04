# Build Troubleshooting

## window-vibrancy 版本冲突导致 macOS 编译失败

**错误信息：**

```
warning: Linking globals named '__CLASS_NSVisualEffectViewTagged': symbol multiply defined!
error: failed to load bitcode of module "window_vibrancy-*.rcgu.o"
```

**原因：**
项目显式依赖的 `window-vibrancy` 版本与 Tauri 内部依赖的版本不一致，两个版本同时被链接，导致 Objective-C 符号重复。

| 来源 | 版本 |
|------|------|
| `app` (Cargo.toml 显式声明) | `^0.7` |
| `tauri` (Tauri 内部依赖) | `^0.6` |

**修复方法：**
将 `src-tauri/Cargo.toml` 中的版本与 Tauri 保持一致：

```toml
# [target.'cfg(target_os = "macos")'.dependencies]
window-vibrancy = "0.6"
```

然后清理 lock 文件并验证：

```bash
cd src-tauri
cargo update -p window-vibrancy
cargo check --target aarch64-apple-darwin
```

**注意：** 项目只用到了 `apply_vibrancy`、`clear_vibrancy`、`NSVisualEffectMaterial`、`NSVisualEffectState`，这些 API 在 0.6.x 和 0.7.x 中完全一致，降级不需要改代码。

**上游跟踪：** https://github.com/tauri-apps/tauri/issues/15478
Tauri 尚未更新到 `window-vibrancy 0.7`。待上游修复后，可把版本改回 `"0.7"`。
