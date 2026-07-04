import { execSync } from "node:child_process";

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
}

console.log("==============================");
console.log("  Tauri 项目引导");
console.log("==============================\n");

console.log("[1/2] 验证 Rust 环境...");
run("rustc --version");
run("cargo --version");

console.log("\n[2/2] 提示");
console.log("  Git 钩子会在 `pnpm install` 时通过 postinstall 自动配置");
console.log("  如需手动重装,运行: pnpm run hooks:install\n");

console.log("==============================");
console.log("  引导完成");
console.log("  安装依赖: pnpm install");
console.log("  启动开发: pnpm dev");
console.log("==============================");
