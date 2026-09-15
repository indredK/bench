#!/usr/bin/env node
// Vendored by bench-quality-cli (init/update).
//
// Wires `core.hooksPath` to the generated `.husky` directory and verifies that
// the hooks are actually there. Reachable as `pnpm hooks:install` (and, when the
// repository had no `prepare` script, automatically after an install).
//
// Why this exists: the generator only runs once. A fresh clone has no
// `.git/config` entry for the hooks path, so without an install entry a
// reviewer would silently commit without any gate running.
//
// Usage: node scripts/quality/install-hooks.mjs [--check]
//   --check   verify only, never write (for CI)
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOKS_PATH = ".husky";
const HOOKS = ["pre-commit", "commit-msg"];
const checkOnly = process.argv.includes("--check");

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

try {
  git(["rev-parse", "--show-toplevel"]);
} catch {
  console.error("GIT_REPO_REQUIRED: this directory is not inside a git repository.");
  console.error("Run the installer from a checkout, or ignore it if the repo is not versioned.");
  process.exit(1);
}

const missing = HOOKS.filter((hook) => !existsSync(path.join(repoRoot, HOOKS_PATH, hook)));
if (missing.length > 0) {
  // A published package carries this file plus a `prepare` script, but not the
  // repository's generated hooks. Running inside an installed dependency is
  // therefore a no-op, never an error (a git/url install would otherwise fail).
  if (repoRoot.split(path.sep).includes("node_modules")) {
    console.log("install-hooks: inside an installed package (no generated hooks here); nothing to wire.");
    process.exit(0);
  }
  console.error(`HOOK_MISSING: ${missing.map((hook) => `${HOOKS_PATH}/${hook}`).join(", ")} not found.`);
  console.error("Run the generator first (init/update) and commit the generated .husky directory.");
  process.exit(1);
}

const current = (() => {
  try {
    return git(["config", "--get", "core.hooksPath"]);
  } catch {
    return "";
  }
})();

if (current === HOOKS_PATH) {
  console.log(`Quality hooks already wired: core.hooksPath=${HOOKS_PATH}`);
  process.exit(0);
}

if (checkOnly) {
  console.error(`HOOKS_NOT_WIRED: core.hooksPath is ${current === "" ? "unset" : `"${current}"`}, expected "${HOOKS_PATH}".`);
  console.error("Run `node scripts/quality/install-hooks.mjs` (or `pnpm hooks:install`) in this checkout.");
  process.exit(1);
}

git(["config", "core.hooksPath", HOOKS_PATH]);
const verified = git(["config", "--get", "core.hooksPath"]);
if (verified !== HOOKS_PATH) {
  console.error(`HOOKS_NOT_WIRED: tried to set core.hooksPath=${HOOKS_PATH} but read back "${verified}".`);
  process.exit(1);
}
console.log(`Quality hooks wired: core.hooksPath=${HOOKS_PATH} (was ${current === "" ? "unset" : `"${current}"`}).`);
