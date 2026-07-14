import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

function detectPackageManager() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"))
    const spec = pkg.packageManager ?? ""
    const match = /^(@[\w-]+\/)?(?<name>[\w-]+)@\d/.exec(spec)
    if (match?.groups?.name) {
      return process.platform === "win32" ? `${match.groups.name}.cmd` : match.groups.name
    }
  } catch {
    // Fall through to npm for checkouts without valid package metadata.
  }
  return process.platform === "win32" ? "npm.cmd" : "npm"
}

const pkgManager = detectPackageManager()

function runStep(label, command, args) {
  console.log(`\n==> ${label}`)
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function gitOutput(args) {
  const result = spawnSync("git", args, {
    cwd: rootDir,
    encoding: "utf8",
  })
  if (result.error || result.status !== 0) return null
  return result.stdout.trim()
}

function gitFiles(args) {
  const output = gitOutput(args)
  if (output === null) {
    console.error(`Unable to inspect Git files: git ${args.join(" ")}`)
    process.exit(1)
  }
  return output
    ? output
        .split("\n")
        .filter(Boolean)
        .map((file) => file.replaceAll("\\", "/"))
    : []
}

function matchesAny(file, patterns) {
  return patterns.some((pattern) => pattern.test(file))
}

const stagedFiles = gitFiles(["diff", "--cached", "--name-only", "--diff-filter=ACMRTD"])
if (stagedFiles.length === 0) {
  console.log("No staged files to validate.")
  process.exit(0)
}

const stagedExistingFiles = gitFiles(["diff", "--cached", "--name-only", "--diff-filter=ACMRT"])
const unstagedFiles = new Set(gitFiles(["diff", "--name-only", "--diff-filter=ACMRTD"]))
const partiallyStagedFiles = stagedExistingFiles.filter((file) => unstagedFiles.has(file))

if (partiallyStagedFiles.length > 0) {
  console.error("Pre-commit checks require each staged file to have no additional unstaged edits.")
  console.error(
    "This prevents checks from passing against content that is not actually being committed:",
  )
  for (const file of partiallyStagedFiles) console.error(`  ${file}`)
  console.error("Stage the remaining edits or move them into a separate file/commit, then retry.")
  process.exit(1)
}

runStep("Checking staged whitespace", "git", ["diff", "--cached", "--check"])

const prettierPatterns = [/\.(?:cjs|css|html|js|json|jsonc|jsx|md|mjs|scss|ts|tsx|yaml|yml)$/]
/** Listed in .prettierignore — release-please output must not be auto-formatted. */
const prettierIgnoredPatterns = [
  /^CHANGELOG\.md$/,
  /^\.release-please-manifest\.json$/,
  /^src-tauri\/tauri\.conf\.json$/,
]
const prettierFiles = stagedExistingFiles.filter(
  (file) => matchesAny(file, prettierPatterns) && !matchesAny(file, prettierIgnoredPatterns),
)
if (prettierFiles.length > 0) {
  // Auto-fix formatting in place instead of blocking the commit. Files reaching
  // this step are fully staged (partially staged files are rejected earlier), so
  // rewriting them is safe and the fixes are folded back into the commit.
  for (let index = 0; index < prettierFiles.length; index += 50) {
    runStep("Auto-fixing staged formatting", pkgManager, [
      "exec",
      "prettier",
      "--write",
      ...prettierFiles.slice(index, index + 50),
    ])
  }
  // Re-stage the rewritten files so the committed content matches the fixes.
  runStep("Re-staging auto-formatted files", "git", ["add", ...prettierFiles])
  console.log("Prettier auto-fixed and re-staged the above files.")
}

const nodeScriptPatterns = [/^postcss\.config\.js$/, /^scripts\/.+\.(?:js|mjs|cjs)$/]
const shellScriptPatterns = [/^\.husky\/[^/]+$/, /\.sh$/]
const formattingConfigPatterns = [
  /^\.gitattributes$/,
  /^\.prettierignore$/,
  /^\.prettierrc(?:\.[^/]+)?$/,
  /^prettier\.config\.(?:js|mjs|cjs|ts)$/,
]
const docsPatterns = [/^docs\//, /^(?:AGENTS|README)\.md$/, /^\.cursorrules$/]
const workflowPatterns = [/^\.github\/workflows\/.*\.ya?ml$/]
const frontendPatterns = [
  /^src\//,
  /^public\//,
  /^scripts\/quality\//,
  /^index\.html$/,
  /^splash\.html$/,
  /^components\.json$/,
  /^postcss\.config\.(?:js|mjs|cjs|ts)$/,
  /^tailwind\.config\.(?:js|mjs|cjs|ts)$/,
  /^vite\.config\.(?:js|mjs|cjs|ts)$/,
  /^tsconfig(?:\.[^/]+)?\.json$/,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
]
const backendPatterns = [/^src-tauri\/(?!target\/|gen\/)/]
/** Only `.rs` sources — never pass Cargo.toml / Cargo.lock to `cargo fmt`. */
const rustFiles = stagedExistingFiles.filter(
  (file) => matchesAny(file, backendPatterns) && file.endsWith(".rs"),
)

const nodeScriptFiles = stagedExistingFiles.filter((file) => matchesAny(file, nodeScriptPatterns))
const shellScriptFiles = stagedExistingFiles.filter((file) => matchesAny(file, shellScriptPatterns))
const hasFormattingConfigChanges = stagedFiles.some((file) =>
  matchesAny(file, formattingConfigPatterns),
)
const hasDocsChanges = stagedFiles.some((file) => matchesAny(file, docsPatterns))
const hasWorkflowChanges = stagedFiles.some((file) => matchesAny(file, workflowPatterns))
const hasFrontendChanges = stagedFiles.some((file) => matchesAny(file, frontendPatterns))
const hasBackendChanges = stagedFiles.some((file) => matchesAny(file, backendPatterns))

for (const file of nodeScriptFiles) {
  runStep(`Syntax check: ${file}`, "node", ["--check", file])
}
for (const file of shellScriptFiles) {
  runStep(`Shell syntax check: ${file}`, "sh", ["-n", file])
}

if (hasFormattingConfigChanges) {
  runStep("Checking repository formatting after Prettier config changes", pkgManager, [
    "run",
    "format:check",
  ])
}

if (hasDocsChanges && !hasFrontendChanges) {
  runStep("Checking documentation consistency and links", pkgManager, ["run", "check:docs"])
}

if (hasWorkflowChanges && !hasFrontendChanges) {
  runStep("Checking CI platform policy", pkgManager, ["run", "check:ci-platforms"])
}

if (hasFrontendChanges) {
  runStep("Running frontend static guards", pkgManager, ["run", "lint:fe"])
  runStep("Running frontend tests", pkgManager, ["run", "test:fe"])
  runStep("Type-checking and building frontend", pkgManager, ["run", "build:fe"])
}

if (hasBackendChanges) {
  runStep("Cross-platform crate check", "node", ["scripts/quality/check-rust-crates.mjs"])
  // Auto-fix Rust formatting on staged files instead of blocking the commit.
  // `cargo fmt` runs against only the committed files (guarded by rustFiles.length)
  // so it never reformats the whole crate or unrelated files.
  if (rustFiles.length > 0) {
    runStep("Auto-fixing Rust formatting", "cargo", [
      "fmt",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--",
      ...rustFiles,
    ])
    runStep("Re-staging auto-formatted Rust files", "git", ["add", ...rustFiles])
    console.log("cargo fmt auto-fixed and re-staged the above Rust files.")
  }
  runStep("Checking Rust code", pkgManager, ["run", "check:be"])
  runStep("Running Rust clippy (warnings as errors)", pkgManager, ["run", "clippy:be"])
  runStep("Running Rust tests", pkgManager, ["run", "test:be"])
}

if (
  !nodeScriptFiles.length &&
  !shellScriptFiles.length &&
  !hasDocsChanges &&
  !hasWorkflowChanges &&
  !hasFrontendChanges &&
  !hasBackendChanges
) {
  console.log("No project-specific checks required for these staged files.")
}

console.log("\nPre-commit checks passed.")
