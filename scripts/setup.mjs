/**
 * Tauri 项目一键初始化脚本
 * 新克隆项目后运行: npm run setup
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
}

console.log("==============================");
console.log("  Tauri 项目一键初始化");
console.log("==============================\n");

// 1. 配置 Rust 国内镜像
console.log("[1/4] 配置 Rust 国内镜像源...");
const cargoDir = join(homedir(), ".cargo");
const configFile = join(cargoDir, "config.toml");
mkdirSync(cargoDir, { recursive: true });
writeFileSync(
  configFile,
  `[source.crates-io]
replace-with = "rsproxy-sparse"

[source.rsproxy]
registry = "https://rsproxy.cn/crates.io-index"

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"
`,
  "utf-8"
);
console.log("  -> Rust 镜像源已配置 (rsproxy.cn 稀疏协议)\n");

// 2. 安装前端依赖
console.log("[2/4] 安装前端依赖 (npm install)...");
run("npm install");
console.log("  -> 前端依赖安装完成\n");

// 3. 配置 Git hooks
console.log("[3/4] 配置 Git 提交钩子...");
run("npm run hooks:install");
console.log("  -> Git 提交钩子已配置\n");

// 4. 验证 Rust 环境
console.log("[4/4] 验证 Rust 环境...");
run("rustc --version");
run("cargo --version");

console.log("\n==============================");
console.log("  初始化完成！");
console.log("  启动开发: npm run dev");
console.log("==============================");
