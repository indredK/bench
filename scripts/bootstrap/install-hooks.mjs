import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const hooksPath = ".husky";

function runGit(args) {
  return spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
  });
}

const repoCheck = runGit(["rev-parse", "--is-inside-work-tree"]);
if (repoCheck.error || repoCheck.status !== 0 || repoCheck.stdout.trim() !== "true") {
  console.log("Skipping hook setup: not inside a Git checkout.");
  process.exit(0);
}

if (!existsSync(path.join(rootDir, ".husky"))) {
  console.log("Skipping hook setup: .husky directory is missing.");
  process.exit(0);
}

const hookConfig = runGit(["config", "--local", "core.hooksPath", hooksPath]);
if (hookConfig.error || hookConfig.status !== 0) {
  const details = [hookConfig.stderr?.trim(), hookConfig.stdout?.trim()].filter(Boolean).join("\n");
  console.warn("Git hooks were not configured automatically.");
  if (details) {
    console.warn(details);
  }
  console.warn(`Run \`git config --local core.hooksPath ${hooksPath}\` to enable them manually.`);
  process.exit(0);
}

console.log(`Git hooks path configured to ${hooksPath}`);
