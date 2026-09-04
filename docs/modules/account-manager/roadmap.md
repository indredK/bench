# Account Manager Roadmap

> 未完成项（待实现 / 待验证 / 远期，含真机验收矩阵）已汇总至 [planned/account-manager.md](../../planned/account-manager.md)。
> 已完成功能与详情见 [product-specs/account-manager.md](../../product-specs/account-manager.md)。
> 长期安全边界见 [design.md](./design.md)；执行顺序见全局路线图 [R01](../../ROADMAP.md#r01-account-manager-代码收口) 与 [R04](../../ROADMAP.md#r04-account-manager-双平台真机矩阵)。

验收红线：真机项仅在全新 macOS 测试用户 + Windows Sandbox/VM 中执行、禁用生产账号；本机无对应平台只能写「未验证」。验证命令：`pnpm run lint:fe`、`pnpm exec vitest run src/features/account-manager`、`cargo test --manifest-path src-tauri/Cargo.toml account_manager`、`cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`、`pnpm run test:critical`、`pnpm run check:docs`、`git diff --check`。
