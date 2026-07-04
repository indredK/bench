import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Detect package manager from package.json's `packageManager` field.
// Falls back to npm for backward compatibility.
function detectPackageManager() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
    const spec = pkg.packageManager ?? "";
    const match = /^(@[\w-]+\/)?(?<name>[\w-]+)@\d/.exec(spec);
    if (match?.groups?.name) {
      return process.platform === "win32" ? `${match.groups.name}.cmd` : match.groups.name;
    }
  } catch {
    // ignore
  }
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

const pkgManager = detectPackageManager();

function hasCommand(cmd) {
  const resolved = process.platform === "win32" ? `${cmd}.cmd` : cmd;
  const check = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(check, [resolved], { stdio: "ignore" });
  return result.status === 0;
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error || result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("==============================");
console.log("  Tauri 项目一键安装");
console.log("==============================\n");

// --- [1/4] 检测系统级工具链 ---
console.log("[1/4] 检测系统级工具链...");

const required = [
  { cmd: "node", label: "Node.js", url: "https://nodejs.org/" },
  {
    cmd: "rustc",
    label: "Rust (rustc)",
    url: "https://www.rust-lang.org/tools/install",
  },
  { cmd: "cargo", label: "Rust (cargo)", url: "https://www.rust-lang.org/tools/install" },
];

if (!hasCommand(pkgManager.replace(/\.cmd$/, ""))) {
  required.push({
    cmd: pkgManager.replace(/\.cmd$/, ""),
    label: `${pkgManager.replace(/\.cmd$/, "")} (包管理器)`,
    url: "https://pnpm.io/installation",
  });
}

const missing = required.filter(({ cmd }) => !hasCommand(cmd));

if (missing.length > 0) {
  console.error("\n✗ 缺少以下工具,请先安装:\n");
  for (const { label, url } of missing) {
    console.error(`  ${label}`);
    console.error(`    安装指南: ${url}\n`);
  }
  console.error("安装完成后重新运行: pnpm run setup\n");
  process.exit(1);
}

console.log(`  Node.js:   ${execSync("node --version").toString().trim()}`);
console.log(`  Rust:      ${execSync("rustc --version").toString().trim()}`);
console.log(`  Cargo:     ${execSync("cargo --version").toString().trim()}`);
console.log(`  ${pkgManager}: 已就绪\n`);

// --- [2/4] 安装前端依赖 ---
console.log("[2/4] 安装前端依赖 (pnpm install)...");
console.log("  Git 钩子会在此步骤通过 postinstall 自动配置\n");
run(pkgManager, ["install"]);

// --- [3/4] 预拉取后端依赖 ---
console.log("\n[3/4] 预拉取后端 Rust 依赖 (cargo fetch)...");
const tauriDir = path.join(rootDir, "src-tauri");
run("cargo", ["fetch"], { cwd: tauriDir });

// --- [4/4] 完成 ---
console.log("\n[4/4] 安装完成");
console.log("==============================");
console.log("  下一步:");
console.log("    启动开发: pnpm dev");
console.log("    构建生产: pnpm build");
console.log("==============================");
