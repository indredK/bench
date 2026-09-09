# Rust 跨平台测试踩坑：tauri `AssetKey::from` 的平台规范化

> 来源：Windows CI `Run Rust tests` 连续失败（#513–#518），macOS 全绿。
> 修复：4766712 `fix(test): assets 拒绝用例按平台分化断言`。

## 症状

同一个测试在 macOS 通过、Windows 失败，断言输出形如：

```text
assertion `left == right` failed
left: Some("/tmp/app/extensions\etc/passwd")
right: None
```

## 根因

`tauri-utils`（≤2.9.x）的 `impl From<P> for AssetKey` 存在平台分叉：

- **Unix 分支**：`path.to_string_lossy()` —— 字符串**原样保留**；
- **Windows 分支**：先补根，再用 `path.components()` **逐组件重建**字符串
  （`RootDir → "/"`，连续分隔符合并，`/` 与 `\` 都视作分隔符）。

因此测试里手工构造的畸形 key 会在 Windows 上被框架"洗白"：

| 输入字面量               | Windows 上 resolve 实际收到 | 结果                                 |
| ------------------------ | --------------------------- | ------------------------------------ |
| `ext//etc/passwd`        | `etc/passwd`                | `Some(root.join("etc/passwd"))`      |
| `ext/\server\share\x`    | `server/share/x`            | `Some(root.join("server/share/x"))`  |
| `ext/C:/windows/win.ini` | `C:/windows/win.ini`        | `None`（中段盘符仍被字符串防御拒绝） |

相关 std 语义（源码级验证，rust 1.98）：

- Windows 上 `Path::new("/etc/passwd").is_absolute()` 为 **false**
  （`is_absolute = has_root() && prefix().is_some()`，前导 `/` 只算 has_root）；
- Windows 上 `components()` 对前导 `/` 仍产出 `Component::RootDir`
  （`has_physical_root` 只看首字节是否分隔符）；
- `PathBuf::push` 遇到「有根无盘符」的路径会**截断基座**（std path.rs
  `_push` 的 `else if path.has_root()` 分支）。

安全影响评估：无真实穿越漏洞——Windows 的 webview → `AssetKey` 链路上
畸形形式不可达（已被规范化），规范化后的落点仍在插件根目录内。

## 处置模式

1. **平台无关的安全语义用纯函数直接测**（如 `is_safe_relative_path`），
   不要经由 `AssetKey::from` / `resolve` 这类含平台行为链路去覆盖；
2. **端到端断言用 `if cfg!(windows)` 运行时分化**，而不是 `#[cfg]` 编译期
   隔离——两个分支在任何平台都参与编译，不破坏 cfg 卫生门禁
   （`pnpm run check:be-cfg`），也不会在某平台留下从未编译过的代码；
3. 断言期望值用 `root.join(rel)` 表达式构造，不手工拼接分隔符字符串。

## 本地验证注意事项（Windows 开发机）

- 2026-09-09 起：本机已装 VS 2022 Community（MSVC 14.44）+ Windows SDK
  10.0.26100.0，`cargo check` / `cargo test` 可在本机完整运行（rustc 经
  vswhere 自动探测 MSVC，无需 VsDevCmd；`cargo check` 2m06s、
  `cargo test` 456 通过）。aws-lc-sys 当前 feature 下不需要 cmake；
  若日后构建报缺 cmake/nasm，安装 VS 的 C++ CMake 组件即可；
- 本机仍需绕过 `src-tauri/.cargo/config.toml` 的 sccache wrapper
  （`.sh` 脚本 Windows 无法作为 rustc-wrapper 执行，报 os error 193）：
  临时方案 `RUSTC_WRAPPER="" cargo ...`（与 CI 的 D-021 做法一致）；
- 在 WorkBuddy/Git Bash 沙箱里跑 cargo 需手动补 PATH：
  `~/.cargo/bin`、rustup 工具链 `bin/`（rustc 代理要加载同目录 DLL）、
  `/c/Windows/System32`，并设 `RUSTC_WRAPPER=""`。
