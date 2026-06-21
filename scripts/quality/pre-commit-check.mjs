import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function runStep(label, command, args) {
  console.log(`\n==> ${label}`);

  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function gitOutput(args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

const stagedOutput = gitOutput(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
if (stagedOutput === null) {
  console.error("Unable to inspect staged files.");
  process.exit(1);
}

const stagedFiles = stagedOutput ? stagedOutput.split("\n").filter(Boolean) : [];
if (stagedFiles.length === 0) {
  console.log("No staged files to validate.");
  process.exit(0);
}

const normalizedFiles = stagedFiles.map((file) => file.replaceAll("\\", "/"));

const nodeScriptPatterns = [/^postcss\.config\.js$/, /^scripts\/.+\.(?:js|mjs|cjs)$/];
const frontendPatterns = [
  /^src\//,
  /^public\//,
  /^index\.html$/,
  /^splash\.html$/,
  /^components\.json$/,
  /^vite\.config\.(?:js|mjs|cjs|ts)$/,
  /^tsconfig(?:\.[^/]+)?\.json$/,
  /^package(?:-lock)?\.json$/,
];
const backendPatterns = [/^src-tauri\/(?!target\/|gen\/)/];

const nodeScriptFiles = normalizedFiles.filter((file) => matchesAny(file, nodeScriptPatterns));
const hasFrontendChanges = normalizedFiles.some((file) => matchesAny(file, frontendPatterns));
const hasBackendChanges = normalizedFiles.some((file) => matchesAny(file, backendPatterns));

if (nodeScriptFiles.length > 0) {
  for (const file of nodeScriptFiles) {
    runStep(`Syntax check: ${file}`, "node", ["--check", file]);
  }
}

if (hasFrontendChanges) {
  runStep("Running frontend static guards", npmCommand, ["run", "lint:fe"]);
  runStep("Running frontend tests", npmCommand, ["run", "test:fe"]);
  runStep("Type-checking and building frontend", npmCommand, ["run", "build:fe"]);
}

if (hasBackendChanges) {
  runStep("Cross-platform crate check", "node", ["scripts/quality/check-rust-crates.mjs"]);
  runStep("Checking Rust code", npmCommand, ["run", "check:be"]);
  runStep("Running Rust clippy (warnings as errors)", npmCommand, ["run", "clippy:be"]);
  runStep("Running Rust tests", npmCommand, ["run", "test:be"]);
}

if (!nodeScriptFiles.length && !hasFrontendChanges && !hasBackendChanges) {
  console.log("No code checks required for the staged files.");
}

console.log("\nPre-commit checks passed.");
