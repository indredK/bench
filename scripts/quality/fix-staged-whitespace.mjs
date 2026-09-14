#!/usr/bin/env node
// Vendored by bench-quality-cli (feature: bench-guards).
// Self-contained: shells out to `git diff --check` via node:child_process so no
// repo-internal helper is required. (The tauri-app original imported a private
// scripts/lib/platform.mjs; this copy avoids that coupling.)
//
// git diff --check finds trailing whitespace and "new blank line at EOF" on the
// staged content but cannot fix it. This script rewrites the offending files in
// place and prints one `fixed:<file>` line per file so lefthook's stage_fixed
// re-adds exactly those paths.
//
// Safety (QG-01 / R2): the rewrite happens only after proving that no file is
// staged *and* has further unstaged edits — otherwise a fix would pull work the
// author never reviewed into the commit. The check is repeated here even though
// the hook chains guard-partial-staging.mjs first, so the script is safe to run
// on its own.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { findPartiallyStaged } from "./git-changes.mjs"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

// Third-party trees are never rewritten, even when they were staged by accident
// (a repo without a .gitignore will happily `git add -A` its node_modules).
// They are reported instead, so the author can unstage them knowingly.
const EXCLUDED_SEGMENTS = ["node_modules/", ".git/", ".pnpm/", "target/"]

const partiallyStaged = findPartiallyStaged({ cwd: rootDir })
if (partiallyStaged.length > 0) {
  console.error(
    "PARTIALLY_STAGED_FILE: refusing to rewrite whitespace while a staged file has unstaged edits.",
  )
  for (const file of partiallyStaged) console.error(`  ${file}`)
  console.error("Stage the whole file or stash the remaining edit, then commit again.")
  process.exit(1)
}

let result
try {
  const stdout = execFileSync("git", ["diff", "--cached", "--check", "--no-color"], {
    cwd: rootDir,
    encoding: "utf8",
  })
  result = { status: 0, stdout, stderr: "" }
} catch (error) {
  result = { status: error.status ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" }
}

if (result.status === 0) {
  console.log("No staged whitespace issues to fix.")
  process.exit(0)
}

// Reported lines look like:
//   path/to/file:12: trailing whitespace.
//   path/to/file:40: new blank line at EOF.
// The path group is greedy up to the ":<digits>: " separator so names may
// contain spaces, dots or non-ASCII characters.
const report = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
const reported = [
  ...report.matchAll(/^(.*):\d+: (?:trailing whitespace|new blank line at EOF)\.?$/gm),
]
  .map((match) => match[1].replaceAll("\\", "/"))
  .filter((file, index, all) => all.indexOf(file) === index)
const files = reported.filter(
  (file) => !EXCLUDED_SEGMENTS.some((segment) => file.includes(segment)),
)
const skipped = reported.filter((file) => !files.includes(file))

if (skipped.length > 0) {
  console.error(
    `Whitespace fixer skipped ${skipped.length} path(s) inside a third-party tree (unstage them if they do not belong to this commit):`,
  )
  for (const file of skipped.slice(0, 10)) console.error(`  skipped:${file}`)
  if (skipped.length > 10) console.error(`  … and ${skipped.length - 10} more`)
}

if (files.length === 0) {
  console.log("No staged whitespace issues to fix outside third-party trees.")
  process.exit(0)
}

const fixedFiles = []
for (const file of files) {
  const filePath = path.join(rootDir, file)
  try {
    const normalized = readFileSync(filePath, "utf8")
      // Strip trailing whitespace on every line.
      .replace(/[ \t]+$/gm, "")
      // Collapse trailing blank lines at EOF to a single newline.
      .replace(/(\r?\n)+$/, "\n")
    writeFileSync(filePath, normalized)
    fixedFiles.push(file)
    console.log(`fixed:${file}`)
  } catch {
    // File untrackable (deleted meanwhile, etc.); git diff --check will still
    // fail and the developer resolves the remaining entry manually.
  }
}

if (fixedFiles.length > 0) {
  console.log(`Auto-fixed whitespace in ${fixedFiles.length} file(s).`)
} else {
  console.error(
    "git diff --check reported staged whitespace issues but no files could be fixed (shown above); resolve them manually.",
  )
  process.exit(1)
}
