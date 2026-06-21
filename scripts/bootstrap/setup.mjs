import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
}

console.log("==============================");
console.log("  Tauri 项目引导");
console.log("==============================\n");

console.log("[1/2] 配置 Git 提交钩子...");
if (existsSync(".husky")) {
  run("npm run hooks:install");
  console.log("  -> Git 提交钩子已配置\n");
} else {
  console.log("  -> 跳过: 当前仓库没有 .husky 目录\n");
}

console.log("[2/2] 验证 Rust 环境...");
run("rustc --version");
run("cargo --version");

console.log("\n==============================");
console.log("  引导完成");
console.log("  安装依赖: npm install");
console.log("  启动开发: npm run dev");
console.log("==============================");
