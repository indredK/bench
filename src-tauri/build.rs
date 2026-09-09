use std::fs;
use std::path::Path;

/// 与 tauri.conf.json `bundle.resources` 的 key 保持一致（相对 src-tauri/）。
/// 该目录由 `pnpm run extensions:stage` 填充，但产物被 .gitignore 忽略。
const BUNDLED_EXTENSIONS_DIR: &str = "resources/extensions";

fn main() {
    // tauri-build 会校验 bundle.resources 的每个源路径必须存在。staging 目录
    // 由 beforeBuildCommand 生成，`cargo clippy` / `cargo test` 不会触发它，
    // 因此在干净 checkout（含 CI）上会因路径缺失直接 build script 失败
    // （exit 101，双平台 verify 均在 clippy 步骤红）。这里兜底创建，
    // 保证任何 cargo 子命令都能跑通；有插件时仍由 stage 脚本写入内容。
    let dir = Path::new(BUNDLED_EXTENSIONS_DIR);
    if let Err(err) = fs::create_dir_all(dir) {
        panic!("failed to create {}: {err}", dir.display());
    }

    tauri_build::build()
}
