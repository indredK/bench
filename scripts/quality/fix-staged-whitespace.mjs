import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

// git diff --check detects trailing whitespace and "new blank line at EOF"
// on staged content but cannot fix it. This script rewrites the offending
// files in place (safe because the pre-commit check only runs on fully
// staged files) and prints one `fixed:<file>` line per file so the caller
// can re-stage them. See scripts/quality/pre-commit-check.mjs.
const result = spawnSync("git", ["diff", "--cached", "--check"], {
  cwd: rootDir,
  encoding: "utf8",
})
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
if (result.status === 0) {
  console.log("No staged whitespace issues to fix.")
  process.exit(0)
}

// Reported lines look like:
//   path/to/file:12: trailing whitespace.
//   path/to/file:40: new blank line at EOF.
// possibly followed by a `+<line content>` context line.
const report = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
const files = [
  ...report.matchAll(/^([^:\n]+):\d+: (?:trailing whitespace|new blank line at EOF)\.?$/gm),
]
  .map((match) => match[1].replaceAll("\\", "/"))
  .filter((file, index, all) => all.indexOf(file) === index)

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
    `git diff --check reported staged whitespace issues but no files could be fixed (shown above); resolve them manually.`,
  )
  process.exit(1)
}
